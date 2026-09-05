export type ProClubLevel = "T1" | "T2" | "T3";
export type ProClubStatus = "ACTIVE" | "INACTIVE";

/**
 * Tenant authorization granted by a canonical Pro Club membership.
 * This is intentionally separate from a football staff assignment.
 */
export type ProClubAuthorizationRole = "OWNER" | "ADMIN" | "MEMBER";

export type ProClubMembershipStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "LEFT"
  | "REVOKED";

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

/** Stored at proClubs/{clubId}; the document path is the club identity. */
export interface ProClub {
  name: string;
  shortName?: string;
  level: ProClubLevel;
  status: ProClubStatus;
  country?: string;
  logoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Stored at proClubs/{clubId}/members/{uid}; neither identity is payload data. */
export interface ProClubMembership {
  authorizationRole: ProClubAuthorizationRole;
  status: ProClubMembershipStatus;
}

/** Stored at proClubs/{clubId}/staff/{uid}; neither identity is payload data. */
export interface ProClubStaffAssignment {
  staffRole: ProClubStaffRole;
  status: ProClubStaffStatus;
}
