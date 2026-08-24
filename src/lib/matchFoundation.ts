/**
 * Transport-neutral Match Foundation domain contract.
 *
 * This module intentionally has no Firebase dependency.
 * Firestore path identity and persistence timestamps belong to adapters/rules,
 * not to this pure domain model.
 */

export const MATCH_SCHEMA_VERSION = 1 as const;

export const MATCH_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_VENUE_TYPES = [
  "HOME",
  "AWAY",
  "NEUTRAL",
] as const;

export type MatchVenueType =
  (typeof MATCH_VENUE_TYPES)[number];

export interface MatchCoreData {
  schemaVersion: typeof MATCH_SCHEMA_VERSION;
  status: MatchStatus;
  squadLabel: string | null;
  competitionName: string | null;
  opponentName: string | null;
  kickoffAt: Date | null;
  venueType: MatchVenueType | null;
}

/**
 * Historical player snapshot stored beneath:
 *
 * academies/{academyId}/matches/{matchId}/roster/{playerId}
 *
 * playerId is deliberately NOT stored in this payload.
 * The Firestore document path is the authoritative Academy-local identity.
 */
export interface MatchRosterSnapshotData {
  schemaVersion: typeof MATCH_SCHEMA_VERSION;
  futId: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  jerseyNumber: number | null;
}

export interface MatchValidationResult {
  valid: boolean;
  errors: string[];
}

const MATCH_CORE_KEYS = [
  "schemaVersion",
  "status",
  "squadLabel",
  "competitionName",
  "opponentName",
  "kickoffAt",
  "venueType",
] as const;

const MATCH_ROSTER_KEYS = [
  "schemaVersion",
  "futId",
  "firstName",
  "lastName",
  "position",
  "jerseyNumber",
] as const;

const MATCH_TEXT_MAX_LENGTH = 160;
const PLAYER_NAME_MAX_LENGTH = 120;
const PLAYER_POSITION_MAX_LENGTH = 64;
const FUTID_MAX_LENGTH = 128;

const MATCH_STATUS_TRANSITIONS:
  Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
    DRAFT: ["SCHEDULED", "CANCELLED"],
    SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();

  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every(
      (key, index) => key === expectedKeys[index],
    )
  );
}

function isNullableTrimmedText(
  value: unknown,
  maxLength: number,
): value is string | null {
  return (
    value === null ||
    (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= maxLength &&
      value.trim() === value
    )
  );
}

function isValidKickoff(
  value: unknown,
): value is Date | null {
  return (
    value === null ||
    (
      value instanceof Date &&
      Number.isFinite(value.getTime())
    )
  );
}

function isValidJerseyNumber(
  value: unknown,
): value is number | null {
  return (
    value === null ||
    (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 999
    )
  );
}

export function isExactMatchPathSegment(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function isMatchStatus(
  value: unknown,
): value is MatchStatus {
  return (
    typeof value === "string" &&
    (MATCH_STATUSES as readonly string[]).includes(value)
  );
}

export function isMatchVenueType(
  value: unknown,
): value is MatchVenueType {
  return (
    typeof value === "string" &&
    (MATCH_VENUE_TYPES as readonly string[]).includes(value)
  );
}

export function isTerminalMatchStatus(
  value: unknown,
): value is "COMPLETED" | "CANCELLED" {
  return value === "COMPLETED" || value === "CANCELLED";
}

/**
 * Returns true only for an actual lifecycle change.
 * Keeping the same status is not considered a transition.
 */
export function canTransitionMatchStatus(
  from: unknown,
  to: unknown,
): boolean {
  if (
    !isMatchStatus(from) ||
    !isMatchStatus(to) ||
    from === to
  ) {
    return false;
  }

  return MATCH_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Historical Match evidence is locked at terminal states.
 *
 * Unknown or malformed status also locks evidence so callers fail closed.
 * A false result does NOT grant write authorization; adapters and Rules
 * must still enforce actor, tenant, lifecycle and schema requirements.
 */
export function isMatchEvidenceLocked(
  status: unknown,
): boolean {
  return (
    !isMatchStatus(status) ||
    isTerminalMatchStatus(status)
  );
}

/**
 * Validates transport-neutral Match business data.
 *
 * DRAFT and CANCELLED may legitimately have incomplete scheduling
 * information. SCHEDULED, IN_PROGRESS and COMPLETED require both an
 * opponent and an authoritative kickoff time.
 */
export function validateMatchCoreData(
  value: unknown,
): MatchValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: ["Match core data must be an object."],
    };
  }

  if (!hasExactKeys(value, MATCH_CORE_KEYS)) {
    errors.push(
      "Match core data contains missing or unsupported fields.",
    );
  }

  if (value.schemaVersion !== MATCH_SCHEMA_VERSION) {
    errors.push("Unsupported Match schema version.");
  }

  if (!isMatchStatus(value.status)) {
    errors.push("Invalid Match status.");
  }

  if (
    !isNullableTrimmedText(
      value.squadLabel,
      MATCH_TEXT_MAX_LENGTH,
    )
  ) {
    errors.push("Invalid squad label.");
  }

  if (
    !isNullableTrimmedText(
      value.competitionName,
      MATCH_TEXT_MAX_LENGTH,
    )
  ) {
    errors.push("Invalid competition name.");
  }

  if (
    !isNullableTrimmedText(
      value.opponentName,
      MATCH_TEXT_MAX_LENGTH,
    )
  ) {
    errors.push("Invalid opponent name.");
  }

  if (!isValidKickoff(value.kickoffAt)) {
    errors.push("Invalid kickoff time.");
  }

  if (
    value.venueType !== null &&
    !isMatchVenueType(value.venueType)
  ) {
    errors.push("Invalid venue type.");
  }

  if (
    isMatchStatus(value.status) &&
    (
      value.status === "SCHEDULED" ||
      value.status === "IN_PROGRESS" ||
      value.status === "COMPLETED"
    )
  ) {
    if (
      typeof value.opponentName !== "string" ||
      value.opponentName.length === 0
    ) {
      errors.push(
        "Scheduled or active Match requires an opponent.",
      );
    }

    if (!isValidKickoff(value.kickoffAt) || value.kickoffAt === null) {
      errors.push(
        "Scheduled or active Match requires a kickoff time.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates one historical roster snapshot.
 *
 * Missing FUTID remains explicit as null. It is never fabricated.
 * Player identity comes from the roster document path.
 */
export function validateMatchRosterSnapshotData(
  playerId: unknown,
  value: unknown,
): MatchValidationResult {
  const errors: string[] = [];

  if (!isExactMatchPathSegment(playerId)) {
    errors.push("Invalid canonical player document ID.");
  }

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [
        ...errors,
        "Match roster snapshot must be an object.",
      ],
    };
  }

  if (!hasExactKeys(value, MATCH_ROSTER_KEYS)) {
    errors.push(
      "Match roster snapshot contains missing or unsupported fields.",
    );
  }

  if (value.schemaVersion !== MATCH_SCHEMA_VERSION) {
    errors.push("Unsupported Match roster schema version.");
  }

  if (
    !isNullableTrimmedText(
      value.futId,
      FUTID_MAX_LENGTH,
    )
  ) {
    errors.push("Invalid FUTID snapshot.");
  }

  if (
    !isNullableTrimmedText(
      value.firstName,
      PLAYER_NAME_MAX_LENGTH,
    )
  ) {
    errors.push("Invalid first-name snapshot.");
  }

  if (
    !isNullableTrimmedText(
      value.lastName,
      PLAYER_NAME_MAX_LENGTH,
    )
  ) {
    errors.push("Invalid last-name snapshot.");
  }

  if (
    !isNullableTrimmedText(
      value.position,
      PLAYER_POSITION_MAX_LENGTH,
    )
  ) {
    errors.push("Invalid position snapshot.");
  }

  if (!isValidJerseyNumber(value.jerseyNumber)) {
    errors.push("Invalid jersey-number snapshot.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
