import {
  isExactFitnessDefinitionId,
  isFiniteFitnessResultValue,
  isValidFitnessDefinitionVersion,
} from "./academyFitnessResult";
import { parseCanonicalDateOnly } from "./dateTimeFoundation";
import {
  FITNESS_TEST_CATEGORIES,
  fitnessDefinitionBelongsToOrganization,
  type FitnessMeasurementDirection,
  type FitnessOrganizationRef,
  type FitnessTestCategory,
  type FitnessTestDefinition,
} from "./fitnessTestFoundation";
import { isExactPlayerKey } from "./playerIdentityFoundation";
import { isValidDocumentIdentifier } from "./proClubModel";

export interface ProClubFitnessWeeklyTrainingReadV1RosterPlayer {
  readonly playerKey: string;
  /** Display label copied from the current canonical roster by the later adapter. */
  readonly displayLabel: string;
  readonly status: "ACTIVE" | "INACTIVE" | "RELEASED";
}

export interface ProClubFitnessWeeklyTrainingReadV1Record {
  readonly id: string;
  /** Tenant identity of the collection path from which this record was read. */
  readonly organization: FitnessOrganizationRef;
  readonly data: unknown;
}

export interface ProClubFitnessWeeklyTrainingReadV1Observation {
  readonly resultId: string;
  readonly playerKey: string;
  readonly playerDisplayLabel: string;
  readonly rosterStatus: "ACTIVE" | "INACTIVE";
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly testName: string;
  readonly category: FitnessTestCategory;
  readonly measurementMethod: string;
  readonly value: number;
  readonly unit: string;
  readonly direction: FitnessMeasurementDirection;
  readonly observedOn: string;
}

export interface ProClubFitnessWeeklyTrainingReadV1Selection {
  readonly state: "NO_DATA" | "AVAILABLE";
  readonly organization: FitnessOrganizationRef;
  readonly observations: readonly ProClubFitnessWeeklyTrainingReadV1Observation[];
  readonly prescription: null;
}

export interface SelectProClubFitnessWeeklyTrainingReadV1Input {
  readonly organization: {
    readonly organizationType: "PRO_CLUB";
    readonly organizationId: string;
  };
  readonly referenceDate: string;
  readonly players: readonly ProClubFitnessWeeklyTrainingReadV1RosterPlayer[];
  readonly definitions: readonly FitnessTestDefinition[];
  readonly records: readonly ProClubFitnessWeeklyTrainingReadV1Record[];
}

type EligibleRosterPlayer = {
  playerKey: string;
  displayLabel: string;
  status: "ACTIVE" | "INACTIVE";
};

type Candidate = ProClubFitnessWeeklyTrainingReadV1Observation;

const PRO_CLUB_FITNESS_RESULT_STORED_FIELDS = [
  "definitionId",
  "definitionVersion",
  "observedOn",
  "playerKey",
  "recordedAt",
  "recordedBy",
  "schemaVersion",
  "source",
  "value",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function definitionIdentity(definitionId: string, definitionVersion: number): string {
  return JSON.stringify([definitionId, definitionVersion]);
}

function hasExactStoredResultFields(data: Record<string, unknown>): boolean {
  const actualFields = Object.keys(data).sort();
  const expectedFields = [...PRO_CLUB_FITNESS_RESULT_STORED_FIELDS].sort();
  return (
    actualFields.length === expectedFields.length &&
    actualFields.every((field, index) => field === expectedFields[index])
  );
}

function isValidPersistedTimestamp(value: unknown): boolean {
  if (!isPlainObject(value)) return false;

  try {
    const toMillis = value.toMillis;
    return typeof toMillis === "function" && Number.isFinite(toMillis.call(value));
  } catch {
    return false;
  }
}

function buildEligibleRoster(
  players: readonly ProClubFitnessWeeklyTrainingReadV1RosterPlayer[],
): ReadonlyMap<string, EligibleRosterPlayer | null> {
  const roster = new Map<string, EligibleRosterPlayer | null>();
  const seenPlayerKeys = new Set<string>();

  for (const rawPlayer of players) {
    if (!isPlainObject(rawPlayer) || !isExactPlayerKey(rawPlayer.playerKey)) continue;
    const playerKey = rawPlayer.playerKey;
    if (seenPlayerKeys.has(playerKey)) {
      roster.set(playerKey, null);
      continue;
    }
    seenPlayerKeys.add(playerKey);

    const status = rawPlayer.status;
    const displayLabel = rawPlayer.displayLabel;
    if (
      (status !== "ACTIVE" && status !== "INACTIVE") ||
      typeof displayLabel !== "string" ||
      displayLabel.length === 0 ||
      displayLabel.trim() !== displayLabel
    ) {
      roster.set(playerKey, null);
      continue;
    }

    roster.set(playerKey, { playerKey, displayLabel, status });
  }

  return roster;
}

function buildDefinitionCatalogue(
  definitions: readonly FitnessTestDefinition[],
  organization: FitnessOrganizationRef,
): ReadonlyMap<string, FitnessTestDefinition | null> {
  const catalogue = new Map<string, FitnessTestDefinition | null>();

  for (const rawDefinition of definitions) {
    if (
      !isPlainObject(rawDefinition) ||
      !isExactFitnessDefinitionId(rawDefinition.id) ||
      !isValidFitnessDefinitionVersion(rawDefinition.version) ||
      typeof rawDefinition.name !== "string" ||
      rawDefinition.name.trim() !== rawDefinition.name ||
      rawDefinition.name.length === 0 ||
      !FITNESS_TEST_CATEGORIES.includes(rawDefinition.category as FitnessTestCategory) ||
      typeof rawDefinition.measurementMethod !== "string" ||
      rawDefinition.measurementMethod.trim() !== rawDefinition.measurementMethod ||
      rawDefinition.measurementMethod.length === 0 ||
      typeof rawDefinition.unit !== "string" ||
      rawDefinition.unit.trim() !== rawDefinition.unit ||
      rawDefinition.unit.length === 0 ||
      (rawDefinition.organization !== null &&
        (!isPlainObject(rawDefinition.organization) ||
          (rawDefinition.organization.organizationType !== "ACADEMY" &&
            rawDefinition.organization.organizationType !== "PRO_CLUB") ||
          !isValidDocumentIdentifier(rawDefinition.organization.organizationId))) ||
      (rawDefinition.direction !== "HIGHER_IS_BETTER" &&
        rawDefinition.direction !== "LOWER_IS_BETTER") ||
      (rawDefinition.status !== "DRAFT" &&
        rawDefinition.status !== "ACTIVE" &&
        rawDefinition.status !== "ARCHIVED") ||
      (rawDefinition.origin !== "BUILT_IN" && rawDefinition.origin !== "ORGANIZATION")
    ) {
      continue;
    }
    if (
      (rawDefinition.origin === "BUILT_IN" && rawDefinition.organization !== null) ||
      (rawDefinition.origin === "ORGANIZATION" && rawDefinition.organization === null)
    ) {
      continue;
    }

    const definition = rawDefinition as unknown as FitnessTestDefinition;
    if (!fitnessDefinitionBelongsToOrganization(definition, organization)) continue;

    const key = definitionIdentity(definition.id, definition.version);
    if (catalogue.has(key)) {
      catalogue.set(key, null);
    } else {
      catalogue.set(key, definition);
    }
  }

  return catalogue;
}

function candidateForRecord(
  rawRecord: unknown,
  input: SelectProClubFitnessWeeklyTrainingReadV1Input,
  roster: ReadonlyMap<string, EligibleRosterPlayer | null>,
  definitions: ReadonlyMap<string, FitnessTestDefinition | null>,
): Candidate | null {
  if (!isPlainObject(rawRecord) || !isValidDocumentIdentifier(rawRecord.id)) return null;
  const recordOrganization = rawRecord.organization;
  const data = rawRecord.data;

  if (
    !isPlainObject(recordOrganization) ||
    recordOrganization.organizationType !== "PRO_CLUB" ||
    recordOrganization.organizationType !== input.organization.organizationType ||
    recordOrganization.organizationId !== input.organization.organizationId ||
    !isPlainObject(data) ||
    !hasExactStoredResultFields(data) ||
    data.schemaVersion !== 1 ||
    data.source !== "PRO_CLUB_FITNESS_ENTRY" ||
    !isValidPersistedTimestamp(data.recordedAt) ||
    !isValidDocumentIdentifier(data.recordedBy) ||
    !isExactPlayerKey(data.playerKey) ||
    !isExactFitnessDefinitionId(data.definitionId) ||
    !isValidFitnessDefinitionVersion(data.definitionVersion) ||
    !isFiniteFitnessResultValue(data.value) ||
    typeof data.observedOn !== "string" ||
    parseCanonicalDateOnly(data.observedOn) === null ||
    data.observedOn > input.referenceDate
  ) {
    return null;
  }

  const player = roster.get(data.playerKey);
  const definition = definitions.get(
    definitionIdentity(data.definitionId, data.definitionVersion),
  );
  if (!player || !definition) return null;

  return {
    resultId: rawRecord.id,
    playerKey: player.playerKey,
    playerDisplayLabel: player.displayLabel,
    rosterStatus: player.status,
    definitionId: definition.id,
    definitionVersion: definition.version,
    testName: definition.name,
    category: definition.category,
    measurementMethod: definition.measurementMethod,
    value: data.value,
    unit: definition.unit,
    direction: definition.direction,
    observedOn: data.observedOn,
  };
}

function candidateFingerprint(candidate: Candidate): string {
  return JSON.stringify([
    candidate.resultId,
    candidate.playerKey,
    candidate.playerDisplayLabel,
    candidate.rosterStatus,
    candidate.definitionId,
    candidate.definitionVersion,
    candidate.testName,
    candidate.category,
    candidate.measurementMethod,
    candidate.value,
    candidate.unit,
    candidate.direction,
    candidate.observedOn,
  ]);
}

function selectionResult(
  organization: FitnessOrganizationRef,
  observations: readonly Candidate[],
): ProClubFitnessWeeklyTrainingReadV1Selection {
  return {
    state: observations.length === 0 ? "NO_DATA" : "AVAILABLE",
    organization: { ...organization },
    observations,
    prescription: null,
  };
}

/** Pure, read-only V1 observation selection for the future Weekly Training adapter. */
export function selectProClubFitnessWeeklyTrainingReadV1(
  input: SelectProClubFitnessWeeklyTrainingReadV1Input,
): ProClubFitnessWeeklyTrainingReadV1Selection {
  if (
    !input ||
    input.organization?.organizationType !== "PRO_CLUB" ||
    !isValidDocumentIdentifier(input.organization.organizationId) ||
    typeof input.referenceDate !== "string" ||
    parseCanonicalDateOnly(input.referenceDate) === null
  ) {
    return selectionResult(input.organization, []);
  }

  const roster = buildEligibleRoster(input.players);
  const definitions = buildDefinitionCatalogue(input.definitions, input.organization);
  const recordsById = new Map<string, Candidate | null>();

  for (const rawRecord of input.records) {
    if (!isPlainObject(rawRecord) || !isValidDocumentIdentifier(rawRecord.id)) continue;
    const candidate = candidateForRecord(rawRecord, input, roster, definitions);
    if (!recordsById.has(rawRecord.id)) {
      recordsById.set(rawRecord.id, candidate);
      continue;
    }

    const previous = recordsById.get(rawRecord.id);
    if (
      !previous ||
      !candidate ||
      candidateFingerprint(previous) !== candidateFingerprint(candidate)
    ) {
      recordsById.set(rawRecord.id, null);
    }
  }

  const selectedByIdentity = new Map<string, Candidate>();
  for (const candidate of recordsById.values()) {
    if (!candidate) continue;
    const identity = JSON.stringify([
      candidate.playerKey,
      candidate.definitionId,
      candidate.definitionVersion,
    ]);
    const previous = selectedByIdentity.get(identity);
    if (
      !previous ||
      candidate.observedOn > previous.observedOn ||
      (candidate.observedOn === previous.observedOn &&
        compareStableText(candidate.resultId, previous.resultId) < 0)
    ) {
      selectedByIdentity.set(identity, candidate);
    }
  }

  const observations = [...selectedByIdentity.values()].sort((left, right) =>
    compareStableText(left.playerKey, right.playerKey) ||
    compareStableText(left.definitionId, right.definitionId) ||
    left.definitionVersion - right.definitionVersion,
  );

  return selectionResult(input.organization, observations);
}
