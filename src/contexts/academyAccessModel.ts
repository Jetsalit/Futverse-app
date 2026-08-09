import type { User, UserRole } from "./AuthContext";

export function isStaffTenantRole(role?: string | null): boolean {
  return role === "ADMIN" || role === "COACH";
}

export function requiresStaffMembership(user?: User | null): boolean {
  if (!user) return false;
  return isStaffTenantRole(user.role);
}

export function isStaffOnboardingRequest(user?: User | null): boolean {
  if (!user) return false;
  if (requiresStaffMembership(user)) return false;
  return isStaffTenantRole(user.requestedRole);
}

export function classifyStaffMembership(status?: string | null): string {
  if (!status) return "MEMBERSHIP_MISSING";
  switch (status.toUpperCase()) {
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

export function appShellLandingPage(
  user: User | null,
  isImpersonating: boolean,
): string {
  if (!user) return "login";
  if (user.role === "SUPERADMIN" && !isImpersonating) {
    return "superadmin";
  }
  return "dashboard";
}

export function appRouteScope(currentPage: string): "global" | "tenant" {
  if (currentPage === "superadmin" || currentPage === "settings") {
    return "global";
  }
  return "tenant";
}

export function normalSuperAdminNeedsAcademyWorkspace(
  user: User | null,
  isImpersonating: boolean,
  academyId: string | null,
  currentPage: string,
): boolean {
  if (!user) return false;
  if (user.role !== "SUPERADMIN" || isImpersonating) return false;
  if (currentPage === "superadmin") return false;
  return !academyId;
}
