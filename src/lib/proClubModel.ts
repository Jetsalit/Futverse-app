import type {
  ProClubLevel,
  ProClubStaffAssignment,
  ProClubStaffRole,
  ProClubStaffStatus,
} from "../types/ProClub";

export function isValidDocumentIdentifier(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value) return false;
  if (value.trim() !== value) return false;
  if (value.includes("/")) return false;
  return true;
}

export function isProClubLevel(value: unknown): value is ProClubLevel {
  return value === "T1" || value === "T2" || value === "T3";
}

export function isProClubStaffRole(value: unknown): value is ProClubStaffRole {
  return (
    value === "HEAD_COACH" ||
    value === "ASSISTANT_COACH" ||
    value === "FITNESS_COACH" ||
    value === "ANALYST" ||
    value === "PHYSIO" ||
    value === "TEAM_MANAGER" ||
    value === "STAFF"
  );
}

export function isProClubStaffStatus(
  value: unknown,
): value is ProClubStaffStatus {
  return value === "ACTIVE" || value === "INACTIVE" || value === "LEFT";
}

export interface ValidateProClubStaffAssignmentOptions {
  expectedUserId?: string;
  expectedClubId?: string;
}

export function validateProClubStaffAssignment(
  assignment: unknown,
  options?: ValidateProClubStaffAssignmentOptions,
): assignment is ProClubStaffAssignment {
  if (!assignment || typeof assignment !== "object") return false;

  const candidate = assignment as Record<string, unknown>;

  if (!isValidDocumentIdentifier(candidate.userId)) return false;
  if (!isValidDocumentIdentifier(candidate.clubId)) return false;
  if (!isProClubStaffRole(candidate.staffRole)) return false;
  if (!isProClubStaffStatus(candidate.status)) return false;

  if (
    options?.expectedUserId !== undefined &&
    candidate.userId !== options.expectedUserId
  ) {
    return false;
  }

  if (
    options?.expectedClubId !== undefined &&
    candidate.clubId !== options.expectedClubId
  ) {
    return false;
  }

  return true;
}

export function isActiveProClubStaffAssignment(
  assignment: unknown,
  options?: ValidateProClubStaffAssignmentOptions,
): boolean {
  if (!validateProClubStaffAssignment(assignment, options)) return false;
  return assignment.status === "ACTIVE";
}
