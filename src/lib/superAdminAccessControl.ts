import { isExactDocumentId } from "./superAdminSupportModel";
import { isExplicitlyActiveAccountStatus } from "./accountRolePolicy";
import { isProClubStaffRole } from "./proClubModel";
import { isValidFitnessCoachSpecialtyRecord } from "./academyFitnessCoachAssignment";
import type {
  MembershipSource,
  MembershipStatus,
  TenantRole,
} from "../types/Membership";
import type { ProClubStaffRole } from "../types/ProClub";

export interface AccessAccountRecord {
  id: string;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  [key: string]: unknown;
}

export type AccountEmailResolution =
  | { state: "FOUND"; user: AccessAccountRecord }
  | { state: "NOT_FOUND" }
  | { state: "AMBIGUOUS" }
  | { state: "INELIGIBLE"; reason: "INVALID_ACCOUNT_ID" | "INVALID_ACCOUNT_ROLE" | "INACTIVE_ACCOUNT" | "SUPERADMIN_TARGET" };

export type ProClubAccessAction =
  | "ACCESS_ASSIGNED"
  | "STAFF_ROLE_ASSIGNED"
  | "STAFF_ROLE_CHANGED"
  | "ACCESS_REACTIVATED";

export type AcademyAccessAction =
  | "ACADEMY_MEMBERSHIP_ASSIGNED"
  | "ACADEMY_ROLE_CHANGED"
  | "ACCESS_REACTIVATED"
  | "ACADEMY_SPECIALTY_ASSIGNED"
  | "ACADEMY_SPECIALTY_REACTIVATED";

export interface AccessStateDecision<Action extends string> {
  state:
    | "ASSIGN"
    | "ASSIGN_STAFF_ROLE"
    | "CHANGE_ROLE"
    | "REACTIVATE"
    | "SPECIALTY_CHANGE"
    | "ALREADY_ACTIVE"
    | "MANUAL_REVIEW";
  actionType: Action | null;
  requiresConfirmation: boolean;
  reason?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function normalizeAccessEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    /\s/.test(normalized) ||
    normalized.indexOf("@") <= 0 ||
    normalized.indexOf("@") !== normalized.lastIndexOf("@") ||
    normalized.endsWith("@")
  ) {
    return null;
  }
  return normalized;
}

export function resolveAccountByExactEmail(
  users: readonly unknown[],
  email: unknown,
): AccountEmailResolution {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return { state: "NOT_FOUND" };

  const matches = users
    .map(asRecord)
    .filter((user): user is Record<string, unknown> =>
      user !== null && normalizeAccessEmail(user.email) === normalizedEmail,
    );

  if (matches.length === 0) return { state: "NOT_FOUND" };
  if (matches.length !== 1) return { state: "AMBIGUOUS" };

  const candidate = matches[0];
  if (typeof candidate.id !== "string") {
    return { state: "INELIGIBLE", reason: "INVALID_ACCOUNT_ID" };
  }
  const user = candidate as AccessAccountRecord;
  if (!isExactDocumentId(user.id)) {
    return { state: "INELIGIBLE", reason: "INVALID_ACCOUNT_ID" };
  }
  if (typeof user.role !== "string" || !user.role.trim()) {
    return { state: "INELIGIBLE", reason: "INVALID_ACCOUNT_ROLE" };
  }
  if (user.role === "SUPERADMIN") {
    return { state: "INELIGIBLE", reason: "SUPERADMIN_TARGET" };
  }
  if (!isExplicitlyActiveAccountStatus(user.status)) {
    return { state: "INELIGIBLE", reason: "INACTIVE_ACCOUNT" };
  }
  return { state: "FOUND", user };
}

function proClubMembership(value: unknown): { authorizationRole: string; status: string } | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const candidate = asRecord(value);
  if (!candidate || !exactKeys(candidate, ["authorizationRole", "status"])) return "INVALID";
  if (
    !["OWNER", "ADMIN", "MEMBER"].includes(String(candidate.authorizationRole)) ||
    !["ACTIVE", "INACTIVE", "LEFT", "REVOKED"].includes(String(candidate.status))
  ) {
    return "INVALID";
  }
  return {
    authorizationRole: candidate.authorizationRole as string,
    status: candidate.status as string,
  };
}

function proClubStaff(value: unknown): { staffRole: ProClubStaffRole; status: string } | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const candidate = asRecord(value);
  if (!candidate || !exactKeys(candidate, ["staffRole", "status"])) return "INVALID";
  if (
    !isProClubStaffRole(candidate.staffRole) ||
    !["ACTIVE", "INACTIVE", "LEFT"].includes(String(candidate.status))
  ) {
    return "INVALID";
  }
  return {
    staffRole: candidate.staffRole,
    status: candidate.status as string,
  };
}

function proClubDecision(
  state: AccessStateDecision<ProClubAccessAction>["state"],
  actionType: ProClubAccessAction | null,
  requiresConfirmation: boolean,
  reason?: string,
): AccessStateDecision<ProClubAccessAction> {
  return { state, actionType, requiresConfirmation, ...(reason ? { reason } : {}) };
}

export function resolveProClubAccessState(
  membershipValue: unknown,
  staffValue: unknown,
  desiredStaffRole: unknown,
): AccessStateDecision<ProClubAccessAction> {
  if (!isProClubStaffRole(desiredStaffRole)) {
    return proClubDecision("MANUAL_REVIEW", null, false, "Choose a canonical Pro Club staff role.");
  }

  const membership = proClubMembership(membershipValue);
  const staff = proClubStaff(staffValue);
  if (membership === "INVALID" || staff === "INVALID") {
    return proClubDecision("MANUAL_REVIEW", null, false, "The current Pro Club access record is malformed.");
  }
  if (membership === null && staff === null) {
    return proClubDecision("ASSIGN", "ACCESS_ASSIGNED", true);
  }
  if (membership === null || membership.authorizationRole !== "MEMBER") {
    return proClubDecision("MANUAL_REVIEW", null, false, "Only a canonical MEMBER relationship can use direct staff assignment.");
  }
  if (membership.status === "LEFT" || membership.status === "REVOKED") {
    return proClubDecision("MANUAL_REVIEW", null, false, "LEFT and REVOKED Pro Club access requires manual review.");
  }
  if (staff === null && membership.status === "ACTIVE") {
    return proClubDecision("ASSIGN_STAFF_ROLE", "STAFF_ROLE_ASSIGNED", true);
  }
  if (staff === null && membership.status === "INACTIVE") {
    return proClubDecision("REACTIVATE", "ACCESS_REACTIVATED", true);
  }
  if (staff === null) {
    return proClubDecision("MANUAL_REVIEW", null, false, "The Pro Club membership state is not supported.");
  }
  if (staff.status === "LEFT") {
    return proClubDecision("MANUAL_REVIEW", null, false, "LEFT staff assignments require manual review.");
  }
  if (membership.status === "INACTIVE" && staff.status === "ACTIVE") {
    return proClubDecision("MANUAL_REVIEW", null, false, "Active staff authority conflicts with an inactive membership.");
  }
  if (membership.status === "ACTIVE" && staff.status === "INACTIVE") {
    return proClubDecision("REACTIVATE", "ACCESS_REACTIVATED", true);
  }
  if (membership.status === "INACTIVE" && staff.status === "INACTIVE") {
    return proClubDecision("REACTIVATE", "ACCESS_REACTIVATED", true);
  }
  if (membership.status !== "ACTIVE" || staff.status !== "ACTIVE") {
    return proClubDecision("MANUAL_REVIEW", null, false, "The Pro Club access state is not supported.");
  }
  if (staff.staffRole === desiredStaffRole) {
    return proClubDecision("ALREADY_ACTIVE", null, false);
  }
  return proClubDecision("CHANGE_ROLE", "STAFF_ROLE_CHANGED", true);
}

type CanonicalAcademyMembership = {
  userId: string;
  academyId: string;
  role: TenantRole;
  status: MembershipStatus;
  source: MembershipSource;
};

const MEMBERSHIP_REQUIRED_KEYS = [
  "userId",
  "academyId",
  "role",
  "status",
  "source",
  "joinedAt",
  "joinedBy",
  "updatedAt",
] as const;

const MEMBERSHIP_ALLOWED_KEYS = new Set([
  ...MEMBERSHIP_REQUIRED_KEYS,
  "approvalClaimId",
]);

function validMembershipDate(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (value instanceof Date) return Number.isFinite(value.getTime());
  const candidate = asRecord(value);
  return candidate !== null && typeof candidate.toDate === "function";
}

function canonicalAcademyMembership(value: unknown): CanonicalAcademyMembership | null {
  const candidate = asRecord(value);
  if (!candidate) return null;
  const keys = Object.keys(candidate);
  if (
    !MEMBERSHIP_REQUIRED_KEYS.every((key) => Object.hasOwn(candidate, key)) ||
    keys.some((key) => !MEMBERSHIP_ALLOWED_KEYS.has(key)) ||
    !isExactDocumentId(candidate.userId) ||
    !isExactDocumentId(candidate.academyId) ||
    !isExactDocumentId(candidate.joinedBy) ||
    (candidate.role !== "ADMIN" && candidate.role !== "COACH") ||
    !["PENDING", "ACTIVE", "SUSPENDED", "LEFT", "REVOKED"].includes(String(candidate.status)) ||
    !["CLAIM_APPROVAL", "SUPERADMIN_ASSIGNMENT", "LEGACY_MIGRATION", "INVITE"].includes(String(candidate.source)) ||
    !validMembershipDate(candidate.joinedAt) ||
    !validMembershipDate(candidate.updatedAt)
  ) {
    return null;
  }
  const hasClaimId = Object.hasOwn(candidate, "approvalClaimId");
  if (candidate.source === "CLAIM_APPROVAL") {
    if (!isExactDocumentId(candidate.approvalClaimId)) return null;
  } else if (hasClaimId) {
    return null;
  }
  return {
    userId: candidate.userId,
    academyId: candidate.academyId,
    role: candidate.role,
    status: candidate.status as MembershipStatus,
    source: candidate.source as MembershipSource,
  };
}

function academyDecision(
  state: AccessStateDecision<AcademyAccessAction>["state"],
  actionType: AcademyAccessAction | null,
  requiresConfirmation: boolean,
  reason?: string,
): AccessStateDecision<AcademyAccessAction> {
  return { state, actionType, requiresConfirmation, ...(reason ? { reason } : {}) };
}

export function resolveAcademyAccessState(
  membershipValue: unknown,
  specialtyValue: unknown,
  desiredRole: unknown,
  desiredFitnessCoach: boolean,
): AccessStateDecision<AcademyAccessAction> {
  if (desiredRole !== "ADMIN" && desiredRole !== "COACH") {
    return academyDecision("MANUAL_REVIEW", null, false, "Choose the canonical Academy ADMIN or COACH role.");
  }
  if (typeof desiredFitnessCoach !== "boolean") {
    return academyDecision("MANUAL_REVIEW", null, false, "The Fitness Coach selection is invalid.");
  }

  const membershipMissing = membershipValue === null || membershipValue === undefined;
  const specialtyMissing = specialtyValue === null || specialtyValue === undefined;
  const membership = membershipMissing ? null : canonicalAcademyMembership(membershipValue);
  if (!membershipMissing && !membership) {
    return academyDecision("MANUAL_REVIEW", null, false, "The current Academy membership is malformed.");
  }
  const specialty = specialtyMissing
    ? null
    : isValidFitnessCoachSpecialtyRecord(specialtyValue)
      ? specialtyValue
      : "INVALID";
  if (specialty === "INVALID") {
    return academyDecision("MANUAL_REVIEW", null, false, "The current Academy specialty record is malformed.");
  }
  if (!membership && specialty) {
    return academyDecision("MANUAL_REVIEW", null, false, "An Academy specialty exists without its canonical membership.");
  }
  if (desiredFitnessCoach && desiredRole !== "COACH") {
    return academyDecision("MANUAL_REVIEW", null, false, "FITNESS_COACH requires an Academy COACH membership.");
  }
  if (!membership) {
    return academyDecision("ASSIGN", "ACADEMY_MEMBERSHIP_ASSIGNED", true);
  }
  if (membership.status === "LEFT" || membership.status === "REVOKED" || membership.status === "PENDING") {
    return academyDecision("MANUAL_REVIEW", null, false, `${membership.status} Academy membership requires manual review.`);
  }
  if (membership.status === "SUSPENDED") {
    if (membership.role !== desiredRole) {
      return academyDecision("MANUAL_REVIEW", null, false, "Reactivate the suspended membership before changing its Academy role.");
    }
    if (desiredFitnessCoach && specialty?.status === "LEFT") {
      return academyDecision("MANUAL_REVIEW", null, false, "LEFT Fitness Coach specialties cannot be reactivated.");
    }
    return academyDecision("REACTIVATE", "ACCESS_REACTIVATED", true);
  }
  if (membership.status !== "ACTIVE") {
    return academyDecision("MANUAL_REVIEW", null, false, "The Academy membership state is not supported.");
  }
  if (desiredFitnessCoach && desiredRole === "COACH" && specialty?.status === "LEFT") {
    return academyDecision("MANUAL_REVIEW", null, false, "LEFT Fitness Coach specialties cannot be reactivated.");
  }
  if (membership.role !== desiredRole) {
    if (desiredRole === "ADMIN" && specialty?.status === "ACTIVE") {
      return academyDecision("MANUAL_REVIEW", null, false, "Deactivate the active Fitness Coach specialty before changing this membership to ADMIN.");
    }
    return academyDecision("CHANGE_ROLE", "ACADEMY_ROLE_CHANGED", true);
  }
  if (desiredFitnessCoach) {
    if (specialty?.status === "LEFT") {
      return academyDecision("MANUAL_REVIEW", null, false, "LEFT Fitness Coach specialties cannot be reactivated.");
    }
    if (specialty?.status === "ACTIVE") {
      return academyDecision("ALREADY_ACTIVE", null, false);
    }
    return academyDecision(
      "SPECIALTY_CHANGE",
      specialty?.status === "INACTIVE"
        ? "ACADEMY_SPECIALTY_REACTIVATED"
        : "ACADEMY_SPECIALTY_ASSIGNED",
      true,
    );
  }
  return academyDecision("ALREADY_ACTIVE", null, false);
}
