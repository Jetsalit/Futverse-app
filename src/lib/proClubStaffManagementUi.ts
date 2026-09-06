import type {
  ProClubAuthorizationRole,
  ProClubStaffRole,
} from "../types/ProClub";
import type { ProClubStaffRosterEntryV1 } from "./proClubStaffRosterModel";
import { isValidDocumentIdentifier } from "./proClubModel";

export const PRO_CLUB_STAFF_ROLE_OPTIONS: readonly ProClubStaffRole[] = [
  "TECHNICAL_DIRECTOR",
  "MANAGER",
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "GK_COACH",
  "FITNESS_COACH",
  "ANALYST",
  "PHYSIO",
  "TEAM_MANAGER",
  "STAFF",
] as const;

export type ProClubStaffManagementUiReason =
  | "ALLOWED"
  | "INVALID_CONTEXT"
  | "SELF_MANAGEMENT_BLOCKED"
  | "OWNER_TARGET_PROTECTED"
  | "OWNER_REQUIRED_FOR_ADMIN"
  | "ACTIVE_TARGET_REQUIRED";

export interface ProClubStaffManagementUiPolicyV1 {
  canManage: boolean;
  canChangeRole: boolean;
  canDeactivate: boolean;
  canMarkLeft: boolean;
  canReactivate: false;
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

/**
 * Client UX policy only. Server authority remains canonical.
 * V1 roster is active-only, so Reactivate intentionally remains unavailable
 * until a separate reviewer-safe inactive staff read contract exists.
 */
export function getProClubStaffManagementUiPolicyV1(input: {
  actorRole: ProClubAuthorizationRole;
  actorUid: string;
  entry: ProClubStaffRosterEntryV1;
}): ProClubStaffManagementUiPolicyV1 {
  const { actorRole, actorUid, entry } = input;

  if (
    (actorRole !== "OWNER" && actorRole !== "ADMIN") ||
    !isValidDocumentIdentifier(actorUid) ||
    !entry ||
    !isValidDocumentIdentifier(entry.userId)
  ) {
    return denied("INVALID_CONTEXT");
  }

  if (entry.membershipStatus !== "ACTIVE" || entry.staffStatus !== "ACTIVE") {
    return denied("ACTIVE_TARGET_REQUIRED");
  }

  if (entry.userId === actorUid) {
    return denied("SELF_MANAGEMENT_BLOCKED");
  }

  if (entry.authorizationRole === "OWNER") {
    return denied("OWNER_TARGET_PROTECTED");
  }

  if (entry.authorizationRole === "ADMIN" && actorRole !== "OWNER") {
    return denied("OWNER_REQUIRED_FOR_ADMIN");
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
