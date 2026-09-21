import {
  isExactMatchPathSegment,
  isMatchStatus,
  isMatchVenueType,
  type MatchStatus,
  type MatchVenueType,
} from "./matchFoundation";
import type { ProClubOrganizationAuthority } from "./firestore/proClubOrganizationAdapter";
import {
  isExactPlayerKey,
} from "./playerIdentityFoundation";
import {
  PRO_CLUB_SET_PIECE_DUTIES,
  PRO_CLUB_STARTING_XI_FIXED_FORMATIONS,
  validateProClubCustomFormationSlots,
  type ProClubCustomFormationSlot,
  type ProClubSetPieceDuty,
  type ProClubStartingXIFormation,
} from "./proClubStartingXI11v11";
import type { PlayerPositionCode } from "./playerPositionSelection";
import {
  createEmptyGameModelTextSnapshot,
  validateGameModelTextSnapshot,
  type GameModelTextSnapshot,
} from "./gameModel";

export const PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION = 1 as const;

export interface ProClubMatchCoreData {
  schemaVersion: typeof PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION;
  status: MatchStatus;
  squadLabel: string;
  competitionName: string;
  opponentName: string | null;
  kickoffAt: Date | null;
  venueType: MatchVenueType | null;
}

export interface ProClubMatchRosterSnapshot {
  schemaVersion: typeof PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION;
  playerKey: string;
  futId: string | null;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: PlayerPositionCode | null;
  additionalPositions: readonly PlayerPositionCode[];
}

export interface ProClubPersistedStartingXIPlan {
  schemaVersion: typeof PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION;
  formation: ProClubStartingXIFormation;
  customFormationSlots?: readonly ProClubCustomFormationSlot[] | null;
  slotPlayerKeys: readonly (string | null)[];
  substitutePlayerKeys: readonly string[];
  positionRoleAssignments: readonly (string | null)[];
  setPieceAssignments: Readonly<Record<ProClubSetPieceDuty, string | null>>;
  gameModelSnapshot?: GameModelTextSnapshot;
  coachNotes: string;
}

export interface ProClubPersistedShootoutPlan {
  schemaVersion: typeof PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION;
  primaryTakers: readonly string[];
  backupTakers: readonly string[];
}

export interface ProClubMatchStartingXIValidationResult {
  ok: boolean;
  errors: readonly string[];
}

const TEXT_LIMITS = {
  squadLabel: 80,
  competitionName: 120,
  opponentName: 120,
  firstName: 80,
  lastName: 80,
  coachNotes: 2000,
  roleAssignment: 160,
  futId: 64,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isTrimmedText(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.length > 0) &&
    value.trim() === value
  );
}

function isNullableTrimmedText(
  value: unknown,
  maxLength: number,
): value is string | null {
  return value === null || isTrimmedText(value, maxLength);
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function proClubMatchDocumentPath(
  clubId: string,
  matchId: string,
): readonly ["proClubs", string, "matches", string] {
  if (!isExactMatchPathSegment(clubId) || !isExactMatchPathSegment(matchId)) {
    throw new Error("clubId and matchId must be exact document identifiers.");
  }
  return ["proClubs", clubId, "matches", matchId];
}

export function proClubMatchRosterDocumentPath(
  clubId: string,
  matchId: string,
  playerKey: string,
): readonly ["proClubs", string, "matches", string, "roster", string] {
  if (!isExactPlayerKey(playerKey)) {
    throw new Error("playerKey must be an exact canonical player identifier.");
  }
  return [...proClubMatchDocumentPath(clubId, matchId), "roster", playerKey];
}

export function proClubMatchStartingXIDocumentPath(
  clubId: string,
  matchId: string,
): readonly ["proClubs", string, "matches", string, "startingXI", "current"] {
  return [...proClubMatchDocumentPath(clubId, matchId), "startingXI", "current"];
}

export function proClubMatchShootoutDocumentPath(
  clubId: string,
  matchId: string,
): readonly ["proClubs", string, "matches", string, "shootout", "current"] {
  return [...proClubMatchDocumentPath(clubId, matchId), "shootout", "current"];
}

export function proClubMatchStartingXIAuditCollectionPath(
  clubId: string,
  matchId: string,
): readonly ["proClubs", string, "matches", string, "startingXIAudit"] {
  return [...proClubMatchDocumentPath(clubId, matchId), "startingXIAudit"];
}

export function canAuthorProClubMatchStartingXI(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    (
      authority.staffRole === "HEAD_COACH" ||
      authority.staffRole === "TECHNICAL_DIRECTOR"
    )
  );
}

export function canMutateStartingXIAtMatchStatus(status: MatchStatus): boolean {
  return status === "DRAFT" || status === "SCHEDULED";
}

export function canMutateShootoutAtMatchStatus(status: MatchStatus): boolean {
  return (
    status === "DRAFT" ||
    status === "SCHEDULED" ||
    status === "IN_PROGRESS"
  );
}

export function validateProClubMatchCoreData(
  value: unknown,
): ProClubMatchStartingXIValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["Match core must be an object."] };
  }

  if (value.schemaVersion !== PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION) {
    errors.push("Unsupported Pro Club Match schemaVersion.");
  }
  if (!isMatchStatus(value.status)) {
    errors.push("Invalid Match status.");
  }
  if (!isTrimmedText(value.squadLabel, TEXT_LIMITS.squadLabel)) {
    errors.push("Invalid squadLabel.");
  }
  if (!isTrimmedText(value.competitionName, TEXT_LIMITS.competitionName)) {
    errors.push("Invalid competitionName.");
  }
  if (!isNullableTrimmedText(value.opponentName, TEXT_LIMITS.opponentName)) {
    errors.push("Invalid opponentName.");
  }
  if (
    value.kickoffAt !== null &&
    !(value.kickoffAt instanceof Date && Number.isFinite(value.kickoffAt.getTime()))
  ) {
    errors.push("Invalid kickoffAt.");
  }
  if (value.venueType !== null && !isMatchVenueType(value.venueType)) {
    errors.push("Invalid venueType.");
  }

  if (
    isMatchStatus(value.status) &&
    ["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(value.status)
  ) {
    if (typeof value.opponentName !== "string" || value.opponentName.length === 0) {
      errors.push("Scheduled or active Match requires opponentName.");
    }
    if (!(value.kickoffAt instanceof Date)) {
      errors.push("Scheduled or active Match requires kickoffAt.");
    }
    if (!isMatchVenueType(value.venueType)) {
      errors.push("Scheduled or active Match requires venueType.");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateProClubMatchRosterSnapshot(
  value: unknown,
): ProClubMatchStartingXIValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["Roster snapshot must be an object."] };
  }

  if (value.schemaVersion !== PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION) {
    errors.push("Unsupported roster snapshot schemaVersion.");
  }
  if (!isExactPlayerKey(value.playerKey)) {
    errors.push("Invalid canonical playerKey.");
  }
  if (!isNullableTrimmedText(value.futId, TEXT_LIMITS.futId)) {
    errors.push("Invalid FUTID snapshot.");
  }
  if (!isTrimmedText(value.firstName, TEXT_LIMITS.firstName)) {
    errors.push("Invalid firstName snapshot.");
  }
  if (!isTrimmedText(value.lastName, TEXT_LIMITS.lastName, true)) {
    errors.push("Invalid lastName snapshot.");
  }
  if (
    typeof value.jerseyNumber !== "number" ||
    !Number.isInteger(value.jerseyNumber) ||
    value.jerseyNumber < 0 ||
    value.jerseyNumber > 99
  ) {
    errors.push("Invalid jerseyNumber snapshot.");
  }
  if (
    value.position !== null &&
    ![
      "GK","LB","LWB","CB","RB","RWB","DM","LM","CM","RM","AM","LW","RW","CF","ST",
    ].includes(String(value.position))
  ) {
    errors.push("Invalid position snapshot.");
  }
  if (
    !Array.isArray(value.additionalPositions) ||
    value.additionalPositions.length > 3
  ) {
    errors.push("Invalid additionalPositions snapshot.");
  }

  return { ok: errors.length === 0, errors };
}

export function validateProClubPersistedStartingXIPlan(
  value: ProClubPersistedStartingXIPlan,
  rosterPlayerKeys: readonly string[],
): ProClubMatchStartingXIValidationResult {
  const errors: string[] = [];
  const rosterSet = new Set(rosterPlayerKeys);

  if (value.schemaVersion !== PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION) {
    errors.push("Unsupported Starting XI schemaVersion.");
  }
  if (
    value.formation !== "CUSTOM" &&
    !(PRO_CLUB_STARTING_XI_FIXED_FORMATIONS as readonly string[]).includes(value.formation)
  ) {
    errors.push("Invalid Starting XI formation.");
  }
  if (value.formation === "CUSTOM") {
    const customValidation = validateProClubCustomFormationSlots(
      value.customFormationSlots,
    );
    errors.push(...customValidation.errors);
  } else if (
    value.customFormationSlots !== undefined &&
    value.customFormationSlots !== null
  ) {
    errors.push("Fixed formations must not persist custom formation slots.");
  }

  if (value.slotPlayerKeys.length !== 11) {
    errors.push("Starting XI must contain exactly 11 slots.");
  }

  const starters = value.slotPlayerKeys.filter(
    (playerKey): playerKey is string => playerKey !== null,
  );

  if (!unique(starters)) {
    errors.push("Starting XI contains duplicate players.");
  }
  if (!value.substitutePlayerKeys.every((key) => isExactPlayerKey(key))) {
    errors.push("Substitutes contain an invalid playerKey.");
  }
  if (!unique(value.substitutePlayerKeys)) {
    errors.push("Substitutes contain duplicate players.");
  }
  if (value.substitutePlayerKeys.some((key) => starters.includes(key))) {
    errors.push("A player cannot be both starter and substitute.");
  }

  const selected = [...starters, ...value.substitutePlayerKeys];
  if (selected.some((key) => !rosterSet.has(key))) {
    errors.push("Starting XI references a player outside the authoritative Match roster.");
  }

  if (value.positionRoleAssignments.length !== 11) {
    errors.push("Position Role Assignments must align to 11 slots.");
  } else if (
    value.positionRoleAssignments.some(
      (role) =>
        role !== null &&
        !isTrimmedText(role, TEXT_LIMITS.roleAssignment),
    )
  ) {
    errors.push("Invalid Position Role Assignment.");
  }

  const gameModelValidation = validateGameModelTextSnapshot(
    value.gameModelSnapshot ?? createEmptyGameModelTextSnapshot(),
  );
  if (!gameModelValidation.ok) {
    errors.push(...gameModelValidation.errors);
  }

  for (const duty of PRO_CLUB_SET_PIECE_DUTIES) {
    const playerKey = value.setPieceAssignments[duty];
    if (playerKey !== null && !selected.includes(playerKey)) {
      errors.push(`Set-piece duty ${duty} must reference the selected Match squad.`);
    }
  }

  if (!isTrimmedText(value.coachNotes, TEXT_LIMITS.coachNotes, true)) {
    errors.push("Invalid coachNotes.");
  }

  return { ok: errors.length === 0, errors };
}

export function validateProClubPersistedShootoutPlan(
  value: ProClubPersistedShootoutPlan,
  matchSquadPlayerKeys: readonly string[],
): ProClubMatchStartingXIValidationResult {
  const errors: string[] = [];
  const squadSet = new Set(matchSquadPlayerKeys);
  const all = [...value.primaryTakers, ...value.backupTakers];

  if (value.schemaVersion !== PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION) {
    errors.push("Unsupported shootout schemaVersion.");
  }
  if (value.primaryTakers.length > 5) {
    errors.push("Shootout primary order supports at most five players.");
  }
  if (value.backupTakers.length > 5) {
    errors.push("Shootout backup order supports at most five players.");
  }
  if (!all.every((key) => isExactPlayerKey(key))) {
    errors.push("Shootout order contains invalid playerKey.");
  }
  if (!unique(all)) {
    errors.push("Shootout order contains duplicate players.");
  }
  if (all.some((key) => !squadSet.has(key))) {
    errors.push("Shootout order must reference the authoritative Match squad.");
  }

  return { ok: errors.length === 0, errors };
}
