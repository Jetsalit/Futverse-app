import assert from "node:assert/strict";
import test from "node:test";
import type { ProClubAuthorizationRole, ProClubStaffRole } from "../src/types/ProClub";
import { staffRoleLabels } from "../src/lib/proClubOnboarding";
import { PRO_CLUB_STAFF_ROLE_OPTIONS } from "../src/lib/proClubStaffManagementUi";
import { planProClubStaffManagementTransitionV1 } from "../src/lib/proClubStaffManagementTransition";
import {
  isProClubCoachPositionV1,
  PRO_CLUB_COACH_POSITION_OPTIONS_V1,
  PRO_CLUB_STAFF_ROLE_OPTION_GROUPS_V1,
  PRO_CLUB_STAFF_ROLE_OPTIONS_V1,
  PRO_CLUB_SUPPORT_STAFF_ROLE_OPTIONS_V1,
  PRO_CLUB_TECHNICAL_LEADERSHIP_ROLE_OPTIONS_V1,
} from "../src/lib/proClubCoachPositionV1";

const ALL_STAFF_ROLES: readonly ProClubStaffRole[] = [
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
];

test("Coach Position V1 contains exactly the four coaching positions", () => {
  assert.deepEqual(PRO_CLUB_COACH_POSITION_OPTIONS_V1, [
    "HEAD_COACH",
    "ASSISTANT_COACH",
    "GK_COACH",
    "FITNESS_COACH",
  ]);
});

test("manager and team manager are not Coach Position V1 values", () => {
  assert.equal(isProClubCoachPositionV1("MANAGER"), false);
  assert.equal(isProClubCoachPositionV1("TEAM_MANAGER"), false);
});

test("Coach Position V1 is separate from authorization roles", () => {
  const authorizationRoles: readonly ProClubAuthorizationRole[] = ["OWNER", "ADMIN", "MEMBER"];
  for (const role of authorizationRoles) {
    assert.equal(isProClubCoachPositionV1(role), false);
  }
});

test("staff role option groups cover every canonical staff role exactly once", () => {
  const grouped = PRO_CLUB_STAFF_ROLE_OPTION_GROUPS_V1.flatMap((group) => [...group.roles]);
  assert.deepEqual(grouped, ALL_STAFF_ROLES);
  assert.equal(new Set(grouped).size, grouped.length);
});

test("canonical selector order is shared with Staff Management UI and onboarding labels", () => {
  assert.deepEqual(PRO_CLUB_STAFF_ROLE_OPTIONS_V1, [
    ...PRO_CLUB_TECHNICAL_LEADERSHIP_ROLE_OPTIONS_V1,
    ...PRO_CLUB_COACH_POSITION_OPTIONS_V1,
    ...PRO_CLUB_SUPPORT_STAFF_ROLE_OPTIONS_V1,
  ]);
  assert.deepEqual(PRO_CLUB_STAFF_ROLE_OPTIONS, PRO_CLUB_STAFF_ROLE_OPTIONS_V1);
  assert.deepEqual(Object.keys(staffRoleLabels), PRO_CLUB_STAFF_ROLE_OPTIONS_V1);
});

test("changing into each Coach Position preserves MEMBER authorization and records history", () => {
  for (const staffRole of PRO_CLUB_COACH_POSITION_OPTIONS_V1) {
    const plan = planProClubStaffManagementTransitionV1(
      {
        clubId: "club-1",
        actorUid: "owner-1",
        authorizationRole: "OWNER",
        membershipStatus: "ACTIVE",
      },
      {
        clubId: "club-1",
        userId: "coach-1",
        authorizationRole: "MEMBER",
        membershipStatus: "ACTIVE",
        staffRole: "STAFF",
        staffStatus: "ACTIVE",
      },
      { type: "CHANGE_ROLE", staffRole },
    );

    assert.equal(plan.membership.authorizationRole, "MEMBER");
    assert.equal(plan.staff.staffRole, staffRole);
    assert.equal(plan.history.previousAuthorizationRole, "MEMBER");
    assert.equal(plan.history.nextAuthorizationRole, "MEMBER");
    assert.equal(plan.history.previousStaffRole, "STAFF");
    assert.equal(plan.history.nextStaffRole, staffRole);
  }
});
