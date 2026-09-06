import assert from "node:assert/strict";
import test from "node:test";
import {
  planProClubStaffManagementTransitionV1 as planClient,
  ProClubStaffManagementTransitionError as ClientTransitionError,
} from "../src/lib/proClubStaffManagementTransition.ts";
import {
  planProClubStaffManagementTransitionV1 as planServer,
  ProClubStaffManagementTransitionError as ServerTransitionError,
} from "../functions/src/proClubStaffManagement/transition.ts";

const owner = {
  clubId: "club-1",
  actorUid: "owner-1",
  authorizationRole: "OWNER" as const,
  membershipStatus: "ACTIVE" as const,
};

const admin = {
  clubId: "club-1",
  actorUid: "admin-1",
  authorizationRole: "ADMIN" as const,
  membershipStatus: "ACTIVE" as const,
};

const activeMember = {
  clubId: "club-1",
  userId: "staff-1",
  authorizationRole: "MEMBER" as const,
  membershipStatus: "ACTIVE" as const,
  staffRole: "ASSISTANT_COACH" as const,
  staffStatus: "ACTIVE" as const,
};

const inactiveMember = {
  ...activeMember,
  membershipStatus: "INACTIVE" as const,
  staffStatus: "INACTIVE" as const,
};

function capture(fn: () => unknown) {
  try {
    return { ok: true as const, value: fn() };
  } catch (error) {
    const code =
      error instanceof ClientTransitionError || error instanceof ServerTransitionError
        ? error.code
        : "UNKNOWN";
    return { ok: false as const, code };
  }
}

const scenarios = [
  { name: "owner role change", actor: owner, target: activeMember, action: { type: "CHANGE_ROLE" as const, staffRole: "HEAD_COACH" as const } },
  { name: "admin member role change", actor: admin, target: activeMember, action: { type: "CHANGE_ROLE" as const, staffRole: "ANALYST" as const } },
  { name: "deactivate", actor: owner, target: activeMember, action: { type: "DEACTIVATE" as const } },
  { name: "reactivate", actor: owner, target: inactiveMember, action: { type: "REACTIVATE" as const } },
  { name: "mark left active", actor: owner, target: activeMember, action: { type: "MARK_LEFT" as const } },
  { name: "mark left inactive", actor: owner, target: inactiveMember, action: { type: "MARK_LEFT" as const } },
  { name: "same role no change", actor: owner, target: activeMember, action: { type: "CHANGE_ROLE" as const, staffRole: "ASSISTANT_COACH" as const } },
  { name: "admin cannot manage admin", actor: admin, target: { ...activeMember, userId: "admin-2", authorizationRole: "ADMIN" as const }, action: { type: "DEACTIVATE" as const } },
  { name: "owner protected", actor: owner, target: { ...activeMember, userId: "owner-2", authorizationRole: "OWNER" as const }, action: { type: "DEACTIVATE" as const } },
  { name: "self management blocked", actor: owner, target: { ...activeMember, userId: "owner-1" }, action: { type: "DEACTIVATE" as const } },
  { name: "mismatched state blocked", actor: owner, target: { ...activeMember, staffStatus: "INACTIVE" as const }, action: { type: "DEACTIVATE" as const } },
] as const;

for (const scenario of scenarios) {
  test(`client/server transition parity: ${scenario.name}`, () => {
    const client = capture(() => planClient(scenario.actor, scenario.target, scenario.action));
    const server = capture(() => planServer(scenario.actor, scenario.target, scenario.action));
    assert.deepEqual(server, client);
  });
}
