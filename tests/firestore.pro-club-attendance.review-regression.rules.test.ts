import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { patchProClubAttendanceRulesV1 } from "../scripts/applyProClubAttendanceRulesV1";

const PROJECT_ID = "demo-futverse-pro-club-attendance-review-regression";
const CLUB_A = "club-a";
const CLUB_B = "club-b";
const HEAD_COACH = "head-coach-a";
const OUTSIDER = "outsider";
const INACTIVE_USER = "inactive-user";
const INACTIVE_MEMBER = "inactive-member";
const INACTIVE_STAFF = "inactive-staff";
const SPOOFED_ACTOR = "spoofed-actor";
const PLAYER_A = "player-a";
const PLAYER_B = "player-b";
const CREATE_CREATED_BY = "audit-created-by";
const CREATE_UPDATED_BY = "audit-updated-by";
const SESSION_ID = "training_2026-09-15_17-30";
const SESSION_A = `proClubs/${CLUB_A}/attendanceSessions/${SESSION_ID}`;
const SESSION_B = `proClubs/${CLUB_B}/attendanceSessions/${SESSION_ID}`;

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

function userData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { role: "USER", status };
}

function clubData(): DocumentData {
  return { name: "Club", level: "T3", status: "ACTIVE" };
}

function membershipData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { authorizationRole: "MEMBER", status };
}

function staffData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { staffRole: "HEAD_COACH", status };
}

function rosterData(): DocumentData {
  return {
    schemaVersion: 1,
    futId: null,
    firstName: "Player",
    lastName: "One",
    position: "GK",
    additionalPositions: [],
    jerseyNumber: 1,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    createdBy: HEAD_COACH,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedBy: HEAD_COACH,
  };
}

function sessionData(): DocumentData {
  return {
    schemaVersion: 1,
    sessionDate: "2026-09-15",
    startTime: "17:30",
    squadLabel: "First Team",
    sessionType: "TRAINING",
    createdAt: new Date("2026-09-15T09:00:00.000Z"),
    createdBy: HEAD_COACH,
  };
}

function storedRecordData(): DocumentData {
  return {
    schemaVersion: 1,
    status: "PRESENT",
    createdAt: new Date("2026-09-15T09:01:00.000Z"),
    createdBy: HEAD_COACH,
    updatedAt: new Date("2026-09-15T09:01:00.000Z"),
    updatedBy: HEAD_COACH,
  };
}

function freshRecordData(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    status: "PRESENT",
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
    ...overrides,
  };
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

async function seedBaseline(): Promise<void> {
  await seed([
    [`users/${HEAD_COACH}`, userData()],
    [`users/${OUTSIDER}`, userData()],
    [`users/${INACTIVE_USER}`, userData("INACTIVE")],
    [`users/${INACTIVE_MEMBER}`, userData()],
    [`users/${INACTIVE_STAFF}`, userData()],
    [`proClubs/${CLUB_A}`, clubData()],
    [`proClubs/${CLUB_B}`, clubData()],
    [`proClubs/${CLUB_A}/members/${HEAD_COACH}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${HEAD_COACH}`, staffData()],
    [`proClubs/${CLUB_A}/members/${INACTIVE_USER}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_USER}`, staffData()],
    [`proClubs/${CLUB_A}/members/${INACTIVE_MEMBER}`, membershipData("INACTIVE")],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_MEMBER}`, staffData()],
    [`proClubs/${CLUB_A}/members/${INACTIVE_STAFF}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_STAFF}`, staffData("INACTIVE")],
    [`proClubs/${CLUB_A}/players/${PLAYER_A}`, rosterData()],
    [`proClubs/${CLUB_A}/players/${CREATE_CREATED_BY}`, rosterData()],
    [`proClubs/${CLUB_A}/players/${CREATE_UPDATED_BY}`, rosterData()],
    [SESSION_A, sessionData()],
    [`${SESSION_A}/records/${PLAYER_A}`, storedRecordData()],
    [SESSION_B, sessionData()],
    [`${SESSION_B}/records/${PLAYER_B}`, storedRecordData()],
  ]);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");

  const baseRules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: patchProClubAttendanceRulesV1(baseRules),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseline();
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test("unauthorized identities cannot get or list nested attendance records", async () => {
  const recordA = `${SESSION_A}/records/${PLAYER_A}`;
  const recordsA = collection(authedDb(OUTSIDER), SESSION_A, "records");

  await assertFails(getDoc(doc(anonymousDb(), recordA)));
  await assertFails(getDocs(collection(anonymousDb(), SESSION_A, "records")));

  for (const uid of [OUTSIDER, INACTIVE_USER, INACTIVE_MEMBER, INACTIVE_STAFF]) {
    const db = authedDb(uid);
    await assertFails(getDoc(doc(db, recordA)));
    await assertFails(getDocs(collection(db, SESSION_A, "records")));
  }

  await assertFails(getDocs(recordsA));

  const headCoachDb = authedDb(HEAD_COACH);
  await assertFails(getDoc(doc(headCoachDb, `${SESSION_B}/records/${PLAYER_B}`)));
  await assertFails(getDocs(collection(headCoachDb, SESSION_B, "records")));
});

test("record create rejects createdBy and updatedBy spoof independently", async () => {
  const db = authedDb(HEAD_COACH);

  await assertFails(
    setDoc(
      doc(db, SESSION_A, "records", CREATE_CREATED_BY),
      freshRecordData({ createdBy: SPOOFED_ACTOR }),
    ),
  );

  await assertFails(
    setDoc(
      doc(db, SESSION_A, "records", CREATE_UPDATED_BY),
      freshRecordData({ updatedBy: SPOOFED_ACTOR }),
    ),
  );
});
