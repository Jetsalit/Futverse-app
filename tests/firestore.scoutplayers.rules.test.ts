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

const PROJECT_ID = "demo-futverse-scoutplayers";
const USER_UID = "user-1";
const PLAYER_UID = "player-1";
const PARENT_UID = "parent-1";
const COACH_UID = "coach-1";
const ADMIN_UID = "admin-1";
const SUPERADMIN_UID = "superadmin-1";
const MISSING_ADMIN_UID = "missing-admin";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string, tokenOptions?: Record<string, unknown>): Firestore {
  return testEnv.authenticatedContext(uid, tokenOptions).firestore() as unknown as Firestore;
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

function scoutPlayerDoc(
  submittedBy: string,
  overrides: DocumentData = {},
): DocumentData {
  return {
    name: "Test Scout Player",
    status: "Pending",
    grade: "C",
    stars: 3,
    submittedBy,
    ...overrides,
  };
}

function legacyScoutPlayerDoc(): DocumentData {
  return {
    name: "Legacy Scout Player",
    status: "Pending",
    grade: "C",
    stars: 3,
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
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(getDoc(doc(anonymousDb(), "scoutPlayers", "p1")));
});

for (const [number, label, uid] of [
  [2, "USER", USER_UID],
  [3, "PLAYER", PLAYER_UID],
  [4, "PARENT", PARENT_UID],
  [5, "COACH", COACH_UID],
  [6, "ADMIN", ADMIN_UID],
  [7, "SUPERADMIN", SUPERADMIN_UID],
] as const) {
  test(`${number}. ${label} GET allowed`, async () => {
    await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
    await assertSucceeds(getDoc(doc(authedDb(uid), "scoutPlayers", "p1")));
  });
}

test("8. signed-in LIST allowed", async () => {
  await seed([
    ["scoutPlayers/p1", scoutPlayerDoc(USER_UID)],
    ["scoutPlayers/p2", scoutPlayerDoc(PLAYER_UID)],
  ]);
  await assertSucceeds(getDocs(collection(authedDb(USER_UID), "scoutPlayers")));
});

test("9. anonymous LIST denied", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(getDocs(collection(anonymousDb(), "scoutPlayers")));
});

for (const [number, label, uid] of [
  [10, "USER", USER_UID],
  [11, "PLAYER", PLAYER_UID],
  [12, "PARENT", PARENT_UID],
  [13, "COACH", COACH_UID],
] as const) {
  test(`${number}. ${label} own Pending/C/3 create allowed`, async () => {
    await assertSucceeds(
      setDoc(doc(authedDb(uid), "scoutPlayers", `new-${label.toLowerCase()}`), scoutPlayerDoc(uid)),
    );
  });
}

test("14. USER spoof submittedBy denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "scoutPlayers", "spoof-user"), scoutPlayerDoc("other-user")));
});

test("15. PLAYER spoof submittedBy denied", async () => {
  await assertFails(setDoc(doc(authedDb(PLAYER_UID), "scoutPlayers", "spoof-player"), scoutPlayerDoc(USER_UID)));
});

test("16. missing submittedBy denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "scoutPlayers", "missing-provenance"), legacyScoutPlayerDoc()));
});

test("17. USER Verified create denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "scoutPlayers", "verified-user"), scoutPlayerDoc(USER_UID, { status: "Verified" })));
});

test("18. USER A+ grade create denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "scoutPlayers", "grade-user"), scoutPlayerDoc(USER_UID, { grade: "A+" })));
});

test("19. USER 5-star create denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "scoutPlayers", "stars-user"), scoutPlayerDoc(USER_UID, { stars: 5 })));
});

test("20. PLAYER Verified create denied", async () => {
  await assertFails(setDoc(doc(authedDb(PLAYER_UID), "scoutPlayers", "verified-player"), scoutPlayerDoc(PLAYER_UID, { status: "Verified" })));
});

test("21. PARENT elevated grade create denied", async () => {
  await assertFails(setDoc(doc(authedDb(PARENT_UID), "scoutPlayers", "grade-parent"), scoutPlayerDoc(PARENT_UID, { grade: "A" })));
});

test("22. COACH elevated stars create denied", async () => {
  await assertFails(setDoc(doc(authedDb(COACH_UID), "scoutPlayers", "stars-coach"), scoutPlayerDoc(COACH_UID, { stars: 4 })));
});

test("23. ADMIN create with own submittedBy allowed", async () => {
  await assertSucceeds(setDoc(doc(authedDb(ADMIN_UID), "scoutPlayers", "admin-create"), scoutPlayerDoc(ADMIN_UID, { status: "Verified", grade: "A+", stars: 5 })));
});

test("24. SUPERADMIN create with own submittedBy allowed", async () => {
  await assertSucceeds(setDoc(doc(authedDb(SUPERADMIN_UID), "scoutPlayers", "superadmin-create"), scoutPlayerDoc(SUPERADMIN_UID, { status: "Verified", grade: "A", stars: 4 })));
});

test("25. ADMIN spoof submittedBy denied", async () => {
  await assertFails(setDoc(doc(authedDb(ADMIN_UID), "scoutPlayers", "admin-spoof"), scoutPlayerDoc(USER_UID)));
});

test("26. SUPERADMIN missing submittedBy denied", async () => {
  await assertFails(setDoc(doc(authedDb(SUPERADMIN_UID), "scoutPlayers", "superadmin-missing"), legacyScoutPlayerDoc()));
});

for (const [number, label, uid] of [
  [27, "USER", USER_UID],
  [28, "PLAYER", PLAYER_UID],
  [29, "PARENT", PARENT_UID],
  [30, "COACH", COACH_UID],
] as const) {
  test(`${number}. ${label} update denied`, async () => {
    await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
    await assertFails(updateDoc(doc(authedDb(uid), "scoutPlayers", "p1"), { name: "Changed" }));
  });
}

test("31. ADMIN normal update allowed", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertSucceeds(updateDoc(doc(authedDb(ADMIN_UID), "scoutPlayers", "p1"), { status: "Verified" }));
});

test("32. SUPERADMIN normal update allowed", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertSucceeds(updateDoc(doc(authedDb(SUPERADMIN_UID), "scoutPlayers", "p1"), { grade: "A" }));
});

test("33. ADMIN submittedBy transfer denied", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(updateDoc(doc(authedDb(ADMIN_UID), "scoutPlayers", "p1"), { submittedBy: ADMIN_UID }));
});

test("34. SUPERADMIN submittedBy transfer denied", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(updateDoc(doc(authedDb(SUPERADMIN_UID), "scoutPlayers", "p1"), { submittedBy: SUPERADMIN_UID }));
});

test("35. ADMIN can update legacy document that has no submittedBy", async () => {
  await seed([["scoutPlayers/legacy", legacyScoutPlayerDoc()]]);
  await assertSucceeds(updateDoc(doc(authedDb(ADMIN_UID), "scoutPlayers", "legacy"), { status: "Verified" }));
});

test("36. SUPERADMIN can update legacy document without submittedBy", async () => {
  await seed([["scoutPlayers/legacy", legacyScoutPlayerDoc()]]);
  await assertSucceeds(updateDoc(doc(authedDb(SUPERADMIN_UID), "scoutPlayers", "legacy"), { grade: "A" }));
});

test("37. USER delete denied", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(deleteDoc(doc(authedDb(USER_UID), "scoutPlayers", "p1")));
});

test("38. COACH delete denied", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(deleteDoc(doc(authedDb(COACH_UID), "scoutPlayers", "p1")));
});

test("39. ADMIN delete allowed", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertSucceeds(deleteDoc(doc(authedDb(ADMIN_UID), "scoutPlayers", "p1")));
});

test("40. SUPERADMIN delete allowed", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertSucceeds(deleteDoc(doc(authedDb(SUPERADMIN_UID), "scoutPlayers", "p1")));
});

test("41. signed-in nested read denied", async () => {
  await seed([["scoutPlayers/p1/child/leaf", { ok: true }]]);
  await assertFails(getDoc(doc(authedDb(USER_UID), "scoutPlayers", "p1", "child", "leaf")));
});

test("42. signed-in nested write denied", async () => {
  await assertFails(setDoc(doc(authedDb(USER_UID), "scoutPlayers", "p1", "child", "leaf"), { ok: true }));
});

test("43. anonymous nested denied", async () => {
  await seed([["scoutPlayers/p1/child/leaf", { ok: true }]]);
  await assertFails(getDoc(doc(anonymousDb(), "scoutPlayers", "p1", "child", "leaf")));
});

test("44. client role alone does not bypass authoritative user role checks", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(updateDoc(doc(authedDb(USER_UID, { role: "ADMIN" }), "scoutPlayers", "p1"), { status: "Verified" }));
});

test("45. missing admin user document does not gain admin moderation", async () => {
  await seed([["scoutPlayers/p1", scoutPlayerDoc(USER_UID)]]);
  await assertFails(updateDoc(doc(authedDb(MISSING_ADMIN_UID, { role: "ADMIN" }), "scoutPlayers", "p1"), { status: "Verified" }));
});
