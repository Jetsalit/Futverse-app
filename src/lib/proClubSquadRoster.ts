import {
  isExactPlayerKey,
  isIssuedFutIdV1,
} from "./playerIdentityFoundation";
import {
  isPlayerPositionCode,
  validatePositionSelection,
  type PlayerPositionCode,
} from "./playerPositionSelection";

export const PRO_CLUB_SQUAD_ROSTER_SCHEMA_VERSION = 1 as const;

export const PRO_CLUB_SQUAD_ROSTER_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "RELEASED",
] as const;

export type ProClubSquadRosterStatus =
  (typeof PRO_CLUB_SQUAD_ROSTER_STATUSES)[number];

export interface ProClubSquadRosterFootballInput {
  futId: string | null;
  firstName: string;
  lastName: string;
  position: PlayerPositionCode | null;
  additionalPositions: PlayerPositionCode[];
  jerseyNumber: number;
  squadLabel: string;
  status: ProClubSquadRosterStatus;
}

export interface ValidProClubSquadRosterFootballInput
  extends ProClubSquadRosterFootballInput {
  schemaVersion: 1;
}

export type ProClubSquadRosterValidationResult =
  | {
      ok: true;
      value: ValidProClubSquadRosterFootballInput;
    }
  | {
      ok: false;
      errors: string[];
    };

const INPUT_KEYS = [
  "additionalPositions",
  "firstName",
  "futId",
  "jerseyNumber",
  "lastName",
  "position",
  "squadLabel",
  "status",
] as const;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function hasExactInputKeys(
  value: Record<string, unknown>,
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...INPUT_KEYS].sort();
  return (
    actual.length === expected.length &&
    actual.join(",") === expected.join(",")
  );
}

function isNormalizedText(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string {
  if (typeof value !== "string") {
    return false;
  }

  if (value.trim() !== value) {
    return false;
  }

  if (value.length > maxLength) {
    return false;
  }

  return allowEmpty || value.length > 0;
}

export function isProClubSquadRosterStatus(
  value: unknown,
): value is ProClubSquadRosterStatus {
  return (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "RELEASED"
  );
}

export function validateProClubSquadRosterFootballInput(
  input: unknown,
): ProClubSquadRosterValidationResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: ["Squad roster input must be an object."],
    };
  }

  const errors: string[] = [];

  if (!hasExactInputKeys(input)) {
    errors.push("Squad roster input contains unknown or missing fields.");
  }

  if (
    input.futId !== null &&
    !isIssuedFutIdV1(input.futId)
  ) {
    errors.push("Invalid FUTID.");
  }

  if (!isNormalizedText(input.firstName, 80)) {
    errors.push("Invalid firstName.");
  }

  if (!isNormalizedText(input.lastName, 80, true)) {
    errors.push("Invalid lastName.");
  }

  if (
    input.position !== null &&
    !isPlayerPositionCode(input.position)
  ) {
    errors.push("Invalid primary position.");
  }

  const additionalPositions = Array.isArray(input.additionalPositions)
    ? input.additionalPositions
    : null;

  if (additionalPositions === null) {
    errors.push("additionalPositions must be an array.");
  } else if (input.position === null) {
    if (additionalPositions.length > 0) {
      errors.push("Additional positions require a primary position.");
    }
  } else {
    const positionValidation = validatePositionSelection({
      primary:
        typeof input.position === "string"
          ? input.position
          : "",
      additional: additionalPositions.filter(
        (value): value is string => typeof value === "string",
      ),
    });

    if (
      additionalPositions.some(
        (value) => typeof value !== "string",
      ) ||
      !positionValidation.valid
    ) {
      errors.push("Invalid additional positions.");
    }
  }

  if (
    !Number.isInteger(input.jerseyNumber) ||
    (input.jerseyNumber as number) < 0 ||
    (input.jerseyNumber as number) > 99
  ) {
    errors.push("jerseyNumber must be an integer from 0 to 99.");
  }

  if (!isNormalizedText(input.squadLabel, 80)) {
    errors.push("Invalid squadLabel.");
  }

  if (!isProClubSquadRosterStatus(input.status)) {
    errors.push("Invalid roster status.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const canonicalAdditionalPositions =
    additionalPositions as PlayerPositionCode[];

  return {
    ok: true,
    value: {
      schemaVersion: PRO_CLUB_SQUAD_ROSTER_SCHEMA_VERSION,
      futId: input.futId as string | null,
      firstName: input.firstName as string,
      lastName: input.lastName as string,
      position: input.position as PlayerPositionCode | null,
      additionalPositions: [...canonicalAdditionalPositions],
      jerseyNumber: input.jerseyNumber as number,
      squadLabel: input.squadLabel as string,
      status: input.status as ProClubSquadRosterStatus,
    },
  };
}

export function canTransitionProClubSquadRosterStatus(
  from: ProClubSquadRosterStatus,
  to: ProClubSquadRosterStatus,
): boolean {
  if (from === "RELEASED") {
    return to === "RELEASED";
  }

  if (from === "ACTIVE") {
    return (
      to === "ACTIVE" ||
      to === "INACTIVE" ||
      to === "RELEASED"
    );
  }

  return (
    to === "INACTIVE" ||
    to === "ACTIVE" ||
    to === "RELEASED"
  );
}

export function canBindProClubRosterFutId(
  playerKey: unknown,
  currentFutId: unknown,
  requestedFutId: unknown,
  registryPlayerKey: unknown,
): boolean {
  if (!isExactPlayerKey(playerKey)) {
    return false;
  }

  if (currentFutId !== null) {
    return (
      isIssuedFutIdV1(currentFutId) &&
      requestedFutId === currentFutId &&
      registryPlayerKey === playerKey
    );
  }

  if (!isIssuedFutIdV1(requestedFutId)) {
    return false;
  }

  return registryPlayerKey === playerKey;
}
