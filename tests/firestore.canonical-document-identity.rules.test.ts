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
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-canonical-document-identity";
const ACADEMY_ID = "academy-a";
const SUPERADMIN_UID = "superadmin-a";
const ADMIN_UID = "admin-a";
const COACH_UID = "coach-a";
const USER_UID = "user-a";
const SECOND_USER_UID = "user-b";
const INVITE_CODE = "FUT-ACADEMY-A";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([documentPath, data]) =>
        setDoc(doc(context.firestore(), documentPath), data)
      ),
    );
  });
}

function userData(uid: string, role: string): DocumentData {
  return { uid, name: uid, role, status: "Active" };
}

function membershipData(uid: string, role: "ADMIN" | "COACH"): DocumentData {
  return {
    userId: uid,
    academyId: ACADEMY_ID,
    role,
    status: "ACTIVE",
    source: "INVITE",
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    joinedBy: SUPERADMIN_UID,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function pendingClaim(uid: string, overrides: DocumentData = {}): DocumentData {
  return {
    type: "ACADEMY_JOIN",
    userId: uid,
    requestedRole: "ADMIN",
    inviteCode: INVITE_CODE,
    requestedAcademyId: ACADEMY_ID,
    status: "PENDING",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
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
    [`users/${SUPERADMIN_UID}`, userData(SUPERADMIN_UID, "SUPERADMIN")],
    [`users/${ADMIN_UID}`, userData(ADMIN_UID, "ADMIN")],
    [`users/${COACH_UID}`, userData(COACH_UID, "COACH")],
    [`users/${USER_UID}`, userData(USER_UID, "USER")],
    [`users/${SECOND_USER_UID}`, userData(SECOND_USER_UID, "USER")],
    [`academies/${ACADEMY_ID}`, { name: "Academy A" }],
    [`academies/${ACADEMY_ID}/members/${ADMIN_UID}`, membershipData(ADMIN_UID, "ADMIN")],
    [`academies/${ACADEMY_ID}/members/${COACH_UID}`, membershipData(COACH_UID, "COACH")],
    [`academy_invites/${INVITE_CODE}`, {
      inviteCode: INVITE_CODE,
      academyId: ACADEMY_ID,
      status: "ACTIVE",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      createdBy: SUPERADMIN_UID,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedBy: SUPERADMIN_UID,
    }],
  ]);
});

after(async () => {
  await testEnv.cleanup();
});

test("1. tenant Player creates without id pass and stored id creates fail", async () => {
  const db = authedDb(COACH_UID);
  await assertSucceeds(setDoc(
    doc(db, "academies", ACADEMY_ID, "players", "player-good"),
    { name: "Player Good" },
  ));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_ID, "players", "player-bad"),
    { id: "victim-player", name: "Player Bad" },
  ));
});

test("2. tenant Player update cannot add/change id and can remove a malformed legacy id", async () => {
  await seed([[
    `academies/${ACADEMY_ID}/players/player-legacy`,
    { id: "victim-player", name: "Legacy" },
  ]]);
  const ref = doc(authedDb(ADMIN_UID), "academies", ACADEMY_ID, "players", "player-legacy");

  await assertFails(updateDoc(ref, { id: "another-victim", name: "Blocked" }));
  await assertSucceeds(updateDoc(ref, { id: deleteField(), name: "Canonical edit" }));
});

test("3. Coach records reject stored id and allow authorized legacy-id cleanup", async () => {
  const db = authedDb(ADMIN_UID);
  await assertSucceeds(setDoc(
    doc(db, "academies", ACADEMY_ID, "coaches", "coach-good"),
    { firstName: "Good", userId: "coach-good" },
  ));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_ID, "coaches", "coach-bad"),
    { id: "victim-coach", firstName: "Bad" },
  ));
  await seed([[
    `academies/${ACADEMY_ID}/coaches/coach-legacy`,
    { id: "victim-coach", firstName: "Legacy" },
  ]]);
  await assertSucceeds(updateDoc(
    doc(db, "academies", ACADEMY_ID, "coaches", "coach-legacy"),
    { id: deleteField(), firstName: "Canonical edit" },
  ));
});

test("4. Drill writes omit id, deny mismatches, and clean legacy id on canonical update", async () => {
  const db = authedDb(USER_UID);
  const goodRef = doc(db, "drills", "drill-good");
  await assertSucceeds(setDoc(goodRef, { title: "Good", created_by: USER_UID }));
  await assertFails(updateDoc(goodRef, { id: "victim-drill", title: "Blocked" }));
  await assertFails(setDoc(
    doc(db, "drills", "drill-bad"),
    { id: "victim-drill", title: "Bad", created_by: USER_UID },
  ));
  await seed([["drills/drill-legacy", {
    id: "victim-drill",
    title: "Legacy",
    created_by: USER_UID,
  }]]);
  await assertSucceeds(updateDoc(
    doc(db, "drills", "drill-legacy"),
    { id: deleteField(), title: "Canonical edit" },
  ));
});

test("5. ProPlayer writes omit id, deny mismatches, and clean legacy id", async () => {
  const db = authedDb(ADMIN_UID);
  await assertSucceeds(setDoc(doc(db, "proPlayers", "pro-good"), { name: "Good" }));
  await assertFails(setDoc(
    doc(db, "proPlayers", "pro-bad"),
    { id: "victim-pro", name: "Bad" },
  ));
  await seed([["proPlayers/pro-legacy", { id: "victim-pro", name: "Legacy" }]]);
  await assertSucceeds(updateDoc(
    doc(db, "proPlayers", "pro-legacy"),
    { id: deleteField(), name: "Canonical edit" },
  ));
});

test("6. ScoutPlayer creates reject id and admin update removes legacy id", async () => {
  const userDb = authedDb(USER_UID);
  const base = { name: "Scout", submittedBy: USER_UID, status: "Pending", grade: "C", stars: 3 };
  await assertSucceeds(setDoc(doc(userDb, "scoutPlayers", "scout-good"), base));
  await assertFails(setDoc(
    doc(userDb, "scoutPlayers", "scout-bad"),
    { ...base, id: "victim-scout" },
  ));
  await seed([["scoutPlayers/scout-legacy", {
    ...base,
    id: "victim-scout",
  }]]);
  await assertSucceeds(updateDoc(
    doc(authedDb(ADMIN_UID), "scoutPlayers", "scout-legacy"),
    { id: deleteField(), name: "Canonical edit" },
  ));
});

test("7. Academy writes reject id and allow legacy-id cleanup", async () => {
  const ref = doc(authedDb(ADMIN_UID), "academies", ACADEMY_ID);
  await assertSucceeds(updateDoc(ref, { shortName: "A" }));
  await assertFails(updateDoc(ref, { id: "victim-academy" }));
  await seed([[`academies/${ACADEMY_ID}`, { id: "victim-academy", name: "Academy A" }]]);
  await assertSucceeds(updateDoc(ref, { id: deleteField(), shortName: "Canonical edit" }));
});

test("8. User writes bind uid to path and reject stored id", async () => {
  const ref = doc(authedDb(SUPERADMIN_UID), "users", USER_UID);
  await assertSucceeds(updateDoc(ref, { uid: USER_UID, status: "ACTIVE" }));
  await assertFails(updateDoc(ref, { uid: "victim-user" }));
  await assertFails(updateDoc(ref, { id: "victim-user" }));
});

test("9. User legacy id and mismatched uid can be repaired only to canonical path identity", async () => {
  await seed([[`users/${USER_UID}`, {
    id: "victim-user",
    uid: "victim-user",
    name: "Legacy",
    role: "USER",
    status: "Active",
  }]]);
  const ref = doc(authedDb(SUPERADMIN_UID), "users", USER_UID);

  await assertFails(updateDoc(ref, { id: deleteField(), uid: "other-user" }));
  await assertSucceeds(updateDoc(ref, { id: deleteField(), uid: USER_UID }));
});

test("10. Membership creates omit id and reject a redundant stored id", async () => {
  const db = authedDb(ADMIN_UID);
  const write = (uid: string) => ({
    userId: uid,
    academyId: ACADEMY_ID,
    role: "COACH",
    status: "ACTIVE",
    source: "INVITE",
    joinedAt: serverTimestamp(),
    joinedBy: ADMIN_UID,
    updatedAt: serverTimestamp(),
  });

  await assertSucceeds(setDoc(
    doc(db, "academies", ACADEMY_ID, "members", USER_UID),
    write(USER_UID),
  ));
  await assertFails(setDoc(
    doc(db, "academies", ACADEMY_ID, "members", SECOND_USER_UID),
    { ...write(SECOND_USER_UID), id: "victim-membership" },
  ));
});

test("11. profile Claim create rejects id while a legitimate canonical create passes", async () => {
  const db = authedDb(USER_UID);
  const claimId = `${USER_UID}_ADMIN_${INVITE_CODE}`;
  const claim = {
    ...pendingClaim(USER_UID),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await assertSucceeds(setDoc(doc(db, "profile_claims", claimId), claim));
  await assertFails(setDoc(
    doc(authedDb(SECOND_USER_UID), "profile_claims", `${SECOND_USER_UID}_ADMIN_${INVITE_CODE}`),
    {
      ...pendingClaim(SECOND_USER_UID),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      id: "victim-claim",
    },
  ));
});

test("12. profile Claim reviewer cannot retain/change legacy id and can remove it", async () => {
  const claimId = `${USER_UID}_ADMIN_${INVITE_CODE}`;
  await seed([[`profile_claims/${claimId}`, pendingClaim(USER_UID, { id: "victim-claim" })]]);
  const ref = doc(authedDb(ADMIN_UID), "profile_claims", claimId);
  const rejection = {
    status: "REJECTED",
    rejectedAt: serverTimestamp(),
    rejectedBy: ADMIN_UID,
    updatedAt: serverTimestamp(),
  };

  await assertFails(updateDoc(ref, { ...rejection, id: "victim-claim" }));
  await assertSucceeds(updateDoc(ref, { ...rejection, id: deleteField() }));
});

test("13. Academy invite writes require path-bound inviteCode and no stored id", async () => {
  const db = authedDb(SUPERADMIN_UID);
  const inviteCode = "FUT-NEW-A";
  const invite = {
    inviteCode,
    academyId: ACADEMY_ID,
    status: "ACTIVE",
    createdAt: serverTimestamp(),
    createdBy: SUPERADMIN_UID,
    updatedAt: serverTimestamp(),
    updatedBy: SUPERADMIN_UID,
  };

  await assertSucceeds(setDoc(doc(db, "academy_invites", inviteCode), invite));
  await assertFails(setDoc(
    doc(db, "academy_invites", "FUT-NEW-B"),
    { ...invite, inviteCode: "FUT-NEW-B", id: "victim-invite" },
  ));
});

test("14. audit Log creates omit id and reject a stored id", async () => {
  const db = authedDb(SUPERADMIN_UID);
  await assertSucceeds(setDoc(doc(db, "logs", "log-good"), {
    action: "ADMIN_ACTION",
    timestamp: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(db, "logs", "log-bad"), {
    id: "victim-log",
    action: "ADMIN_ACTION",
    timestamp: serverTimestamp(),
  }));
});
