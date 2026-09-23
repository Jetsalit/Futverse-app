import type { MembershipDate, MembershipStatus, TenantRole } from "./Membership";

/**
 * Functional Academy staff specialty. This is intentionally separate from
 * tenant membership authority and must never grant Academy access by itself.
 */
export type AcademyStaffSpecialty = "FITNESS_COACH";

export type AcademyStaffSpecialtyStatus = "ACTIVE" | "INACTIVE" | "LEFT";

export type AcademyFitnessCapability =
  | "FITNESS_VIEW"
  | "FITNESS_RECORD_RESULTS"
  | "FITNESS_MANAGE_TESTING"
  | "FITNESS_MANAGE_CATALOGUE"
  | "FITNESS_USE_IN_TRAINING";

export interface AcademyStaffSpecialtyAssignment {
  specialty: AcademyStaffSpecialty;
  status: AcademyStaffSpecialtyStatus;
}

export interface AcademyStaffCapabilityContext {
  membershipRole: TenantRole;
  membershipStatus: MembershipStatus;
  specialties?: readonly AcademyStaffSpecialtyAssignment[];
}

/**
 * Authoritative V1 record reserved for
 * academies/{academyId}/staffSpecialties/{uid}.
 *
 * Academy and user identity come only from the Firestore path.
 */
export interface AcademyStaffSpecialtyRecord {
  schemaVersion: 1;
  specialty: AcademyStaffSpecialty;
  status: AcademyStaffSpecialtyStatus;
  createdAt: MembershipDate;
  createdBy: string;
  updatedAt: MembershipDate;
  updatedBy: string;
}
