import type { ProClubOrganizationAuthority } from "./firestore/proClubOrganizationAdapter";

export function canOpenProClubGKTraining(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    authority.staffRole === "GK_COACH"
  );
}
