import type {
  SuperAdminAccountOrganizationCoverage,
} from "./superAdminAccountOrganizationContext";

import type {
  SuperAdminIntegrityState,
  SuperAdminLegacyEvidence,
  SuperAdminOrganizationRelationship,
  SuperAdminOrganizationType,
  SuperAdminRelationshipEvidenceKind,
  SuperAdminRelationshipRole,
  SuperAdminRelationshipSource,
  SuperAdminRelationshipStatus,
  SuperAdminUserRelationshipRow,
} from "../../lib/superAdminRelationshipReadModel";

export type SuperAdminUserRelationshipInspectorState =
  | "READY"
  | "LOADING"
  | "UNAVAILABLE"
  | "OUT_OF_SYNC";

export type SuperAdminUserRelationshipInspectorAuthorityState =
  | "RESOLVED"
  | "UNRESOLVED_CONFLICT"
  | "NO_CURRENT_AUTHORITY";

export interface SuperAdminUserRelationshipInspectorItem {
  organizationId: string;
  organizationName?: string;
  organizationType: SuperAdminOrganizationType;
  role: SuperAdminRelationshipRole;
  status: SuperAdminRelationshipStatus;
  evidenceKind: SuperAdminRelationshipEvidenceKind;
  membershipSource?: string;
  playerId?: string;
  futId?: string;
  playerName?: string;
}

export interface SuperAdminUserRelationshipInspectorModel {
  state: SuperAdminUserRelationshipInspectorState;
  authorityState: SuperAdminUserRelationshipInspectorAuthorityState;
  userId: string;
  coverage: SuperAdminAccountOrganizationCoverage;
  accountRole?: string;
  accountStatus?: string;
  source?: SuperAdminRelationshipSource;
  integrity?: SuperAdminIntegrityState;
  currentEvidence: SuperAdminUserRelationshipInspectorItem[];
  resolvedAuthority: SuperAdminUserRelationshipInspectorItem[];
  historical: SuperAdminUserRelationshipInspectorItem[];
  legacyEvidence?: SuperAdminLegacyEvidence;
  lastKnownAccountActivity?: unknown;
  issues: string[];
  reason?: string;
}

export interface BuildSuperAdminUserRelationshipInspectorModelInput {
  userId: string;
  context: unknown;
  row?: SuperAdminUserRelationshipRow;
}

type InspectorContextState =
  | "READY"
  | "LOADING"
  | "UNAVAILABLE"
  | "OUT_OF_SYNC";

const COVERAGE_VALUES =
  new Set([
    "AVAILABLE",
    "LOADING",
    "UNAVAILABLE",
    "NOT_CONNECTED",
  ]);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function contextState(
  context: unknown,
): InspectorContextState | null {
  if (!isRecord(context)) return null;

  const state = context.state;

  if (
    state === "READY" ||
    state === "LOADING" ||
    state === "UNAVAILABLE" ||
    state === "OUT_OF_SYNC"
  ) {
    return state;
  }

  return null;
}

function fallbackCoverage(
  state: InspectorContextState,
): SuperAdminAccountOrganizationCoverage {
  if (state === "LOADING") {
    return {
      academyAuthority: "LOADING",
      proClubAuthority: "NOT_CONNECTED",
    };
  }

  if (state === "UNAVAILABLE") {
    return {
      academyAuthority: "UNAVAILABLE",
      proClubAuthority: "NOT_CONNECTED",
    };
  }

  return {
    academyAuthority: "AVAILABLE",
    proClubAuthority: "NOT_CONNECTED",
  };
}

function coverageFromContext(
  context: unknown,
): SuperAdminAccountOrganizationCoverage | null {
  if (!isRecord(context)) {
    return null;
  }

  const coverage = context.coverage;

  if (!isRecord(coverage)) {
    return null;
  }

  const academyAuthority =
    coverage.academyAuthority;

  const proClubAuthority =
    coverage.proClubAuthority;

  if (
    typeof academyAuthority !== "string" ||
    typeof proClubAuthority !== "string" ||
    !COVERAGE_VALUES.has(academyAuthority) ||
    !COVERAGE_VALUES.has(proClubAuthority)
  ) {
    return null;
  }

  return {
    academyAuthority:
      academyAuthority as
        SuperAdminAccountOrganizationCoverage["academyAuthority"],
    proClubAuthority:
      proClubAuthority as
        SuperAdminAccountOrganizationCoverage["proClubAuthority"],
  };
}

function contextReason(
  context: unknown,
): string | undefined {
  if (!isRecord(context)) return undefined;

  return typeof context.reason === "string"
    ? context.reason
    : undefined;
}

function contextPresentation(
  context: unknown,
): Record<string, unknown> | null {
  if (!isRecord(context)) return null;

  return isRecord(context.presentation)
    ? context.presentation
    : null;
}

function cloneLegacyEvidence(
  evidence?: SuperAdminLegacyEvidence,
): SuperAdminLegacyEvidence | undefined {
  if (!evidence) return undefined;

  return {
    academyId: evidence.academyId,
    activeAcademyId: evidence.activeAcademyId,
    tenantRole: evidence.tenantRole,
    linkedPlayerId: evidence.linkedPlayerId,
    assignedClients:
      Array.isArray(evidence.assignedClients)
        ? [...evidence.assignedClients]
        : undefined,
  };
}

function toInspectorItem(
  relationship: SuperAdminOrganizationRelationship,
): SuperAdminUserRelationshipInspectorItem {
  return {
    organizationId: relationship.organizationId,
    organizationName: relationship.organizationName,
    organizationType: relationship.organizationType,
    role: relationship.relationship,
    status: relationship.relationshipStatus,
    evidenceKind: relationship.evidenceKind,
    membershipSource: relationship.membershipSource,
    playerId: relationship.playerId,
    futId: relationship.futId,
    playerName: relationship.playerName,
  };
}

function failClosed(
  state: Exclude<
    SuperAdminUserRelationshipInspectorState,
    "READY"
  >,
  userId: string,
  coverage: SuperAdminAccountOrganizationCoverage,
  reason?: string,
): SuperAdminUserRelationshipInspectorModel {
  return {
    state,
    authorityState: "NO_CURRENT_AUTHORITY",
    userId,
    coverage,
    currentEvidence: [],
    resolvedAuthority: [],
    historical: [],
    issues: [],
    reason,
  };
}

export function buildSuperAdminUserRelationshipInspectorModel(
  input: BuildSuperAdminUserRelationshipInspectorModelInput,
): SuperAdminUserRelationshipInspectorModel {
  const state =
    contextState(input.context);

  if (!state) {
    return failClosed(
      "OUT_OF_SYNC",
      input.userId,
      fallbackCoverage("OUT_OF_SYNC"),
      "The organization context is invalid or unsupported.",
    );
  }

  const coverage =
    coverageFromContext(input.context);

  if (!coverage) {
    return failClosed(
      "OUT_OF_SYNC",
      input.userId,
      fallbackCoverage("OUT_OF_SYNC"),
      "The organization authority coverage is invalid or unsupported.",
    );
  }

  if (state === "LOADING") {
    return failClosed(
      "LOADING",
      input.userId,
      coverage,
    );
  }

  if (state === "UNAVAILABLE") {
    return failClosed(
      "UNAVAILABLE",
      input.userId,
      coverage,
    );
  }

  if (state === "OUT_OF_SYNC") {
    return failClosed(
      "OUT_OF_SYNC",
      input.userId,
      coverage,
      contextReason(input.context) ||
        "The relationship snapshot is out of sync.",
    );
  }

  if (!input.userId) {
    return failClosed(
      "OUT_OF_SYNC",
      input.userId,
      coverage,
      "Account identity is missing; relationship inspection cannot continue.",
    );
  }

  if (!input.row) {
    return failClosed(
      "OUT_OF_SYNC",
      input.userId,
      coverage,
      "The live account is missing from the relationship snapshot.",
    );
  }

  const presentation =
    contextPresentation(input.context);

  const presentationUserId =
    presentation &&
    typeof presentation.userId === "string"
      ? presentation.userId
      : null;

  if (
    input.row.userId !== input.userId ||
    presentationUserId !== input.userId
  ) {
    return failClosed(
      "OUT_OF_SYNC",
      input.userId,
      coverage,
      "The relationship snapshot does not match the requested account.",
    );
  }

  const presentationSource =
    presentation?.source;

  const presentationIntegrity =
    presentation?.integrity;

  if (
    presentationSource !== input.row.source ||
    presentationIntegrity !== input.row.integrity
  ) {
    return failClosed(
      "OUT_OF_SYNC",
      input.userId,
      coverage,
      "The relationship snapshot does not match the current organization context.",
    );
  }

  const currentEvidence =
    input.row.organizations
      .filter(
        (relationship) =>
          relationship.isCurrent,
      )
      .map(toInspectorItem);

  const historical =
    input.row.organizations
      .filter(
        (relationship) =>
          !relationship.isCurrent,
      )
      .map(toInspectorItem);

  let authorityState:
    SuperAdminUserRelationshipInspectorAuthorityState =
      "NO_CURRENT_AUTHORITY";

  if (input.row.integrity === "CONFLICT") {
    authorityState =
      "UNRESOLVED_CONFLICT";
  } else if (
    input.row.source === "CANONICAL" &&
    (
      input.row.integrity === "VERIFIED" ||
      input.row.integrity === "REVIEW_REQUIRED"
    ) &&
    currentEvidence.length > 0
  ) {
    authorityState =
      "RESOLVED";
  }

  const resolvedAuthority =
    authorityState === "RESOLVED"
      ? currentEvidence.map(
          (item) => ({ ...item }),
        )
      : [];

  return {
    state: "READY",
    authorityState,
    userId: input.userId,
    coverage,
    accountRole: input.row.accountRole,
    accountStatus: input.row.accountStatus,
    source: input.row.source,
    integrity: input.row.integrity,
    currentEvidence,
    resolvedAuthority,
    historical,
    legacyEvidence:
      cloneLegacyEvidence(
        input.row.legacyEvidence,
      ),
    lastKnownAccountActivity:
      input.row.lastKnownAccountActivity,
    issues: [...input.row.issues],
  };
}