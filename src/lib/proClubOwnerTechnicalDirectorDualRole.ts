import {
  validateProClub,
  validateProClubMembership,
  validateProClubStaffAssignment,
  isValidDocumentIdentifier,
} from "./proClubModel";

export interface ProClubOwnerMembershipCandidate {
  uid: string;
  data: unknown;
}

export type ProClubOwnerTechnicalDirectorPlan =
  | {
      action: "CREATE";
      ownerUid: string;
      membershipAuthorizationRole: "OWNER";
      staffRole: "TECHNICAL_DIRECTOR";
      staffStatus: "ACTIVE";
    }
  | {
      action: "NOOP";
      ownerUid: string;
      membershipAuthorizationRole: "OWNER";
      staffRole: "TECHNICAL_DIRECTOR";
      staffStatus: "ACTIVE";
    };

function fail(message: string): never {
  throw new Error(`OWNER_TECHNICAL_DIRECTOR_DUAL_ROLE_BLOCKED: ${message}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function planProClubOwnerTechnicalDirectorDualRole(input: {
  clubId: string;
  club: unknown;
  memberships: readonly ProClubOwnerMembershipCandidate[];
  ownerUser: unknown;
  existingStaffAssignment: unknown | null;
}): ProClubOwnerTechnicalDirectorPlan {
  const { clubId } = input;

  if (!isValidDocumentIdentifier(clubId)) {
    fail("clubId must be one exact document identifier");
  }

  if (
    !validateProClub(input.club, { clubId, documentId: clubId }) ||
    input.club.status !== "ACTIVE"
  ) {
    fail("Pro Club must be canonical and ACTIVE");
  }

  if (!Array.isArray(input.memberships)) {
    fail("memberships must be an array");
  }

  const activeOwners: string[] = [];

  for (const membershipDocument of input.memberships) {
    if (
      !membershipDocument ||
      !isValidDocumentIdentifier(membershipDocument.uid)
    ) {
      fail("membership document identity is invalid");
    }

    if (
      !validateProClubMembership(membershipDocument.data, {
        clubId,
        documentClubId: clubId,
        userId: membershipDocument.uid,
        documentId: membershipDocument.uid,
      })
    ) {
      fail("all Pro Club membership documents must be canonical");
    }

    if (
      membershipDocument.data.authorizationRole === "OWNER" &&
      membershipDocument.data.status === "ACTIVE"
    ) {
      activeOwners.push(membershipDocument.uid);
    }
  }

  if (activeOwners.length !== 1) {
    fail(`exactly one ACTIVE OWNER is required; found ${activeOwners.length}`);
  }

  const ownerUid = activeOwners[0];
  const ownerUser = asRecord(input.ownerUser);
  if (!ownerUser) {
    fail("OWNER user document is missing or invalid");
  }

  if (
    ownerUser.status !== "Active" &&
    ownerUser.status !== "ACTIVE"
  ) {
    fail("OWNER user account must be ACTIVE");
  }

  if (input.existingStaffAssignment === null) {
    return {
      action: "CREATE",
      ownerUid,
      membershipAuthorizationRole: "OWNER",
      staffRole: "TECHNICAL_DIRECTOR",
      staffStatus: "ACTIVE",
    };
  }

  if (
    !validateProClubStaffAssignment(input.existingStaffAssignment, {
      clubId,
      documentClubId: clubId,
      userId: ownerUid,
      documentId: ownerUid,
    })
  ) {
    fail("existing OWNER staff assignment is not canonical");
  }

  if (
    input.existingStaffAssignment.staffRole !== "TECHNICAL_DIRECTOR" ||
    input.existingStaffAssignment.status !== "ACTIVE"
  ) {
    fail(
      "existing OWNER staff assignment conflicts with TECHNICAL_DIRECTOR ACTIVE; overwrite is forbidden",
    );
  }

  return {
    action: "NOOP",
    ownerUid,
    membershipAuthorizationRole: "OWNER",
    staffRole: "TECHNICAL_DIRECTOR",
    staffStatus: "ACTIVE",
  };
}
