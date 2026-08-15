import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import {
  approveUserAtomically,
  createFirestoreAdminMutationDependencies,
  rejectUserAtomically,
} from "../src/lib/firestore/adminUserMutations";

const PROJECT_ID = "demo-futverse-admin-decisions";
const SUPERADMIN_A_UID = "super-admin-a";
const SUPERADMIN_B_UID = "super-admin-b";
const TARGET_UID = "pending-user";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

async function seedPendingTarget(status: "PENDING" | "Inactive") {
  await seed([
    [`users/${SUPERADMIN_A_UID}`, {
      uid: SUPERADMIN_A_UID,
      email: "superadmin-a@example.test",
      role: "SUPERADMIN",
      status: "Active",
    }],
    [`users/${SUPERADMIN_B_UID}`, {
      uid: SUPERADMIN_B_UID,
      email: "superadmin-b@example.test",
      role: "SUPERADMIN",
      status: "Active",
    }],
    [`users/${TARGET_UID}`, {
      uid: TARGET_UID,
      email: "pending@example.test",
      role: "USER",
      status,
      requestedRole: "PARENT",
    }],
  ]);
}

function decisionInput(actorUid: string, status: "PENDING" | "Inactive") {
  return {
    actorUid,
    targetUid: TARGET_UID,
    targetEmail: "stale-caller@example.test",
    previousRole: "USER",
    previousStatus: status,
    requestedRole: "PARENT",
  };
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Admin decision tests require the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

for (const pendingStatus of ["PENDING", "Inactive"] as const) {
  test(`reject ${pendingStatus} -> canonical REJECTED with one atomic audit`, async () => {
    await seedPendingTarget(pendingStatus);
    const db = authedDb(SUPERADMIN_A_UID);
    const dependencies = createFirestoreAdminMutationDependencies(db);

    await rejectUserAtomically({
      ...decisionInput(SUPERADMIN_A_UID, pendingStatus),
      rejectionReason: "Rejected after explicit review",
    }, dependencies);

    const target = await getDoc(doc(db, "users", TARGET_UID));
    assert.equal(target.data()?.status, "REJECTED");
    const logs = await getDocs(collection(db, "logs"));
    assert.equal(logs.size, 1);
    assert.equal(logs.docs[0].data().action, "USER_REJECTED");
    assert.equal(logs.docs[0].data().previousStatus, pendingStatus);
    assert.equal(logs.docs[0].data().targetEmail, "pending@example.test");
  });

  test(`approve ${pendingStatus} USER/PARENT -> PARENT Active with one atomic audit`, async () => {
    await seedPendingTarget(pendingStatus);
    const db = authedDb(SUPERADMIN_A_UID);
    const dependencies = createFirestoreAdminMutationDependencies(db);

    await approveUserAtomically({
      ...decisionInput(SUPERADMIN_A_UID, pendingStatus),
      approvedRole: "PARENT",
    }, dependencies);

    const target = await getDoc(doc(db, "users", TARGET_UID));
    assert.equal(target.data()?.role, "PARENT");
    assert.equal(target.data()?.status, "Active");
    assert.equal(target.data()?.approvedBy, SUPERADMIN_A_UID);

    const logs = await getDocs(collection(db, "logs"));
    assert.equal(logs.size, 1);
    const log = logs.docs[0].data();
    assert.equal(log.action, "USER_APPROVED");
    assert.equal(log.actorUid, SUPERADMIN_A_UID);
    assert.equal(log.approvedBy, SUPERADMIN_A_UID);
    assert.equal(log.previousStatus, pendingStatus);
    assert.equal(log.targetEmail, "pending@example.test");
  });
}

test("a stale reviewer cannot overwrite a newer authoritative decision", async () => {
  await seedPendingTarget("PENDING");
  const db = authedDb(SUPERADMIN_A_UID);
  const dependencies = createFirestoreAdminMutationDependencies(db);
  const staleInput = decisionInput(SUPERADMIN_A_UID, "PENDING");

  await updateDoc(doc(db, "users", TARGET_UID), {
    status: "REJECTED",
    updatedAt: new Date(),
  });

  await assert.rejects(approveUserAtomically({
    ...staleInput,
    approvedRole: "PARENT",
  }, dependencies), /no longer pending/);

  const target = await getDoc(doc(db, "users", TARGET_UID));
  assert.equal(target.data()?.status, "REJECTED");
  assert.equal((await getDocs(collection(db, "logs"))).size, 0);
});

test("two concurrent reviewers cannot commit contradictory decisions", async () => {
  await seedPendingTarget("PENDING");
  const dbA = authedDb(SUPERADMIN_A_UID);
  const dbB = authedDb(SUPERADMIN_B_UID);

  const results = await Promise.allSettled([
    approveUserAtomically({
      ...decisionInput(SUPERADMIN_A_UID, "PENDING"),
      approvedRole: "PARENT",
    }, createFirestoreAdminMutationDependencies(dbA)),
    rejectUserAtomically({
      ...decisionInput(SUPERADMIN_B_UID, "PENDING"),
      rejectionReason: "Rejected by concurrent reviewer",
    }, createFirestoreAdminMutationDependencies(dbB)),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);

  const target = await getDoc(doc(dbA, "users", TARGET_UID));
  const logs = await getDocs(collection(dbA, "logs"));
  assert.equal(logs.size, 1);
  const log = logs.docs[0].data();

  if (results[0].status === "fulfilled") {
    assert.equal(results[1].status, "rejected");
    assert.equal(log.action, "USER_APPROVED");
    assert.equal(log.actorUid, SUPERADMIN_A_UID);
    assert.equal(log.approvedBy, SUPERADMIN_A_UID);
    assert.equal(log.rejectedBy, undefined);
    assert.equal(target.data()?.role, "PARENT");
    assert.equal(target.data()?.status, "Active");
    assert.equal(target.data()?.approvedBy, SUPERADMIN_A_UID);
  } else {
    assert.equal(results[1].status, "fulfilled");
    assert.equal(log.action, "USER_REJECTED");
    assert.equal(log.actorUid, SUPERADMIN_B_UID);
    assert.equal(log.rejectedBy, SUPERADMIN_B_UID);
    assert.equal(log.approvedBy, undefined);
    assert.equal(target.data()?.role, "USER");
    assert.equal(target.data()?.status, "REJECTED");
    assert.equal(target.data()?.rejectionReason, "Rejected by concurrent reviewer");
  }
});
