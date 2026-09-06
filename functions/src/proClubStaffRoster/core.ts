export const STAFF_ROSTER_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOO_MANY_RESULTS: "TOO_MANY_RESULTS",
  INVALID_DATA: "INVALID_DATA",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type StaffRosterErrorCode =
  (typeof STAFF_ROSTER_ERROR_CODES)[keyof typeof STAFF_ROSTER_ERROR_CODES];

export class ProClubStaffRosterError extends Error {
  constructor(
    readonly code: StaffRosterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProClubStaffRosterError";
  }
}

export type ProClubAuthorizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type ProClubMembershipStatus = "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED";
export type ProClubStaffRole =
  | "TECHNICAL_DIRECTOR"
  | "MANAGER"
  | "HEAD_COACH"
  | "ASSISTANT_COACH"
  | "GK_COACH"
  | "FITNESS_COACH"
  | "ANALYST"
  | "PHYSIO"
  | "TEAM_MANAGER"
  | "STAFF";
export type ProClubStaffStatus = "ACTIVE" | "INACTIVE" | "LEFT";

export interface ProClubStaffRosterRequestV1 {
  clubId: string;
}

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

export interface ProClubStaffRosterResponseV1 {
  schemaVersion: 1;
  clubId: string;
  entries: ProClubStaffRosterEntryV1[];
}

export function isValidDocumentIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function isProClubAuthorizationRole(value: unknown): value is ProClubAuthorizationRole {
  return value === "OWNER" || value === "ADMIN" || value === "MEMBER";
}

export function isProClubMembershipStatus(value: unknown): value is ProClubMembershipStatus {
  return value === "ACTIVE" || value === "INACTIVE" || value === "LEFT" || value === "REVOKED";
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

export function isProClubStaffStatus(value: unknown): value is ProClubStaffStatus {
  return value === "ACTIVE" || value === "INACTIVE" || value === "LEFT";
}

function exactRecord(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProClubStaffRosterError(
      STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
      "Canonical roster source data is invalid.",
    );
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== allowedKeys.length || !keys.every((key) => allowedKeys.includes(key))) {
    throw new ProClubStaffRosterError(
      STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
      "Canonical roster source data is invalid.",
    );
  }
  return record;
}

export function validateRosterRequest(body: unknown): ProClubStaffRosterRequestV1 {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ProClubStaffRosterError(
      STAFF_ROSTER_ERROR_CODES.INVALID_REQUEST,
      "Request body must be a JSON object.",
    );
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "clubId" || !isValidDocumentIdentifier(record.clubId)) {
    throw new ProClubStaffRosterError(
      STAFF_ROSTER_ERROR_CODES.INVALID_REQUEST,
      "A valid clubId is required.",
    );
  }

  return { clubId: record.clubId };
}

export function parseCanonicalMembership(value: unknown): {
  authorizationRole: ProClubAuthorizationRole;
  status: ProClubMembershipStatus;
} {
  const record = exactRecord(value, ["authorizationRole", "status"]);
  if (!isProClubAuthorizationRole(record.authorizationRole) || !isProClubMembershipStatus(record.status)) {
    throw new ProClubStaffRosterError(
      STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
      "Canonical membership data is invalid.",
    );
  }
  return {
    authorizationRole: record.authorizationRole,
    status: record.status,
  };
}

export function parseCanonicalStaffAssignment(value: unknown): {
  staffRole: ProClubStaffRole;
  status: ProClubStaffStatus;
} {
  const record = exactRecord(value, ["staffRole", "status"]);
  if (!isProClubStaffRole(record.staffRole) || !isProClubStaffStatus(record.status)) {
    throw new ProClubStaffRosterError(
      STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
      "Canonical staff assignment data is invalid.",
    );
  }
  return {
    staffRole: record.staffRole,
    status: record.status,
  };
}

export function normalizeRosterDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 120 || value.trim() !== value) return null;
  return value;
}

const STAFF_ROLE_ORDER: readonly ProClubStaffRole[] = [
  "TECHNICAL_DIRECTOR",
  "MANAGER",
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "GK_COACH",
  "FITNESS_COACH",
  "ANALYST",
  "PHYSIO",
  "TEAM_MANAGER",
  "STAFF",
];

export function sortRosterEntries(
  entries: readonly ProClubStaffRosterEntryV1[],
): ProClubStaffRosterEntryV1[] {
  return [...entries].sort((a, b) => {
    const roleDiff = STAFF_ROLE_ORDER.indexOf(a.staffRole) - STAFF_ROLE_ORDER.indexOf(b.staffRole);
    if (roleDiff !== 0) return roleDiff;
    const nameA = a.displayName ?? "";
    const nameB = b.displayName ?? "";
    const nameDiff = nameA.localeCompare(nameB);
    return nameDiff !== 0 ? nameDiff : a.userId.localeCompare(b.userId);
  });
}
