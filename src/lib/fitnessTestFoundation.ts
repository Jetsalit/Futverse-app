export const FITNESS_TEST_CATEGORIES = [
  "AEROBIC_ENDURANCE",
  "ACCELERATION",
  "SPEED",
  "AGILITY",
  "POWER",
  "STRENGTH_ENDURANCE",
] as const;

export type FitnessTestCategory = (typeof FITNESS_TEST_CATEGORIES)[number];
export type FitnessMeasurementDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type FitnessTestDefinitionStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface FitnessOrganizationRef {
  readonly organizationType: "ACADEMY" | "PRO_CLUB";
  readonly organizationId: string;
}

export interface FitnessTestDefinition {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly category: FitnessTestCategory;
  readonly measurementMethod: string;
  readonly unit: string;
  readonly direction: FitnessMeasurementDirection;
  readonly status: FitnessTestDefinitionStatus;
  readonly version: number;
  readonly organization: FitnessOrganizationRef | null;
  readonly origin: "BUILT_IN" | "ORGANIZATION";
  readonly resultCount: number;
  readonly supersedesDefinitionId?: string;
}

export type CreateFitnessTestDefinitionInput = Pick<
  FitnessTestDefinition,
  "key" | "name" | "category" | "measurementMethod" | "unit" | "direction"
>;

export type EditFitnessTestDefinitionPatch = Partial<
  Pick<
    FitnessTestDefinition,
    "name" | "category" | "measurementMethod" | "unit" | "direction"
  >
>;

type FitnessDefinitionFailure = {
  readonly ok: false;
  readonly reason:
    | "INVALID_DEFINITION"
    | "NOT_OWNED"
    | "NOT_DRAFT"
    | "HAS_HISTORY"
    | "ALREADY_ARCHIVED";
};

export type CreateFitnessDefinitionResult =
  | { readonly ok: true; readonly definition: FitnessTestDefinition }
  | FitnessDefinitionFailure;

export type EditFitnessDefinitionResult =
  | {
      readonly ok: true;
      readonly kind: "UPDATED";
      readonly definition: FitnessTestDefinition;
    }
  | {
      readonly ok: true;
      readonly kind: "VERSIONED";
      readonly previous: FitnessTestDefinition;
      readonly definition: FitnessTestDefinition;
    }
  | FitnessDefinitionFailure;

export type ArchiveFitnessDefinitionResult =
  | { readonly ok: true; readonly definition: FitnessTestDefinition }
  | FitnessDefinitionFailure;

export type DeleteFitnessDefinitionResult =
  | { readonly ok: true; readonly deletedDefinitionId: string }
  | FitnessDefinitionFailure;

function builtInDefinition(
  definition: Omit<
    FitnessTestDefinition,
    "id" | "status" | "version" | "organization" | "origin" | "resultCount"
  >,
): FitnessTestDefinition {
  return Object.freeze({
    ...definition,
    id: `football:${definition.key}:v1`,
    status: "ACTIVE",
    version: 1,
    organization: null,
    origin: "BUILT_IN",
    resultCount: 0,
  });
}

/**
 * Shared football catalogue. It defines measurement semantics only: it does
 * not contain medical guidance, age norms, readiness scores, or thresholds.
 */
export const FOOTBALL_FITNESS_TEST_CATALOGUE: readonly FitnessTestDefinition[] =
  Object.freeze([
    builtInDefinition({
      key: "yoyo_level",
      name: "Yo-Yo intermittent recovery test",
      category: "AEROBIC_ENDURANCE",
      measurementMethod: "Completed test level recorded from the configured Yo-Yo protocol",
      unit: "level",
      direction: "HIGHER_IS_BETTER",
    }),
    builtInDefinition({
      key: "speed_10m",
      name: "10 m sprint",
      category: "ACCELERATION",
      measurementMethod: "Best configured 10 metre sprint time",
      unit: "s",
      direction: "LOWER_IS_BETTER",
    }),
    builtInDefinition({
      key: "speed_30m",
      name: "30 m sprint",
      category: "SPEED",
      measurementMethod: "Best configured 30 metre sprint time",
      unit: "s",
      direction: "LOWER_IS_BETTER",
    }),
    builtInDefinition({
      key: "vertical_jump",
      name: "Vertical jump",
      category: "POWER",
      measurementMethod: "Best configured vertical jump height",
      unit: "cm",
      direction: "HIGHER_IS_BETTER",
    }),
    builtInDefinition({
      key: "agility_505",
      name: "505 change-of-direction test",
      category: "AGILITY",
      measurementMethod: "Best configured 505 change-of-direction completion time",
      unit: "s",
      direction: "LOWER_IS_BETTER",
    }),
  ]);

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function isValidOrganization(organization: FitnessOrganizationRef): boolean {
  return (
    (organization.organizationType === "ACADEMY" || organization.organizationType === "PRO_CLUB") &&
    isNonEmptyText(organization.organizationId) &&
    !organization.organizationId.includes("/")
  );
}

function isValidDefinitionInput(input: CreateFitnessTestDefinitionInput): boolean {
  return (
    isNonEmptyText(input.key) &&
    /^[a-z0-9][a-z0-9_-]*$/.test(input.key) &&
    isNonEmptyText(input.name) &&
    FITNESS_TEST_CATEGORIES.includes(input.category) &&
    isNonEmptyText(input.measurementMethod) &&
    isNonEmptyText(input.unit) &&
    (input.direction === "HIGHER_IS_BETTER" || input.direction === "LOWER_IS_BETTER")
  );
}

export function fitnessDefinitionBelongsToOrganization(
  definition: FitnessTestDefinition,
  organization: FitnessOrganizationRef,
): boolean {
  return (
    definition.organization === null ||
    (definition.organization.organizationType === organization.organizationType &&
      definition.organization.organizationId === organization.organizationId)
  );
}

function fitnessDefinitionIsOwnedByOrganization(
  definition: FitnessTestDefinition,
  organization: FitnessOrganizationRef,
): boolean {
  return (
    isValidOrganization(organization) &&
    definition.origin === "ORGANIZATION" &&
    definition.organization?.organizationType === organization.organizationType &&
    definition.organization.organizationId === organization.organizationId
  );
}

export function createFitnessTestDefinition(
  organization: FitnessOrganizationRef,
  input: CreateFitnessTestDefinitionInput,
): CreateFitnessDefinitionResult {
  if (!isValidOrganization(organization) || !isValidDefinitionInput(input)) {
    return { ok: false, reason: "INVALID_DEFINITION" };
  }

  return {
    ok: true,
    definition: {
      ...input,
      id: `organization:${organization.organizationType}:${organization.organizationId}:${input.key}:v1`,
      status: "DRAFT",
      version: 1,
      organization: { ...organization },
      origin: "ORGANIZATION",
      resultCount: 0,
    },
  };
}

export function editFitnessTestDefinition(
  organization: FitnessOrganizationRef,
  definition: FitnessTestDefinition,
  patch: EditFitnessTestDefinitionPatch,
): EditFitnessDefinitionResult {
  if (!fitnessDefinitionIsOwnedByOrganization(definition, organization)) {
    return { ok: false, reason: "NOT_OWNED" };
  }
  if (definition.status === "ARCHIVED") {
    return { ok: false, reason: "ALREADY_ARCHIVED" };
  }

  const candidate = { ...definition, ...patch };
  if (!isValidDefinitionInput(candidate)) {
    return { ok: false, reason: "INVALID_DEFINITION" };
  }

  const changesMeasurementSemantics =
    candidate.category !== definition.category ||
    candidate.measurementMethod !== definition.measurementMethod ||
    candidate.unit !== definition.unit ||
    candidate.direction !== definition.direction;

  if (changesMeasurementSemantics && definition.resultCount > 0) {
    const nextVersion = definition.version + 1;
    return {
      ok: true,
      kind: "VERSIONED",
      previous: { ...definition, status: "ARCHIVED" },
      definition: {
        ...candidate,
        id: `${definition.id.replace(/:v\d+$/, "")}:v${nextVersion}`,
        version: nextVersion,
        status: "DRAFT",
        resultCount: 0,
        supersedesDefinitionId: definition.id,
      },
    };
  }

  return { ok: true, kind: "UPDATED", definition: candidate };
}

export function archiveFitnessTestDefinition(
  organization: FitnessOrganizationRef,
  definition: FitnessTestDefinition,
): ArchiveFitnessDefinitionResult {
  if (!fitnessDefinitionIsOwnedByOrganization(definition, organization)) {
    return { ok: false, reason: "NOT_OWNED" };
  }
  if (definition.status === "ARCHIVED") {
    return { ok: false, reason: "ALREADY_ARCHIVED" };
  }
  return { ok: true, definition: { ...definition, status: "ARCHIVED" } };
}

export function deleteFitnessTestDefinition(
  organization: FitnessOrganizationRef,
  definition: FitnessTestDefinition,
): DeleteFitnessDefinitionResult {
  if (!fitnessDefinitionIsOwnedByOrganization(definition, organization)) {
    return { ok: false, reason: "NOT_OWNED" };
  }
  if (definition.status !== "DRAFT") return { ok: false, reason: "NOT_DRAFT" };
  if (definition.resultCount > 0) return { ok: false, reason: "HAS_HISTORY" };
  return { ok: true, deletedDefinitionId: definition.id };
}

export interface FitnessResultReference {
  readonly id: string;
  readonly organization: FitnessOrganizationRef;
  readonly playerId: string;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly value: number;
  readonly recordedAt: string;
}

export interface FitnessTrainingObservation extends FitnessResultReference {
  readonly testName: string;
  readonly category: FitnessTestCategory;
  readonly measurementMethod: string;
  readonly unit: string;
  readonly direction: FitnessMeasurementDirection;
}

export type FitnessTrainingConnection = {
  readonly state: "NO_DATA" | "AVAILABLE";
  readonly organization: FitnessOrganizationRef;
  readonly observations: readonly FitnessTrainingObservation[];
  /** Automated prescription is deliberately outside this foundation slice. */
  readonly prescription: null;
};

export function buildFitnessTrainingConnection(input: {
  readonly organization: FitnessOrganizationRef;
  readonly definitions: readonly FitnessTestDefinition[];
  readonly results: readonly FitnessResultReference[];
}): FitnessTrainingConnection {
  const definitionsByVersion = new Map(
    input.definitions
      .filter((definition) => fitnessDefinitionBelongsToOrganization(definition, input.organization))
      .map((definition) => [`${definition.id}:${definition.version}`, definition]),
  );
  const observations = input.results.flatMap((result) => {
    if (
      result.organization.organizationType !== input.organization.organizationType ||
      result.organization.organizationId !== input.organization.organizationId
    ) return [];
    const definition = definitionsByVersion.get(`${result.definitionId}:${result.definitionVersion}`);
    if (!definition || !Number.isFinite(result.value)) return [];
    return [{
      ...result,
      testName: definition.name,
      category: definition.category,
      measurementMethod: definition.measurementMethod,
      unit: definition.unit,
      direction: definition.direction,
    }];
  });

  return {
    state: observations.length === 0 ? "NO_DATA" : "AVAILABLE",
    organization: { ...input.organization },
    observations,
    prescription: null,
  };
}
