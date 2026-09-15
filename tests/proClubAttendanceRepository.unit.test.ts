import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentData } from "firebase/firestore";

import {
  createProClubAttendanceRecord,
  createProClubAttendanceSession,
  getProClubAttendanceSession,
  listProClubAttendanceRecords,
  listProClubAttendanceSessions,
  updateProClubAttendanceRecord,
  type ProClubAttendanceRepositoryOps,
} from "../src/lib/firestore/proClubAttendanceRepository";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

const CLUB_ID = "club-a";
const HEAD_COACH_UID = "head-coach-a";
const SESSION_ID = "training_2026-09-15_17-30";
const PLAYER_KEY = "player-a";

const activeHeadCoachAuthority: ProClubOrganizationAuthority = {
  organizationId: CLUB_ID,
  organizationType: "PRO_CLUB",
  organizationName: "Club A",
  organizationLevel: "T3",
  organizationStatus: "ACTIVE",
  userId: HEAD_COACH_UID,
  membershipAuthorizationRole: "MEMBER",
  membershipStatus: "ACTIVE",
  hasMembershipAuthority: true,
  staffRole: "HEAD_COACH",
};

function key(path: readonly string[]): string {
  return path.join("/");
}

function sessionDocument(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    sessionDate: "2026-09-15",
    startTime: "17:30",
    squadLabel: "First Team",
    sessionType: "TRAINING",
    createdAt: { logical: "created" },
    createdBy: HEAD_COACH_UID,
    ...overrides,
  };
}

function attendanceDocument(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    status: "PRESENT",
    createdAt: { logical: "created" },
    createdBy: HEAD_COACH_UID,
    updatedAt: { logical: "updated" },
    updatedBy: HEAD_COACH_UID,
    ...overrides,
  };
}

function rosterDocument(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    futId: null,
    firstName: "Player",
    lastName: "A",
    position: "GK",
    additionalPositions: [],
    jerseyNumber: 1,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: { logical: "created" },
    createdBy: HEAD_COACH_UID,
    updatedAt: { logical: "updated" },
    updatedBy: HEAD_COACH_UID,
    ...overrides,
  };
}

function makeOps(options?: {
  authority?: ProClubOrganizationAuthority;
  uid?: string | null;
  initial?: Record<string, DocumentData>;
}) {
  const documents = new Map<string, DocumentData>(Object.entries(options?.initial ?? {}));
  const writes: Array<{ kind: "create" | "update"; path: string; data: DocumentData }> = [];
  const reads: string[] = [];
  let tick = 0;

  const ops: ProClubAttendanceRepositoryOps = {
    getAuthenticatedUid() {
      return options?.uid === undefined ? HEAD_COACH_UID : options.uid;
    },
    async resolveAuthority() {
      return { state: "FOUND", value: options?.authority ?? activeHeadCoachAuthority };
    },
    async readDocument(path) {
      const pathKey = key(path);
      reads.push(pathKey);
      const data = documents.get(pathKey);
      return { id: path[path.length - 1] ?? "", exists: data !== undefined, data };
    },
    async listDocuments(path) {
      const prefix = `${key(path)}/`;
      return {
        documents: [...documents.entries()]
          .filter(([pathKey]) => pathKey.startsWith(prefix) && !pathKey.slice(prefix.length).includes("/"))
          .map(([pathKey, data]) => ({
            id: pathKey.slice(prefix.length),
            exists: true,
            data,
          })),
      };
    },
    async createDocument(path, data) {
      const pathKey = key(path);
      writes.push({ kind: "create", path: pathKey, data });
      documents.set(pathKey, { ...data });
    },
    async updateDocument(path, data) {
      const pathKey = key(path);
      const existing = documents.get(pathKey);
      assert.ok(existing, "test setup requires existing document");
      writes.push({ kind: "update", path: pathKey, data });
      documents.set(pathKey, { ...existing, ...data });
    },
    timestamp() {
      tick += 1;
      return { testTimestamp: tick };
    },
  };

  return { ops, documents, writes, reads };
}

test("active Pro Club staff can list canonical attendance sessions", async () => {
  const { ops } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument(),
    },
  });
  const sessions = await listProClubAttendanceSessions(CLUB_ID, ops);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.attendanceSessionId, SESSION_ID);
});

test("attendance read fails closed without active staff authority", async () => {
  const { ops } = makeOps({
    authority: { ...activeHeadCoachAuthority, staffRole: null },
  });
  await assert.rejects(
    () => getProClubAttendanceSession(CLUB_ID, SESSION_ID, ops),
    /active staff authority/i,
  );
});

test("Head Coach creates deterministic training session with canonical audit fields", async () => {
  const { ops, writes } = makeOps();
  const created = await createProClubAttendanceSession(
    CLUB_ID,
    { sessionDate: "2026-09-15", startTime: "17:30" },
    ops,
  );
  assert.equal(created.attendanceSessionId, SESSION_ID);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.path, `proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`);
  assert.deepEqual(Object.keys(writes[0]!.data).sort(), [
    "createdAt",
    "createdBy",
    "schemaVersion",
    "sessionDate",
    "sessionType",
    "squadLabel",
    "startTime",
  ]);
});

test("non-Head-Coach staff cannot create attendance session", async () => {
  const { ops, writes } = makeOps({
    authority: { ...activeHeadCoachAuthority, staffRole: "ASSISTANT_COACH" },
  });
  await assert.rejects(
    () => createProClubAttendanceSession(
      CLUB_ID,
      { sessionDate: "2026-09-15", startTime: "17:30" },
      ops,
    ),
    /HEAD_COACH/,
  );
  assert.equal(writes.length, 0);
});

test("duplicate deterministic session is rejected instead of overwritten", async () => {
  const { ops, writes } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument(),
    },
  });
  await assert.rejects(
    () => createProClubAttendanceSession(
      CLUB_ID,
      { sessionDate: "2026-09-15", startTime: "17:30" },
      ops,
    ),
    /already exists/,
  );
  assert.equal(writes.length, 0);
});

test("Head Coach creates attendance record only for ACTIVE First Team roster player", async () => {
  const { ops, writes, reads } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument(),
      [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: rosterDocument(),
    },
  });
  const created = await createProClubAttendanceRecord(
    CLUB_ID,
    SESSION_ID,
    { playerKey: PLAYER_KEY, status: "PRESENT" },
    ops,
  );
  assert.equal(created.status, "PRESENT");
  assert.ok(reads.includes(`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`));
  const write = writes.find((item) => item.kind === "create");
  assert.equal(
    write?.path,
    `proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}/records/${PLAYER_KEY}`,
  );
  assert.equal("playerKey" in (write?.data ?? {}), false);
  assert.equal("firstName" in (write?.data ?? {}), false);
  assert.equal("futId" in (write?.data ?? {}), false);
});

test("new attendance record rejects INACTIVE or wrong-squad roster player", async () => {
  for (const roster of [
    rosterDocument({ status: "INACTIVE" }),
    rosterDocument({ squadLabel: "U21" }),
  ]) {
    const { ops, writes } = makeOps({
      initial: {
        [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument(),
        [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: roster,
      },
    });
    await assert.rejects(
      () => createProClubAttendanceRecord(
        CLUB_ID,
        SESSION_ID,
        { playerKey: PLAYER_KEY, status: "PRESENT" },
        ops,
      ),
      /ACTIVE First Team/,
    );
    assert.equal(writes.length, 0);
  }
});

test("attendance record create rejects missing canonical roster player", async () => {
  const { ops, writes } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument(),
    },
  });
  await assert.rejects(
    () => createProClubAttendanceRecord(
      CLUB_ID,
      SESSION_ID,
      { playerKey: PLAYER_KEY, status: "ABSENT" },
      ops,
    ),
    /ACTIVE First Team/,
  );
  assert.equal(writes.length, 0);
});

test("other active staff can read attendance records but cannot mutate", async () => {
  const authority: ProClubOrganizationAuthority = {
    ...activeHeadCoachAuthority,
    staffRole: "ANALYST",
  };
  const { ops, writes } = makeOps({
    authority,
    initial: {
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument(),
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}/records/${PLAYER_KEY}`]: attendanceDocument(),
    },
  });
  const records = await listProClubAttendanceRecords(CLUB_ID, SESSION_ID, ops);
  assert.equal(records[0]?.status, "PRESENT");
  await assert.rejects(
    () => updateProClubAttendanceRecord(CLUB_ID, SESSION_ID, PLAYER_KEY, "LATE", ops),
    /HEAD_COACH/,
  );
  assert.equal(writes.length, 0);
});

test("Head Coach can correct historical record after roster is no longer ACTIVE", async () => {
  const { ops, writes } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument(),
      [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: rosterDocument({ status: "RELEASED" }),
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}/records/${PLAYER_KEY}`]: attendanceDocument(),
    },
  });
  const updated = await updateProClubAttendanceRecord(
    CLUB_ID,
    SESSION_ID,
    PLAYER_KEY,
    "EXCUSED",
    ops,
  );
  assert.equal(updated.status, "EXCUSED");
  assert.equal(updated.createdBy, HEAD_COACH_UID);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0]!.data).sort(), ["status", "updatedAt", "updatedBy"]);
});

test("repository rejects malformed stored session identity", async () => {
  const { ops } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/attendanceSessions/${SESSION_ID}`]: sessionDocument({ startTime: "18:00" }),
    },
  });
  await assert.rejects(
    () => getProClubAttendanceSession(CLUB_ID, SESSION_ID, ops),
    /session invariants/i,
  );
});

test("repository fails closed for missing authenticated actor", async () => {
  const { ops } = makeOps({ uid: null });
  await assert.rejects(
    () => listProClubAttendanceSessions(CLUB_ID, ops),
    /Authenticated actor UID/,
  );
});
