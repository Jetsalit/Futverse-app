import {
  SAFE_ACCOUNT_ROLES,
  assessRequestedIntent,
  genericApprovalBlockReason,
  isSafeAccountRole,
  isTenantMembershipRole,
  type SafeAccountRole,
  type TenantMembershipRole,
} from "./accountRolePolicy";

export type ExplicitAccountRoleSelection = SafeAccountRole | "";
export type UserReviewMode = "APPROVAL_REVIEW" | "READ_ONLY_PROFILE";

export interface RawProfileClaimData {
  id?: string;
  type?: unknown;
  userId?: unknown;
  userEmail?: unknown;
  userName?: unknown;
  requestedRole?: unknown;
  requestedAcademyId?: unknown;
  approvedAcademyId?: unknown;
  inviteCode?: unknown;
  status?: unknown;
  createdAt?: unknown;
  approvedRole?: unknown;
  [key: string]: unknown;
}

export type StaffClaimView =
  | { state: "NO_CLAIM" }
  | {
      state: "PENDING";
      claimId: string;
      academyId: string;
      role: "ADMIN" | "COACH";
    }
  | {
      state: "APPROVED";
      claimId: string;
      academyId: string;
      role: "ADMIN" | "COACH";
    }
  | {
      state: "REJECTED";
      claimId: string;
      academyId?: string;
      role: "ADMIN" | "COACH";
    }
  | {
      state: "AMBIGUOUS";
      claims: Array<{
        claimId: string;
        academyId?: string;
        role?: string;
        status?: string;
      }>;
    };

export function isExactDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function mapCanonicalClaimSnapshot(
  docId: string,
  data: Record<string, unknown> | undefined,
): RawProfileClaimData {
  return {
    ...(data || {}),
    id: docId,
  };
}

export function formatFirestoreDate(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  // Firestore Timestamp-like (has toDate method)
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      const date = (value as { toDate: () => unknown }).toDate();
      if (date instanceof Date && !isNaN(date.getTime())) {
        return date.toLocaleDateString();
      }
      return "-";
    } catch {
      return "-";
    }
  }

  // Date instance
  if (value instanceof Date) {
    return !isNaN(value.getTime()) ? value.toLocaleDateString() : "-";
  }

  // Number timestamp (e.g. milliseconds)
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return !isNaN(date.getTime()) ? date.toLocaleDateString() : "-";
  }

  // ISO string or date string
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "-";
    const date = new Date(trimmed);
    return !isNaN(date.getTime()) ? date.toLocaleDateString() : "-";
  }

  return "-";
}

export function isClaimCandidateForUser(
  claim: RawProfileClaimData,
  user: { id?: string; uid?: string; requestedRole?: unknown },
): boolean {
  const targetUid = user.id || user.uid;
  if (!isExactDocumentId(targetUid)) return false;
  if (!isExactDocumentId(claim.id)) return false;

  // Canonical userId match ONLY — never match by email
  if (claim.userId !== targetUid) return false;

  const userRequestedRole = user.requestedRole;
  if (isTenantMembershipRole(userRequestedRole)) {
    const claimRequestedRole = typeof claim.requestedRole === "string" ? claim.requestedRole.trim() : undefined;
    const claimApprovedRole = typeof claim.approvedRole === "string" ? claim.approvedRole.trim() : undefined;
    const claimType = typeof claim.type === "string" ? claim.type.trim() : undefined;

    // Filter out unrelated non-tenant claims (e.g. PLAYER, PARENT, SCOUT)
    if (
      (claimRequestedRole && isSafeAccountRole(claimRequestedRole)) ||
      (claimApprovedRole && isSafeAccountRole(claimApprovedRole))
    ) {
      return false;
    }

    // Filter out non-tenant claim types (e.g. PLAYER_CLAIM, FUTID_CLAIM, etc.)
    if (
      claimType &&
      (claimType.includes("PLAYER") ||
        claimType.includes("PARENT") ||
        claimType.includes("SCOUT") ||
        claimType.includes("FUTID"))
    ) {
      return false;
    }

    // If claim is explicitly for COACH_JOIN, only applies when target role is COACH
    if (claimType === "COACH_JOIN") {
      if (userRequestedRole !== "COACH") return false;
      return true;
    }

    // If claim explicitly requested a DIFFERENT valid tenant role, ignore as different tenant role
    if (
      claimRequestedRole &&
      isTenantMembershipRole(claimRequestedRole) &&
      claimRequestedRole !== userRequestedRole
    ) {
      return false;
    }

    // If requestedRole is absent/non-tenant, but approvedRole is explicitly a DIFFERENT valid tenant role, ignore
    if (
      !isTenantMembershipRole(claimRequestedRole) &&
      claimApprovedRole &&
      isTenantMembershipRole(claimApprovedRole) &&
      claimApprovedRole !== userRequestedRole
    ) {
      return false;
    }

    // ACADEMY_JOIN type is relevant for the target tenant role
    if (claimType === "ACADEMY_JOIN") {
      return true;
    }

    // Legacy undefined type: relevant if role matches or if it's an academy join attempt
    if (claimType === undefined) {
      if (claimRequestedRole === userRequestedRole || claimApprovedRole === userRequestedRole) {
        return true;
      }
      if (claim.requestedAcademyId || claim.approvedAcademyId || claim.academyId) {
        return true;
      }
      return false;
    }

    // Other/malformed types remain candidate to fail closed in resolveStaffClaimView
    return true;
  }

  return true;
}

export function isClaimMatchingUser(
  claim: RawProfileClaimData,
  user: { id?: string; uid?: string; requestedRole?: unknown },
): boolean {
  return isClaimCandidateForUser(claim, user);
}

export function resolveStaffClaimView(
  claims: readonly RawProfileClaimData[],
  user: { id?: string; uid?: string; requestedRole?: unknown },
): StaffClaimView {
  const candidates = claims.filter((claim) => isClaimCandidateForUser(claim, user));

  if (candidates.length === 0) {
    return { state: "NO_CLAIM" };
  }

  const toAmbiguous = (): StaffClaimView => ({
    state: "AMBIGUOUS",
    claims: candidates.map((c) => ({
      claimId: isExactDocumentId(c.id) ? c.id : "UNKNOWN",
      academyId: (isExactDocumentId(c.approvedAcademyId)
        ? c.approvedAcademyId
        : isExactDocumentId(c.requestedAcademyId)
          ? c.requestedAcademyId
          : isExactDocumentId(c.academyId)
            ? c.academyId
            : undefined) as string | undefined,
      role: (typeof c.approvedRole === "string"
        ? c.approvedRole
        : typeof c.requestedRole === "string"
          ? c.requestedRole
          : c.type === "COACH_JOIN"
            ? "COACH"
            : undefined) as string | undefined,
      status: typeof c.status === "string" ? c.status : "UNKNOWN",
    })),
  });

  if (candidates.length > 1) {
    return toAmbiguous();
  }

  const single = candidates[0];
  const claimId = single.id!;

  // 1. Type validation (Supported: ACADEMY_JOIN, COACH_JOIN, or undefined)
  if (
    single.type !== undefined &&
    single.type !== "ACADEMY_JOIN" &&
    single.type !== "COACH_JOIN"
  ) {
    return toAmbiguous();
  }

  // 2. Status validation (Status MUST be explicitly PENDING | APPROVED | REJECTED)
  const status = single.status;
  if (status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED") {
    return toAmbiguous();
  }

  const userRequestedRole = user.requestedRole;

  // 3. Status === "PENDING"
  if (status === "PENDING") {
    const rawAcademyId = single.requestedAcademyId ?? single.academyId;
    if (!isExactDocumentId(rawAcademyId)) {
      return toAmbiguous();
    }
    const rawRole =
      single.requestedRole ||
      (single.type === "COACH_JOIN" ? "COACH" : undefined) ||
      single.approvedRole;

    if (rawRole !== "ADMIN" && rawRole !== "COACH") {
      return toAmbiguous();
    }
    if (isTenantMembershipRole(userRequestedRole) && rawRole !== userRequestedRole) {
      return toAmbiguous();
    }

    return {
      state: "PENDING",
      claimId,
      academyId: rawAcademyId,
      role: rawRole as "ADMIN" | "COACH",
    };
  }

  // 4. Status === "APPROVED" (Authoritative approval fields required)
  if (status === "APPROVED") {
    // 4.1 approvedAcademyId MUST exist and be an exact Firestore document ID (no fallback to requestedAcademyId)
    if (!isExactDocumentId(single.approvedAcademyId)) {
      return toAmbiguous();
    }
    const approvedAcademyId = single.approvedAcademyId;

    // 4.2 approvedRole MUST exist and equal ADMIN or COACH (no fallback to requestedRole)
    if (single.approvedRole !== "ADMIN" && single.approvedRole !== "COACH") {
      return toAmbiguous();
    }
    const approvedRole = single.approvedRole;

    // 4.3 approvedRole MUST match user's requested tenant role
    if (isTenantMembershipRole(userRequestedRole) && approvedRole !== userRequestedRole) {
      return toAmbiguous();
    }

    // 4.4 If requestedRole exists, it must be consistent with approvedRole
    if (single.requestedRole !== undefined && single.requestedRole !== approvedRole) {
      return toAmbiguous();
    }

    // 4.5 If requestedAcademyId exists, it must be an exact ID and equal approvedAcademyId
    if (single.requestedAcademyId !== undefined) {
      if (!isExactDocumentId(single.requestedAcademyId) || single.requestedAcademyId !== approvedAcademyId) {
        return toAmbiguous();
      }
    }

    return {
      state: "APPROVED",
      claimId,
      academyId: approvedAcademyId,
      role: approvedRole,
    };
  }

  // 5. Status === "REJECTED"
  if (status === "REJECTED") {
    const rawRole =
      single.approvedRole ||
      single.requestedRole ||
      (single.type === "COACH_JOIN" ? "COACH" : undefined);

    if (rawRole !== "ADMIN" && rawRole !== "COACH") {
      return toAmbiguous();
    }

    const rawAcademyId =
      single.requestedAcademyId ?? single.approvedAcademyId ?? single.academyId;

    return {
      state: "REJECTED",
      claimId,
      academyId: isExactDocumentId(rawAcademyId) ? rawAcademyId : undefined,
      role: rawRole as "ADMIN" | "COACH",
    };
  }

  return toAmbiguous();
}

export function getApprovalActionLabel(
  approvedRole: ExplicitAccountRoleSelection,
): string {
  if (approvedRole === "") {
    return "Select approved role";
  }
  return `Approve as ${approvedRole}`;
}

export function canExecuteAccountApproval(
  approvedRole: unknown,
): approvedRole is SafeAccountRole {
  return isSafeAccountRole(approvedRole);
}

export interface UserApprovalBadge {
  label: string;
  kind: "SAFE_ACCOUNT" | "TENANT_STAFF" | "BLOCKED";
}

export function getUserApprovalBadge(requestedRole: unknown): UserApprovalBadge {
  const assessment = assessRequestedIntent(requestedRole);
  if (assessment.kind === "SAFE_ACCOUNT_INTENT") {
    return {
      label: `${assessment.intent} — Account Approval`,
      kind: "SAFE_ACCOUNT",
    };
  }
  if (assessment.kind === "TENANT_MEMBERSHIP_INTENT") {
    return {
      label: `${assessment.intent} — Academy Membership`,
      kind: "TENANT_STAFF",
    };
  }
  return {
    label: "Blocked Intent",
    kind: "BLOCKED",
  };
}

export function isBulkApprovalEligibleSet(
  targets: readonly { requestedRole?: unknown }[],
): boolean {
  if (targets.length === 0) return false;
  for (const t of targets) {
    if (genericApprovalBlockReason(t.requestedRole) !== null) {
      return false;
    }
  }
  return true;
}

export type NormalizedManagedStatus = "ACTIVE" | "PENDING" | "REJECTED" | "INACTIVE" | "";

export function normalizeManagedAccountStatus(status: unknown): NormalizedManagedStatus {
  if (typeof status !== "string") return "";
  const upper = status.trim().toUpperCase();
  if (upper === "ACTIVE") return "ACTIVE";
  if (upper === "PENDING") return "PENDING";
  if (upper === "REJECTED") return "REJECTED";
  if (upper === "INACTIVE" || upper === "SUSPENDED") return "INACTIVE";
  return "";
}

export function isPendingAccountStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  const upper = status.trim().toUpperCase();
  return upper === "PENDING" || upper === "INACTIVE";
}

export function getManagedAccountStatusDisplay(status: unknown): string {
  if (typeof status !== "string") {
    return "UNKNOWN";
  }
  const trimmed = status.trim();
  if (trimmed.length === 0) {
    return "MISSING";
  }
  const upper = trimmed.toUpperCase();
  if (upper === "ACTIVE") return "ACTIVE";
  if (upper === "PENDING") return "PENDING";
  if (upper === "REJECTED") return "REJECTED";
  if (upper === "INACTIVE" || upper === "SUSPENDED") return "INACTIVE";
  return upper;
}

export function canReviewModeApprove(
  mode: UserReviewMode,
  userStatus: unknown,
  requestedRole: unknown,
): boolean {
  if (mode !== "APPROVAL_REVIEW") return false;
  if (!isPendingAccountStatus(userStatus)) return false;
  const intent = assessRequestedIntent(requestedRole);
  return intent.kind === "SAFE_ACCOUNT_INTENT";
}

export function canReviewModeReject(
  mode: UserReviewMode,
  userStatus: unknown,
  requestedRole: unknown,
  currentRole: unknown,
): boolean {
  if (mode !== "APPROVAL_REVIEW") return false;
  if (!isPendingAccountStatus(userStatus)) return false;
  if (currentRole === "SUPERADMIN" || currentRole === "DATA_ADMIN") return false;
  const intent = assessRequestedIntent(requestedRole);
  return intent.kind !== "TENANT_MEMBERSHIP_INTENT";
}

export function resolveClaimDisplayAcademy(claim: {
  status?: string;
  approvedAcademyId?: string;
  requestedAcademyId?: string;
  academyId?: string;
}): { academyId: string; label?: string } {
  const status = typeof claim.status === "string" ? claim.status.trim().toUpperCase() : "";

  if (status === "APPROVED") {
    if (claim.approvedAcademyId) return { academyId: claim.approvedAcademyId, label: "Approved" };
    if (claim.requestedAcademyId) return { academyId: claim.requestedAcademyId, label: "Requested" };
    if (claim.academyId) return { academyId: claim.academyId, label: "Legacy" };
    return { academyId: "-" };
  }

  if (status === "PENDING") {
    if (claim.requestedAcademyId) return { academyId: claim.requestedAcademyId, label: "Requested" };
    if (claim.approvedAcademyId) return { academyId: claim.approvedAcademyId, label: "Approved" };
    if (claim.academyId) return { academyId: claim.academyId, label: "Legacy" };
    return { academyId: "-" };
  }

  if (status === "REJECTED") {
    if (claim.requestedAcademyId) return { academyId: claim.requestedAcademyId, label: "Requested" };
    if (claim.approvedAcademyId) return { academyId: claim.approvedAcademyId, label: "Approved" };
    if (claim.academyId) return { academyId: claim.academyId, label: "Legacy" };
    return { academyId: "-" };
  }

  const id = claim.approvedAcademyId || claim.requestedAcademyId || claim.academyId || "-";
  return { academyId: id };
}
