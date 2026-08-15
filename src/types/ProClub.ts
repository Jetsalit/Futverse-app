export type ProClubLevel = "T1" | "T2" | "T3";
export type ProClubStatus = "ACTIVE" | "INACTIVE";

export type ProClubStaffRole =
  | "HEAD_COACH"
  | "ASSISTANT_COACH"
  | "FITNESS_COACH"
  | "ANALYST"
  | "PHYSIO"
  | "TEAM_MANAGER"
  | "STAFF";

export type ProClubStaffStatus = "ACTIVE" | "INACTIVE" | "LEFT";

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

export interface ProClubStaffAssignment {
  userId: string;
  clubId: string;
  staffRole: ProClubStaffRole;
  status: ProClubStaffStatus;
}
