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
    // Extract role from claim
    const claimRole =
      claim.approvedRole ||
      claim.requestedRole ||
      (claim.type === "COACH_JOIN" ? "COACH" : undefined);

    // If claim explicitly defines a DIFFERENT valid tenant role, it's not for this intent
    if (
      isTenantMembershipRole(claimRole) &&
      claimRole !== userRequestedRole
    ) {
      return false;
    }
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

  // 1. Type validation (Hardening 6)
  // Supported: ACADEMY_JOIN, COACH_JOIN, or undefined (legacy)
  if (
    single.type !== undefined &&
    single.type !== "ACADEMY_JOIN" &&
    single.type !== "COACH_JOIN"
  ) {
    return toAmbiguous();
  }

  // 2. Role validation
  const rawRole =
    single.approvedRole ||
    single.requestedRole ||
    (single.type === "COACH_JOIN" ? "COACH" : undefined);

  if (rawRole !== "ADMIN" && rawRole !== "COACH") {
    return toAmbiguous();
  }
  const role: "ADMIN" | "COACH" = rawRole;

  // 3. Status validation (Hardening 5)
  // Status MUST be explicitly "PENDING" | "APPROVED" | "REJECTED"
  const status = single.status;
  if (status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED") {
    return toAmbiguous();
  }

  // 4. Status-specific Academy ID validation (Hardening 4)
  if (status === "PENDING") {
    const rawAcademyId = single.requestedAcademyId ?? single.academyId;
    if (!isExactDocumentId(rawAcademyId)) {
      return toAmbiguous();
    }
    return {
      state: "PENDING",
      claimId,
      academyId: rawAcademyId,
      role,
    };
  }

  if (status === "APPROVED") {
    const rawAcademyId = single.approvedAcademyId ?? single.requestedAcademyId ?? single.academyId;
    if (!isExactDocumentId(rawAcademyId)) {
      return toAmbiguous();
    }
    return {
      state: "APPROVED",
      claimId,
      academyId: rawAcademyId,
      role,
    };
  }

  if (status === "REJECTED") {
    const rawAcademyId = single.approvedAcademyId ?? single.requestedAcademyId ?? single.academyId;
    return {
      state: "REJECTED",
      claimId,
      academyId: isExactDocumentId(rawAcademyId) ? rawAcademyId : undefined,
      role,
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
