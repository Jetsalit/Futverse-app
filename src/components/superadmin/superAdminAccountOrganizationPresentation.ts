import type {
  SuperAdminIntegrityState,
  SuperAdminOrganizationRelationship,
  SuperAdminOrganizationType,
  SuperAdminRelationshipEvidenceKind,
  SuperAdminRelationshipRole,
  SuperAdminRelationshipSource,
  SuperAdminRelationshipStatus,
  SuperAdminUserRelationshipRow,
} from "../../lib/superAdminRelationshipReadModel";

export type SuperAdminAccountOrganizationItemState =
  | "CURRENT"
  | "HISTORICAL";

export type SuperAdminAccountOrganizationPresentationState =
  | "VERIFIED"
  | "REVIEW_REQUIRED"
  | "CONFLICT"
  | "LEGACY_REVIEW_REQUIRED"
  | "UNASSIGNED";

export interface SuperAdminAccountOrganizationItem {
  organizationId: string;
  organizationName?: string;
  organizationType: SuperAdminOrganizationType;
  role: SuperAdminRelationshipRole;
  status: SuperAdminRelationshipStatus;
  evidenceKind: SuperAdminRelationshipEvidenceKind;
  state: SuperAdminAccountOrganizationItemState;
  playerId?: string;
  futId?: string;
  playerName?: string;
}

export interface SuperAdminAccountOrganizationPresentation {
  userId: string;
  name?: string;
  email?: string;
  accountRole?: string;
  accountStatus?: string;
  source: SuperAdminRelationshipSource;
  integrity: SuperAdminIntegrityState;
  presentationState: SuperAdminAccountOrganizationPresentationState;
  current: SuperAdminAccountOrganizationItem[];
  historical: SuperAdminAccountOrganizationItem[];
  issues: string[];
}

function toPresentationItem(
  relationship: SuperAdminOrganizationRelationship,
): SuperAdminAccountOrganizationItem {
  return {
    organizationId: relationship.organizationId,
    organizationName: relationship.organizationName,
    organizationType: relationship.organizationType,
    role: relationship.relationship,
    status: relationship.relationshipStatus,
    evidenceKind: relationship.evidenceKind,
    state: relationship.isCurrent ? "CURRENT" : "HISTORICAL",
    playerId: relationship.playerId,
    futId: relationship.futId,
    playerName: relationship.playerName,
  };
}

function resolvePresentationState(
  row: SuperAdminUserRelationshipRow,
): SuperAdminAccountOrganizationPresentationState {
  if (row.integrity === "CONFLICT") {
    return "CONFLICT";
  }

  if (row.source === "LEGACY_COMPATIBLE") {
    return "LEGACY_REVIEW_REQUIRED";
  }

  if (
    row.source === "UNASSIGNED" &&
    row.integrity === "UNASSIGNED"
  ) {
    return "UNASSIGNED";
  }

  if (row.integrity === "REVIEW_REQUIRED") {
    return "REVIEW_REQUIRED";
  }

  if (row.integrity === "VERIFIED") {
    return "VERIFIED";
  }

  // Any impossible or future source/integrity combination must fail closed
  // rather than being presented as safely unassigned.
  return "REVIEW_REQUIRED";
}

export function buildSuperAdminAccountOrganizationPresentation(
  row: SuperAdminUserRelationshipRow,
): SuperAdminAccountOrganizationPresentation {
  const current: SuperAdminAccountOrganizationItem[] = [];
  const historical: SuperAdminAccountOrganizationItem[] = [];

  for (const relationship of row.organizations) {
    const item = toPresentationItem(relationship);

    if (relationship.isCurrent) {
      current.push(item);
    } else {
      historical.push(item);
    }
  }

  return {
    userId: row.userId,
    name: row.name,
    email: row.email,
    accountRole: row.accountRole,
    accountStatus: row.accountStatus,
    source: row.source,
    integrity: row.integrity,
    presentationState: resolvePresentationState(row),
    current,
    historical,
    issues: [...row.issues],
  };
}
