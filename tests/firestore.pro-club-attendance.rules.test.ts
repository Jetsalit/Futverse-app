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
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { patchProClubAttendanceRulesV1 } from "../scripts/applyProClubAttendanceRulesV1";

const PROJECT_ID = "demo-futverse-pro-club-attendance-v1";
const CLUB_A = "club-a";
const CLUB_B = "club-b";
const CLUB_INACTIVE = "club-inactive";
const HEAD_COACH = "head-coach-a";
const ASSISTANT = "assistant-a";
const OUTSIDER = "outsider";
const INACTIVE_USER = "inactive-user";
const INACTIVE_MEMBER = "inactive-member";
const INACTIVE_STAFF = "inactive-staff";
const INACTIVE_CLUB_HEAD = "inactive-club-head";
const PLAYER_ACTIVE = "player-active";
const PLAYER_INACTIVE = "player-inactive";
const PLAYER_RELEASED = "player-released";
const PLAYER_U21 = "player-u21";
const PLAYER_MISSING = "player-missing";
const NEW_ACTIVE_PLAYER = "new-active-player";
const SESSION_ID = "training_2026-09-15_17-30";
const SESSION_PATH = `proClubs/${CLUB_A}/attendanceSessions/${SESSION_ID}`;

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

function clubData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { name: "Club", level: "T3", status };
}

function membershipData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { authorizationRole: "MEMBER", status };
}

function staffData(
  staffRole: "HEAD_COACH" | "ASSISTANT_COACH",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): DocumentData {
  return { staffRole, status };
}

function rosterData(
  status: "ACTIVE" | "INACTIVE" | "RELEASED" = "ACTIVE",
  squadLabel = "First Team",
): DocumentData {
  return {
    schemaVersion: 1,
    futId: null,
    firstName: "Player",
    lastName: "One",
    position: "GK",
    additionalPositions: [],
    jerseyNumber: 1,
    squadLabel,
    status,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    createdBy: HEAD_COACH,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedBy: HEAD_COACH,
  };
}

function storedSessionData(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    sessionDate: "2026-09-15",
    startTime: "17:30",
    squadLabel: "First Team",
    sessionType: "TRAINING",
    createdAt: new Date("2026-09-15T09:00:00.000Z"),
    createdBy: HEAD_COACH,
    ...overrides,
  };
}

function freshSessionData(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    sessionDate: "2026-09-16",
    startTime: "18:00",
    squadLabel: "First Team",
    sessionType: "TRAINING",
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH,
    ...overrides,
  };
}

function storedRecordData(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    status: "PRESENT",
    createdAt: new Date("2026-09-15T09:01:00.000Z"),
    createdBy: HEAD_COACH,
    updatedAt: new Date("2026-09-15T09:01:00.000Z"),
    updatedBy: HEAD_COACH,
    ...overrides,
  };
}

function freshRecordData(actor = HEAD_COACH, overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    status: "PRESENT",
    createdAt: serverTimestamp(),
    createdBy: actor,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
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
    [`users/${ASSISTANT}`, userData()],
    [`users/${OUTSIDER}`, userData()],
    [`users/${INACTIVE_USER}`, userData("INACTIVE")],
    [`users/${INACTIVE_MEMBER}`, userData()],
    [`users/${INACTIVE_STAFF}`, userData()],
    [`users/${INACTIVE_CLUB_HEAD}`, userData()],
    [`proClubs/${CLUB_A}`, clubData()],
    [`proClubs/${CLUB_B}`, clubData()],
    [`proClubs/${CLUB_INACTIVE}`, clubData("INACTIVE")],
    [`proClubs/${CLUB_A}/members/${HEAD_COACH}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${HEAD_COACH}`, staffData("HEAD_COACH")],
    [`proClubs/${CLUB_A}/members/${ASSISTANT}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${ASSISTANT}`, staffData("ASSISTANT_COACH")],
    [`proClubs/${CLUB_A}/members/${INACTIVE_USER}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_USER}`, staffData("HEAD_COACH")],
    [`proClubs/${CLUB_A}/members/${INACTIVE_MEMBER}`, membershipData("INACTIVE")],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_MEMBER}`, staffData("HEAD_COACH")],
    [`proClubs/${CLUB_A}/members/${INACTIVE_STAFF}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_STAFF}`, staffData("HEAD_COACH", "INACTIVE")],
    [`proClubs/${CLUB_INACTIVE}/members/${INACTIVE_CLUB_HEAD}`, membershipData()],
    [`proClubs/${CLUB_INACTIVE}/staff/${INACTIVE_CLUB_HEAD}`, staffData("HEAD_COACH")],
    [`proClubs/${CLUB_A}/players/${PLAYER_ACTIVE}`, rosterData()],
    [`proClubs/${CLUB_A}/players/${NEW_ACTIVE_PLAYER}`, rosterData()],
    [`proClubs/${CLUB_A}/players/${PLAYER_INACTIVE}`, rosterData("INACTIVE")],
    [`proClubs/${CLUB_A}/players/${PLAYER_RELEASED}`, rosterData("RELEASED")],
    [`proClubs/${CLUB_A}/players/${PLAYER_U21}`, rosterData("ACTIVE", "U21")],
    [SESSION_PATH, storedSessionData()],
    [`${SESSION_PATH}/records/${PLAYER_ACTIVE}`, storedRecordData()],
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
  await testEnv.cleanup();
});

test("active staff can read/list sessions and records", async () => {
  for (const uid of [HEAD_COACH, ASSISTANT]) {
    const db = authedDb(uid);
    assert.equal((await assertSucceeds(getDoc(doc(db, SESSION_PATH)))).exists(), true);
    assert.equal(
      (await assertSucceeds(getDocs(collection(db, "proClubs", CLUB_A, "attendanceSessions")))).docs.length,
      1,
    );
    assert.equal(
      (await assertSucceeds(getDocs(collection(db, SESSION_PATH, "records")))).docs.length,
      1,
    );
  }
});

test("anonymous outsider inactive user member staff and club fail closed", async () => {
  await assertFails(getDoc(doc(anonymousDb(), SESSION_PATH)));
  for (const uid of [OUTSIDER, INACTIVE_USER, INACTIVE_MEMBER, INACTIVE_STAFF]) {
    await assertFails(getDoc(doc(authedDb(uid), SESSION_PATH)));
  }
  await assertFails(
    getDocs(collection(authedDb(INACTIVE_CLUB_HEAD), "proClubs", CLUB_INACTIVE, "attendanceSessions")),
  );
});

test("tenant authority cannot cross club boundaries", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(getDocs(collection(db, "proClubs", CLUB_B, "attendanceSessions")));
  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_B, "attendanceSessions", "training_2026-09-16_18-00"),
      freshSessionData(),
    ),
  );
});

test("Head Coach creates canonical deterministic session", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "attendanceSessions", "training_2026-09-16_18-00"),
      freshSessionData(),
    ),
  );
});

test("session create rejects wrong id malformed time unknown field and spoofed actor", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(setDoc(doc(db, "proClubs", CLUB_A, "attendanceSessions", "wrong-id"), freshSessionData()));
  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "attendanceSessions", "training_2026-09-16_24-00"),
      freshSessionData({ startTime: "24:00" }),
    ),
  );
  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "attendanceSessions", "training_2026-09-16_18-00"),
      freshSessionData({ note: "not allowed" }),
    ),
  );
  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "attendanceSessions", "training_2026-09-16_18-00"),
      freshSessionData({ createdBy: ASSISTANT }),
    ),
  );
});

test("assistant is read-only", async () => {
  const db = authedDb(ASSISTANT);
  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "attendanceSessions", "training_2026-09-16_18-00"),
      freshSessionData({ createdBy: ASSISTANT }),
    ),
  );
  await assertFails(
    updateDoc(doc(db, SESSION_PATH, "records", PLAYER_ACTIVE), {
      status: "LATE",
      updatedAt: serverTimestamp(),
      updatedBy: ASSISTANT,
    }),
  );
});

test("session update and delete are forbidden", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(updateDoc(doc(db, SESSION_PATH), { startTime: "18:00" }));
  await assertFails(deleteDoc(doc(db, SESSION_PATH)));
});

test("Head Coach creates record for ACTIVE First Team canonical roster player", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(HEAD_COACH), SESSION_PATH, "records", NEW_ACTIVE_PLAYER),
      freshRecordData(),
    ),
  );
});

test("record create rejects missing INACTIVE RELEASED and wrong-squad roster", async () => {
  const db = authedDb(HEAD_COACH);
  for (const playerKey of [PLAYER_MISSING, PLAYER_INACTIVE, PLAYER_RELEASED, PLAYER_U21]) {
    await assertFails(setDoc(doc(db, SESSION_PATH, "records", playerKey), freshRecordData()));
  }
});

test("record create rejects invalid status duplicated identity unknown field and audit spoof", async () => {
  const db = authedDb(HEAD_COACH);
  const targets: Array<[string, DocumentData]> = [
    ["new-invalid-status", freshRecordData(HEAD_COACH, { status: "INJURED" })],
    ["new-duplicated-player", freshRecordData(HEAD_COACH, { firstName: "Duplicated" })],
    ["new-unknown-field", freshRecordData(HEAD_COACH, { clubId: CLUB_A })],
    ["new-spoofed-actor", freshRecordData(ASSISTANT)],
  ];
  await seed(
    targets.map(([playerKey]) => [
      `proClubs/${CLUB_A}/players/${playerKey}`,
      rosterData(),
    ]),
  );
  for (const [playerKey, data] of targets) {
    await assertFails(setDoc(doc(db, SESSION_PATH, "records", playerKey), data));
  }
});

test("Head Coach can update only attendance status plus update audit", async () => {
  await assertSucceeds(
    updateDoc(doc(authedDb(HEAD_COACH), SESSION_PATH, "records", PLAYER_ACTIVE), {
      status: "LATE",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("record update rejects created audit mutation invalid status unknown field and actor spoof", async () => {
  const ref = doc(authedDb(HEAD_COACH), SESSION_PATH, "records", PLAYER_ACTIVE);
  await assertFails(updateDoc(ref, { createdBy: ASSISTANT }));
  await assertFails(
    updateDoc(ref, { status: "INJURED", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH }),
  );
  await assertFails(
    updateDoc(ref, { note: "not allowed", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH }),
  );
  await assertFails(
    updateDoc(ref, { status: "EXCUSED", updatedAt: serverTimestamp(), updatedBy: ASSISTANT }),
  );
});

test("historical record remains correctable after roster becomes RELEASED", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await updateDoc(
      doc(context.firestore(), "proClubs", CLUB_A, "players", PLAYER_ACTIVE),
      { status: "RELEASED" },
    );
  });
  await assertSucceeds(
    updateDoc(doc(authedDb(HEAD_COACH), SESSION_PATH, "records", PLAYER_ACTIVE), {
      status: "EXCUSED",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("record delete and unreviewed nested paths are forbidden", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(deleteDoc(doc(db, SESSION_PATH, "records", PLAYER_ACTIVE)));
  await assertFails(
    setDoc(doc(db, SESSION_PATH, "records", PLAYER_ACTIVE, "notes", "note-a"), {
      text: "not part of Attendance V1",
    }),
  );
});
