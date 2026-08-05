import type { Timestamp } from "firebase/firestore";

export type TenantRole = "ADMIN" | "COACH";

export type MembershipStatus =
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "LEFT"
  | "REVOKED";

export type MembershipSource =
  | "CLAIM_APPROVAL"
  | "SUPERADMIN_ASSIGNMENT"
  | "LEGACY_MIGRATION"
  | "INVITE";

export type MembershipDate = Timestamp | Date | string | null;

export interface Membership {
  userId: string;
  academyId: string;
  role: TenantRole;
  status: MembershipStatus;
  source: MembershipSource;
  joinedAt: MembershipDate;
  joinedBy: string;
  updatedAt: MembershipDate;
}

export interface AcademyJoinClaim {
  id: string;
  type: "ACADEMY_JOIN" | "COACH_JOIN";
  userId: string;
  userEmail?: string;
  userName?: string;
  requestedRole?: TenantRole;
  inviteCode: string;
  requestedAcademyName?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt?: MembershipDate;
  updatedAt?: MembershipDate;
  approvedAcademyId?: string;
  approvedRole?: TenantRole;
}

export type MembershipReadResult =
  | { state: "FOUND"; membership: Membership }
  | { state: "MISSING" }
  | { state: "PERMISSION_DENIED"; error: Error }
  | { state: "ERROR"; error: Error };

export type MembershipValidationResult =
  | { state: "ACTIVE"; membership: Membership }
  | { state: "MISSING" }
  | { state: "PENDING"; membership: Membership }
  | { state: "SUSPENDED"; membership: Membership }
  | { state: "LEFT"; membership: Membership }
  | { state: "REVOKED"; membership: Membership }
  | { state: "PERMISSION_DENIED"; error: Error }
  | { state: "ERROR"; error: Error };

export type TenantRoleResolution =
  | { state: "ACTIVE"; role: TenantRole; membership: Membership }
  | Exclude<MembershipValidationResult, { state: "ACTIVE" }>;

export interface ApproveAcademyJoinClaimInput {
  academyId: string;
  claim: AcademyJoinClaim;
  approvedBy: string;
}

export interface ApproveAcademyJoinClaimResult {
  membership: Membership;
  role: TenantRole;
  coachProfileId: string | null;
}
