import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-registration-log";
const LOG_PREFIX = "user_registered_";
let testEnv: RulesTestEnvironment;

function authedDb(uid: string, email = `${uid}@example.com`): Firestore {
  return testEnv.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;
}

function registrationUser(
  uid: string,
  email: string,
  requestedRole: string,
  overrides: DocumentData = {},
): DocumentData {
  return {
    uid,
    email,
    requestedRole,
    role: requestedRole === "PLAYER" ? "PLAYER" : "USER",
    status: requestedRole === "PLAYER" ? "Active" : "Inactive",
    academyId: null,
    activeAcademyId: null,
    subscriptionPlan: "FREE",
    name: "New User",
    ...overrides,
  };
}

function registrationLog(
  uid: string,
  email: string,
  requestedRole: string,
  overrides: DocumentData = {},
): DocumentData {
  return {
    action: "USER_REGISTERED",
    userId: uid,
    email,
    requestedRole,
    timestamp: serverTimestamp(),
    ...overrides,
  };
}

function atomicRegistration(
  uid: string,
  requestedRole: string,
  options: {
    email?: string;
    logId?: string;
    userOverrides?: DocumentData;
    logOverrides?: DocumentData;
  } = {},
) {
  const email = options.email ?? `${uid}@example.com`;
  const db = authedDb(uid, email);
  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", uid),
    registrationUser(uid, email, requestedRole, options.userOverrides),
  );
  batch.set(
    doc(db, "logs", options.logId ?? `${LOG_PREFIX}${uid}`),
    registrationLog(uid, email, requestedRole, options.logOverrides),
  );
  return batch.commit();
}

async function seed(entries: Array<[string, DocumentData]>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([documentPath, data]) =>
        setDoc(doc(context.firestore(), documentPath), data),
      ),
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
});

after(async () => {
  await testEnv.cleanup();
});

test("1 valid USER registration atomic batch succeeds", async () => {
  await assertSucceeds(atomicRegistration("user-registration", "COACH"));
});

test("2 valid PLAYER registration atomic batch succeeds", async () => {
  await assertSucceeds(atomicRegistration("player-registration", "PLAYER"));
});

test("3 standalone User create without log is denied", async () => {
  const uid = "standalone-user";
  const email = `${uid}@example.com`;
  await assertFails(setDoc(doc(authedDb(uid, email), "users", uid), registrationUser(uid, email, "SCOUT")));
});

test("4 standalone USER_REGISTERED log is denied", async () => {
  const uid = "standalone-log";
  const email = `${uid}@example.com`;
  await assertFails(setDoc(doc(authedDb(uid, email), "logs", `${LOG_PREFIX}${uid}`), registrationLog(uid, email, "PARENT")));
});

test("5 wrong deterministic log ID is denied", async () => {
  await assertFails(atomicRegistration("wrong-log-id", "COACH", { logId: "random-id" }));
});

test("6 wrong userId is denied", async () => {
  await assertFails(atomicRegistration("wrong-user-id", "COACH", { logOverrides: { userId: "someone-else" } }));
});

test("7 wrong or spoofed email is denied", async () => {
  await assertFails(atomicRegistration("spoofed-email", "COACH", { logOverrides: { email: "attacker@example.com" } }));
  await assertFails(atomicRegistration("spoofed-user-email", "COACH", {
    userOverrides: { email: "attacker@example.com" },
    logOverrides: { email: "attacker@example.com" },
  }));
});

test("8 wrong requestedRole is denied", async () => {
  await assertFails(atomicRegistration("wrong-requested-role", "COACH", { logOverrides: { requestedRole: "PLAYER" } }));
});

test("9 client timestamp instead of request.time is denied", async () => {
  await assertFails(atomicRegistration("client-timestamp", "COACH", { logOverrides: { timestamp: Timestamp.now() } }));
});

test("10 extra registration-log fields are denied", async () => {
  await assertFails(atomicRegistration("extra-log-field", "COACH", { logOverrides: { isAdmin: true } }));
});

test("11 wrong action is denied", async () => {
  await assertFails(atomicRegistration("wrong-action", "COACH", { logOverrides: { action: "ROLE_UPDATED" } }));
});

test("12 duplicate or second registration log is denied", async () => {
  const uid = "duplicate-registration";
  const email = `${uid}@example.com`;
  await assertSucceeds(atomicRegistration(uid, "COACH"));
  await assertFails(setDoc(doc(authedDb(uid, email), "logs", `${LOG_PREFIX}${uid}`), registrationLog(uid, email, "COACH")));
  await assertFails(setDoc(doc(authedDb(uid, email), "logs", "second-random-log"), registrationLog(uid, email, "COACH")));
});

test("13 registration-log update and delete are denied", async () => {
  const uid = "immutable-registration";
  const logId = `${LOG_PREFIX}${uid}`;
  await assertSucceeds(atomicRegistration(uid, "COACH"));
  await assertFails(updateDoc(doc(authedDb(uid), "logs", logId), { email: "changed@example.com" }));
  await assertFails(deleteDoc(doc(authedDb(uid), "logs", logId)));
});

test("14 existing-user login cannot add a registration event", async () => {
  const uid = "existing-user";
  const email = `${uid}@example.com`;
  await seed([[`users/${uid}`, registrationUser(uid, email, "COACH")]]);
  await assertFails(setDoc(doc(authedDb(uid, email), "logs", `${LOG_PREFIX}${uid}`), registrationLog(uid, email, "COACH")));
});

test("15 normal users cannot create other log actions", async () => {
  const uid = "normal-user";
  const email = `${uid}@example.com`;
  await seed([[`users/${uid}`, registrationUser(uid, email, "COACH")]]);
  await assertFails(setDoc(doc(authedDb(uid, email), "logs", "audit"), { action: "STATUS_UPDATED", timestamp: serverTimestamp() }));
});

test("16 active SuperAdmin legitimate audit-log creation remains allowed", async () => {
  const uid = "active-superadmin";
  await seed([[`users/${uid}`, { uid, role: "SUPERADMIN", status: "ACTIVE" }]]);
  await assertSucceeds(setDoc(doc(authedDb(uid), "logs", "legitimate-audit"), { action: "STATUS_UPDATED", targetUser: "target", timestamp: serverTimestamp() }));
});

test("17 inactive SUPERADMIN and DATA_ADMIN log access remains denied", async () => {
  await seed([
    ["users/inactive-super", { uid: "inactive-super", role: "SUPERADMIN", status: "INACTIVE" }],
    ["users/inactive-data", { uid: "inactive-data", role: "DATA_ADMIN", status: "INACTIVE" }],
    ["logs/existing", { action: "STATUS_UPDATED" }],
  ]);
  await assertFails(getDoc(doc(authedDb("inactive-super"), "logs", "existing")));
  await assertFails(setDoc(doc(authedDb("inactive-super"), "logs", "denied-super"), { action: "STATUS_UPDATED" }));
  await assertFails(getDoc(doc(authedDb("inactive-data"), "logs", "existing")));
  await assertFails(setDoc(doc(authedDb("inactive-data"), "logs", "denied-data"), { action: "STATUS_UPDATED" }));
});

test("18 registration metadata cannot derive privileged authority", async () => {
  for (const privilegedRole of ["SUPERADMIN", "DATA_ADMIN", "ADMIN", "COACH"]) {
    await assertFails(atomicRegistration(`privileged-${privilegedRole.toLowerCase()}`, privilegedRole, {
      userOverrides: { role: privilegedRole, status: "Active" },
    }));
  }
});
