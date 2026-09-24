import { parseCanonicalDateOnly } from "./dateTimeFoundation";
import { isExactPlayerKey } from "./playerIdentityFoundation";
import type { FitnessTestDefinition } from "./fitnessTestFoundation";

export const ACADEMY_FITNESS_RESULT_SCHEMA_VERSION = 1 as const;

export const ACADEMY_FITNESS_RESULTS_COLLECTION =
  "fitnessResults" as const;

export const ACADEMY_FITNESS_RESULT_SOURCE =
  "ACADEMY_BULK_ENTRY" as const;

/**
 * Client/domain input for one observed Fitness result.
 *
 * Firestore persistence metadata (`recordedAt`, `recordedBy`) is deliberately
 * excluded from client input. The repository and Rules bind those fields to
 * the authenticated actor and server request time.
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
 * V1 lifecycle is append-only: create is allowed; update/delete are not.
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

export interface AcademyFitnessResultDraftEntry {
  playerId: string;
  definitionKey: string;
  input: AcademyFitnessResultCreateInput;
}

export type AcademyFitnessResultDraftPreparation =
  | { ok: true; entries: AcademyFitnessResultDraftEntry[] }
  | { ok: false; errors: string[] };

export interface AcademyFitnessResultHistoryEntry {
  id: string;
  playerId: string;
  observedOn: string;
  definitionKey: string;
  definitionName: string;
  value: number;
  unit: string;
}

function recordedAtMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (isPlainObject(value) && typeof value.toMillis === "function") {
    try {
      return (value.toMillis as () => number)();
    } catch {
      return Number.NaN;
    }
  }
  return Number.NaN;
}

/** Turn non-empty grid cells into exact V1 observations before any write. */
export function prepareAcademyFitnessResultDrafts(input: {
  observedOn: string;
  playerIds: readonly string[];
  definitions: readonly FitnessTestDefinition[];
  drafts: Record<string, Record<string, string>>;
  saved: Record<string, Record<string, number>>;
}): AcademyFitnessResultDraftPreparation {
  const errors: string[] = [];
  const entries: AcademyFitnessResultDraftEntry[] = [];
  if (!isStrictAcademyFitnessObservedOn(input.observedOn)) {
    errors.push("Select a valid testing date.");
  }

  const playerIds = new Set(input.playerIds);
  const definitions = new Map(
    input.definitions
      .filter((definition) => definition.origin === "BUILT_IN" && definition.status === "ACTIVE")
      .map((definition) => [definition.key, definition]),
  );
  for (const [playerId, cells] of Object.entries(input.drafts)) {
    for (const [definitionKey, rawValue] of Object.entries(cells)) {
      if (rawValue.trim() === "") continue;
      const label = `${playerId} / ${definitionKey}`;
      const definition = definitions.get(definitionKey);
      if (!playerIds.has(playerId) || !definition) {
        errors.push(`${label}: player or test is no longer available.`);
        continue;
      }
      if (Object.hasOwn(input.saved[playerId] ?? {}, definitionKey)) {
        errors.push(`${label}: a result is already recorded for this date.`);
        continue;
      }
      const value = Number(rawValue);
      if (
        !/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(rawValue.trim()) ||
        !Number.isFinite(value)
      ) {
        errors.push(`${label}: enter a finite numeric result.`);
        continue;
      }
      const candidate: AcademyFitnessResultCreateInput = {
        playerId,
        definitionId: definition.id,
        definitionVersion: definition.version,
        value,
        observedOn: input.observedOn,
      };
      const validated = validateAcademyFitnessResultCreateInput(candidate);
      if (validated.ok === false) {
        errors.push(`${label}: ${validated.errors.join(" ")}`);
        continue;
      }
      entries.push({ playerId, definitionKey, input: candidate });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, entries };
}

/** Read one immutable value per player and test for the selected date. */
export function selectAcademyFitnessResultsForDate(input: {
  observedOn: string;
  definitions: readonly FitnessTestDefinition[];
  records: readonly { id: string; data: unknown }[];
}): Record<string, Record<string, number>> {
  const definitions = new Map(
    input.definitions
      .filter((definition) => definition.origin === "BUILT_IN")
      .map((definition) => [`${definition.id}:${definition.version}`, definition.key]),
  );
  const latest = new Map<string, {
    playerId: string;
    definitionKey: string;
    value: number;
    recordedAt: number;
    id: string;
  }>();
  for (const record of input.records) {
    if (!isPlainObject(record.data)) continue;
    const data = record.data;
    const definitionKey = definitions.get(`${data.definitionId}:${data.definitionVersion}`);
    const recordedAt = recordedAtMillis(data.recordedAt);
    if (
      data.schemaVersion !== ACADEMY_FITNESS_RESULT_SCHEMA_VERSION ||
      data.source !== ACADEMY_FITNESS_RESULT_SOURCE ||
      data.observedOn !== input.observedOn ||
      !isStrictAcademyFitnessObservedOn(data.observedOn) ||
      !isExactPlayerKey(data.playerId) ||
      !definitionKey ||
      !isFiniteFitnessResultValue(data.value) ||
      !Number.isFinite(recordedAt)
    ) continue;
    const key = JSON.stringify([data.playerId, definitionKey]);
    const previous = latest.get(key);
    if (
      !previous ||
      recordedAt > previous.recordedAt ||
      (recordedAt === previous.recordedAt && record.id > previous.id)
    ) {
      latest.set(key, {
        playerId: data.playerId,
        definitionKey,
        value: data.value,
        recordedAt,
        id: record.id,
      });
    }
  }
  const byPlayer = new Map<string, Map<string, number>>();
  for (const result of latest.values()) {
    const cells = byPlayer.get(result.playerId) ?? new Map<string, number>();
    cells.set(result.definitionKey, result.value);
    byPlayer.set(result.playerId, cells);
  }
  return Object.fromEntries(
    [...byPlayer].map(([playerId, cells]) => [playerId, Object.fromEntries(cells)]),
  );
}

/** Validate and order every persisted observation for one player's history. */
export function selectAcademyFitnessHistory(input: {
  playerId: string;
  definitions: readonly FitnessTestDefinition[];
  records: readonly { id: string; data: unknown }[];
}): AcademyFitnessResultHistoryEntry[] {
  const definitions = new Map(
    input.definitions
      .filter((definition) => definition.origin === "BUILT_IN")
      .map((definition) => [
        JSON.stringify([definition.id, definition.version]),
        definition,
      ]),
  );
  const history: Array<AcademyFitnessResultHistoryEntry & { recordedAt: number }> = [];

  for (const record of input.records) {
    if (!isPlainObject(record.data)) continue;
    const data = record.data;
    const definition = definitions.get(
      JSON.stringify([data.definitionId, data.definitionVersion]),
    );
    const recordedAt = recordedAtMillis(data.recordedAt);
    if (
      data.schemaVersion !== ACADEMY_FITNESS_RESULT_SCHEMA_VERSION ||
      data.source !== ACADEMY_FITNESS_RESULT_SOURCE ||
      data.playerId !== input.playerId ||
      !isExactPlayerKey(data.playerId) ||
      !isStrictAcademyFitnessObservedOn(data.observedOn) ||
      !definition ||
      !isValidFitnessDefinitionVersion(data.definitionVersion) ||
      !isFiniteFitnessResultValue(data.value) ||
      !Number.isFinite(recordedAt)
    ) continue;

    history.push({
      id: record.id,
      playerId: data.playerId,
      observedOn: data.observedOn,
      definitionKey: definition.key,
      definitionName: definition.name,
      value: data.value,
      unit: definition.unit,
      recordedAt,
    });
  }

  return history
    .sort((left, right) =>
      right.observedOn.localeCompare(left.observedOn) ||
      right.recordedAt - left.recordedAt ||
      right.id.localeCompare(left.id),
    )
    .map(({ recordedAt: _recordedAt, ...entry }) => entry);
}
