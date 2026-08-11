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
  collectionGroup,
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
const PLAYER_C = "player-c";

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
    activeAcademyId: academyId,
    ...(linkedPlayerId === undefined ? {} : { linkedPlayerId }),
  };
}

function membershipData(
  uid: string,
  academyId: string,
  role: "ADMIN" | "COACH",
  status = "ACTIVE",
): DocumentData {
  return { userId: uid, academyId, role, status };
}

function associationData(
  uid: string,
  academyId: string,
  playerId: string,
  role: "PLAYER" | "PARENT" | string,
  status = "ACTIVE",
): DocumentData {
  return { userId: uid, academyId, playerId, role, status };
}

function associationPath(academyId: string, uid: string, playerId: string) {
  return `academies/${academyId}/nonstaffUsers/${uid}/playerAssociations/${playerId}`;
}

function playerData(linkedUserId: string): DocumentData {
  return { name: linkedUserId, linkedUserId };
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

const playerReference = (db: Firestore, academyId: string, playerId: string) =>
  doc(db, "academies", academyId, "players", playerId);

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

test("legacy academyId alone grants no player access", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(PLAYER_UID), ACADEMY_A, PLAYER_A)));
});

test("legacy linkedPlayerId alone grants no parent access", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A, "Active", PLAYER_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(PARENT_UID), ACADEMY_A, PLAYER_A)));
});

test("exact ACTIVE PLAYER association permits only its canonical player get", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_B)],
    [associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
      associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PLAYER")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(OTHER_PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(PLAYER_UID)],
  ]);
  const db = authedDb(PLAYER_UID);

  await assertSucceeds(getDoc(playerReference(db, ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(playerReference(db, ACADEMY_A, PLAYER_B)));
  await assertFails(getDocs(collection(db, "academies", ACADEMY_A, "players")));
  await assertFails(getDocs(query(
    collection(db, "academies", ACADEMY_A, "players"),
    where("linkedUserId", "==", PLAYER_UID),
  )));
});

test("exact ACTIVE PARENT associations permit multiple explicit children only", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A)],
    [associationPath(ACADEMY_A, PARENT_UID, PLAYER_A),
      associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT")],
    [associationPath(ACADEMY_A, PARENT_UID, PLAYER_B),
      associationData(PARENT_UID, ACADEMY_A, PLAYER_B, "PARENT")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(OTHER_PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_C}`, playerData("third-user")],
  ]);
  const db = authedDb(PARENT_UID);

  await assertSucceeds(getDoc(playerReference(db, ACADEMY_A, PLAYER_A)));
  await assertSucceeds(getDoc(playerReference(db, ACADEMY_A, PLAYER_B)));
  await assertFails(getDoc(playerReference(db, ACADEMY_A, PLAYER_C)));
  await assertFails(getDocs(collection(db, "academies", ACADEMY_A, "players")));
});

test("wrong UID, academy, or player ID is denied", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`users/${OTHER_PLAYER_UID}`, userData(OTHER_PLAYER_UID, "PLAYER", ACADEMY_A)],
    [associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
      associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PLAYER")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_B}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(OTHER_PLAYER_UID), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(playerReference(authedDb(PLAYER_UID), ACADEMY_B, PLAYER_A)));
  await assertFails(getDoc(playerReference(authedDb(PLAYER_UID), ACADEMY_A, PLAYER_B)));
});

test("malformed canonical association identity is denied", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A), {
      ...associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PLAYER"),
      playerId: PLAYER_B,
    }],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(PLAYER_UID), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(doc(
    authedDb(PLAYER_UID),
    associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
  )));
});

test("unknown or account-mismatched association role is denied", async () => {
  const unknownUid = "unknown-role-user";
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`users/${unknownUid}`, userData(unknownUid, "PLAYER", ACADEMY_A)],
    [associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
      associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PARENT")],
    [associationPath(ACADEMY_A, unknownUid, PLAYER_B),
      associationData(unknownUid, ACADEMY_A, PLAYER_B, "UNKNOWN")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_B}`, playerData(unknownUid)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(PLAYER_UID), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(playerReference(authedDb(unknownUid), ACADEMY_A, PLAYER_B)));
});

test("missing, inactive, and revoked associations are denied", async () => {
  const inactiveUid = "inactive-association-user";
  const revokedUid = "revoked-association-user";
  const missingUid = "missing-association-user";
  await seed([
    [`users/${inactiveUid}`, userData(inactiveUid, "PLAYER", ACADEMY_A)],
    [`users/${revokedUid}`, userData(revokedUid, "PLAYER", ACADEMY_A)],
    [`users/${missingUid}`, userData(missingUid, "PLAYER", ACADEMY_A)],
    [associationPath(ACADEMY_A, inactiveUid, PLAYER_A),
      associationData(inactiveUid, ACADEMY_A, PLAYER_A, "PLAYER", "INACTIVE")],
    [associationPath(ACADEMY_A, revokedUid, PLAYER_A),
      associationData(revokedUid, ACADEMY_A, PLAYER_A, "PLAYER", "REVOKED")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(inactiveUid), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(playerReference(authedDb(revokedUid), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(playerReference(authedDb(missingUid), ACADEMY_A, PLAYER_A)));
});

test("inactive nonstaff account is denied despite an ACTIVE association", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A, "Inactive")],
    [associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
      associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PLAYER")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(PLAYER_UID), ACADEMY_A, PLAYER_A)));
});

test("stale and tampered legacy pointers cannot cross academies", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_B, "Active", PLAYER_B)],
    [associationPath(ACADEMY_A, PARENT_UID, PLAYER_A),
      associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_B}/players/${PLAYER_B}`, playerData(OTHER_PLAYER_UID)],
  ]);

  await assertSucceeds(getDoc(playerReference(authedDb(PARENT_UID), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(playerReference(authedDb(PARENT_UID), ACADEMY_B, PLAYER_B)));
});

test("owner can continuously query only canonical association documents", async () => {
  await seed([
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A)],
    [associationPath(ACADEMY_A, PARENT_UID, PLAYER_A),
      associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT")],
    [associationPath(ACADEMY_A, PARENT_UID, PLAYER_B),
      associationData(PARENT_UID, ACADEMY_A, PLAYER_B, "PARENT", "REVOKED")],
  ]);

  const snapshot = await assertSucceeds(getDocs(query(
    collectionGroup(authedDb(PARENT_UID), "playerAssociations"),
    where("userId", "==", PARENT_UID),
  )));
  assert.equal(snapshot.size, 2);

  await assertFails(getDocs(query(
    collectionGroup(authedDb(OTHER_PLAYER_UID), "playerAssociations"),
    where("userId", "==", PARENT_UID),
  )));
});

test("association reads are limited to owner, active staff, and active SUPERADMIN", async () => {
  const adminUid = "admin-user";
  const coachUid = "coach-user";
  const superUid = "super-user";
  const association = associationPath(ACADEMY_A, PARENT_UID, PLAYER_A);
  await seed([
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A)],
    [`users/${adminUid}`, userData(adminUid, "ADMIN", ACADEMY_A)],
    [`users/${coachUid}`, userData(coachUid, "COACH", ACADEMY_A)],
    [`users/${superUid}`, userData(superUid, "SUPERADMIN", null)],
    [`academies/${ACADEMY_A}/members/${adminUid}`,
      membershipData(adminUid, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/members/${coachUid}`,
      membershipData(coachUid, ACADEMY_A, "COACH")],
    [association, associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT")],
  ]);

  await assertSucceeds(getDoc(doc(authedDb(PARENT_UID), association)));
  await assertSucceeds(getDoc(doc(authedDb(adminUid), association)));
  await assertSucceeds(getDoc(doc(authedDb(coachUid), association)));
  await assertSucceeds(getDoc(doc(authedDb(superUid), association)));
  await assertFails(getDoc(doc(authedDb(OTHER_PLAYER_UID), association)));
  await assertFails(getDoc(doc(anonymousDb(), association)));
});

test("PLAYER and PARENT cannot create, edit, or delete associations", async () => {
  const playerAssociation = associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A);
  const parentAssociation = associationPath(ACADEMY_A, PARENT_UID, PLAYER_B);
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A)],
    [playerAssociation, associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PLAYER")],
  ]);

  await assertFails(updateDoc(doc(authedDb(PLAYER_UID), playerAssociation), { status: "REVOKED" }));
  await assertFails(deleteDoc(doc(authedDb(PLAYER_UID), playerAssociation)));
  await assertFails(setDoc(
    doc(authedDb(PARENT_UID), parentAssociation),
    associationData(PARENT_UID, ACADEMY_A, PLAYER_B, "PARENT"),
  ));
});

test("active Academy ADMIN can provision and revoke a canonical association", async () => {
  const adminUid = "admin-user";
  const association = associationPath(ACADEMY_A, PARENT_UID, PLAYER_A);
  await seed([
    [`users/${adminUid}`, userData(adminUid, "ADMIN", ACADEMY_A)],
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${adminUid}`,
      membershipData(adminUid, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);
  const associationReference = doc(authedDb(adminUid), association);

  await assertSucceeds(setDoc(
    associationReference,
    associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT"),
  ));
  await assertFails(updateDoc(associationReference, { role: "PLAYER" }));
  await assertSucceeds(updateDoc(associationReference, { status: "REVOKED" }));
  await assertSucceeds(deleteDoc(associationReference));
});

test("association provisioning fails closed for missing targets and COACH writers", async () => {
  const adminUid = "admin-user";
  const coachUid = "coach-user";
  const association = associationPath(ACADEMY_A, PARENT_UID, PLAYER_A);
  await seed([
    [`users/${adminUid}`, userData(adminUid, "ADMIN", ACADEMY_A)],
    [`users/${coachUid}`, userData(coachUid, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${adminUid}`,
      membershipData(adminUid, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/members/${coachUid}`,
      membershipData(coachUid, ACADEMY_A, "COACH")],
  ]);

  await assertFails(setDoc(
    doc(authedDb(adminUid), association),
    associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT"),
  ));

  await seed([
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);
  await assertFails(setDoc(
    doc(authedDb(coachUid), association),
    associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT"),
  ));
});

test("PLAYER and PARENT player writes and arbitrary subcollections remain denied", async () => {
  await seed([
    [`users/${PLAYER_UID}`, userData(PLAYER_UID, "PLAYER", ACADEMY_A)],
    [`users/${PARENT_UID}`, userData(PARENT_UID, "PARENT", ACADEMY_A)],
    [associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
      associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PLAYER")],
    [associationPath(ACADEMY_A, PARENT_UID, PLAYER_A),
      associationData(PARENT_UID, ACADEMY_A, PLAYER_A, "PARENT")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}/daily_wellness/day-1`, { readiness: 5 }],
  ]);

  for (const uid of [PLAYER_UID, PARENT_UID]) {
    const db = authedDb(uid);
    const player = playerReference(db, ACADEMY_A, PLAYER_A);
    await assertFails(setDoc(playerReference(db, ACADEMY_A, "new-player"), playerData(uid)));
    await assertFails(updateDoc(player, { name: "Changed" }));
    await assertFails(deleteDoc(player));
    await assertFails(getDoc(doc(
      db,
      "academies",
      ACADEMY_A,
      "players",
      PLAYER_A,
      "daily_wellness",
      "day-1",
    )));
  }
});

test("active ADMIN and COACH Membership player read/list/write behavior is unchanged", async () => {
  const adminUid = "admin-user";
  const coachUid = "coach-user";
  await seed([
    [`users/${adminUid}`, userData(adminUid, "ADMIN", ACADEMY_A)],
    [`users/${coachUid}`, userData(coachUid, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${adminUid}`,
      membershipData(adminUid, ACADEMY_A, "ADMIN")],
    [`academies/${ACADEMY_A}/members/${coachUid}`,
      membershipData(coachUid, ACADEMY_A, "COACH")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  for (const uid of [adminUid, coachUid]) {
    const db = authedDb(uid);
    await assertSucceeds(getDoc(playerReference(db, ACADEMY_A, PLAYER_A)));
    await assertSucceeds(getDocs(collection(db, "academies", ACADEMY_A, "players")));
    const created = playerReference(db, ACADEMY_A, `created-by-${uid}`);
    await assertSucceeds(setDoc(created, playerData(uid)));
    await assertSucceeds(updateDoc(created, { name: "updated" }));
    await assertSucceeds(deleteDoc(created));
  }
});

test("inactive or missing staff Membership is denied", async () => {
  const inactiveAdmin = "inactive-admin";
  const missingCoach = "missing-coach";
  await seed([
    [`users/${inactiveAdmin}`, userData(inactiveAdmin, "ADMIN", ACADEMY_A)],
    [`users/${missingCoach}`, userData(missingCoach, "COACH", ACADEMY_A)],
    [`academies/${ACADEMY_A}/members/${inactiveAdmin}`,
      membershipData(inactiveAdmin, ACADEMY_A, "ADMIN", "REVOKED")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(authedDb(inactiveAdmin), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(playerReference(authedDb(missingCoach), ACADEMY_A, PLAYER_A)));
});

test("only active SUPERADMIN retains broad player access", async () => {
  const activeUid = "active-superadmin";
  const inactiveUid = "inactive-superadmin";
  await seed([
    [`users/${activeUid}`, userData(activeUid, "SUPERADMIN", null)],
    [`users/${inactiveUid}`, userData(inactiveUid, "SUPERADMIN", null, "Inactive")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertSucceeds(getDoc(playerReference(authedDb(activeUid), ACADEMY_A, PLAYER_A)));
  await assertSucceeds(getDocs(collection(authedDb(activeUid), "academies", ACADEMY_A, "players")));
  await assertFails(getDoc(playerReference(authedDb(inactiveUid), ACADEMY_A, PLAYER_A)));
});

test("anonymous player and association access is denied", async () => {
  await seed([
    [associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
      associationData(PLAYER_UID, ACADEMY_A, PLAYER_A, "PLAYER")],
    [`academies/${ACADEMY_A}/players/${PLAYER_A}`, playerData(PLAYER_UID)],
  ]);

  await assertFails(getDoc(playerReference(anonymousDb(), ACADEMY_A, PLAYER_A)));
  await assertFails(getDoc(doc(
    anonymousDb(),
    associationPath(ACADEMY_A, PLAYER_UID, PLAYER_A),
  )));
});
