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
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-privileged-status";
const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";

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

async function seedUser(uid: string, role: string, status?: string) {
  await seed([[
    `users/${uid}`,
    {
      uid,
      role,
      ...(status === undefined ? {} : { status }),
    },
  ]]);
}

async function seedMembership(
  uid: string,
  role: "ADMIN" | "COACH",
  status = "ACTIVE",
  storedAcademyId = ACADEMY_A,
) {
  await seed([[
    `academies/${ACADEMY_A}/members/${uid}`,
    {
      userId: uid,
      academyId: storedAcademyId,
      role,
      status,
    },
  ]]);
}

function writeSetting(uid: string) {
  return setDoc(doc(authedDb(uid), "settings", "security"), { enabled: true });
}

function readAcademy(uid: string) {
  return getDoc(doc(authedDb(uid), "academies", ACADEMY_A));
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
    [`academies/${ACADEMY_A}`, { name: "Academy A" }],
    [`academies/${ACADEMY_B}`, { name: "Academy B" }],
    ["users/target-user", { uid: "target-user", role: "USER", status: "Active", name: "Before" }],
    ["academy_invites/FUT-STATUS", { inviteCode: "FUT-STATUS", academyId: ACADEMY_A, status: "ACTIVE" }],
    ["proPlayers/existing", { name: "Existing Pro" }],
    ["scoutPlayers/existing", { name: "Existing Scout", submittedBy: "submitter", status: "Pending", grade: "C", stars: 3 }],
    ["logs/existing", { action: "AUDIT" }],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test("1. Active SUPERADMIN privileged user update allowed", async () => {
  await seedUser("super-active", "SUPERADMIN", "Active");
  await assertSucceeds(updateDoc(
    doc(authedDb("super-active"), "users", "target-user"),
    { name: "After Active" },
  ));
});

test("2. ACTIVE SUPERADMIN privileged write allowed", async () => {
  await seedUser("super-uppercase", "SUPERADMIN", "ACTIVE");
  await assertSucceeds(updateDoc(doc(authedDb("super-uppercase"), "users", "target-user"), { name: "After" }));
});

test("3. ACTIVE SUPERADMIN tenant access allowed", async () => {
  await seedUser("super-tenant", "SUPERADMIN", "ACTIVE");
  await assertSucceeds(readAcademy("super-tenant"));
});

test("4. ACTIVE SUPERADMIN logs access allowed", async () => {
  await seedUser("super-logs", "SUPERADMIN", "ACTIVE");
  await assertSucceeds(getDoc(doc(authedDb("super-logs"), "logs", "existing")));
});

for (const [number, label, status] of [
  [5, "Inactive", "Inactive"],
  [6, "INACTIVE", "INACTIVE"],
  [7, "Suspended", "Suspended"],
  [8, "SUSPENDED", "SUSPENDED"],
  [9, "Rejected", "Rejected"],
  [10, "REJECTED", "REJECTED"],
  [11, "missing status", undefined],
  [12, "unknown status", "Enabled"],
] as const) {
  test(`${number}. ${label} SUPERADMIN denied`, async () => {
    const uid = `super-revoked-${number}`;
    await seedUser(uid, "SUPERADMIN", status);
    await assertFails(writeSetting(uid));
  });
}

test("13. missing authoritative user document denied", async () => {
  await assertFails(writeSetting("missing-superadmin"));
});

test("14. Active ADMIN root settings write denied", async () => {
  await seedUser("admin-active", "ADMIN", "Active");
  await assertFails(writeSetting("admin-active"));
});

test("15. ACTIVE ADMIN proPlayers write allowed", async () => {
  await seedUser("admin-pro", "ADMIN", "ACTIVE");
  await assertSucceeds(setDoc(doc(authedDb("admin-pro"), "proPlayers", "new"), { name: "New Pro" }));
});

test("16. ACTIVE ADMIN scout moderation allowed", async () => {
  await seedUser("admin-scout", "ADMIN", "ACTIVE");
  await assertSucceeds(updateDoc(doc(authedDb("admin-scout"), "scoutPlayers", "existing"), { status: "Verified" }));
});

for (const [number, label, status] of [
  [17, "Inactive", "Inactive"],
  [18, "INACTIVE", "INACTIVE"],
  [19, "Suspended", "Suspended"],
  [20, "SUSPENDED", "SUSPENDED"],
  [21, "Rejected", "Rejected"],
  [22, "REJECTED", "REJECTED"],
  [23, "missing status", undefined],
] as const) {
  test(`${number}. ${label} ADMIN denied`, async () => {
    const uid = `admin-revoked-${number}`;
    await seedUser(uid, "ADMIN", status);
    await assertFails(writeSetting(uid));
  });
}

test("24. ACTIVE USER role does not gain admin authority", async () => {
  await seedUser("active-user", "USER", "ACTIVE");
  await assertFails(writeSetting("active-user"));
});

test("25. ACTIVE user plus ACTIVE ADMIN Membership allowed", async () => {
  await seedUser("tenant-admin", "ADMIN", "ACTIVE");
  await seedMembership("tenant-admin", "ADMIN");
  await assertSucceeds(readAcademy("tenant-admin"));
});

test("26. Active user plus ACTIVE COACH Membership allowed", async () => {
  await seedUser("tenant-coach", "COACH", "Active");
  await seedMembership("tenant-coach", "COACH");
  await assertSucceeds(readAcademy("tenant-coach"));
});

for (const [number, userStatus, role] of [
  [27, "Inactive", "ADMIN"],
  [28, "INACTIVE", "COACH"],
  [29, "Suspended", "ADMIN"],
  [30, "Rejected", "COACH"],
] as const) {
  test(`${number}. ${userStatus} user plus ACTIVE ${role} Membership denied`, async () => {
    const uid = `tenant-revoked-${number}`;
    await seedUser(uid, role, userStatus);
    await seedMembership(uid, role);
    await assertFails(readAcademy(uid));
  });
}

test("31. ACTIVE user plus SUSPENDED Membership denied", async () => {
  await seedUser("tenant-suspended-membership", "ADMIN", "ACTIVE");
  await seedMembership("tenant-suspended-membership", "ADMIN", "SUSPENDED");
  await assertFails(readAcademy("tenant-suspended-membership"));
});

test("32. ACTIVE user plus missing Membership denied", async () => {
  await seedUser("tenant-missing-membership", "COACH", "ACTIVE");
  await assertFails(readAcademy("tenant-missing-membership"));
});

test("33. ACTIVE user plus cross-academy Membership denied", async () => {
  await seedUser("tenant-cross-academy", "ADMIN", "ACTIVE");
  await seedMembership("tenant-cross-academy", "ADMIN", "ACTIVE", ACADEMY_B);
  await assertFails(readAcademy("tenant-cross-academy"));
});

test("34. revoked ADMIN cannot mutate proPlayers", async () => {
  await seedUser("revoked-admin-pro", "ADMIN", "Suspended");
  await assertFails(setDoc(doc(authedDb("revoked-admin-pro"), "proPlayers", "new"), { name: "Denied" }));
});

test("35. revoked ADMIN cannot moderate scoutPlayers", async () => {
  await seedUser("revoked-admin-scout", "ADMIN", "Rejected");
  await assertFails(updateDoc(doc(authedDb("revoked-admin-scout"), "scoutPlayers", "existing"), { status: "Verified" }));
});

test("36. revoked ADMIN cannot mutate settings", async () => {
  await seedUser("revoked-admin-settings", "ADMIN", "Inactive");
  await assertFails(writeSetting("revoked-admin-settings"));
});

test("37. revoked SUPERADMIN cannot manage users", async () => {
  await seedUser("revoked-super-users", "SUPERADMIN", "Suspended");
  await assertFails(updateDoc(doc(authedDb("revoked-super-users"), "users", "target-user"), { name: "Denied" }));
});

test("38. revoked SUPERADMIN cannot manage academy invites", async () => {
  await seedUser("revoked-super-invites", "SUPERADMIN", "Rejected");
  await assertFails(deleteDoc(doc(authedDb("revoked-super-invites"), "academy_invites", "FUT-STATUS")));
});

test("39. revoked SUPERADMIN cannot bypass tenant authorization", async () => {
  await seedUser("revoked-super-tenant", "SUPERADMIN", "Inactive");
  await assertFails(readAcademy("revoked-super-tenant"));
});

test("40. revoked SUPERADMIN cannot write logs", async () => {
  await seedUser("revoked-super-logs", "SUPERADMIN", "INACTIVE");
  await assertFails(setDoc(doc(authedDb("revoked-super-logs"), "logs", "denied"), { action: "PRIVILEGED_AUDIT" }));
});
