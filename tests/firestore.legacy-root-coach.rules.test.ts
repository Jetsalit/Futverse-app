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

const PROJECT_ID = "demo-futverse-legacy-root-coach";

let testEnv: RulesTestEnvironment;

function userData(uid: string, role: string, academyId: string | null, status = "Active"):
  DocumentData {
  return {
    uid,
    role,
    status,
    academyId,
  };
}

function academyMemberData(uid: string, academyId: string, role: "ADMIN" | "COACH", status = "ACTIVE") {
  return {
    userId: uid,
    academyId,
    role,
    status,
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: new Date(0),
    joinedBy: "superadmin-1",
    updatedAt: new Date(0),
  };
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
});

after(async () => {
  await testEnv.cleanup();
});

test("1. anonymous GET root coach is denied", async () => {
  await assertFails(getDoc(doc(anonymousDb(), "coaches", "legacy-coach-1")));
});

test("2. USER GET root coach is denied", async () => {
  await seed([[`users/user-1`, userData("user-1", "USER", null)]]);
  await assertFails(getDoc(doc(authedDb("user-1"), "coaches", "legacy-coach-1")));
});

test("3. PLAYER GET root coach is denied", async () => {
  await seed([[`users/player-1`, userData("player-1", "PLAYER", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("player-1"), "coaches", "legacy-coach-1")));
});

test("4. PARENT GET root coach is denied", async () => {
  await seed([[`users/parent-1`, userData("parent-1", "PARENT", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("parent-1"), "coaches", "legacy-coach-1")));
});

test("5. ADMIN GET root coach is denied", async () => {
  await seed([[`users/admin-1`, userData("admin-1", "ADMIN", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("admin-1"), "coaches", "legacy-coach-1")));
});

test("6. COACH GET root coach is denied", async () => {
  await seed([[`users/coach-1`, userData("coach-1", "COACH", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("coach-1"), "coaches", "legacy-coach-1")));
});

test("7. SUPERADMIN GET root coach is denied", async () => {
  await seed([[`users/superadmin-1`, userData("superadmin-1", "SUPERADMIN", null)]]);
  await assertFails(getDoc(doc(authedDb("superadmin-1"), "coaches", "legacy-coach-1")));
});

test("8. USER LIST root coaches is denied", async () => {
  await seed([[`users/user-1`, userData("user-1", "USER", null)]]);
  await assertFails(getDocs(collection(authedDb("user-1"), "coaches")));
});

test("9. ADMIN LIST root coaches is denied", async () => {
  await seed([[`users/admin-1`, userData("admin-1", "ADMIN", "academy-a")]]);
  await assertFails(getDocs(collection(authedDb("admin-1"), "coaches")));
});

test("10. SUPERADMIN LIST root coaches is denied", async () => {
  await seed([[`users/superadmin-1`, userData("superadmin-1", "SUPERADMIN", null)]]);
  await assertFails(getDocs(collection(authedDb("superadmin-1"), "coaches")));
});

test("11. USER CREATE root coach is denied", async () => {
  await seed([[`users/user-1`, userData("user-1", "USER", null)]]);
  await assertFails(setDoc(doc(authedDb("user-1"), "coaches", "legacy-coach-1"), {
    name: "Legacy Coach",
  }));
});

test("12. ADMIN CREATE root coach is denied", async () => {
  await seed([[`users/admin-1`, userData("admin-1", "ADMIN", "academy-a")]]);
  await assertFails(setDoc(doc(authedDb("admin-1"), "coaches", "legacy-coach-1"), {
    name: "Legacy Coach",
  }));
});

test("13. COACH UPDATE existing root coach is denied", async () => {
  await seed([
    [`users/coach-1`, userData("coach-1", "COACH", "academy-a")],
    ["coaches/legacy-coach-1", { name: "Old Name" }],
  ]);
  await assertFails(updateDoc(doc(authedDb("coach-1"), "coaches", "legacy-coach-1"), {
    name: "New Name",
  }));
});

test("14. SUPERADMIN DELETE existing root coach is denied", async () => {
  await seed([
    [`users/superadmin-1`, userData("superadmin-1", "SUPERADMIN", null)],
    ["coaches/legacy-coach-1", { name: "Legacy Coach" }],
  ]);
  await assertFails(deleteDoc(doc(authedDb("superadmin-1"), "coaches", "legacy-coach-1")));
});

test("15. signed-in nested root coach access is denied", async () => {
  await seed([
    [`users/user-1`, userData("user-1", "USER", null)],
    ["coaches/legacy-coach-1/notes/note-1", { text: "secret" }],
  ]);
  await assertFails(getDoc(doc(authedDb("user-1"), "coaches", "legacy-coach-1", "notes", "note-1")));
  await assertFails(setDoc(doc(authedDb("user-1"), "coaches", "legacy-coach-1", "notes", "note-2"), {
    text: "new secret",
  }));
});

test("16. anonymous nested root access is denied", async () => {
  await seed([["coaches/legacy-coach-1/notes/note-1", { text: "secret" }]]);
  await assertFails(getDoc(doc(anonymousDb(), "coaches", "legacy-coach-1", "notes", "note-1")));
});

test("17. ACTIVE ADMIN can read academy-scoped coach", async () => {
  await seed([
    [`users/admin-user`, userData("admin-user", "ADMIN", "academy-a")],
    [`academies/academy-a/members/admin-user`, academyMemberData("admin-user", "academy-a", "ADMIN")],
    [`academies/academy-a/coaches/coach-profile-a`, { name: "Coach A", status: "ACTIVE" }],
  ]);

  await assertSucceeds(getDoc(doc(authedDb("admin-user"), "academies", "academy-a", "coaches", "coach-profile-a")));
});

test("18. ACTIVE ADMIN can create/update academy-scoped coach", async () => {
  await seed([
    [`users/admin-user`, userData("admin-user", "ADMIN", "academy-a")],
    [`academies/academy-a/members/admin-user`, academyMemberData("admin-user", "academy-a", "ADMIN")],
    [`academies/academy-a/coaches/coach-profile-a`, { name: "Coach A", status: "ACTIVE" }],
  ]);

  await assertSucceeds(setDoc(doc(authedDb("admin-user"), "academies", "academy-a", "coaches", "coach-profile-b"), {
    name: "Coach B",
    status: "ACTIVE",
  }));

  await assertSucceeds(updateDoc(doc(authedDb("admin-user"), "academies", "academy-a", "coaches", "coach-profile-a"), {
    name: "Updated Coach A",
  }));
});

test("19. ACTIVE COACH can read academy-scoped coach", async () => {
  await seed([
    [`users/coach-user`, userData("coach-user", "COACH", "academy-a")],
    [`academies/academy-a/members/coach-user`, academyMemberData("coach-user", "academy-a", "COACH")],
    [`academies/academy-a/coaches/coach-profile-a`, { name: "Coach A", status: "ACTIVE" }],
  ]);

  await assertSucceeds(getDoc(doc(authedDb("coach-user"), "academies", "academy-a", "coaches", "coach-profile-a")));
});

test("20. ACTIVE COACH cannot create/update academy coach if current rules do not permit it", async () => {
  await seed([
    [`users/coach-user`, userData("coach-user", "COACH", "academy-a")],
    [`academies/academy-a/members/coach-user`, academyMemberData("coach-user", "academy-a", "COACH")],
    [`academies/academy-a/coaches/coach-profile-a`, { name: "Coach A", status: "ACTIVE" }],
  ]);

  await assertFails(setDoc(doc(authedDb("coach-user"), "academies", "academy-a", "coaches", "coach-profile-b"), {
    name: "Coach B",
    status: "ACTIVE",
  }));

  await assertFails(updateDoc(doc(authedDb("coach-user"), "academies", "academy-a", "coaches", "coach-profile-a"), {
    name: "Updated Coach A",
  }));
});

test("21. SUPERADMIN can read/write academy-scoped coach", async () => {
  await seed([
    [`users/superadmin-1`, userData("superadmin-1", "SUPERADMIN", null)],
    [`academies/academy-a/coaches/coach-profile-a`, { name: "Coach A", status: "ACTIVE" }],
  ]);

  await assertSucceeds(getDoc(doc(authedDb("superadmin-1"), "academies", "academy-a", "coaches", "coach-profile-a")));
  await assertSucceeds(updateDoc(doc(authedDb("superadmin-1"), "academies", "academy-a", "coaches", "coach-profile-a"), {
    name: "Updated by Superadmin",
  }));
});
