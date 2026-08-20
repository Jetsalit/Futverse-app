import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collectionGroup,
  getDocs,
  query,
  setDoc,
  where,
  doc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-superadmin-relationship-read";
const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";
const SUPER_UID = "super-user";
const INACTIVE_SUPER_UID = "inactive-super-user";
const ADMIN_UID = "academy-admin";
const COACH_UID = "academy-coach";
const PARENT_A_UID = "parent-a";
const PARENT_B_UID = "parent-b";

let testEnv: RulesTestEnvironment;

function userData(uid: string, role: string, status = "Active"): DocumentData {
  return { uid, role, status, academyId: null, activeAcademyId: null };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
): DocumentData {
  return { userId: uid, academyId, role, status: "ACTIVE" };
}

function associationData(
  uid: string,
  academyId: string,
  playerId: string,
): DocumentData {
  return {
    userId: uid,
    academyId,
    playerId,
    role: "PARENT",
    status: "ACTIVE",
  };
}

function associationPath(academyId: string, uid: string, playerId: string) {
  return `academies/${academyId}/nonstaffUsers/${uid}/playerAssociations/${playerId}`;
}

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed([
    [`users/${SUPER_UID}`, userData(SUPER_UID, "SUPERADMIN")],
    [`users/${INACTIVE_SUPER_UID}`, userData(INACTIVE_SUPER_UID, "SUPERADMIN", "Inactive")],
    [`users/${ADMIN_UID}`, userData(ADMIN_UID, "ADMIN")],
    [`users/${COACH_UID}`, userData(COACH_UID, "COACH")],
    [`users/${PARENT_A_UID}`, userData(PARENT_A_UID, "PARENT")],
    [`users/${PARENT_B_UID}`, userData(PARENT_B_UID, "PARENT")],
    [`academies/${ACADEMY_A}/members/${ADMIN_UID}`,
      membershipData(ADMIN_UID, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/members/${COACH_UID}`,
      membershipData(COACH_UID, ACADEMY_A, "COACH")],
    [associationPath(ACADEMY_A, PARENT_A_UID, "player-a"),
      associationData(PARENT_A_UID, ACADEMY_A, "player-a")],
    [associationPath(ACADEMY_B, PARENT_B_UID, "player-b"),
      associationData(PARENT_B_UID, ACADEMY_B, "player-b")],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test("active SUPERADMIN can list canonical playerAssociations globally", async () => {
  const snapshot = await assertSucceeds(
    getDocs(collectionGroup(authedDb(SUPER_UID), "playerAssociations")),
  );
  assert.equal(snapshot.size, 2);
});

test("inactive SUPERADMIN cannot list playerAssociations globally", async () => {
  await assertFails(
    getDocs(collectionGroup(authedDb(INACTIVE_SUPER_UID), "playerAssociations")),
  );
});

test("academy ADMIN cannot enumerate playerAssociations across organizations", async () => {
  await assertFails(
    getDocs(collectionGroup(authedDb(ADMIN_UID), "playerAssociations")),
  );
});

test("academy COACH cannot enumerate playerAssociations across organizations", async () => {
  await assertFails(
    getDocs(collectionGroup(authedDb(COACH_UID), "playerAssociations")),
  );
});

test("PARENT still lists only own associations with query-provable userId", async () => {
  const snapshot = await assertSucceeds(
    getDocs(
      query(
        collectionGroup(authedDb(PARENT_A_UID), "playerAssociations"),
        where("userId", "==", PARENT_A_UID),
      ),
    ),
  );
  assert.equal(snapshot.size, 1);
  assert.equal(snapshot.docs[0]?.data().userId, PARENT_A_UID);
});

test("PARENT cannot enumerate all associations without own-user filter", async () => {
  await assertFails(
    getDocs(collectionGroup(authedDb(PARENT_A_UID), "playerAssociations")),
  );
});

test("anonymous user cannot list playerAssociations globally", async () => {
  await assertFails(getDocs(collectionGroup(anonymousDb(), "playerAssociations")));
});
