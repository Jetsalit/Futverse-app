import type { UserRole } from "./AuthContext";
import type { Membership } from "../types/Membership";

export type StaffMembershipState =
  | "ACTIVE"
  | "MISSING"
  | "PENDING"
  | "SUSPENDED"
  | "LEFT"
  | "REVOKED"
  | "ERROR";

export interface AccessRoleInput {
  role: UserRole;
  requestedRole?: UserRole;
  email?: string;
}

export function isStaffTenantRole(role: UserRole): role is "ADMIN" | "COACH" {
  return role === "ADMIN" || role === "COACH";
}

export function requiresStaffMembership(user: AccessRoleInput): boolean {
  return isStaffTenantRole(user.role);
}

export function isStaffOnboardingRequest(user: AccessRoleInput): boolean {
  return user.role === "USER"
    && (user.requestedRole === "ADMIN" || user.requestedRole === "COACH");
}

export function classifyStaffMembership(
  uid: string,
  academyId: string,
  expectedRole: "ADMIN" | "COACH",
  membership: Membership | null,
): StaffMembershipState {
  if (!membership) return "MISSING";
  if (membership.userId !== uid || membership.academyId !== academyId) return "ERROR";
  if (membership.role !== "ADMIN" && membership.role !== "COACH") return "ERROR";
  if (membership.role !== expectedRole) return "ERROR";

  switch (membership.status) {
    case "ACTIVE":
      return "ACTIVE";
    case "PENDING":
      return "PENDING";
    case "SUSPENDED":
      return "SUSPENDED";
    case "LEFT":
      return "LEFT";
    case "REVOKED":
      return "REVOKED";
    default:
      return "ERROR";
  }
}
