import {
  MATCH_SCHEMA_VERSION,
  MATCH_STATUSES,
  isTerminalMatchStatus,
  validateMatchCoreData,
  type MatchCoreData,
  type MatchStatus,
  type MatchVenueType,
} from "../../lib/matchFoundation";
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

const pad = (value: number) =>
  String(value).padStart(2, "0");

export function toDateTimeLocalValue(
  value: Date | null,
): string {
  if (!value) return "";

  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    "T",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
  ].join("");
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

  const kickoffAt =
    form.kickoffAt.length > 0
      ? new Date(form.kickoffAt)
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

  return validateBuiltData(data);
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