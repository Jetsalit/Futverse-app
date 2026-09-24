import { parseCanonicalDateOnly } from "./dateTimeFoundation";
import {
  isExactFitnessDefinitionId,
  isFiniteFitnessResultValue,
  isValidFitnessDefinitionVersion,
} from "./academyFitnessResult";
import { isExactPlayerKey } from "./playerIdentityFoundation";
import type { FitnessTestDefinition } from "./fitnessTestFoundation";

export const PRO_CLUB_FITNESS_RESULT_SCHEMA_VERSION = 1 as const;
export const PRO_CLUB_FITNESS_RESULTS_COLLECTION = "fitnessResults" as const;
export const PRO_CLUB_FITNESS_RESULT_SOURCE = "PRO_CLUB_FITNESS_ENTRY" as const;

export interface ProClubFitnessResultCreateInput {
  playerKey: string;
  definitionId: string;
  definitionVersion: number;
  value: number;
  observedOn: string;
}

export interface ValidProClubFitnessResultCreate {
  schemaVersion: 1;
  playerKey: string;
  definitionId: string;
  definitionVersion: number;
  value: number;
  observedOn: string;
  source: typeof PRO_CLUB_FITNESS_RESULT_SOURCE;
}

export interface ProClubFitnessResultStoredRecord<RecordedAt = unknown>
  extends ValidProClubFitnessResultCreate {
  recordedAt: RecordedAt;
  recordedBy: string;
}

export type ProClubFitnessResultValidationResult =
  | { ok: true; value: ValidProClubFitnessResultCreate }
  | { ok: false; errors: string[] };

const CREATE_INPUT_KEYS = [
  "definitionId",
  "definitionVersion",
  "observedOn",
  "playerKey",
  "value",
] as const;

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

export function validateProClubFitnessResultCreateInput(
  input: unknown,
): ProClubFitnessResultValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Pro Club Fitness result input must be an object."] };
  }

  const errors: string[] = [];
  if (!hasExactKeys(input, CREATE_INPUT_KEYS)) {
    errors.push("Pro Club Fitness result input contains unknown or missing fields.");
  }
  if (!isExactPlayerKey(input.playerKey)) {
    errors.push("playerKey must be an exact Player Identity key.");
  }
  if (!isExactFitnessDefinitionId(input.definitionId)) {
    errors.push("definitionId must be an exact Fitness definition identifier.");
  }
  if (!isValidFitnessDefinitionVersion(input.definitionVersion)) {
    errors.push("definitionVersion must be a positive integer.");
  }
  if (!isFiniteFitnessResultValue(input.value)) {
    errors.push("value must be a finite numeric observation.");
  }
  if (
    typeof input.observedOn !== "string" ||
    parseCanonicalDateOnly(input.observedOn) === null
  ) {
    errors.push("observedOn must be a valid calendar date in YYYY-MM-DD format.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: PRO_CLUB_FITNESS_RESULT_SCHEMA_VERSION,
      playerKey: input.playerKey as string,
      definitionId: input.definitionId as string,
      definitionVersion: input.definitionVersion as number,
      value: input.value as number,
      observedOn: input.observedOn as string,
      source: PRO_CLUB_FITNESS_RESULT_SOURCE,
    },
  };
}

export function proClubFitnessResultIdentitySeedV1(
  result: Pick<
    ValidProClubFitnessResultCreate,
    "playerKey" | "observedOn" | "definitionId" | "definitionVersion"
  >,
): string {
  const encoder = new TextEncoder();
  return `fitness-result-v1|${encoder.encode(result.playerKey).length}:${result.playerKey}|` +
    `${result.observedOn}|${encoder.encode(result.definitionId).length}:${result.definitionId}|` +
    String(result.definitionVersion);
}

export async function proClubFitnessResultDocumentIdV1(
  result: Pick<
    ValidProClubFitnessResultCreate,
    "playerKey" | "observedOn" | "definitionId" | "definitionVersion"
  >,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(proClubFitnessResultIdentitySeedV1(result)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `fit-v1-${hex}`;
}

export interface ProClubFitnessResultDraftEntry {
  playerKey: string;
  definitionKey: string;
  input: ProClubFitnessResultCreateInput;
}

export type ProClubFitnessResultDraftPreparation =
  | { ok: true; entries: ProClubFitnessResultDraftEntry[] }
  | { ok: false; errors: string[] };

export interface ProClubFitnessResultHistoryEntry {
  id: string;
  playerKey: string;
  observedOn: string;
  definitionId: string;
  definitionVersion: number;
  definitionKey: string;
  definitionName: string;
  value: number;
  unit: string;
}

type RosterPlayerForEntry = {
  playerKey: string;
  status: "ACTIVE" | "INACTIVE" | "RELEASED";
};

export function prepareProClubFitnessResultDrafts(input: {
  observedOn: string;
  players: readonly RosterPlayerForEntry[];
  definitions: readonly FitnessTestDefinition[];
  drafts: Record<string, Record<string, string>>;
  saved: Record<string, Record<string, number>>;
}): ProClubFitnessResultDraftPreparation {
  const errors: string[] = [];
  const entries: ProClubFitnessResultDraftEntry[] = [];
  if (parseCanonicalDateOnly(input.observedOn) === null) {
    errors.push("Select a valid testing date.");
  }

  const players = new Map(
    input.players
      .filter((player) => isExactPlayerKey(player.playerKey))
      .map((player) => [player.playerKey, player.status]),
  );
  const definitions = new Map(
    input.definitions
      .filter((definition) => definition.origin === "BUILT_IN" && definition.status === "ACTIVE")
      .map((definition) => [definition.key, definition]),
  );

  for (const [playerKey, cells] of Object.entries(input.drafts)) {
    for (const [definitionKey, rawValue] of Object.entries(cells)) {
      if (rawValue.trim() === "") continue;
      const label = `${playerKey} / ${definitionKey}`;
      const playerStatus = players.get(playerKey);
      const definition = definitions.get(definitionKey);
      if (!playerStatus || playerStatus === "RELEASED" || !definition) {
        errors.push(`${label}: player or test is not eligible for a new result.`);
        continue;
      }
      if (Object.hasOwn(input.saved[playerKey] ?? {}, definitionKey)) {
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
      const candidate: ProClubFitnessResultCreateInput = {
        playerKey,
        definitionId: definition.id,
        definitionVersion: definition.version,
        value,
        observedOn: input.observedOn,
      };
      const validated = validateProClubFitnessResultCreateInput(candidate);
      if (validated.ok === false) {
        errors.push(`${label}: ${validated.errors.join(" ")}`);
        continue;
      }
      entries.push({ playerKey, definitionKey, input: candidate });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, entries };
}

type FitnessResultRecordForSelection = { id: string; data: unknown };

function definitionsByIdentity(
  definitions: readonly FitnessTestDefinition[],
): Map<string, FitnessTestDefinition> {
  return new Map(
    definitions
      .filter((definition) => definition.origin === "BUILT_IN")
      .map((definition) => [
        JSON.stringify([definition.id, definition.version]),
        definition,
      ]),
  );
}

function validStoredObservation(
  record: FitnessResultRecordForSelection,
  definitions: ReadonlyMap<string, FitnessTestDefinition>,
): { data: Record<string, unknown>; definition: FitnessTestDefinition } | null {
  if (!isPlainObject(record.data)) return null;
  const data = record.data;
  const definition = definitions.get(
    JSON.stringify([data.definitionId, data.definitionVersion]),
  );
  if (
    data.schemaVersion !== PRO_CLUB_FITNESS_RESULT_SCHEMA_VERSION ||
    data.source !== PRO_CLUB_FITNESS_RESULT_SOURCE ||
    !isExactPlayerKey(data.playerKey) ||
    !isExactFitnessDefinitionId(data.definitionId) ||
    !isValidFitnessDefinitionVersion(data.definitionVersion) ||
    !isFiniteFitnessResultValue(data.value) ||
    typeof data.observedOn !== "string" ||
    parseCanonicalDateOnly(data.observedOn) === null ||
    !definition
  ) {
    return null;
  }
  return { data, definition };
}

export function selectProClubFitnessResultsForDate(input: {
  observedOn: string;
  definitions: readonly FitnessTestDefinition[];
  records: readonly FitnessResultRecordForSelection[];
}): Record<string, Record<string, number>> {
  const definitions = definitionsByIdentity(input.definitions);
  const selected = new Map<string, { value: number; version: number; id: string }>();

  for (const record of input.records) {
    const valid = validStoredObservation(record, definitions);
    if (!valid || valid.data.observedOn !== input.observedOn) continue;
    const playerKey = valid.data.playerKey as string;
    const definitionKey = valid.definition.key;
    const key = JSON.stringify([playerKey, definitionKey]);
    const previous = selected.get(key);
    if (
      !previous ||
      valid.definition.version > previous.version ||
      (valid.definition.version === previous.version && record.id > previous.id)
    ) {
      selected.set(key, {
        value: valid.data.value as number,
        version: valid.definition.version,
        id: record.id,
      });
    }
  }

  const byPlayer = new Map<string, Map<string, number>>();
  for (const [key, result] of selected) {
    const [playerKey, definitionKey] = JSON.parse(key) as [string, string];
    const cells = byPlayer.get(playerKey) ?? new Map<string, number>();
    cells.set(definitionKey, result.value);
    byPlayer.set(playerKey, cells);
  }
  return Object.fromEntries(
    [...byPlayer].map(([playerKey, cells]) => [playerKey, Object.fromEntries(cells)]),
  );
}

export function selectProClubFitnessResultHistory(input: {
  playerKey: string;
  definitions: readonly FitnessTestDefinition[];
  records: readonly FitnessResultRecordForSelection[];
}): ProClubFitnessResultHistoryEntry[] {
  const definitions = definitionsByIdentity(input.definitions);
  const history: ProClubFitnessResultHistoryEntry[] = [];

  for (const record of input.records) {
    const valid = validStoredObservation(record, definitions);
    if (!valid || valid.data.playerKey !== input.playerKey) continue;
    history.push({
      id: record.id,
      playerKey: valid.data.playerKey as string,
      observedOn: valid.data.observedOn as string,
      definitionId: valid.data.definitionId as string,
      definitionVersion: valid.data.definitionVersion as number,
      definitionKey: valid.definition.key,
      definitionName: valid.definition.name,
      value: valid.data.value as number,
      unit: valid.definition.unit,
    });
  }

  return history.sort((left, right) =>
    right.observedOn.localeCompare(left.observedOn) ||
    left.id.localeCompare(right.id),
  );
}
