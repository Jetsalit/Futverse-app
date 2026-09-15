import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProClubAttendanceSessionId,
  isEligibleProClubAttendanceRosterPlayer,
  isProClubAttendanceStatus,
  isStrictProClubAttendanceDate,
  isStrictProClubAttendanceTime,
  validateProClubAttendanceRecordInput,
  validateProClubAttendanceSessionInput,
} from "../src/lib/proClubAttendance";

test("builds deterministic First Team training attendance session identity", () => {
  assert.equal(
    buildProClubAttendanceSessionId("2026-09-15", "17:30"),
    "training_2026-09-15_17-30",
  );
  assert.equal(
    buildProClubAttendanceSessionId("2026-09-15", "17:30"),
    buildProClubAttendanceSessionId("2026-09-15", "17:30"),
  );
});

test("strict date validation rejects impossible or malformed calendar dates", () => {
  assert.equal(isStrictProClubAttendanceDate("2026-09-15"), true);
  assert.equal(isStrictProClubAttendanceDate("2026-02-29"), false);
  assert.equal(isStrictProClubAttendanceDate("2026-9-15"), false);
  assert.equal(isStrictProClubAttendanceDate(" 2026-09-15"), false);
});

test("strict time validation requires canonical 24-hour HH:mm", () => {
  assert.equal(isStrictProClubAttendanceTime("00:00"), true);
  assert.equal(isStrictProClubAttendanceTime("23:59"), true);
  assert.equal(isStrictProClubAttendanceTime("24:00"), false);
  assert.equal(isStrictProClubAttendanceTime("7:30"), false);
});

test("invalid session slot cannot produce an attendance session id", () => {
  assert.equal(buildProClubAttendanceSessionId("2026-02-29", "17:30"), null);
  assert.equal(buildProClubAttendanceSessionId("2026-09-15", "24:00"), null);
});

test("valid session input emits canonical V1 constants and deterministic identity", () => {
  const result = validateProClubAttendanceSessionInput({
    sessionDate: "2026-09-15",
    startTime: "17:30",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      attendanceSessionId: "training_2026-09-15_17-30",
      schemaVersion: 1,
      sessionDate: "2026-09-15",
      startTime: "17:30",
      squadLabel: "First Team",
      sessionType: "TRAINING",
    },
  });
});

test("session input fails closed on missing or unknown fields", () => {
  assert.equal(
    validateProClubAttendanceSessionInput({ sessionDate: "2026-09-15" }).ok,
    false,
  );
  assert.equal(
    validateProClubAttendanceSessionInput({
      sessionDate: "2026-09-15",
      startTime: "17:30",
      clubId: "club-a",
    }).ok,
    false,
  );
});

test("attendance status set is frozen to four V1 values", () => {
  for (const status of ["PRESENT", "LATE", "ABSENT", "EXCUSED"]) {
    assert.equal(isProClubAttendanceStatus(status), true);
  }
  for (const status of ["INJURED", "UNKNOWN", "", null]) {
    assert.equal(isProClubAttendanceStatus(status), false);
  }
});

test("valid record input returns path identity separately from stored payload", () => {
  const result = validateProClubAttendanceRecordInput({
    playerKey: "provisional-player-a",
    status: "PRESENT",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      playerKey: "provisional-player-a",
      value: {
        schemaVersion: 1,
        status: "PRESENT",
      },
    },
  });
});

test("record input rejects invalid player keys and unknown fields", () => {
  assert.equal(
    validateProClubAttendanceRecordInput({
      playerKey: "bad/player",
      status: "PRESENT",
    }).ok,
    false,
  );
  assert.equal(
    validateProClubAttendanceRecordInput({
      playerKey: "player-a",
      status: "PRESENT",
      firstName: "Should not be duplicated",
    }).ok,
    false,
  );
});

test("only ACTIVE First Team canonical roster players are eligible for new records", () => {
  assert.equal(
    isEligibleProClubAttendanceRosterPlayer("player-a", {
      status: "ACTIVE",
      squadLabel: "First Team",
    }),
    true,
  );
  assert.equal(
    isEligibleProClubAttendanceRosterPlayer("player-a", {
      status: "INACTIVE",
      squadLabel: "First Team",
    }),
    false,
  );
  assert.equal(
    isEligibleProClubAttendanceRosterPlayer("player-a", {
      status: "RELEASED",
      squadLabel: "First Team",
    }),
    false,
  );
  assert.equal(
    isEligibleProClubAttendanceRosterPlayer("player-a", {
      status: "ACTIVE",
      squadLabel: "U21",
    }),
    false,
  );
  assert.equal(
    isEligibleProClubAttendanceRosterPlayer("bad/player", {
      status: "ACTIVE",
      squadLabel: "First Team",
    }),
    false,
  );
});
