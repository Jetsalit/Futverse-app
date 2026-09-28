import type { ProClubOrganizationAuthority } from "./firestore/proClubOrganizationAdapter";

export const PRO_CLUB_MATCH_ANALYSIS_ROLES = [
  "ANALYST",
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "TECHNICAL_DIRECTOR",
] as const;

export function canAccessProClubMatchAnalysis(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    PRO_CLUB_MATCH_ANALYSIS_ROLES.includes(
      authority.staffRole as (typeof PRO_CLUB_MATCH_ANALYSIS_ROLES)[number],
    )
  );
}
