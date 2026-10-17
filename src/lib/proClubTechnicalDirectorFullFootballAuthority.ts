import type { ProClubOrganizationAuthority } from "./firestore/proClubOrganizationAdapter";
import type { ProClubTechnicalAuthorityResolution } from "./proClubTechnicalGovernance";

export interface ProClubTechnicalDirectorFullFootballCapabilities {
  canViewAllFootballModules: boolean;
  canViewSquad: boolean;
  canViewTraining: boolean;
  canViewAttendance: boolean;
  canViewSubmissions: boolean;
  canViewReports: boolean;
  canViewAssessments: boolean;
  canViewMatches: boolean;
  canWriteDailyTrainingPlan: boolean;
  canWriteWeeklyTrainingPlan: boolean;
  canEditTrainingDrafts: boolean;
  canReviewTechnicalWork: boolean;
  canRequestRevision: boolean;
  canApproveTechnicalWork: boolean;
  canCreateAssessment: boolean;
  canEditAssessment: boolean;
  canDeleteAuditHistory: false;
  canMutateTenantAuthority: false;
}

const NONE: ProClubTechnicalDirectorFullFootballCapabilities = {
  canViewAllFootballModules: false,
  canViewSquad: false,
  canViewTraining: false,
  canViewAttendance: false,
  canViewSubmissions: false,
  canViewReports: false,
  canViewAssessments: false,
  canViewMatches: false,
  canWriteDailyTrainingPlan: false,
  canWriteWeeklyTrainingPlan: false,
  canEditTrainingDrafts: false,
  canReviewTechnicalWork: false,
  canRequestRevision: false,
  canApproveTechnicalWork: false,
  canCreateAssessment: false,
  canEditAssessment: false,
  canDeleteAuditHistory: false,
  canMutateTenantAuthority: false,
};

function isActiveTechnicalDirector(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    authority.staffRole === "TECHNICAL_DIRECTOR"
  );
}

/**
 * Pure permission contract for Pro Club Technical Director V1.
 *
 * This resolver expresses football-operational entitlement only. It does not
 * bypass Firestore Rules, runtime capability flags, module readiness, or the
 * existing tenant authorization model.
 *
 * Authoring, assessment and read entitlements follow the active
 * TECHNICAL_DIRECTOR staff role. Review/approval additionally requires the
 * exact resolved technical authority identity so ambiguous leadership fails
 * closed and audit provenance remains deterministic.
 */
export function resolveProClubTechnicalDirectorFullFootballCapabilities(input: {
  authority: ProClubOrganizationAuthority;
  technicalAuthority: ProClubTechnicalAuthorityResolution;
}): ProClubTechnicalDirectorFullFootballCapabilities {
  if (!isActiveTechnicalDirector(input.authority)) {
    return { ...NONE };
  }

  const isResolvedTechnicalAuthority =
    input.technicalAuthority.state === "FOUND" &&
    input.technicalAuthority.authorityUid === input.authority.userId &&
    input.technicalAuthority.authorityRole === "TECHNICAL_DIRECTOR";

  return {
    canViewAllFootballModules: true,
    canViewSquad: true,
    canViewTraining: true,
    canViewAttendance: true,
    canViewSubmissions: true,
    canViewReports: true,
    canViewAssessments: true,
    canViewMatches: true,
    canWriteDailyTrainingPlan: true,
    canWriteWeeklyTrainingPlan: true,
    canEditTrainingDrafts: true,
    canReviewTechnicalWork: isResolvedTechnicalAuthority,
    canRequestRevision: isResolvedTechnicalAuthority,
    canApproveTechnicalWork: isResolvedTechnicalAuthority,
    canCreateAssessment: true,
    canEditAssessment: true,
    canDeleteAuditHistory: false,
    canMutateTenantAuthority: false,
  };
}
