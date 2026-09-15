import { isExactPlayerKey } from "./playerIdentityFoundation";

export const PRO_CLUB_ATTENDANCE_SCHEMA_VERSION = 1 as const;
export const PRO_CLUB_ATTENDANCE_SQUAD_LABEL = "First Team" as const;
export const PRO_CLUB_ATTENDANCE_SESSION_TYPE = "TRAINING" as const;

export const PRO_CLUB_ATTENDANCE_STATUSES = [
  "PRESENT",
  "LATE",
  "ABSENT",
  "EXCUSED",
] as const;

export type ProClubAttendanceStatus =
  (typeof PRO_CLUB_ATTENDANCE_STATUSES)[number];

export interface ProClubAttendanceSessionInput {
  sessionDate: string;
  startTime: string;
}

export interface ValidProClubAttendanceSessionInput
  extends ProClubAttendanceSessionInput {
  attendanceSessionId: string;
  schemaVersion: 1;
  squadLabel: "First Team";
  sessionType: "TRAINING";
}

export interface ProClubAttendanceRecordInput {
  playerKey: string;
  status: ProClubAttendanceStatus;
}

export interface ValidProClubAttendanceRecordInput {
  playerKey: string;
  value: {
    schemaVersion: 1;
    status: ProClubAttendanceStatus;
  };
}

export type ProClubAttendanceSessionValidationResult =
  | { ok: true; value: ValidProClubAttendanceSessionInput }
  | { ok: false; errors: string[] };

export type ProClubAttendanceRecordValidationResult =
  | { ok: true; value: ValidProClubAttendanceRecordInput }
  | { ok: false; errors: string[] };

const SESSION_INPUT_KEYS = ["sessionDate", "startTime"] as const;
const RECORD_INPUT_KEYS = ["playerKey", "status"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.join(",") === expected.join(",");
}

export function isStrictProClubAttendanceDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isStrictProClubAttendanceTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isProClubAttendanceStatus(
  value: unknown,
): value is ProClubAttendanceStatus {
  return (
    value === "PRESENT" ||
    value === "LATE" ||
    value === "ABSENT" ||
    value === "EXCUSED"
  );
}

export function buildProClubAttendanceSessionId(
  sessionDate: unknown,
  startTime: unknown,
): string | null {
  if (
    !isStrictProClubAttendanceDate(sessionDate) ||
    !isStrictProClubAttendanceTime(startTime)
  ) {
    return null;
  }

  return `training_${sessionDate}_${startTime.replace(":", "-")}`;
}

export function validateProClubAttendanceSessionInput(
  input: unknown,
): ProClubAttendanceSessionValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Attendance session input must be an object."] };
  }

  const errors: string[] = [];

  if (!hasExactKeys(input, SESSION_INPUT_KEYS)) {
    errors.push("Attendance session input contains unknown or missing fields.");
  }

  if (!isStrictProClubAttendanceDate(input.sessionDate)) {
    errors.push("sessionDate must be a strict calendar date in YYYY-MM-DD format.");
  }

  if (!isStrictProClubAttendanceTime(input.startTime)) {
    errors.push("startTime must be a strict 24-hour time in HH:mm format.");
  }

  const attendanceSessionId = buildProClubAttendanceSessionId(
    input.sessionDate,
    input.startTime,
  );

  if (errors.length > 0 || attendanceSessionId === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      attendanceSessionId,
      schemaVersion: PRO_CLUB_ATTENDANCE_SCHEMA_VERSION,
      sessionDate: input.sessionDate as string,
      startTime: input.startTime as string,
      squadLabel: PRO_CLUB_ATTENDANCE_SQUAD_LABEL,
      sessionType: PRO_CLUB_ATTENDANCE_SESSION_TYPE,
    },
  };
}

export function validateProClubAttendanceRecordInput(
  input: unknown,
): ProClubAttendanceRecordValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Attendance record input must be an object."] };
  }

  const errors: string[] = [];

  if (!hasExactKeys(input, RECORD_INPUT_KEYS)) {
    errors.push("Attendance record input contains unknown or missing fields.");
  }

  if (!isExactPlayerKey(input.playerKey)) {
    errors.push("playerKey must be an exact player document identifier.");
  }

  if (!isProClubAttendanceStatus(input.status)) {
    errors.push("Invalid attendance status.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      playerKey: input.playerKey as string,
      value: {
        schemaVersion: PRO_CLUB_ATTENDANCE_SCHEMA_VERSION,
        status: input.status as ProClubAttendanceStatus,
      },
    },
  };
}

export function isEligibleProClubAttendanceRosterPlayer(
  playerKey: unknown,
  roster: unknown,
): boolean {
  if (!isExactPlayerKey(playerKey) || !isPlainObject(roster)) {
    return false;
  }

  return (
    roster.status === "ACTIVE" &&
    roster.squadLabel === PRO_CLUB_ATTENDANCE_SQUAD_LABEL
  );
}
