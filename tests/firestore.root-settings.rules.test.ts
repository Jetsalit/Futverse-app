import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-root-settings";
const ACADEMY_ID = "academy-settings";

let testEnv: RulesTestEnvironment;

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

async function seedUser(uid: string, role: unknown, status: unknown = "ACTIVE") {
  await seed([[
    `users/${uid}`,
    {
      uid,
      role,
      ...(status === undefined ? {} : { status }),
    },
  ]]);
}

async function seedTenantUser(
  uid: string,
  role: "ADMIN" | "COACH",
  membershipStatus = "ACTIVE",
  storedAcademyId = ACADEMY_ID,
) {
  await seedUser(uid, role);
  await seed([[
    `academies/${ACADEMY_ID}/members/${uid}`,
    {
      userId: uid,
      academyId: storedAcademyId,
      role,
      status: membershipStatus,
    },
  ]]);
}

function rootSetting(db: Firestore) {
  return doc(db, "settings", "security");
}

function academySettingsDocument(db: Firestore) {
  return doc(db, "academies", ACADEMY_ID);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost) {
    throw new Error("Rules tests must run through the Firestore Emulator.");
  }
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  if (!host || !Number.isInteger(port)) {
    throw new Error("Invalid FIRESTORE_EMULATOR_HOST.");
  }

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
    ["settings/security", { enabled: true }],
    ["settings/security/details/private", { value: "closed" }],
    [
      `academies/${ACADEMY_ID}`,
      {
        name: "Settings Academy",
        shortName: "Settings",
        logoUrl: null,
        squads: ["U15"],
      },
    ],
    [
      `academies/${ACADEMY_ID}/settings/profile`,
      { theme: "unused-nested-shape" },
    ],
    ["unmatched/document", { value: true }],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test("1. anonymous root settings document read is denied", async () => {
  await assertFails(getDoc(rootSetting(anonymousDb())));
});

test("2. anonymous root settings collection read is denied", async () => {
  await assertFails(getDocs(collection(anonymousDb(), "settings")));
});

for (const [number, role] of [
  [3, "USER"],
  [4, "PLAYER"],
  [5, "PARENT"],
  [6, "SCOUT"],
  [7, "DATA_ADMIN"],
] as const) {
  test(`${number}. active ${role} root settings read is denied`, async () => {
    const uid = `root-settings-${role.toLowerCase()}`;
    await seedUser(uid, role);
    await assertFails(getDoc(rootSetting(authedDb(uid))));
  });
}

for (const [number, role] of [
  [8, "ADMIN"],
  [9, "COACH"],
] as const) {
  test(`${number}. exact active tenant ${role} root settings read is denied`, async () => {
    const uid = `root-settings-${role.toLowerCase()}`;
    await seedTenantUser(uid, role);
    await assertFails(getDoc(rootSetting(authedDb(uid))));
  });
}

for (const [number, label, role, status] of [
  [10, "Inactive", "SUPERADMIN", "Inactive"],
  [11, "INACTIVE", "SUPERADMIN", "INACTIVE"],
  [12, "missing status", "SUPERADMIN", undefined],
  [13, "lowercase status", "SUPERADMIN", "active"],
  [14, "malformed role", ["SUPERADMIN"], "ACTIVE"],
] as const) {
  test(`${number}. ${label} SUPERADMIN root settings read is denied`, async () => {
    const uid = `root-settings-malformed-super-${number}`;
    await seedUser(uid, role, status);
    await assertFails(getDoc(rootSetting(authedDb(uid))));
  });
}

test("15. exact active SUPERADMIN root settings document read is denied by the fail-closed policy", async () => {
  await seedUser("root-settings-super", "SUPERADMIN", "ACTIVE");
  await assertFails(getDoc(rootSetting(authedDb("root-settings-super"))));
});

test("16. exact active SUPERADMIN root settings collection read is denied by the fail-closed policy", async () => {
  await seedUser("root-settings-super-list", "SUPERADMIN", "Active");
  await assertFails(getDocs(collection(authedDb("root-settings-super-list"), "settings")));
});

test("17. exact active SUPERADMIN cannot create a root setting", async () => {
  await seedUser("root-settings-super-create", "SUPERADMIN", "ACTIVE");
  await assertFails(setDoc(
    doc(authedDb("root-settings-super-create"), "settings", "new-setting"),
    { enabled: true },
  ));
});

test("18. exact active SUPERADMIN cannot update a root setting", async () => {
  await seedUser("root-settings-super-update", "SUPERADMIN", "ACTIVE");
  await assertFails(updateDoc(
    rootSetting(authedDb("root-settings-super-update")),
    { enabled: false },
  ));
});

test("19. exact active SUPERADMIN cannot delete a root setting", async () => {
  await seedUser("root-settings-super-delete", "SUPERADMIN", "ACTIVE");
  await assertFails(deleteDoc(rootSetting(authedDb("root-settings-super-delete"))));
});

test("20. recursive root settings descendants are also denied", async () => {
  await seedUser("root-settings-super-descendant", "SUPERADMIN", "ACTIVE");
  await assertFails(getDoc(doc(
    authedDb("root-settings-super-descendant"),
    "settings",
    "security",
    "details",
    "private",
  )));
});

test("21. exact ACTIVE tenant ADMIN can still read Academy settings fields", async () => {
  await seedTenantUser("academy-settings-admin-read", "ADMIN");
  await assertSucceeds(getDoc(
    academySettingsDocument(authedDb("academy-settings-admin-read")),
  ));
});

test("22. exact ACTIVE tenant COACH can still read Academy settings fields", async () => {
  await seedTenantUser("academy-settings-coach-read", "COACH");
  await assertSucceeds(getDoc(
    academySettingsDocument(authedDb("academy-settings-coach-read")),
  ));
});

test("23. exact ACTIVE tenant ADMIN can still update Academy settings fields", async () => {
  await seedTenantUser("academy-settings-admin-write", "ADMIN");
  await assertSucceeds(updateDoc(
    academySettingsDocument(authedDb("academy-settings-admin-write")),
    { shortName: "Updated" },
  ));
});

test("24. exact ACTIVE tenant COACH still cannot update Academy settings fields", async () => {
  await seedTenantUser("academy-settings-coach-write", "COACH");
  await assertFails(updateDoc(
    academySettingsDocument(authedDb("academy-settings-coach-write")),
    { shortName: "Denied" },
  ));
});

test("25. inactive tenant user with ACTIVE Membership cannot read Academy settings fields", async () => {
  await seedTenantUser("academy-settings-inactive-user", "ADMIN");
  await seedUser("academy-settings-inactive-user", "ADMIN", "Inactive");
  await assertFails(getDoc(
    academySettingsDocument(authedDb("academy-settings-inactive-user")),
  ));
});

test("26. ACTIVE tenant user with non-ACTIVE Membership cannot read Academy settings fields", async () => {
  await seedTenantUser("academy-settings-inactive-member", "ADMIN", "SUSPENDED");
  await assertFails(getDoc(
    academySettingsDocument(authedDb("academy-settings-inactive-member")),
  ));
});

test("27. unused Academy settings subcollection remains denied and is not widened", async () => {
  await seedTenantUser("academy-settings-nested", "ADMIN");
  await assertFails(getDoc(doc(
    authedDb("academy-settings-nested"),
    "academies",
    ACADEMY_ID,
    "settings",
    "profile",
  )));
});

test("28. final catch-all deny remains effective", async () => {
  await seedUser("root-settings-catch-all", "SUPERADMIN", "ACTIVE");
  await assertFails(getDoc(doc(
    authedDb("root-settings-catch-all"),
    "unmatched",
    "document",
  )));
});
