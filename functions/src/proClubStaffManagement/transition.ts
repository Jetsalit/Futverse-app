export type ProClubAuthorizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type ProClubMembershipStatus = "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED";
export type ProClubStaffRole =
  | "TECHNICAL_DIRECTOR"
  | "MANAGER"
  | "HEAD_COACH"
  | "ASSISTANT_COACH"
  | "GK_COACH"
  | "FITNESS_COACH"
  | "ANALYST"
  | "PHYSIO"
  | "TEAM_MANAGER"
  | "STAFF";
export type ProClubStaffStatus = "ACTIVE" | "INACTIVE" | "LEFT";

export interface ProClubMembership {
  authorizationRole: ProClubAuthorizationRole;
  status: ProClubMembershipStatus;
}

export interface ProClubStaffAssignment {
  staffRole: ProClubStaffRole;
  status: ProClubStaffStatus;
}

export type ProClubStaffManagementActionV1 =
  | { type: "CHANGE_ROLE"; staffRole: ProClubStaffRole }
  | { type: "DEACTIVATE" }
  | { type: "REACTIVATE" }
  | { type: "MARK_LEFT" };

export interface ProClubStaffManagementActorV1 {
  clubId: string;
  actorUid: string;
  authorizationRole: ProClubAuthorizationRole;
  membershipStatus: ProClubMembershipStatus;
}

export interface ProClubStaffManagementTargetV1 {
  clubId: string;
  userId: string;
  authorizationRole: ProClubAuthorizationRole;
  membershipStatus: ProClubMembershipStatus;
  staffRole: ProClubStaffRole;
  staffStatus: ProClubStaffStatus;
}

export interface ProClubStaffManagementHistoryDraftV1 {
  schemaVersion: 1;
  clubId: string;
  userId: string;
  action: ProClubStaffManagementActionV1["type"];
  previousAuthorizationRole: ProClubAuthorizationRole;
  nextAuthorizationRole: ProClubAuthorizationRole;
  previousMembershipStatus: ProClubMembershipStatus;
  nextMembershipStatus: ProClubMembershipStatus;
  previousStaffRole: ProClubStaffRole;
  nextStaffRole: ProClubStaffRole;
  previousStaffStatus: ProClubStaffStatus;
  nextStaffStatus: ProClubStaffStatus;
  changedBy: string;
}

export interface ProClubStaffManagementPlanV1 {
  membership: ProClubMembership;
  staff: ProClubStaffAssignment;
  history: ProClubStaffManagementHistoryDraftV1;
}

export type ProClubStaffManagementTransitionErrorCode =
  | "INVALID_INPUT"
  | "REVIEWER_REQUIRED"
  | "SELF_MANAGEMENT_BLOCKED"
  | "OWNER_TARGET_PROTECTED"
  | "OWNER_ACTION_REQUIRED"
  | "INVALID_TRANSITION"
  | "NO_CHANGE";

export class ProClubStaffManagementTransitionError extends Error {
  constructor(readonly code: ProClubStaffManagementTransitionErrorCode) {
    super(code);
    this.name = "ProClubStaffManagementTransitionError";
  }
}

const AUTH_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
const MEMBERSHIP_STATUSES = ["ACTIVE", "INACTIVE", "LEFT", "REVOKED"] as const;
const STAFF_ROLES = [
  "TECHNICAL_DIRECTOR", "MANAGER", "HEAD_COACH", "ASSISTANT_COACH", "GK_COACH",
  "FITNESS_COACH", "ANALYST", "PHYSIO", "TEAM_MANAGER", "STAFF",
] as const;
const STAFF_STATUSES = ["ACTIVE", "INACTIVE", "LEFT"] as const;

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("/");
}

function assertActor(actor: ProClubStaffManagementActorV1): void {
  if (
    !isIdentifier(actor.clubId) ||
    !isIdentifier(actor.actorUid) ||
    !AUTH_ROLES.includes(actor.authorizationRole) ||
    !MEMBERSHIP_STATUSES.includes(actor.membershipStatus)
  ) throw new ProClubStaffManagementTransitionError("INVALID_INPUT");

  if (
    actor.membershipStatus !== "ACTIVE" ||
    (actor.authorizationRole !== "OWNER" && actor.authorizationRole !== "ADMIN")
  ) throw new ProClubStaffManagementTransitionError("REVIEWER_REQUIRED");
}

function assertTarget(target: ProClubStaffManagementTargetV1): void {
  if (
    !isIdentifier(target.clubId) ||
    !isIdentifier(target.userId) ||
    !AUTH_ROLES.includes(target.authorizationRole) ||
    !MEMBERSHIP_STATUSES.includes(target.membershipStatus) ||
    !STAFF_ROLES.includes(target.staffRole) ||
    !STAFF_STATUSES.includes(target.staffStatus)
  ) throw new ProClubStaffManagementTransitionError("INVALID_INPUT");
}

function assertAction(action: ProClubStaffManagementActionV1): void {
  if (!action || typeof action !== "object") throw new ProClubStaffManagementTransitionError("INVALID_INPUT");
  if (action.type === "CHANGE_ROLE") {
    if (!STAFF_ROLES.includes(action.staffRole)) throw new ProClubStaffManagementTransitionError("INVALID_INPUT");
    return;
  }
  if (action.type !== "DEACTIVATE" && action.type !== "REACTIVATE" && action.type !== "MARK_LEFT") {
    throw new ProClubStaffManagementTransitionError("INVALID_INPUT");
  }
}

function assertBoundary(actor: ProClubStaffManagementActorV1, target: ProClubStaffManagementTargetV1): void {
  if (actor.clubId !== target.clubId) throw new ProClubStaffManagementTransitionError("INVALID_INPUT");
  if (actor.actorUid === target.userId) throw new ProClubStaffManagementTransitionError("SELF_MANAGEMENT_BLOCKED");
  if (target.authorizationRole === "OWNER") throw new ProClubStaffManagementTransitionError("OWNER_TARGET_PROTECTED");
  if (target.authorizationRole === "ADMIN" && actor.authorizationRole !== "OWNER") {
    throw new ProClubStaffManagementTransitionError("OWNER_ACTION_REQUIRED");
  }
}

function assertActive(target: ProClubStaffManagementTargetV1): void {
  if (target.membershipStatus !== "ACTIVE" || target.staffStatus !== "ACTIVE") {
    throw new ProClubStaffManagementTransitionError("INVALID_TRANSITION");
  }
}

function assertInactive(target: ProClubStaffManagementTargetV1): void {
  if (target.membershipStatus !== "INACTIVE" || target.staffStatus !== "INACTIVE") {
    throw new ProClubStaffManagementTransitionError("INVALID_TRANSITION");
  }
}

function history(
  actor: ProClubStaffManagementActorV1,
  target: ProClubStaffManagementTargetV1,
  action: ProClubStaffManagementActionV1,
  membership: ProClubMembership,
  staff: ProClubStaffAssignment,
): ProClubStaffManagementHistoryDraftV1 {
  return {
    schemaVersion: 1,
    clubId: target.clubId,
    userId: target.userId,
    action: action.type,
    previousAuthorizationRole: target.authorizationRole,
    nextAuthorizationRole: membership.authorizationRole,
    previousMembershipStatus: target.membershipStatus,
    nextMembershipStatus: membership.status,
    previousStaffRole: target.staffRole,
    nextStaffRole: staff.staffRole,
    previousStaffStatus: target.staffStatus,
    nextStaffStatus: staff.status,
    changedBy: actor.actorUid,
  };
}

export function planProClubStaffManagementTransitionV1(
  actor: ProClubStaffManagementActorV1,
  target: ProClubStaffManagementTargetV1,
  action: ProClubStaffManagementActionV1,
): ProClubStaffManagementPlanV1 {
  assertActor(actor);
  assertTarget(target);
  assertAction(action);
  assertBoundary(actor, target);

  let membership: ProClubMembership = {
    authorizationRole: target.authorizationRole,
    status: target.membershipStatus,
  };
  let staff: ProClubStaffAssignment = { staffRole: target.staffRole, status: target.staffStatus };

  switch (action.type) {
    case "CHANGE_ROLE":
      assertActive(target);
      if (action.staffRole === target.staffRole) throw new ProClubStaffManagementTransitionError("NO_CHANGE");
      staff = { staffRole: action.staffRole, status: "ACTIVE" };
      break;
    case "DEACTIVATE":
      assertActive(target);
      membership = { authorizationRole: target.authorizationRole, status: "INACTIVE" };
      staff = { staffRole: target.staffRole, status: "INACTIVE" };
      break;
    case "REACTIVATE":
      assertInactive(target);
      membership = { authorizationRole: target.authorizationRole, status: "ACTIVE" };
      staff = { staffRole: target.staffRole, status: "ACTIVE" };
      break;
    case "MARK_LEFT":
      if (!(
        (target.membershipStatus === "ACTIVE" && target.staffStatus === "ACTIVE") ||
        (target.membershipStatus === "INACTIVE" && target.staffStatus === "INACTIVE")
      )) throw new ProClubStaffManagementTransitionError("INVALID_TRANSITION");
      membership = { authorizationRole: target.authorizationRole, status: "LEFT" };
      staff = { staffRole: target.staffRole, status: "LEFT" };
      break;
  }

  if (membership.authorizationRole !== target.authorizationRole) {
    throw new ProClubStaffManagementTransitionError("INVALID_TRANSITION");
  }

  return { membership, staff, history: history(actor, target, action, membership, staff) };
}
