import type { User, UserRole } from "./AuthContext";
import type { Membership } from "../types/Membership";
import { isActivePrivilegedActor } from "../lib/privilegedAuthorization";

type MembershipAuthorizationFields = Pick<
  Membership,
  "userId" | "academyId" | "role" | "status"
>;

export type StaffMembershipAccessState =
  | "ACTIVE_MEMBERSHIP"
  | "MEMBERSHIP_MISSING"
  | "MEMBERSHIP_PENDING"
  | "MEMBERSHIP_SUSPENDED"
  | "MEMBERSHIP_LEFT"
  | "MEMBERSHIP_REVOKED"
  | "ERROR";

export type StaffMembershipResolution =
  | { state: "ACTIVE_MEMBERSHIP"; membership: Membership }
  | { state: Exclude<StaffMembershipAccessState, "ACTIVE_MEMBERSHIP"> };

export function isExactDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function hasExactMembershipIdentityAndRole(
  membership: unknown,
  documentId: unknown,
  uid: unknown,
  academyId: unknown,
): membership is MembershipAuthorizationFields {
  if (!membership || typeof membership !== "object") return false;
  if (
    !isExactDocumentId(documentId) ||
    !isExactDocumentId(uid) ||
    !isExactDocumentId(academyId) ||
    documentId !== uid
  ) {
    return false;
  }

  const candidate = membership as Record<string, unknown>;
  return (
    candidate.userId === uid &&
    candidate.academyId === academyId &&
    typeof candidate.status === "string" &&
    (candidate.role === "ADMIN" || candidate.role === "COACH")
  );
}

export function isExactActiveMembership(
  membership: unknown,
  documentId: unknown,
  uid: unknown,
  academyId: unknown,
): membership is MembershipAuthorizationFields {
  return (
    hasExactMembershipIdentityAndRole(membership, documentId, uid, academyId) &&
    membership.status === "ACTIVE"
  );
}

export function isStaffTenantRole(role?: unknown): boolean {
  return role === "ADMIN" || role === "COACH";
}

export function requiresStaffMembership(user?: User | null): boolean {
  if (!user) return false;
  if (user.role === "SUPERADMIN") return false;
  return isStaffTenantRole(user.role);
}

export function isStaffOnboardingRequest(user?: User | null): boolean {
  if (!user) return false;
  if (user.role !== "USER") return false;
  return isStaffTenantRole(user.requestedRole);
}

export function classifyStaffMembership(status?: unknown): string {
  if (!status) return "MEMBERSHIP_MISSING";
  switch (status) {
    case "ACTIVE":
      return "ACTIVE_MEMBERSHIP";
    case "PENDING":
      return "MEMBERSHIP_PENDING";
    case "SUSPENDED":
      return "MEMBERSHIP_SUSPENDED";
    case "LEFT":
      return "MEMBERSHIP_LEFT";
    case "REVOKED":
      return "MEMBERSHIP_REVOKED";
    default:
      return "ERROR";
  }
}

export function resolveExactMembershipSnapshot(
  exists: boolean,
  membership: unknown,
  documentId: unknown,
  uid: unknown,
  academyId: unknown,
): StaffMembershipResolution {
  if (!exists) return { state: "MEMBERSHIP_MISSING" };
  if (
    !hasExactMembershipIdentityAndRole(
      membership,
      documentId,
      uid,
      academyId,
    )
  ) {
    return { state: "ERROR" };
  }

  const state = classifyStaffMembership(
    membership.status,
  ) as StaffMembershipAccessState;
  if (state !== "ACTIVE_MEMBERSHIP") return { state };
  if (!isExactActiveMembership(membership, documentId, uid, academyId)) {
    return { state: "ERROR" };
  }
  return { state, membership: membership as Membership };
}

export function appShellLandingPage(
  user: User | null,
): string {
  if (!user) return "login";
  if (
    user.role === "SUPERADMIN" &&
    isActivePrivilegedActor(user, ["SUPERADMIN"])
  ) {
    return "superadmin";
  }
  return "dashboard";
}

export type AppRouteScope = "GLOBAL" | "TENANT_SCOPED";

export function appRouteScope(currentPage: string): AppRouteScope {
  const normalized = currentPage.startsWith("/")
    ? currentPage.slice(1)
    : currentPage;
  switch (normalized) {
    case "superadmin":
    case "drills":
    case "tactic":
    case "subscription":
    case "concierge":
      return "GLOBAL";
    default:
      return "TENANT_SCOPED";
  }
}

export function normalSuperAdminNeedsAcademyWorkspace(
  user: User | null,
  academyId: string | null,
  currentPage: string,
): boolean {
  if (!user) return false;
  if (user.role !== "SUPERADMIN") return false;
  if (appRouteScope(currentPage) !== "TENANT_SCOPED") return false;
  return !academyId;
}
