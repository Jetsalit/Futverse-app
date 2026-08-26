import {
  MATCH_SCHEMA_VERSION,
  MATCH_STATUSES,
  isTerminalMatchStatus,
  validateMatchCoreData,
  type MatchCoreData,
  type MatchStatus,
  type MatchVenueType,
} from "../../lib/matchFoundation";
import {
  parseCanonicalDateOnly,
} from "../../lib/dateTimeFoundation";
import type { AcademyMatchRecord } from "../../lib/firestore/matchRepository";

export const MATCH_STATUS_FILTERS = [
  "ALL",
  ...MATCH_STATUSES,
] as const;

export type MatchStatusFilter =
  (typeof MATCH_STATUS_FILTERS)[number];

export interface MatchFormState {
  squadLabel: string;
  competitionName: string;
  opponentName: string;
  kickoffAt: string;
  venueType: "" | MatchVenueType;
}

export interface MatchCoreBuildResult {
  data: MatchCoreData;
  valid: boolean;
  errors: string[];
}

export type MatchLifecycleActionId =
  | "SCHEDULE"
  | "START"
  | "COMPLETE"
  | "CANCEL";

export interface MatchLifecycleAction {
  id: MatchLifecycleActionId;
  targetStatus: MatchStatus;
  translationKey: string;
  destructive: boolean;
}

const STATUS_PRIORITY: Record<MatchStatus, number> = {
  IN_PROGRESS: 0,
  SCHEDULED: 1,
  DRAFT: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

export const MATCH_WORKSPACE_TIME_ZONE =
  "Asia/Bangkok";

interface MatchWallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const MATCH_WALL_CLOCK_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (value: number) =>
  String(value).padStart(2, "0");

function formatCanonicalWallClock(
  value: MatchWallClockParts,
): string {
  return [
    String(value.year).padStart(4, "0"),
    "-",
    pad(value.month),
    "-",
    pad(value.day),
    "T",
    pad(value.hour),
    ":",
    pad(value.minute),
  ].join("");
}

function parseMatchWallClock(
  value: string,
): MatchWallClockParts | null {
  const match =
    MATCH_WALL_CLOCK_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  const canonicalDate =
    [
      match[1],
      match[2],
      match[3],
    ].join("-");

  if (
    parseCanonicalDateOnly(
      canonicalDate,
    ) === null
  ) {
    return null;
  }

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
  };
}

function dateTimeFormatPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string | null {
  return (
    parts.find(
      (part) => part.type === type,
    )?.value ?? null
  );
}

function dateTimePartsInTimeZone(
  instant: Date,
  timeZone: string,
): MatchWallClockParts | null {
  if (
    !(instant instanceof Date) ||
    !Number.isFinite(instant.getTime())
  ) {
    return null;
  }

  try {
    const parts =
      new Intl.DateTimeFormat(
        "en-US-u-ca-gregory-nu-latn",
        {
          timeZone,
          calendar: "gregory",
          numberingSystem: "latn",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        },
      ).formatToParts(instant);

    const year =
      dateTimeFormatPart(
        parts,
        "year",
      );

    const month =
      dateTimeFormatPart(
        parts,
        "month",
      );

    const day =
      dateTimeFormatPart(
        parts,
        "day",
      );

    const hour =
      dateTimeFormatPart(
        parts,
        "hour",
      );

    const minute =
      dateTimeFormatPart(
        parts,
        "minute",
      );

    if (
      year === null ||
      month === null ||
      day === null ||
      hour === null ||
      minute === null
    ) {
      return null;
    }

    return parseMatchWallClock(
      [
        year.padStart(4, "0"),
        "-",
        month.padStart(2, "0"),
        "-",
        day.padStart(2, "0"),
        "T",
        hour.padStart(2, "0"),
        ":",
        minute.padStart(2, "0"),
      ].join(""),
    );
  } catch {
    return null;
  }
}

function wallClockPartsAsUtcMillis(
  value: MatchWallClockParts,
): number {
  const date =
    new Date(0);

  date.setUTCFullYear(
    value.year,
    value.month - 1,
    value.day,
  );

  date.setUTCHours(
    value.hour,
    value.minute,
    0,
    0,
  );

  return date.getTime();
}

function sameWallClockParts(
  left: MatchWallClockParts,
  right: MatchWallClockParts,
): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function wallClockToInstant(
  value: string,
  timeZone: string,
): Date | null {
  const requested =
    parseMatchWallClock(value);

  if (requested === null) {
    return null;
  }

  const requestedPseudoUtc =
    wallClockPartsAsUtcMillis(
      requested,
    );

  let candidateMillis =
    requestedPseudoUtc;

  /*
   * Resolve an IANA wall-clock value without relying on the
   * machine/process timezone.
   *
   * The candidate is repeatedly compared with how Intl renders
   * that instant in the requested timezone. The difference between
   * the requested wall clock and rendered wall clock is applied to
   * the candidate until the two match.
   *
   * Final round-trip verification fails closed for a wall clock
   * that cannot be represented in the requested zone.
   */
  for (
    let attempt = 0;
    attempt < 4;
    attempt += 1
  ) {
    const observed =
      dateTimePartsInTimeZone(
        new Date(candidateMillis),
        timeZone,
      );

    if (observed === null) {
      return null;
    }

    const observedPseudoUtc =
      wallClockPartsAsUtcMillis(
        observed,
      );

    const adjustment =
      requestedPseudoUtc -
      observedPseudoUtc;

    if (adjustment === 0) {
      break;
    }

    candidateMillis +=
      adjustment;

    if (!Number.isFinite(candidateMillis)) {
      return null;
    }
  }

  const candidate =
    new Date(candidateMillis);

  if (
    !Number.isFinite(
      candidate.getTime(),
    )
  ) {
    return null;
  }

  const verified =
    dateTimePartsInTimeZone(
      candidate,
      timeZone,
    );

  if (
    verified === null ||
    !sameWallClockParts(
      verified,
      requested,
    )
  ) {
    return null;
  }

  return candidate;
}

export function toDateTimeLocalValue(
  value: Date | null,
): string {
  if (!value) return "";

  const wallClock =
    dateTimePartsInTimeZone(
      value,
      MATCH_WORKSPACE_TIME_ZONE,
    );

  return wallClock === null
    ? ""
    : formatCanonicalWallClock(
        wallClock,
      );
}

export function createEmptyMatchForm(): MatchFormState {
  return {
    squadLabel: "",
    competitionName: "",
    opponentName: "",
    kickoffAt: "",
    venueType: "",
  };
}

export function matchRecordToForm(
  match: AcademyMatchRecord,
): MatchFormState {
  return {
    squadLabel: match.squadLabel,
    competitionName: match.competitionName,
    opponentName: match.opponentName ?? "",
    kickoffAt: toDateTimeLocalValue(match.kickoffAt),
    venueType: match.venueType ?? "",
  };
}

function validateBuiltData(
  data: MatchCoreData,
): MatchCoreBuildResult {
  const validation = validateMatchCoreData(data);

  return {
    data,
    valid: validation.valid,
    errors: [...validation.errors],
  };
}

export function buildMatchCoreData(
  form: MatchFormState,
  status: MatchStatus,
): MatchCoreBuildResult {
  const opponentName = form.opponentName.trim();

  const kickoffInput =
    form.kickoffAt;

  const kickoffAt =
    kickoffInput.length > 0
      ? wallClockToInstant(
          kickoffInput,
          MATCH_WORKSPACE_TIME_ZONE,
        )
      : null;

  const data: MatchCoreData = {
    schemaVersion: MATCH_SCHEMA_VERSION,
    status,
    squadLabel: form.squadLabel.trim(),
    competitionName: form.competitionName.trim(),
    opponentName:
      opponentName.length > 0
        ? opponentName
        : null,
    kickoffAt,
    venueType:
      form.venueType === ""
        ? null
        : form.venueType,
  };

  const result =
    validateBuiltData(data);

  if (
    kickoffInput.length > 0 &&
    kickoffAt === null
  ) {
    return {
      data,
      valid: false,
      errors:
        result.errors.includes(
          "Invalid kickoff time.",
        )
          ? result.errors
          : [
              "Invalid kickoff time.",
              ...result.errors,
            ],
    };
  }

  return result;
}

export function buildMatchCoreDataFromRecord(
  match: AcademyMatchRecord,
  status: MatchStatus = match.status,
): MatchCoreBuildResult {
  const data: MatchCoreData = {
    schemaVersion: MATCH_SCHEMA_VERSION,
    status,
    squadLabel: match.squadLabel,
    competitionName: match.competitionName,
    opponentName: match.opponentName,
    kickoffAt: match.kickoffAt
      ? new Date(match.kickoffAt.getTime())
      : null,
    venueType: match.venueType,
  };

  return validateBuiltData(data);
}

export function filterMatches(
  matches: readonly AcademyMatchRecord[],
  filter: MatchStatusFilter,
): AcademyMatchRecord[] {
  if (filter === "ALL") {
    return [...matches];
  }

  return matches.filter(
    (match) => match.status === filter,
  );
}

export function sortMatchesForWorkspace(
  matches: readonly AcademyMatchRecord[],
): AcademyMatchRecord[] {
  return [...matches].sort((left, right) => {
    const statusDifference =
      STATUS_PRIORITY[left.status] -
      STATUS_PRIORITY[right.status];

    if (statusDifference !== 0) {
      return statusDifference;
    }

    const leftKickoff =
      left.kickoffAt?.getTime()
      ?? Number.MAX_SAFE_INTEGER;

    const rightKickoff =
      right.kickoffAt?.getTime()
      ?? Number.MAX_SAFE_INTEGER;

    if (leftKickoff !== rightKickoff) {
      return leftKickoff - rightKickoff;
    }

    const updatedDifference =
      right.updatedAt.getTime() -
      left.updatedAt.getTime();

    if (updatedDifference !== 0) {
      return updatedDifference;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getLifecycleActions(
  status: MatchStatus,
): MatchLifecycleAction[] {
  if (status === "DRAFT") {
    return [
      {
        id: "SCHEDULE",
        targetStatus: "SCHEDULED",
        translationKey: "match_action_schedule",
        destructive: false,
      },
      {
        id: "CANCEL",
        targetStatus: "CANCELLED",
        translationKey: "match_action_cancel",
        destructive: true,
      },
    ];
  }

  if (status === "SCHEDULED") {
    return [
      {
        id: "START",
        targetStatus: "IN_PROGRESS",
        translationKey: "match_action_start",
        destructive: false,
      },
      {
        id: "CANCEL",
        targetStatus: "CANCELLED",
        translationKey: "match_action_cancel",
        destructive: true,
      },
    ];
  }

  if (status === "IN_PROGRESS") {
    return [
      {
        id: "COMPLETE",
        targetStatus: "COMPLETED",
        translationKey: "match_action_complete",
        destructive: false,
      },
      {
        id: "CANCEL",
        targetStatus: "CANCELLED",
        translationKey: "match_action_cancel",
        destructive: true,
      },
    ];
  }

  return [];
}

export function isMatchReadOnly(
  status: MatchStatus,
): boolean {
  return isTerminalMatchStatus(status);
}