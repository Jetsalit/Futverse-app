import type {
  ProClubAuthorizationRole,
  ProClubMembershipStatus,
  ProClubStaffRole,
  ProClubStaffStatus,
} from "../types/ProClub";
import {
  isProClubAuthorizationRole,
  isProClubMembershipStatus,
  isProClubStaffRole,
  isProClubStaffStatus,
  isValidDocumentIdentifier,
} from "./proClubModel";

const ROSTER_ENTRY_FIELDS = new Set([
  "schemaVersion",
  "clubId",
  "userId",
  "displayName",
  "authorizationRole",
  "membershipStatus",
  "staffRole",
  "staffStatus",
]);

export interface ProClubStaffRosterEntryV1 {
  schemaVersion: 1;
  clubId: string;
  userId: string;
  displayName: string | null;
  authorizationRole: ProClubAuthorizationRole;
  membershipStatus: ProClubMembershipStatus;
  staffRole: ProClubStaffRole;
  staffStatus: ProClubStaffStatus;
}

export interface ProClubStaffRosterEntryContext {
  clubId: string;
  documentClubId: string;
  userId: string;
  documentId: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isRosterDisplayName(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= 120 &&
      value.trim() === value)
  );
}

function hasExactContext(context: ProClubStaffRosterEntryContext): boolean {
  return (
    isValidDocumentIdentifier(context.clubId) &&
    isValidDocumentIdentifier(context.documentClubId) &&
    context.documentClubId === context.clubId &&
    isValidDocumentIdentifier(context.userId) &&
    isValidDocumentIdentifier(context.documentId) &&
    context.documentId === context.userId
  );
}

export function validateProClubStaffRosterEntryV1(
  value: unknown,
  context: ProClubStaffRosterEntryContext,
): value is ProClubStaffRosterEntryV1 {
  if (!hasExactContext(context)) return false;
  const candidate = asRecord(value);
  if (!candidate) return false;
  if (!Object.keys(candidate).every((field) => ROSTER_ENTRY_FIELDS.has(field))) {
    return false;
  }
  if (Object.keys(candidate).length !== ROSTER_ENTRY_FIELDS.size) return false;

  return (
    candidate.schemaVersion === 1 &&
    candidate.clubId === context.clubId &&
    candidate.userId === context.userId &&
    isRosterDisplayName(candidate.displayName) &&
    isProClubAuthorizationRole(candidate.authorizationRole) &&
    isProClubMembershipStatus(candidate.membershipStatus) &&
    isProClubStaffRole(candidate.staffRole) &&
    isProClubStaffStatus(candidate.staffStatus)
  );
}

/**
 * V1 reviewer roster is deliberately active-only. Historical/terminal state
 * remains in canonical membership/staff sources and must not be deleted.
 */
export function isReviewerVisibleProClubStaffRosterEntryV1(
  value: unknown,
  context: ProClubStaffRosterEntryContext,
): value is ProClubStaffRosterEntryV1 {
  return (
    validateProClubStaffRosterEntryV1(value, context) &&
    value.membershipStatus === "ACTIVE" &&
    value.staffStatus === "ACTIVE"
  );
}
