import { isExplicitlyActiveAccountStatus } from "../accountRolePolicy";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  getProClub,
  getProClubMembership,
  getProClubStaffAssignment,
  type ProClubReadOps,
  type ProClubReadResult,
  type ProClubRecord,
  type ProClubMembershipRecord,
  type ProClubStaffAssignmentRecord,
} from "./proClubReadAdapter";

export const PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1 =
  "PRO_CLUB_SUPERADMIN_SUPPORT_V1" as const;

export interface ProClubSupportReadActor {
  uid?: string | null;
  id?: string | null;
  role?: string | null;
  status?: string | null;
}

export type ProClubSupportReadTarget = {
  clubId: string;
  subjectUid?: string | null;
};

export type ProClubSupportReadEnvelope = {
  mode: typeof PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1;
  actorUid: string;
  club: ProClubRecord;
  subjectMembership: ProClubMembershipRecord | null;
  subjectStaffAssignment: ProClubStaffAssignmentRecord | null;
};

export type ProClubSupportReadResult =
  | { state: "FOUND"; value: ProClubSupportReadEnvelope }
  | { state: "UNAUTHORIZED"; error: Error }
  | { state: "INVALID_TARGET"; error: Error }
  | Exclude<ProClubReadResult<never>, { state: "FOUND" }>;

function actorUid(actor: ProClubSupportReadActor | null | undefined): string | null {
  const uid = actor?.uid ?? actor?.id ?? null;
  return isValidDocumentIdentifier(uid) ? uid : null;
}

export function isActiveCanonicalSuperAdminSupportActor(
  actor: ProClubSupportReadActor | null | undefined,
): boolean {
  return Boolean(
    actorUid(actor) &&
      actor?.role === "SUPERADMIN" &&
      isExplicitlyActiveAccountStatus(actor?.status),
  );
}

function unauthorized(message: string): ProClubSupportReadResult {
  return { state: "UNAUTHORIZED", error: new Error(message) };
}

function invalidTarget(message: string): ProClubSupportReadResult {
  return { state: "INVALID_TARGET", error: new Error(message) };
}

function forwardReadFailure(
  result: Exclude<ProClubReadResult<unknown>, { state: "FOUND" }>,
): ProClubSupportReadResult {
  return result as ProClubSupportReadResult;
}

/**
 * Exact-target, read-only support envelope.
 *
 * This adapter never synthesizes tenant Membership, Staff or Technical
 * Authority. Firestore Rules remain responsible for proving that the real
 * authenticated account is the ACTIVE canonical SUPERADMIN before any support
 * read succeeds. No mutation operation is exposed here.
 */
export async function readProClubSupportEnvelopeV1(
  actor: ProClubSupportReadActor | null | undefined,
  target: ProClubSupportReadTarget,
  ops?: ProClubReadOps,
): Promise<ProClubSupportReadResult> {
  const uid = actorUid(actor);
  if (!uid || !isActiveCanonicalSuperAdminSupportActor(actor)) {
    return unauthorized("Pro Club support reads require an ACTIVE canonical SUPERADMIN actor.");
  }

  if (!isValidDocumentIdentifier(target.clubId)) {
    return invalidTarget("Pro Club support requires an exact clubId.");
  }

  const subjectUid = target.subjectUid ?? null;
  if (subjectUid !== null && !isValidDocumentIdentifier(subjectUid)) {
    return invalidTarget("Pro Club support subjectUid must be an exact document identifier.");
  }

  const clubResult = await getProClub(target.clubId, ops);
  if (clubResult.state !== "FOUND") {
    return forwardReadFailure(clubResult);
  }

  if (!subjectUid) {
    return {
      state: "FOUND",
      value: {
        mode: PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1,
        actorUid: uid,
        club: clubResult.value,
        subjectMembership: null,
        subjectStaffAssignment: null,
      },
    };
  }

  const membershipResult = await getProClubMembership(
    target.clubId,
    subjectUid,
    ops,
  );
  if (
    membershipResult.state !== "FOUND" &&
    membershipResult.state !== "MISSING"
  ) {
    return forwardReadFailure(membershipResult);
  }

  const staffResult = await getProClubStaffAssignment(
    target.clubId,
    subjectUid,
    ops,
  );
  if (staffResult.state !== "FOUND" && staffResult.state !== "MISSING") {
    return forwardReadFailure(staffResult);
  }

  return {
    state: "FOUND",
    value: {
      mode: PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1,
      actorUid: uid,
      club: clubResult.value,
      subjectMembership:
        membershipResult.state === "FOUND" ? membershipResult.value : null,
      subjectStaffAssignment:
        staffResult.state === "FOUND" ? staffResult.value : null,
    },
  };
}
