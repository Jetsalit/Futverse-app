import type {
  ProClub,
  ProClubAuthorizationRole,
  ProClubLevel,
  ProClubMembership,
  ProClubMembershipStatus,
  ProClubNameChangeReason,
  ProClubNameHistoryRecord,
  ProClubStaffAssignment,
  ProClubStaffRole,
  ProClubStaffStatus,
  ProClubStatus,
} from "../types/ProClub";

const PRO_CLUB_FIELDS = new Set([
  "name",
  "shortName",
  "level",
  "status",
  "country",
  "logoUrl",
  "createdAt",
  "updatedAt",
]);

const PRO_CLUB_MEMBERSHIP_FIELDS = new Set([
  "authorizationRole",
  "status",
]);

const PRO_CLUB_STAFF_ASSIGNMENT_FIELDS = new Set([
  "staffRole",
  "status",
]);

const PRO_CLUB_NAME_HISTORY_FIELDS = new Set([
  "schemaVersion",
  "clubId",
  "previousName",
  "previousShortName",
  "newName",
  "newShortName",
  "reason",
  "reasonNote",
  "effectiveAt",
  "changedAt",
  "changedBy",
]);

export interface ProClubDocumentContext {
  /** Tenant requested by the caller. */
  clubId: string;
  /** Document ID read from proClubs/{clubId}. */
  documentId: string;
}

export interface ProClubMemberDocumentContext {
  /** Tenant requested by the caller. */
  clubId: string;
  /** Parent Pro Club document ID read from the Firestore path. */
  documentClubId: string;
  /** User requested by the caller. */
  userId: string;
  /** Document ID read from members/{uid} or staff/{uid}. */
  documentId: string;
}

export interface ProClubNameHistoryDocumentContext {
  clubId: string;
  documentClubId: string;
  changeId: string;
  documentId: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOnlyFields(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((field) => allowedFields.has(field));
}

function isOptionalExactString(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "string" && value.length > 0 && value.trim() === value)
  );
}

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

export function isProClubStatus(value: unknown): value is ProClubStatus {
  return value === "ACTIVE" || value === "INACTIVE";
}

export function isProClubNameChangeReason(
  value: unknown,
): value is ProClubNameChangeReason {
  return (
    value === "TAKEOVER" ||
    value === "REBRAND" ||
    value === "LEGAL_NAME_CHANGE" ||
    value === "OTHER"
  );
}

function isCanonicalIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString() === value;
}

function isNullableExactString(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string" && value.length > 0 && value.trim() === value
  );
}

export function isProClubAuthorizationRole(
  value: unknown,
): value is ProClubAuthorizationRole {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

export function isProClubMembershipStatus(
  value: unknown,
): value is ProClubMembershipStatus {
  return (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "LEFT" ||
    value === "REVOKED"
  );
}

export function isTerminalProClubMembershipStatus(
  value: unknown,
): value is "LEFT" | "REVOKED" {
  return value === "LEFT" || value === "REVOKED";
}

export function isProClubStaffRole(value: unknown): value is ProClubStaffRole {
  return (
    value === "TECHNICAL_DIRECTOR" ||
    value === "MANAGER" ||
    value === "HEAD_COACH" ||
    value === "ASSISTANT_COACH" ||
    value === "GK_COACH" ||
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

function hasExactProClubDocumentIdentity(
  context: ProClubDocumentContext,
): boolean {
  if (!context || typeof context !== "object") return false;
  return (
    isValidDocumentIdentifier(context.clubId) &&
    isValidDocumentIdentifier(context.documentId) &&
    context.documentId === context.clubId
  );
}

function hasExactProClubMemberDocumentIdentity(
  context: ProClubMemberDocumentContext,
): boolean {
  if (!context || typeof context !== "object") return false;
  return (
    isValidDocumentIdentifier(context.clubId) &&
    isValidDocumentIdentifier(context.documentClubId) &&
    context.documentClubId === context.clubId &&
    isValidDocumentIdentifier(context.userId) &&
    isValidDocumentIdentifier(context.documentId) &&
    context.documentId === context.userId
  );
}

export function validateProClub(
  club: unknown,
  context: ProClubDocumentContext,
): club is ProClub {
  if (!hasExactProClubDocumentIdentity(context)) return false;
  const candidate = asRecord(club);
  if (!candidate || !hasOnlyFields(candidate, PRO_CLUB_FIELDS)) return false;

  return (
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    candidate.name.trim() === candidate.name &&
    isProClubLevel(candidate.level) &&
    isProClubStatus(candidate.status) &&
    isOptionalExactString(candidate.shortName) &&
    isOptionalExactString(candidate.country) &&
    isOptionalExactString(candidate.logoUrl) &&
    isOptionalExactString(candidate.createdAt) &&
    isOptionalExactString(candidate.updatedAt)
  );
}

export function validateProClubNameHistoryRecord(
  history: unknown,
  context: ProClubNameHistoryDocumentContext,
): history is ProClubNameHistoryRecord {
  if (
    !context ||
    typeof context !== "object" ||
    !isValidDocumentIdentifier(context.clubId) ||
    !isValidDocumentIdentifier(context.documentClubId) ||
    context.clubId !== context.documentClubId ||
    !isValidDocumentIdentifier(context.changeId) ||
    !isValidDocumentIdentifier(context.documentId) ||
    context.changeId !== context.documentId
  ) {
    return false;
  }

  const candidate = asRecord(history);
  if (!candidate || !hasOnlyFields(candidate, PRO_CLUB_NAME_HISTORY_FIELDS)) {
    return false;
  }

  return (
    Object.keys(candidate).length === PRO_CLUB_NAME_HISTORY_FIELDS.size &&
    candidate.schemaVersion === 1 &&
    candidate.clubId === context.clubId &&
    typeof candidate.previousName === "string" &&
    candidate.previousName.length > 0 &&
    candidate.previousName.trim() === candidate.previousName &&
    isNullableExactString(candidate.previousShortName) &&
    typeof candidate.newName === "string" &&
    candidate.newName.length > 0 &&
    candidate.newName.length <= 120 &&
    candidate.newName.trim() === candidate.newName &&
    isNullableExactString(candidate.newShortName) &&
    isProClubNameChangeReason(candidate.reason) &&
    isNullableExactString(candidate.reasonNote) &&
    (candidate.reasonNote === null || candidate.reasonNote.length <= 500) &&
    (candidate.reason === "OTHER"
      ? candidate.reasonNote !== null
      : candidate.reasonNote === null) &&
    isCanonicalIsoUtcTimestamp(candidate.effectiveAt) &&
    isCanonicalIsoUtcTimestamp(candidate.changedAt) &&
    isValidDocumentIdentifier(candidate.changedBy)
  );
}

export function validateProClubMembership(
  membership: unknown,
  context: ProClubMemberDocumentContext,
): membership is ProClubMembership {
  if (!hasExactProClubMemberDocumentIdentity(context)) return false;
  const candidate = asRecord(membership);
  if (
    !candidate ||
    !hasOnlyFields(candidate, PRO_CLUB_MEMBERSHIP_FIELDS)
  ) {
    return false;
  }

  return (
    isProClubAuthorizationRole(candidate.authorizationRole) &&
    isProClubMembershipStatus(candidate.status)
  );
}

export function validateProClubStaffAssignment(
  assignment: unknown,
  context: ProClubMemberDocumentContext,
): assignment is ProClubStaffAssignment {
  if (!hasExactProClubMemberDocumentIdentity(context)) return false;
  const candidate = asRecord(assignment);
  if (
    !candidate ||
    !hasOnlyFields(candidate, PRO_CLUB_STAFF_ASSIGNMENT_FIELDS)
  ) {
    return false;
  }

  return (
    isProClubStaffRole(candidate.staffRole) &&
    isProClubStaffStatus(candidate.status)
  );
}

export function isActiveProClubStaffAssignment(
  assignment: unknown,
  context: ProClubMemberDocumentContext,
): boolean {
  return (
    validateProClubStaffAssignment(assignment, context) &&
    assignment.status === "ACTIVE"
  );
}

export function hasActiveProClubMembershipAuthority(
  club: unknown,
  clubContext: ProClubDocumentContext,
  membership: unknown,
  memberContext: ProClubMemberDocumentContext,
  allowedRoles: readonly ProClubAuthorizationRole[] = [
    "OWNER",
    "ADMIN",
    "MEMBER",
  ],
): boolean {
  if (!validateProClub(club, clubContext) || club.status !== "ACTIVE") {
    return false;
  }
  if (
    !validateProClubMembership(membership, memberContext) ||
    membership.status !== "ACTIVE"
  ) {
    return false;
  }
  if (clubContext.clubId !== memberContext.clubId) return false;
  if (
    !Array.isArray(allowedRoles) ||
    allowedRoles.length === 0 ||
    !allowedRoles.every(isProClubAuthorizationRole)
  ) {
    return false;
  }
  return allowedRoles.includes(membership.authorizationRole);
}

/**
 * Resolves a functional staff role only when tenant authority and the staff
 * assignment are both active for the exact same club and UID path.
 */
export function resolveActiveProClubStaffRole(
  club: unknown,
  clubContext: ProClubDocumentContext,
  membership: unknown,
  membershipContext: ProClubMemberDocumentContext,
  assignment: unknown,
  assignmentContext: ProClubMemberDocumentContext,
): ProClubStaffRole | null {
  if (
    !hasActiveProClubMembershipAuthority(
      club,
      clubContext,
      membership,
      membershipContext,
    ) ||
    !validateProClubStaffAssignment(assignment, assignmentContext) ||
    assignment.status !== "ACTIVE" ||
    membershipContext.clubId !== assignmentContext.clubId ||
    membershipContext.documentClubId !== assignmentContext.documentClubId ||
    membershipContext.userId !== assignmentContext.userId ||
    membershipContext.documentId !== assignmentContext.documentId
  ) {
    return null;
  }
  return assignment.staffRole;
}
