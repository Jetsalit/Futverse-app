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

const PROJECT_ID = "demo-futverse-legacy-root-player";

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

test("1. anonymous GET root player is denied", async () => {
  await assertFails(getDoc(doc(anonymousDb(), "players", "legacy-player-1")));
});

test("2. authenticated USER GET root player is denied", async () => {
  await seed([[`users/user-1`, userData("user-1", "USER", null)]]);
  await assertFails(getDoc(doc(authedDb("user-1"), "players", "legacy-player-1")));
});

test("3. PLAYER GET root player is denied", async () => {
  await seed([[`users/player-1`, userData("player-1", "PLAYER", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("player-1"), "players", "legacy-player-1")));
});

test("4. PARENT GET root player is denied", async () => {
  await seed([[`users/parent-1`, userData("parent-1", "PARENT", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("parent-1"), "players", "legacy-player-1")));
});

test("5. ACTIVE ADMIN GET root player is denied", async () => {
  await seed([[`users/admin-1`, userData("admin-1", "ADMIN", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("admin-1"), "players", "legacy-player-1")));
});

test("6. ACTIVE COACH GET root player is denied", async () => {
  await seed([[`users/coach-1`, userData("coach-1", "COACH", "academy-a")]]);
  await assertFails(getDoc(doc(authedDb("coach-1"), "players", "legacy-player-1")));
});

test("7. SUPERADMIN GET root player is denied", async () => {
  await seed([[`users/superadmin-1`, userData("superadmin-1", "SUPERADMIN", null)]]);
  await assertFails(getDoc(doc(authedDb("superadmin-1"), "players", "legacy-player-1")));
});

test("8. authenticated USER LIST root players is denied", async () => {
  await seed([[`users/user-1`, userData("user-1", "USER", null)]]);
  await assertFails(getDocs(collection(authedDb("user-1"), "players")));
});

test("9. ADMIN LIST root players is denied", async () => {
  await seed([[`users/admin-1`, userData("admin-1", "ADMIN", "academy-a")]]);
  await assertFails(getDocs(collection(authedDb("admin-1"), "players")));
});

test("10. SUPERADMIN LIST root players is denied", async () => {
  await seed([[`users/superadmin-1`, userData("superadmin-1", "SUPERADMIN", null)]]);
  await assertFails(getDocs(collection(authedDb("superadmin-1"), "players")));
});

test("11. authenticated USER CREATE root player is denied", async () => {
  await seed([[`users/user-1`, userData("user-1", "USER", null)]]);
  await assertFails(setDoc(doc(authedDb("user-1"), "players", "legacy-player-1"), {
    name: "Legacy Player",
  }));
});

test("12. ADMIN CREATE root player is denied", async () => {
  await seed([[`users/admin-1`, userData("admin-1", "ADMIN", "academy-a")]]);
  await assertFails(setDoc(doc(authedDb("admin-1"), "players", "legacy-player-1"), {
    name: "Legacy Player",
  }));
});

test("13. COACH UPDATE root player is denied", async () => {
  await seed([
    [`users/coach-1`, userData("coach-1", "COACH", "academy-a")],
    ["players/legacy-player-1", { name: "Old Name" }],
  ]);
  await assertFails(updateDoc(doc(authedDb("coach-1"), "players", "legacy-player-1"), {
    name: "New Name",
  }));
});

test("14. SUPERADMIN DELETE root player is denied", async () => {
  await seed([
    [`users/superadmin-1`, userData("superadmin-1", "SUPERADMIN", null)],
    ["players/legacy-player-1", { name: "Legacy Player" }],
  ]);
  await assertFails(deleteDoc(doc(authedDb("superadmin-1"), "players", "legacy-player-1")));
});

test("15. nested root player subcollection access is denied", async () => {
  await seed([
    [`users/user-1`, userData("user-1", "USER", null)],
    ["players/legacy-player-1/notes/note-1", { text: "secret" }],
  ]);
  await assertFails(getDoc(doc(authedDb("user-1"), "players", "legacy-player-1", "notes", "note-1")));
  await assertFails(setDoc(doc(authedDb("user-1"), "players", "legacy-player-1", "notes", "note-2"), {
    text: "new secret",
  }));
});

test("16. anonymous nested root access is denied", async () => {
  await seed([["players/legacy-player-1/notes/note-1", { text: "secret" }]]);
  await assertFails(getDoc(doc(anonymousDb(), "players", "legacy-player-1", "notes", "note-1")));
});
