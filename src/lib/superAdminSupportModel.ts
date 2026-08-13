import type {
  SuperAdminSupportSession,
  SuperAdminSupportSubject,
} from "../types/SuperAdminSupport";

export function isExactDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function isExactActiveSuperAdmin(actor: unknown): boolean {
  if (!actor || typeof actor !== "object") return false;
  const candidate = actor as Record<string, unknown>;
  const uid = candidate.uid || candidate.id;
  const role = candidate.role;
  const status = candidate.status;
  return (
    isExactDocumentId(uid) &&
    role === "SUPERADMIN" &&
    (status === "ACTIVE" || status === "Active")
  );
}

export function isExactActiveStaffMembership(
  membership: unknown,
  targetUid: unknown,
  academyId: unknown,
  documentId?: unknown,
): boolean {
  if (!membership || typeof membership !== "object") return false;
  if (!isExactDocumentId(targetUid) || !isExactDocumentId(academyId)) return false;

  const docId = documentId !== undefined ? documentId : targetUid;
  if (!isExactDocumentId(docId) || docId !== targetUid) return false;

  const candidate = membership as Record<string, unknown>;
  if (
    candidate.userId !== targetUid ||
    candidate.academyId !== academyId ||
    candidate.status !== "ACTIVE"
  ) {
    return false;
  }

  const role = candidate.role;
  return role === "ADMIN" || role === "COACH";
}

export function isExactActiveStaffMembershipForRole(
  membership: unknown,
  targetUid: unknown,
  academyId: unknown,
  documentId: unknown | undefined,
  expectedTenantRole: string,
): boolean {
  if (expectedTenantRole !== "ADMIN" && expectedTenantRole !== "COACH") {
    return false;
  }
  if (!isExactActiveStaffMembership(membership, targetUid, academyId, documentId)) {
    return false;
  }
  const candidate = membership as Record<string, unknown>;
  return candidate.role === expectedTenantRole;
}

export function canEnterAcademyWorkspace(
  actor: unknown,
  academyId: unknown,
): boolean {
  return isExactActiveSuperAdmin(actor) && isExactDocumentId(academyId);
}

export function canStartStaffWorkMode(
  actor: unknown,
  academyId: unknown,
  targetUid: unknown,
  membership: unknown,
  membershipDocId?: unknown,
): boolean {
  if (!canEnterAcademyWorkspace(actor, academyId)) return false;
  if (!isExactDocumentId(targetUid)) return false;

  const actorCandidate = actor as Record<string, unknown>;
  const actorUid = actorCandidate.uid || actorCandidate.id;
  if (actorUid === targetUid) return false;

  return isExactActiveStaffMembership(
    membership,
    targetUid,
    academyId,
    membershipDocId,
  );
}

export function resolveSupportPresentationRole(
  session: SuperAdminSupportSession | null,
): "SUPERADMIN" | "ADMIN" | "COACH" | "PLAYER" | "PARENT" | "NONE" {
  if (!session) return "SUPERADMIN";
  if (session.mode === "ACADEMY_WORKSPACE") return "SUPERADMIN";
  if (session.mode === "WORK_AS_STAFF") {
    if (session.subject?.tenantRole === "ADMIN") return "ADMIN";
    if (session.subject?.tenantRole === "COACH") return "COACH";
    return "NONE";
  }
  if (session.mode === "SUPPORT_PLAYER") return "PLAYER";
  if (session.mode === "SUPPORT_PARENT") return "PARENT";
  return "SUPERADMIN";
}

export function validateSupportSubject(
  subject: unknown,
): subject is SuperAdminSupportSubject {
  if (!subject || typeof subject !== "object") return false;
  const candidate = subject as Record<string, unknown>;
  if (!isExactDocumentId(candidate.uid)) return false;

  const role = candidate.role;
  if (
    role !== "ADMIN" &&
    role !== "COACH" &&
    role !== "PLAYER" &&
    role !== "PARENT"
  ) {
    return false;
  }

  if (role === "ADMIN" || role === "COACH") {
    if (candidate.tenantRole !== role) return false;
  }

  return true;
}

export function isAuthoritativeSnapshotMetadata(
  metadata: { fromCache?: boolean; hasPendingWrites?: boolean } | null | undefined,
): boolean {
  if (!metadata) return false;
  if (metadata.fromCache === true) return false;
  if (metadata.hasPendingWrites === true) return false;
  return true;
}

export function canAccessTenantCapability(
  effectivePresentationRole: string,
  requiredRoles: string[],
  isSupportActive: boolean,
  hasPermissionFn: (roles: string[]) => boolean,
): boolean {
  if (isSupportActive) {
    if (effectivePresentationRole === "SUPERADMIN") return true;
    return requiredRoles.includes(effectivePresentationRole);
  }
  return hasPermissionFn(requiredRoles);
}

export function canUpdateAcademySettings(
  isSupportActive: boolean,
  presentationRole: string,
  normalMembershipRole?: string | null,
): boolean {
  if (isSupportActive) {
    return presentationRole === "SUPERADMIN" || presentationRole === "ADMIN";
  }
  return (
    normalMembershipRole === "ADMIN" ||
    normalMembershipRole === "COACH" ||
    normalMembershipRole === "SUPERADMIN"
  );
}
