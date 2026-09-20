import type { ProClubOrganizationAuthority } from "./firestore/proClubOrganizationAdapter";
import type { ProClubSquadRosterRecord } from "./firestore/proClubSquadRosterRepository";
import {
  isExactPlayerKey,
} from "./playerIdentityFoundation";
import type { PlayerPositionCode } from "./playerPositionSelection";

export const PRO_CLUB_STARTING_XI_FIXED_FORMATIONS = [
  "4-3-3",
  "4-2-3-1",
  "4-4-2",
  "3-5-2",
] as const;

export type ProClubStartingXIFixedFormation =
  (typeof PRO_CLUB_STARTING_XI_FIXED_FORMATIONS)[number];

export type ProClubStartingXIFormation =
  | ProClubStartingXIFixedFormation
  | "CUSTOM";

export interface ProClubStartingXISlotDefinition {
  slotIndex: number;
  position: PlayerPositionCode;
  x: number;
  y: number;
}

export const PRO_CLUB_STARTING_XI_FIXED_SLOTS:
  Readonly<Record<ProClubStartingXIFixedFormation, readonly ProClubStartingXISlotDefinition[]>> = {
    "4-3-3": [
      { slotIndex: 0, position: "GK", x: 50, y: 90 },
      { slotIndex: 1, position: "LB", x: 15, y: 70 },
      { slotIndex: 2, position: "CB", x: 35, y: 70 },
      { slotIndex: 3, position: "CB", x: 65, y: 70 },
      { slotIndex: 4, position: "RB", x: 85, y: 70 },
      { slotIndex: 5, position: "CM", x: 30, y: 50 },
      { slotIndex: 6, position: "DM", x: 50, y: 55 },
      { slotIndex: 7, position: "CM", x: 70, y: 50 },
      { slotIndex: 8, position: "LW", x: 20, y: 25 },
      { slotIndex: 9, position: "ST", x: 50, y: 20 },
      { slotIndex: 10, position: "RW", x: 80, y: 25 },
    ],
    "4-2-3-1": [
      { slotIndex: 0, position: "GK", x: 50, y: 90 },
      { slotIndex: 1, position: "LB", x: 15, y: 70 },
      { slotIndex: 2, position: "CB", x: 35, y: 70 },
      { slotIndex: 3, position: "CB", x: 65, y: 70 },
      { slotIndex: 4, position: "RB", x: 85, y: 70 },
      { slotIndex: 5, position: "DM", x: 38, y: 55 },
      { slotIndex: 6, position: "DM", x: 62, y: 55 },
      { slotIndex: 7, position: "LW", x: 20, y: 35 },
      { slotIndex: 8, position: "AM", x: 50, y: 38 },
      { slotIndex: 9, position: "RW", x: 80, y: 35 },
      { slotIndex: 10, position: "ST", x: 50, y: 18 },
    ],
    "4-4-2": [
      { slotIndex: 0, position: "GK", x: 50, y: 90 },
      { slotIndex: 1, position: "LB", x: 15, y: 70 },
      { slotIndex: 2, position: "CB", x: 35, y: 70 },
      { slotIndex: 3, position: "CB", x: 65, y: 70 },
      { slotIndex: 4, position: "RB", x: 85, y: 70 },
      { slotIndex: 5, position: "LM", x: 15, y: 45 },
      { slotIndex: 6, position: "CM", x: 38, y: 45 },
      { slotIndex: 7, position: "CM", x: 62, y: 45 },
      { slotIndex: 8, position: "RM", x: 85, y: 45 },
      { slotIndex: 9, position: "ST", x: 35, y: 20 },
      { slotIndex: 10, position: "ST", x: 65, y: 20 },
    ],
    "3-5-2": [
      { slotIndex: 0, position: "GK", x: 50, y: 90 },
      { slotIndex: 1, position: "CB", x: 25, y: 72 },
      { slotIndex: 2, position: "CB", x: 50, y: 68 },
      { slotIndex: 3, position: "CB", x: 75, y: 72 },
      { slotIndex: 4, position: "LWB", x: 15, y: 46 },
      { slotIndex: 5, position: "CM", x: 35, y: 50 },
      { slotIndex: 6, position: "AM", x: 50, y: 40 },
      { slotIndex: 7, position: "CM", x: 65, y: 50 },
      { slotIndex: 8, position: "RWB", x: 85, y: 46 },
      { slotIndex: 9, position: "ST", x: 35, y: 20 },
      { slotIndex: 10, position: "ST", x: 65, y: 20 },
    ],
  };

export const PRO_CLUB_STARTING_XI_UI_SECTIONS = [
  "STARTING_XI",
  "SUBSTITUTES",
  "AVAILABLE_PLAYERS",
  "GAME_MODEL",
  "POSITION_ROLE_ASSIGNMENTS",
  "SET_PIECE_DUTIES",
  "PENALTY_SHOOTOUT_ORDER",
  "COACH_NOTES",
  "PLAYER_COMMUNICATION_SYNC",
  "MATCHDAY_CONTROL",
  "AUDIT_TRAIL",
] as const;

export const PRO_CLUB_GAME_MODEL_PHASES = [
  "IN_POSSESSION",
  "OUT_OF_POSSESSION",
  "TRANSITION_TO_ATTACK",
  "TRANSITION_TO_DEFEND",
] as const;

export type ProClubGameModelPhase =
  (typeof PRO_CLUB_GAME_MODEL_PHASES)[number];

export const PRO_CLUB_SET_PIECE_DUTIES = [
  "CORNER_LEFT",
  "CORNER_RIGHT",
  "FREE_KICK_LEFT",
  "FREE_KICK_RIGHT",
  "THROW_IN_LEFT",
  "THROW_IN_RIGHT",
  "PENALTY",
] as const;

export type ProClubSetPieceDuty =
  (typeof PRO_CLUB_SET_PIECE_DUTIES)[number];

export interface ProClubStartingXIEligiblePlayer {
  playerKey: string;
  futId: string | null;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: PlayerPositionCode | null;
  additionalPositions: readonly PlayerPositionCode[];
}

export interface ProClubPenaltyShootoutOrder {
  primaryTakers: readonly string[];
  backupTakers: readonly string[];
}

export interface ProClubStartingXIDraft {
  formation: ProClubStartingXIFormation;
  slotPlayerKeys: readonly (string | null)[];
  substitutePlayerKeys: readonly string[];
  positionRoleAssignments: readonly (string | null)[];
  setPieceAssignments: Readonly<Record<ProClubSetPieceDuty, string | null>>;
  penaltyShootoutOrder: ProClubPenaltyShootoutOrder;
}

export interface ProClubStartingXIValidationResult {
  ok: boolean;
  errors: readonly string[];
}

const MAX_ROLE_ASSIGNMENT_LENGTH = 160;
const PRIMARY_PENALTY_TAKER_LIMIT = 5;
const BACKUP_PENALTY_TAKER_LIMIT = 5;

function uniqueNonNull(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function allExactPlayerKeys(values: readonly string[]): boolean {
  return values.every((value) => isExactPlayerKey(value));
}

export function canAuthorProClubStartingXI(
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

export function deriveProClubStartingXIEligiblePlayers(
  roster: readonly ProClubSquadRosterRecord[],
): ProClubStartingXIEligiblePlayer[] {
  return roster
    .filter((player) => player.status === "ACTIVE")
    .map((player) => ({
      playerKey: player.playerKey,
      futId: player.futId,
      firstName: player.firstName,
      lastName: player.lastName,
      jerseyNumber: player.jerseyNumber,
      position: player.position,
      additionalPositions: [...player.additionalPositions],
    }));
}

export function createEmptyProClubStartingXIDraft(
  formation: ProClubStartingXIFormation = "4-3-3",
): ProClubStartingXIDraft {
  return {
    formation,
    slotPlayerKeys: Array.from({ length: 11 }, () => null),
    substitutePlayerKeys: [],
    positionRoleAssignments: Array.from({ length: 11 }, () => null),
    setPieceAssignments: {
      CORNER_LEFT: null,
      CORNER_RIGHT: null,
      FREE_KICK_LEFT: null,
      FREE_KICK_RIGHT: null,
      THROW_IN_LEFT: null,
      THROW_IN_RIGHT: null,
      PENALTY: null,
    },
    penaltyShootoutOrder: {
      primaryTakers: [],
      backupTakers: [],
    },
  };
}

export function validateProClubStartingXIDraft(
  input: ProClubStartingXIDraft,
  options: {
    requireCompleteStartingXI?: boolean;
  } = {},
): ProClubStartingXIValidationResult {
  const errors: string[] = [];

  if (
    input.formation !== "CUSTOM" &&
    !(PRO_CLUB_STARTING_XI_FIXED_FORMATIONS as readonly string[])
      .includes(input.formation)
  ) {
    errors.push("Invalid 11v11 formation.");
  }

  if (input.slotPlayerKeys.length !== 11) {
    errors.push("Starting XI must contain exactly 11 lineup slots.");
  }

  const starters = input.slotPlayerKeys.filter(
    (value): value is string => value !== null,
  );

  if (!allExactPlayerKeys(starters)) {
    errors.push("Starting XI contains an invalid playerKey.");
  }

  if (uniqueNonNull(input.slotPlayerKeys).length !== starters.length) {
    errors.push("A player cannot occupy more than one Starting XI slot.");
  }

  if (
    options.requireCompleteStartingXI === true &&
    starters.length !== 11
  ) {
    errors.push("A publishable Starting XI requires exactly 11 selected players.");
  }

  if (!allExactPlayerKeys(input.substitutePlayerKeys)) {
    errors.push("Substitutes contain an invalid playerKey.");
  }

  if (new Set(input.substitutePlayerKeys).size !== input.substitutePlayerKeys.length) {
    errors.push("Substitutes must contain unique players.");
  }

  const starterSet = new Set(starters);
  if (input.substitutePlayerKeys.some((playerKey) => starterSet.has(playerKey))) {
    errors.push("A player cannot be both Starting XI and substitute.");
  }

  if (input.positionRoleAssignments.length !== 11) {
    errors.push("Position role assignments must align to 11 lineup slots.");
  } else if (
    input.positionRoleAssignments.some(
      (value) =>
        value !== null &&
        (
          value.trim() !== value ||
          value.length === 0 ||
          value.length > MAX_ROLE_ASSIGNMENT_LENGTH
        ),
    )
  ) {
    errors.push("Position role assignments must be null or bounded trimmed text.");
  }

  const matchSquad = new Set([
    ...starters,
    ...input.substitutePlayerKeys,
  ]);

  for (const duty of PRO_CLUB_SET_PIECE_DUTIES) {
    const assignee = input.setPieceAssignments[duty];
    if (assignee !== null) {
      if (!isExactPlayerKey(assignee)) {
        errors.push(`Set-piece duty ${duty} contains an invalid playerKey.`);
      } else if (!matchSquad.has(assignee)) {
        errors.push(`Set-piece duty ${duty} must reference the selected match squad.`);
      }
    }
  }

  const primary = input.penaltyShootoutOrder.primaryTakers;
  const backups = input.penaltyShootoutOrder.backupTakers;

  if (primary.length > PRIMARY_PENALTY_TAKER_LIMIT) {
    errors.push("Penalty shootout primary order supports at most five takers.");
  }

  if (backups.length > BACKUP_PENALTY_TAKER_LIMIT) {
    errors.push("Penalty shootout backup order supports at most five takers.");
  }

  const allPenaltyTakers = [...primary, ...backups];
  if (!allExactPlayerKeys(allPenaltyTakers)) {
    errors.push("Penalty shootout order contains an invalid playerKey.");
  }

  if (new Set(allPenaltyTakers).size !== allPenaltyTakers.length) {
    errors.push("Penalty shootout order cannot contain duplicate players.");
  }

  if (allPenaltyTakers.some((playerKey) => !matchSquad.has(playerKey))) {
    errors.push("Penalty shootout order must reference the selected match squad.");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
