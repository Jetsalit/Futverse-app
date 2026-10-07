import type { ProClubOrganizationAuthority } from "./firestore/proClubOrganizationAdapter";
import { isValidDocumentIdentifier } from "./proClubModel";

export interface ProClubDrillProvenance {
  organizationType: "PRO_CLUB";
  organizationId: string;
}

export function isProClubDrillSubmissionEligible(
  drill:
    | {
        organizationType?: unknown;
        organizationId?: unknown;
      }
    | null
    | undefined,
  clubId: string,
): boolean {
  return (
    drill !== null &&
    drill !== undefined &&
    drill.organizationType === "PRO_CLUB" &&
    drill.organizationId === clubId
  );
}

export function resolveProClubDrillProvenance(
  authority: ProClubOrganizationAuthority | null | undefined,
): ProClubDrillProvenance | null {
  if (
    !authority ||
    authority.organizationType !== "PRO_CLUB" ||
    !isValidDocumentIdentifier(authority.organizationId) ||
    !isValidDocumentIdentifier(authority.userId) ||
    authority.organizationStatus !== "ACTIVE" ||
    authority.membershipStatus !== "ACTIVE" ||
    authority.hasMembershipAuthority !== true ||
    (authority.staffRole !== "HEAD_COACH" &&
      authority.staffRole !== "GK_COACH")
  ) {
    return null;
  }

  return {
    organizationType: "PRO_CLUB",
    organizationId: authority.organizationId,
  };
}
