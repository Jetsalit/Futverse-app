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

const PROJECT_ID = "demo-futverse-proplayers";
const USER_UID = "user-1";
const PLAYER_UID = "player-1";
const PARENT_UID = "parent-1";
const COACH_UID = "coach-1";
const ADMIN_UID = "admin-1";
const SUPERADMIN_UID = "superadmin-1";
const MISSING_ADMIN_UID = "missing-admin";

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

function userDoc(uid: string, role: string): DocumentData {
  return { uid, role, status: "Active" };
}

function proPlayerDoc(): DocumentData {
  return {
    name: "Test Pro Player",
    nationality: "Thailand",
    position: "Striker",
    createdAt: new Date().toISOString(),
  };
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
    [`users/${USER_UID}`, userDoc(USER_UID, "USER")],
    [`users/${PLAYER_UID}`, userDoc(PLAYER_UID, "PLAYER")],
    [`users/${PARENT_UID}`, userDoc(PARENT_UID, "PARENT")],
    [`users/${COACH_UID}`, userDoc(COACH_UID, "COACH")],
    [`users/${ADMIN_UID}`, userDoc(ADMIN_UID, "ADMIN")],
    [`users/${SUPERADMIN_UID}`, userDoc(SUPERADMIN_UID, "SUPERADMIN")],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test("1. anonymous GET denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(getDoc(doc(anonymousDb(), "proPlayers", "p1")));
});

test("2. USER GET allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(getDoc(doc(authedDb(USER_UID), "proPlayers", "p1")));
});

test("3. PLAYER GET allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(getDoc(doc(authedDb(PLAYER_UID), "proPlayers", "p1")));
});

test("4. PARENT GET allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(getDoc(doc(authedDb(PARENT_UID), "proPlayers", "p1")));
});

test("5. COACH GET allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(getDoc(doc(authedDb(COACH_UID), "proPlayers", "p1")));
});

test("6. ADMIN GET allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(getDoc(doc(authedDb(ADMIN_UID), "proPlayers", "p1")));
});

test("7. SUPERADMIN GET allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(getDoc(doc(authedDb(SUPERADMIN_UID), "proPlayers", "p1")));
});

test("8. signed-in LIST allowed", async () => {
  await seed([
    [`proPlayers/p1`, proPlayerDoc()],
    [`proPlayers/p2`, proPlayerDoc()],
  ]);
  await assertSucceeds(getDocs(collection(authedDb(USER_UID), "proPlayers")));
});

test("9. anonymous LIST denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(getDocs(collection(anonymousDb(), "proPlayers")));
});

test("10. USER create denied", async () => {
  await assertFails(
    setDoc(doc(authedDb(USER_UID), "proPlayers", "new-user"), proPlayerDoc()),
  );
});

test("11. PLAYER create denied", async () => {
  await assertFails(
    setDoc(doc(authedDb(PLAYER_UID), "proPlayers", "new-player"), proPlayerDoc()),
  );
});

test("12. PARENT create denied", async () => {
  await assertFails(
    setDoc(doc(authedDb(PARENT_UID), "proPlayers", "new-parent"), proPlayerDoc()),
  );
});

test("13. COACH create denied", async () => {
  await assertFails(
    setDoc(doc(authedDb(COACH_UID), "proPlayers", "new-coach"), proPlayerDoc()),
  );
});

test("14. ADMIN create allowed", async () => {
  await assertSucceeds(
    setDoc(doc(authedDb(ADMIN_UID), "proPlayers", "new-admin"), proPlayerDoc()),
  );
});

test("15. SUPERADMIN create allowed", async () => {
  await assertSucceeds(
    setDoc(doc(authedDb(SUPERADMIN_UID), "proPlayers", "new-superadmin"), proPlayerDoc()),
  );
});

test("16. USER update denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(updateDoc(doc(authedDb(USER_UID), "proPlayers", "p1"), { name: "Hacked" }));
});

test("17. PLAYER update denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(updateDoc(doc(authedDb(PLAYER_UID), "proPlayers", "p1"), { name: "Hacked" }));
});

test("18. COACH update denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(updateDoc(doc(authedDb(COACH_UID), "proPlayers", "p1"), { name: "Hacked" }));
});

test("19. ADMIN update allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(updateDoc(doc(authedDb(ADMIN_UID), "proPlayers", "p1"), { name: "Admin Update" }));
});

test("20. SUPERADMIN update allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(updateDoc(doc(authedDb(SUPERADMIN_UID), "proPlayers", "p1"), { name: "Super Update" }));
});

test("21. USER delete denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(deleteDoc(doc(authedDb(USER_UID), "proPlayers", "p1")));
});

test("22. PLAYER delete denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(deleteDoc(doc(authedDb(PLAYER_UID), "proPlayers", "p1")));
});

test("23. COACH delete denied", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertFails(deleteDoc(doc(authedDb(COACH_UID), "proPlayers", "p1")));
});

test("24. ADMIN delete allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(deleteDoc(doc(authedDb(ADMIN_UID), "proPlayers", "p1")));
});

test("25. SUPERADMIN delete allowed", async () => {
  await seed([[`proPlayers/p1`, proPlayerDoc()]]);
  await assertSucceeds(deleteDoc(doc(authedDb(SUPERADMIN_UID), "proPlayers", "p1")));
});

test("26. signed-in nested proPlayers/{id}/... read denied", async () => {
  await seed([[`proPlayers/p1/child/leaf`, { ok: true }]]);
  await assertFails(getDoc(doc(authedDb(USER_UID), "proPlayers", "p1", "child", "leaf")));
});

test("27. signed-in nested write denied", async () => {
  await assertFails(
    setDoc(doc(authedDb(USER_UID), "proPlayers", "p1", "child", "leaf"), { ok: true }),
  );
});

test("28. anonymous nested denied", async () => {
  await seed([[`proPlayers/p1/child/leaf`, { ok: true }]]);
  await assertFails(getDoc(doc(anonymousDb(), "proPlayers", "p1", "child", "leaf")));
});

test("29. ADMIN role only in auth context but missing users/{uid} doc denied", async () => {
  await assertFails(
    setDoc(doc(authedDb(MISSING_ADMIN_UID), "proPlayers", "missing-admin"), proPlayerDoc()),
  );
});

test("30. user document with USER role cannot gain writes merely through auth context", async () => {
  await assertFails(
    setDoc(doc(authedDb(USER_UID), "proPlayers", "user-writes"), proPlayerDoc()),
  );
});
