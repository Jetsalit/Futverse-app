export type SuperAdminRelationshipSource =
  | "CANONICAL"
  | "LEGACY_COMPATIBLE"
  | "UNASSIGNED";

export type SuperAdminIntegrityState =
  | "VERIFIED"
  | "REVIEW_REQUIRED"
  | "CONFLICT"
  | "UNASSIGNED";

export type SuperAdminOrganizationType =
  | "ACADEMY"
  | "PRO_CLUB"
  | "UNKNOWN";

export type SuperAdminRelationshipRole =
  | "ADMIN"
  | "COACH"
  | "PLAYER"
  | "PARENT";

export type SuperAdminRelationshipStatus =
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "LEFT"
  | "REVOKED"
  | "INACTIVE";

export type SuperAdminRelationshipEvidenceKind =
  | "STAFF_MEMBERSHIP"
  | "PLAYER_ASSOCIATION";

export interface SuperAdminOrganizationRelationship {
  organizationId: string;
  organizationName?: string;
  organizationType: SuperAdminOrganizationType;
  relationship: SuperAdminRelationshipRole;
  relationshipStatus: SuperAdminRelationshipStatus;
  source: "CANONICAL";
  evidenceKind: SuperAdminRelationshipEvidenceKind;
  isCurrent: boolean;
  membershipSource?: string;
  playerId?: string;
  futId?: string;
  playerName?: string;
}

export interface SuperAdminLegacyEvidence {
  academyId?: string | null;
  activeAcademyId?: string | null;
  tenantRole?: string | null;
  linkedPlayerId?: string | null;
  assignedClients?: string[];
}

export interface SuperAdminUserRelationshipRow {
  userId: string;
  name?: string;
  email?: string;
  accountRole?: string;
  accountStatus?: string;
  organizations: SuperAdminOrganizationRelationship[];
  source: SuperAdminRelationshipSource;
  integrity: SuperAdminIntegrityState;
  legacyEvidence?: SuperAdminLegacyEvidence;
  lastKnownAccountActivity?: unknown;
  issues: string[];
}

export interface SuperAdminAccountIdentityInput {
  userId: string;
  name?: string;
  email?: string;
  accountRole?: string;
  accountStatus?: string;
  lastKnownAccountActivity?: unknown;
}

export interface SuperAdminStaffMembershipInput {
  documentId: string;
  userId: string;
  academyId: string;
  role: unknown;
  status: unknown;
  source?: unknown;
  organizationName?: string;
}

export interface SuperAdminNonStaffAssociationInput {
  documentId: string;
  userId: string;
  academyId: string;
  playerId: string;
  role: unknown;
  status: unknown;
  organizationName?: string;
  futId?: string;
  playerName?: string;
  pathAcademyId?: string;
  pathUserId?: string;
  pathPlayerId?: string;
}

export interface ResolveSuperAdminRelationshipRowInput {
  account: SuperAdminAccountIdentityInput;
  staffMemberships?: SuperAdminStaffMembershipInput[];
  nonStaffAssociations?: SuperAdminNonStaffAssociationInput[];
  legacyEvidence?: SuperAdminLegacyEvidence;
}

const STAFF_ROLES = new Set(["ADMIN", "COACH"]);
const STAFF_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "LEFT",
  "REVOKED",
]);
const STAFF_SOURCES = new Set([
  "CLAIM_APPROVAL",
  "SUPERADMIN_ASSIGNMENT",
  "LEGACY_MIGRATION",
  "INVITE",
]);
const NONSTAFF_ROLES = new Set(["PLAYER", "PARENT"]);
const NONSTAFF_STATUSES = new Set(["ACTIVE", "INACTIVE", "REVOKED"]);

export function isExactReadModelDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

function hasLegacyEvidence(
  legacyEvidence?: SuperAdminLegacyEvidence,
): legacyEvidence is SuperAdminLegacyEvidence {
  if (!legacyEvidence) return false;
  return (
    (typeof legacyEvidence.academyId === "string" &&
      legacyEvidence.academyId.length > 0) ||
    (typeof legacyEvidence.activeAcademyId === "string" &&
      legacyEvidence.activeAcademyId.length > 0) ||
    (typeof legacyEvidence.tenantRole === "string" &&
      legacyEvidence.tenantRole.length > 0) ||
    (typeof legacyEvidence.linkedPlayerId === "string" &&
      legacyEvidence.linkedPlayerId.length > 0) ||
    (Array.isArray(legacyEvidence.assignedClients) &&
      legacyEvidence.assignedClients.length > 0)
  );
}

function normalizedLegacyEvidence(
  legacyEvidence?: SuperAdminLegacyEvidence,
): SuperAdminLegacyEvidence | undefined {
  if (!hasLegacyEvidence(legacyEvidence)) return undefined;
  return {
    academyId: legacyEvidence.academyId,
    activeAcademyId: legacyEvidence.activeAcademyId,
    tenantRole: legacyEvidence.tenantRole,
    linkedPlayerId: legacyEvidence.linkedPlayerId,
    assignedClients: Array.isArray(legacyEvidence.assignedClients)
      ? [...legacyEvidence.assignedClients]
      : undefined,
  };
}

function sameStaffRelationship(
  left: SuperAdminOrganizationRelationship,
  right: SuperAdminOrganizationRelationship,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.relationship === right.relationship &&
    left.relationshipStatus === right.relationshipStatus &&
    left.membershipSource === right.membershipSource
  );
}

function sameNonStaffRelationship(
  left: SuperAdminOrganizationRelationship,
  right: SuperAdminOrganizationRelationship,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.relationship === right.relationship &&
    left.relationshipStatus === right.relationshipStatus &&
    left.playerId === right.playerId
  );
}

function validateStaffMembership(
  accountUserId: string,
  membership: SuperAdminStaffMembershipInput,
): SuperAdminOrganizationRelationship | null {
  if (
    !isExactReadModelDocumentId(membership.documentId) ||
    !isExactReadModelDocumentId(membership.userId) ||
    !isExactReadModelDocumentId(membership.academyId) ||
    membership.documentId !== membership.userId ||
    membership.userId !== accountUserId ||
    !STAFF_ROLES.has(String(membership.role)) ||
    !STAFF_STATUSES.has(String(membership.status)) ||
    (membership.source !== undefined &&
      !STAFF_SOURCES.has(String(membership.source)))
  ) {
    return null;
  }

  const relationship = String(membership.role) as SuperAdminRelationshipRole;
  const relationshipStatus = String(
    membership.status,
  ) as SuperAdminRelationshipStatus;

  return {
    organizationId: membership.academyId,
    organizationName: membership.organizationName,
    organizationType: "ACADEMY",
    relationship,
    relationshipStatus,
    source: "CANONICAL",
    evidenceKind: "STAFF_MEMBERSHIP",
    isCurrent: relationshipStatus === "ACTIVE",
    membershipSource:
      typeof membership.source === "string" ? membership.source : undefined,
  };
}

function validateNonStaffAssociation(
  account: SuperAdminAccountIdentityInput,
  association: SuperAdminNonStaffAssociationInput,
): SuperAdminOrganizationRelationship | null {
  const pathIdentityIsValid =
    (association.pathAcademyId === undefined ||
      association.pathAcademyId === association.academyId) &&
    (association.pathUserId === undefined ||
      association.pathUserId === association.userId) &&
    (association.pathPlayerId === undefined ||
      association.pathPlayerId === association.playerId);

  if (
    !isExactReadModelDocumentId(association.documentId) ||
    !isExactReadModelDocumentId(association.userId) ||
    !isExactReadModelDocumentId(association.academyId) ||
    !isExactReadModelDocumentId(association.playerId) ||
    association.documentId !== association.playerId ||
    association.userId !== account.userId ||
    !pathIdentityIsValid ||
    !NONSTAFF_ROLES.has(String(association.role)) ||
    !NONSTAFF_STATUSES.has(String(association.status))
  ) {
    return null;
  }

  // The current hardened non-staff access model requires the account role to
  // match the association role. Do not silently promote a mismatched record.
  if (account.accountRole !== association.role) return null;

  const relationship = String(association.role) as SuperAdminRelationshipRole;
  const relationshipStatus = String(
    association.status,
  ) as SuperAdminRelationshipStatus;

  return {
    organizationId: association.academyId,
    organizationName: association.organizationName,
    organizationType: "ACADEMY",
    relationship,
    relationshipStatus,
    source: "CANONICAL",
    evidenceKind: "PLAYER_ASSOCIATION",
    isCurrent: relationshipStatus === "ACTIVE",
    playerId: association.playerId,
    futId: association.futId,
    playerName: association.playerName,
  };
}

function evaluateLegacyCompatibility(
  legacyEvidence: SuperAdminLegacyEvidence | undefined,
  relationships: SuperAdminOrganizationRelationship[],
): string[] {
  if (!legacyEvidence || relationships.length === 0) return [];

  const issues: string[] = [];
  const currentRelationships = relationships.filter((relationship) =>
    relationship.isCurrent,
  );
  if (currentRelationships.length === 0) return issues;

  const currentOrganizationIds = new Set(
    currentRelationships.map((relationship) => relationship.organizationId),
  );
  const currentStaffRoles = new Set(
    currentRelationships
      .filter((relationship) => relationship.evidenceKind === "STAFF_MEMBERSHIP")
      .map((relationship) => relationship.relationship),
  );
  const currentPlayerIds = new Set(
    currentRelationships
      .filter((relationship) => relationship.evidenceKind === "PLAYER_ASSOCIATION")
      .map((relationship) => relationship.playerId)
      .filter((playerId): playerId is string => Boolean(playerId)),
  );

  const legacyOrganizationIds = [
    legacyEvidence.activeAcademyId,
    legacyEvidence.academyId,
  ].filter(
    (organizationId): organizationId is string =>
      typeof organizationId === "string" && organizationId.length > 0,
  );

  if (
    legacyOrganizationIds.some(
      (organizationId) => !currentOrganizationIds.has(organizationId),
    )
  ) {
    issues.push("LEGACY_ORGANIZATION_DIVERGES");
  }

  if (
    typeof legacyEvidence.tenantRole === "string" &&
    legacyEvidence.tenantRole.length > 0 &&
    currentStaffRoles.size > 0 &&
    !currentStaffRoles.has(
      legacyEvidence.tenantRole as SuperAdminRelationshipRole,
    )
  ) {
    issues.push("LEGACY_TENANT_ROLE_DIVERGES");
  }

  if (
    typeof legacyEvidence.linkedPlayerId === "string" &&
    legacyEvidence.linkedPlayerId.length > 0 &&
    currentPlayerIds.size > 0 &&
    !currentPlayerIds.has(legacyEvidence.linkedPlayerId)
  ) {
    issues.push("LEGACY_PLAYER_LINK_DIVERGES");
  }

  return issues;
}

export function resolveSuperAdminUserRelationshipRow(
  input: ResolveSuperAdminRelationshipRowInput,
): SuperAdminUserRelationshipRow {
  const { account } = input;
  if (!isExactReadModelDocumentId(account.userId)) {
    throw new Error("SuperAdmin relationship read model requires an exact userId.");
  }

  const relationships: SuperAdminOrganizationRelationship[] = [];
  const issues: string[] = [];
  let hasCanonicalConflict = false;

  const staffByAcademy = new Map<string, SuperAdminOrganizationRelationship>();
  for (const membership of input.staffMemberships ?? []) {
    const relationship = validateStaffMembership(account.userId, membership);
    if (!relationship) {
      issues.push("INVALID_STAFF_MEMBERSHIP_EVIDENCE");
      continue;
    }

    const existing = staffByAcademy.get(relationship.organizationId);
    if (existing) {
      if (!sameStaffRelationship(existing, relationship)) {
        hasCanonicalConflict = true;
        issues.push("CONFLICTING_STAFF_MEMBERSHIP_EVIDENCE");
      }
      continue;
    }

    staffByAcademy.set(relationship.organizationId, relationship);
    relationships.push(relationship);
  }

  const associationByIdentity = new Map<
    string,
    SuperAdminOrganizationRelationship
  >();
  for (const association of input.nonStaffAssociations ?? []) {
    const relationship = validateNonStaffAssociation(account, association);
    if (!relationship) {
      issues.push("INVALID_NONSTAFF_ASSOCIATION_EVIDENCE");
      continue;
    }

    const identity = `${relationship.organizationId}:${relationship.playerId}`;
    const existing = associationByIdentity.get(identity);
    if (existing) {
      if (!sameNonStaffRelationship(existing, relationship)) {
        hasCanonicalConflict = true;
        issues.push("CONFLICTING_NONSTAFF_ASSOCIATION_EVIDENCE");
      }
      continue;
    }

    associationByIdentity.set(identity, relationship);
    relationships.push(relationship);
  }

  relationships.sort(
    (left, right) =>
      Number(right.isCurrent) - Number(left.isCurrent) ||
      left.organizationId.localeCompare(right.organizationId) ||
      left.evidenceKind.localeCompare(right.evidenceKind) ||
      (left.playerId ?? "").localeCompare(right.playerId ?? ""),
  );

  const legacyEvidence = normalizedLegacyEvidence(input.legacyEvidence);
  issues.push(...evaluateLegacyCompatibility(legacyEvidence, relationships));

  const hasCanonicalEvidence = relationships.length > 0;
  const source: SuperAdminRelationshipSource = hasCanonicalEvidence
    ? "CANONICAL"
    : legacyEvidence
      ? "LEGACY_COMPATIBLE"
      : "UNASSIGNED";

  let integrity: SuperAdminIntegrityState;
  if (hasCanonicalConflict) {
    integrity = "CONFLICT";
  } else if (issues.length > 0) {
    integrity = "REVIEW_REQUIRED";
  } else if (hasCanonicalEvidence) {
    integrity = "VERIFIED";
  } else if (legacyEvidence) {
    integrity = "REVIEW_REQUIRED";
  } else {
    integrity = "UNASSIGNED";
  }

  return {
    userId: account.userId,
    name: account.name,
    email: account.email,
    accountRole: account.accountRole,
    accountStatus: account.accountStatus,
    organizations: relationships,
    source,
    integrity,
    legacyEvidence,
    lastKnownAccountActivity: account.lastKnownAccountActivity,
    issues: Array.from(new Set(issues)),
  };
}

export function currentSuperAdminOrganizationRelationships(
  row: SuperAdminUserRelationshipRow,
): SuperAdminOrganizationRelationship[] {
  return row.organizations.filter((relationship) => relationship.isCurrent);
}
