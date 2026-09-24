import { parseCanonicalDateOnly } from "./dateTimeFoundation";
import { isExactPlayerKey } from "./playerIdentityFoundation";

export const ACADEMY_FITNESS_RESULT_SCHEMA_VERSION = 1 as const;

export const ACADEMY_FITNESS_RESULTS_COLLECTION =
  "fitnessResults" as const;

export const ACADEMY_FITNESS_RESULT_SOURCE =
  "ACADEMY_BULK_ENTRY" as const;

/**
 * Client/domain input for one observed Fitness result.
 *
 * Firestore persistence metadata (`recordedAt`, `recordedBy`) is deliberately
 * excluded from client input. A later repository/Rules slice will bind those
 * fields to trusted request/server context.
 */
export interface AcademyFitnessResultCreateInput {
  playerId: string;
  definitionId: string;
  definitionVersion: number;
  value: number;
  observedOn: string;
}

/**
 * Validated immutable observation payload before persistence metadata is added.
 *
 * Canonical future persistence path:
 * academies/{academyId}/fitnessResults/{resultId}
 *
 * V1 lifecycle is append-only:
 * create is allowed by the future Rules contract; update/delete are not.
 */
export interface ValidAcademyFitnessResultCreate {
  schemaVersion: 1;
  playerId: string;
  definitionId: string;
  definitionVersion: number;
  value: number;
  observedOn: string;
  source: "ACADEMY_BULK_ENTRY";
}

export interface AcademyFitnessResultStoredRecord<
  RecordedAt = unknown,
> extends ValidAcademyFitnessResultCreate {
  recordedAt: RecordedAt;
  recordedBy: string;
}

export type AcademyFitnessResultValidationResult =
  | {
      ok: true;
      value: ValidAcademyFitnessResultCreate;
    }
  | {
      ok: false;
      errors: string[];
    };

const CREATE_INPUT_KEYS = [
  "definitionId",
  "definitionVersion",
  "observedOn",
  "playerId",
  "value",
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

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual =
    Object.keys(value).sort();

  const expected =
    [...expectedKeys].sort();

  return (
    actual.length === expected.length &&
    actual.join(",") === expected.join(",")
  );
}

export function isExactFitnessDefinitionId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function isValidFitnessDefinitionVersion(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  );
}

export function isFiniteFitnessResultValue(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

export function isStrictAcademyFitnessObservedOn(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    parseCanonicalDateOnly(value) !== null
  );
}

export function validateAcademyFitnessResultCreateInput(
  input: unknown,
): AcademyFitnessResultValidationResult {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [
        "Fitness result input must be an object.",
      ],
    };
  }

  const errors: string[] = [];

  if (!hasExactKeys(input, CREATE_INPUT_KEYS)) {
    errors.push(
      "Fitness result input contains unknown or missing fields.",
    );
  }

  if (!isExactPlayerKey(input.playerId)) {
    errors.push(
      "playerId must be an exact Academy player document identifier.",
    );
  }

  if (!isExactFitnessDefinitionId(input.definitionId)) {
    errors.push(
      "definitionId must be an exact Fitness definition identifier.",
    );
  }

  if (!isValidFitnessDefinitionVersion(input.definitionVersion)) {
    errors.push(
      "definitionVersion must be a positive integer.",
    );
  }

  if (!isFiniteFitnessResultValue(input.value)) {
    errors.push(
      "value must be a finite numeric observation.",
    );
  }

  if (!isStrictAcademyFitnessObservedOn(input.observedOn)) {
    errors.push(
      "observedOn must be a valid calendar date in YYYY-MM-DD format.",
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      schemaVersion:
        ACADEMY_FITNESS_RESULT_SCHEMA_VERSION,
      playerId: input.playerId as string,
      definitionId: input.definitionId as string,
      definitionVersion: input.definitionVersion as number,
      value: input.value as number,
      observedOn: input.observedOn as string,
      source: ACADEMY_FITNESS_RESULT_SOURCE,
    },
  };
}