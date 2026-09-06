import type {
  ProClubAuthorizationRole,
  ProClubStaffRole,
} from "../types/ProClub";
import type { ProClubStaffRosterEntryV1 } from "./proClubStaffRosterModel";
import type { ProClubStaffLifecycleEntryV1 } from "./proClubStaffLifecycleReviewModel";
import { isValidDocumentIdentifier } from "./proClubModel";
import { PRO_CLUB_STAFF_ROLE_OPTIONS_V1 } from "./proClubCoachPositionV1";

/** Backward-compatible export; canonical ordering lives in Coach Position V1. */
export const PRO_CLUB_STAFF_ROLE_OPTIONS: readonly ProClubStaffRole[] =
  PRO_CLUB_STAFF_ROLE_OPTIONS_V1;

export type ProClubStaffManagementUiReason =
  | "ALLOWED"
  | "INVALID_CONTEXT"
  | "SELF_MANAGEMENT_BLOCKED"
  | "OWNER_TARGET_PROTECTED"
  | "OWNER_REQUIRED_FOR_ADMIN"
  | "ACTIVE_TARGET_REQUIRED"
  | "INACTIVE_TARGET_REQUIRED";

export interface ProClubStaffManagementUiPolicyV1 {
  canManage: boolean;
  canChangeRole: boolean;
  canDeactivate: boolean;
  canMarkLeft: boolean;
  canReactivate: boolean;
  reason: ProClubStaffManagementUiReason;
}

const denied = (
  reason: Exclude<ProClubStaffManagementUiReason, "ALLOWED">,
): ProClubStaffManagementUiPolicyV1 => ({
  canManage: false,
  canChangeRole: false,
  canDeactivate: false,
  canMarkLeft: false,
  canReactivate: false,
  reason,
});

function assertSharedAuthorityBoundary(input: {
  actorRole: ProClubAuthorizationRole;
  actorUid: string;
  targetUid: string;
  targetAuthorizationRole: ProClubAuthorizationRole;
}): ProClubStaffManagementUiPolicyV1 | null {
  const { actorRole, actorUid, targetUid, targetAuthorizationRole } = input;
  if (
    (actorRole !== "OWNER" && actorRole !== "ADMIN") ||
    !isValidDocumentIdentifier(actorUid) ||
    !isValidDocumentIdentifier(targetUid)
  ) return denied("INVALID_CONTEXT");
  if (targetUid === actorUid) return denied("SELF_MANAGEMENT_BLOCKED");
  if (targetAuthorizationRole === "OWNER") return denied("OWNER_TARGET_PROTECTED");
  if (targetAuthorizationRole === "ADMIN" && actorRole !== "OWNER") {
    return denied("OWNER_REQUIRED_FOR_ADMIN");
  }
  return null;
}

/** Client UX policy only. Server authority remains canonical. */
export function getProClubStaffManagementUiPolicyV1(input: {
  actorRole: ProClubAuthorizationRole;
  actorUid: string;
  entry: ProClubStaffRosterEntryV1;
}): ProClubStaffManagementUiPolicyV1 {
  const { actorRole, actorUid, entry } = input;
  if (!entry) return denied("INVALID_CONTEXT");
  const boundary = assertSharedAuthorityBoundary({
    actorRole,
    actorUid,
    targetUid: entry.userId,
    targetAuthorizationRole: entry.authorizationRole,
  });
  if (boundary) return boundary;
  if (entry.membershipStatus !== "ACTIVE" || entry.staffStatus !== "ACTIVE") {
    return denied("ACTIVE_TARGET_REQUIRED");
  }
  return {
    canManage: true,
    canChangeRole: true,
    canDeactivate: true,
    canMarkLeft: true,
    canReactivate: false,
    reason: "ALLOWED",
  };
}

/**
 * Reactivation is intentionally available only through the reviewer-safe
 * lifecycle read model and only for aligned INACTIVE/INACTIVE records.
 * LEFT remains terminal in Staff Management V1.
 */
export function getProClubStaffReactivationUiPolicyV1(input: {
  actorRole: ProClubAuthorizationRole;
  actorUid: string;
  entry: ProClubStaffLifecycleEntryV1;
}): ProClubStaffManagementUiPolicyV1 {
  const { actorRole, actorUid, entry } = input;
  if (!entry) return denied("INVALID_CONTEXT");
  const boundary = assertSharedAuthorityBoundary({
    actorRole,
    actorUid,
    targetUid: entry.userId,
    targetAuthorizationRole: entry.authorizationRole,
  });
  if (boundary) return boundary;
  if (entry.membershipStatus !== "INACTIVE" || entry.staffStatus !== "INACTIVE") {
    return denied("INACTIVE_TARGET_REQUIRED");
  }
  return {
    canManage: true,
    canChangeRole: false,
    canDeactivate: false,
    canMarkLeft: false,
    canReactivate: true,
    reason: "ALLOWED",
  };
}
