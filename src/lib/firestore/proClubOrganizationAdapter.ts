import type {
  ProClubAuthorizationRole,
  ProClubLevel,
  ProClubMembershipStatus,
  ProClubStaffRole,
  ProClubStatus,
} from "../../types/ProClub";

import {
  resolveProClubAuthoritySnapshot,
  type ProClubReadOps,
  type ProClubReadResult,
} from "./proClubReadAdapter";

export interface ProClubOrganizationAuthority {
  organizationId: string;
  organizationType: "PRO_CLUB";
  organizationName: string;
  organizationShortName?: string;
  organizationLevel: ProClubLevel;
  organizationStatus: ProClubStatus;
  userId: string;
  membershipAuthorizationRole: ProClubAuthorizationRole;
  membershipStatus: ProClubMembershipStatus;
  hasMembershipAuthority: boolean;
  staffRole: ProClubStaffRole | null;
}

export type ProClubOrganizationAuthorityResult =
  ProClubReadResult<ProClubOrganizationAuthority>;

function forwardNonFound(
  result: Exclude<
    ProClubReadResult<unknown>,
    { state: "FOUND" }
  >,
): ProClubOrganizationAuthorityResult {
  return result as ProClubOrganizationAuthorityResult;
}

export async function resolveProClubOrganizationAuthority(
  clubId: string,
  uid: string,
  ops?: ProClubReadOps,
): Promise<ProClubOrganizationAuthorityResult> {
  const authorityResult =
    await resolveProClubAuthoritySnapshot(
      clubId,
      uid,
      ops,
    );

  if (authorityResult.state !== "FOUND") {
    return forwardNonFound(authorityResult);
  }

  const snapshot = authorityResult.value;

  return {
    state: "FOUND",
    value: {
      organizationId: snapshot.clubId,
      organizationType: "PRO_CLUB",
      organizationName: snapshot.club.name,
      organizationShortName: snapshot.club.shortName,
      organizationLevel: snapshot.club.level,
      organizationStatus: snapshot.club.status,
      userId: snapshot.uid,

      // Preserve the canonical relationship role even when the membership is
      // inactive or terminal. Effective authority is represented separately
      // by hasMembershipAuthority.
      membershipAuthorizationRole:
        snapshot.membership.authorizationRole,

      membershipStatus:
        snapshot.membership.status,

      hasMembershipAuthority:
        snapshot.hasMembershipAuthority,

      // resolveProClubAuthoritySnapshot already fails closed and exposes only
      // the effective active football staff role.
      staffRole:
        snapshot.staffRole,
    },
  };
}