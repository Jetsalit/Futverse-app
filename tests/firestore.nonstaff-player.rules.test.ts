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
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-nonstaff-player";
const ACADEMY_A = "academy-a";
const ACADEMY_B = "academy-b";
const PLAYER_UID = "player-user";
const OTHER_PLAYER_UID = "other-player-user";
const PARENT_UID = "parent-user";
const PLAYER_A = "player-a";
const PLAYER_B = "player-b";

let testEnv: RulesTestEnvironment;

function userData(
  uid: string,
  role: string,
  academyId: string | null,
  status = "Active",
  linkedPlayerId?: string,
): DocumentData {
  return {
    uid,
    role,
    status,
    academyId,
    ...(linkedPlayerId === undefined ? {} : { linkedPlayerId }),
  };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
  status = "ACTIVE",
): DocumentData {
  return {
    userId: uid,
    academyId,
    role,
    status,
  };
}

function playerData(linkedUserId: string): DocumentData {
  return {
    name: linkedUserId,
    linkedUserId,
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

test("1. PLAYER gets own profile", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertSucceeds(getDoc(doc(
    authedDb(PLAYER_UID),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
  )));
});

test("2. PLAYER is denied another player in the same academy", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(OTHER_PLAYER_UID)],
  ]);

  await assertFails(getDoc(doc(
    authedDb(PLAYER_UID),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_B,
  )));
});

test("3. PLAYER is denied an own-linked profile on a cross-academy path", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_B}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(doc(
    authedDb(PLAYER_UID),
    "academies",
    ACADEMY_B,
    "players",
    PLAYER_A,
  )));
});

test("4. PLAYER own linkedUserId query succeeds", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(OTHER_PLAYER_UID)],
  ]);
  const snapshot = await assertSucceeds(getDocs(query(
    collection(authedDb(PLAYER_UID), "academies", ACADEMY_A, "players"),
    where("linkedUserId", "==", PLAYER_UID),
  )));

  assert.equal(snapshot.size, 1);
  assert.equal(snapshot.docs[0].id, PLAYER_A);
});

test("5. PLAYER broad list is denied", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDocs(collection(
    authedDb(PLAYER_UID),
    "academies",
    ACADEMY_A,
    "players",
  )));
});

test("6. PLAYER query for another UID is denied", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(OTHER_PLAYER_UID)],
  ]);

  await assertFails(getDocs(query(
    collection(authedDb(PLAYER_UID), "academies", ACADEMY_A, "players"),
    where("linkedUserId", "==", OTHER_PLAYER_UID),
  )));
});

test("7. PARENT gets the exact linked player", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(
      PARENT_UID,
      "PARENT",
      ACADEMY_A,
      "ACTIVE",
      PLAYER_A,
    )],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertSucceeds(getDoc(doc(
    authedDb(PARENT_UID),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
  )));
});

test("8. PARENT is denied another player", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(
      PARENT_UID,
      "PARENT",
      ACADEMY_A,
      "Active",
      PLAYER_A,
    )],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(OTHER_PLAYER_UID)],
  ]);

  await assertFails(getDoc(doc(
    authedDb(PARENT_UID),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_B,
  )));
});

test("9. PARENT receives no list access", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(
      PARENT_UID,
      "PARENT",
      ACADEMY_A,
      "Active",
      PLAYER_A,
    )],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDocs(query(
    collection(authedDb(PARENT_UID), "academies", ACADEMY_A, "players"),
    where("linkedUserId", "==", PLAYER_UID),
  )));
});

test("10. PARENT is denied the linked player on a cross-academy path", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(
      PARENT_UID,
      "PARENT",
      ACADEMY_A,
      "Active",
      PLAYER_A,
    )],
    [`academies/${ACADEMY_B}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(doc(
    authedDb(PARENT_UID),
    "academies",
    ACADEMY_B,
    "players",
    PLAYER_A,
  )));
});

test("11. missing or malformed PARENT linkedPlayerId is denied", async () => {
  const missingParent = "parent-missing-link";
  const malformedParent = "parent-malformed-link";
  await seed([
    [`users/${missingParent}`, userData(missingParent, "PARENT", ACADEMY_A)],
    [`users/${malformedParent}`, userData(
      malformedParent,
      "PARENT",
      ACADEMY_A,
      "Active",
      `${PLAYER_A}/extra`,
    )],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);
  const playerPath = ["academies", ACADEMY_A, "players", PLAYER_A] as const;

  await assertFails(getDoc(doc(authedDb(missingParent), ...playerPath)));
  await assertFails(getDoc(doc(authedDb(malformedParent), ...playerPath)));
});

test("12. USER role is denied", async () => {
  const userUid = "plain-user";
  await seed([
    [`users/${userUid}`, userData(userUid, "USER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(userUid)],
  ]);

  await assertFails(getDoc(doc(
    authedDb(userUid),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
  )));
});

test("13. anonymous access is denied", async () => {
  await seed([
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(doc(
    anonymousDb(),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
  )));
});

test("14. active ADMIN Membership retains read access", async () => {
  const adminUid = "admin-user";
  await seed([
    [`users/${adminUid}`, userData(adminUid, "ADMIN", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${adminUid}`,
      membershipData(adminUid, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertSucceeds(getDoc(doc(
    authedDb(adminUid),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
  )));
  await assertSucceeds(getDocs(collection(
    authedDb(adminUid),
    "academies",
    ACADEMY_A,
    "players",
  )));
});

test("15. active COACH Membership retains read access", async () => {
  const coachUid = "coach-user";
  await seed([
    [`users/${coachUid}`, userData(coachUid, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${coachUid}`,
      membershipData(coachUid, ACADEMY_A, "COACH")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertSucceeds(getDoc(doc(
    authedDb(coachUid),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
  )));
  await assertSucceeds(getDocs(collection(
    authedDb(coachUid),
    "academies",
    ACADEMY_A,
    "players",
  )));
});

test("16. inactive or missing staff Membership is denied", async () => {
  const inactiveAdmin = "inactive-admin";
  const missingCoach = "missing-coach";
  await seed([
    [`users/${inactiveAdmin}`, userData(inactiveAdmin, "ADMIN", ACADEMY_A)],
    [`users/${missingCoach}`, userData(missingCoach, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${inactiveAdmin}`,
      membershipData(inactiveAdmin, ACADEMY_A, "ADMIN", "REVOKED")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);
  const playerPath = ["academies", ACADEMY_A, "players", PLAYER_A] as const;

  await assertFails(getDoc(doc(authedDb(inactiveAdmin), ...playerPath)));
  await assertFails(getDoc(doc(authedDb(missingCoach), ...playerPath)));
});

test("17. SUPERADMIN retains read access", async () => {
  const superadminUid = "superadmin-user";
  await seed([
    [`users/${superadminUid}`, userData(superadminUid, "SUPERADMIN", null)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertSucceeds(getDoc(doc(
    authedDb(superadminUid),
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
  )));
  await assertSucceeds(getDocs(collection(
    authedDb(superadminUid),
    "academies",
    ACADEMY_A,
    "players",
  )));
});

test("18. PLAYER create, update, and delete are denied", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);
  const db = authedDb(PLAYER_UID);
  const ownPlayer = doc(db, "academies", ACADEMY_A, "players", PLAYER_A);
  const newPlayer = doc(db, "academies", ACADEMY_A, "players", "player-new");

  await assertFails(setDoc(newPlayer, playerData(PLAYER_UID)));
  await assertFails(updateDoc(ownPlayer, { name: "Changed" }));
  await assertFails(deleteDoc(ownPlayer));
});

test("19. PARENT create, update, and delete are denied", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(
      PARENT_UID,
      "PARENT",
      ACADEMY_A,
      "Active",
      PLAYER_A,
    )],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);
  const db = authedDb(PARENT_UID);
  const linkedPlayer = doc(db, "academies", ACADEMY_A, "players", PLAYER_A);
  const newPlayer = doc(db, "academies", ACADEMY_A, "players", "player-new");

  await assertFails(setDoc(newPlayer, playerData(PLAYER_UID)));
  await assertFails(updateDoc(linkedPlayer, { name: "Changed" }));
  await assertFails(deleteDoc(linkedPlayer));
});

test("20. PLAYER and PARENT arbitrary player subcollection access is denied", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`users/${PARENT_UID}`, userData(
      PARENT_UID,
      "PARENT",
      ACADEMY_A,
      "Active",
      PLAYER_A,
    )],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}/daily_wellness/day-1`,
      { readiness: 5 }],
  ]);
  const subcollectionPath = [
    "academies",
    ACADEMY_A,
    "players",
    PLAYER_A,
    "daily_wellness",
    "day-1",
  ] as const;
  const playerWellness = doc(authedDb(PLAYER_UID), ...subcollectionPath);
  const parentWellness = doc(authedDb(PARENT_UID), ...subcollectionPath);

  await assertFails(getDoc(playerWellness));
  await assertFails(getDoc(parentWellness));
  await assertFails(setDoc(playerWellness, { readiness: 10 }));
  await assertFails(setDoc(parentWellness, { readiness: 10 }));
});
