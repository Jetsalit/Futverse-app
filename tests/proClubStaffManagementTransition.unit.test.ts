import assert from "node:assert/strict";
import test from "node:test";
import {
  planProClubStaffManagementTransitionV1,
  ProClubStaffManagementTransitionError,
} from "../src/lib/proClubStaffManagementTransition.ts";

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

const memberTarget = {
  clubId: "club-1",
  userId: "staff-1",
  authorizationRole: "MEMBER" as const,
  membershipStatus: "ACTIVE" as const,
  staffRole: "ASSISTANT_COACH" as const,
  staffStatus: "ACTIVE" as const,
};

function errorCode(expected: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ProClubStaffManagementTransitionError);
    assert.equal(error.code, expected);
    return true;
  };
}

test("1. owner can change an active member functional role without changing authorization", () => {
  const plan = planProClubStaffManagementTransitionV1(owner, memberTarget, {
    type: "CHANGE_ROLE",
    staffRole: "HEAD_COACH",
  });
  assert.deepEqual(plan.membership, { authorizationRole: "MEMBER", status: "ACTIVE" });
  assert.deepEqual(plan.staff, { staffRole: "HEAD_COACH", status: "ACTIVE" });
  assert.equal(plan.history.previousAuthorizationRole, "MEMBER");
  assert.equal(plan.history.nextAuthorizationRole, "MEMBER");
});

test("2. active admin can manage a member functional role", () => {
  const plan = planProClubStaffManagementTransitionV1(admin, memberTarget, {
    type: "CHANGE_ROLE",
    staffRole: "ANALYST",
  });
  assert.equal(plan.staff.staffRole, "ANALYST");
});

test("3. admin cannot manage another ADMIN target", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1(admin, {
      ...memberTarget,
      userId: "admin-2",
      authorizationRole: "ADMIN",
    }, { type: "DEACTIVATE" }),
    errorCode("OWNER_ACTION_REQUIRED"),
  );
});

test("4. owner can manage ADMIN functional role while preserving ADMIN authority", () => {
  const plan = planProClubStaffManagementTransitionV1(owner, {
    ...memberTarget,
    userId: "admin-2",
    authorizationRole: "ADMIN",
  }, { type: "CHANGE_ROLE", staffRole: "MANAGER" });
  assert.equal(plan.membership.authorizationRole, "ADMIN");
  assert.equal(plan.staff.staffRole, "MANAGER");
});

test("5. OWNER target is protected from Staff Management V1", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1(owner, {
      ...memberTarget,
      userId: "owner-2",
      authorizationRole: "OWNER",
    }, { type: "CHANGE_ROLE", staffRole: "MANAGER" }),
    errorCode("OWNER_TARGET_PROTECTED"),
  );
});

test("6. self-management is blocked", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1(owner, {
      ...memberTarget,
      userId: "owner-1",
    }, { type: "DEACTIVATE" }),
    errorCode("SELF_MANAGEMENT_BLOCKED"),
  );
});

test("7. deactivate atomically plans membership and staff INACTIVE", () => {
  const plan = planProClubStaffManagementTransitionV1(owner, memberTarget, {
    type: "DEACTIVATE",
  });
  assert.deepEqual(plan.membership, { authorizationRole: "MEMBER", status: "INACTIVE" });
  assert.deepEqual(plan.staff, { staffRole: "ASSISTANT_COACH", status: "INACTIVE" });
  assert.equal(plan.history.previousMembershipStatus, "ACTIVE");
  assert.equal(plan.history.nextMembershipStatus, "INACTIVE");
  assert.equal(plan.history.nextStaffStatus, "INACTIVE");
});

test("8. reactivate requires both canonical states INACTIVE and returns both ACTIVE", () => {
  const plan = planProClubStaffManagementTransitionV1(owner, {
    ...memberTarget,
    membershipStatus: "INACTIVE",
    staffStatus: "INACTIVE",
  }, { type: "REACTIVATE" });
  assert.equal(plan.membership.status, "ACTIVE");
  assert.equal(plan.staff.status, "ACTIVE");
});

test("9. mark-left is terminal output from aligned ACTIVE state", () => {
  const plan = planProClubStaffManagementTransitionV1(owner, memberTarget, {
    type: "MARK_LEFT",
  });
  assert.equal(plan.membership.status, "LEFT");
  assert.equal(plan.staff.status, "LEFT");
  assert.equal(plan.history.action, "MARK_LEFT");
});

test("10. terminal LEFT state cannot transition again", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1(owner, {
      ...memberTarget,
      membershipStatus: "LEFT",
      staffStatus: "LEFT",
    }, { type: "REACTIVATE" }),
    errorCode("INVALID_TRANSITION"),
  );
});

test("11. same functional role is rejected as NO_CHANGE", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1(owner, memberTarget, {
      type: "CHANGE_ROLE",
      staffRole: "ASSISTANT_COACH",
    }),
    errorCode("NO_CHANGE"),
  );
});

test("12. mismatched membership/staff states fail closed", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1(owner, {
      ...memberTarget,
      staffStatus: "INACTIVE",
    }, { type: "DEACTIVATE" }),
    errorCode("INVALID_TRANSITION"),
  );
});

test("13. inactive reviewer cannot manage staff", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1({
      ...owner,
      membershipStatus: "INACTIVE",
    }, memberTarget, { type: "DEACTIVATE" }),
    errorCode("REVIEWER_REQUIRED"),
  );
});

test("14. cross-club target is rejected", () => {
  assert.throws(
    () => planProClubStaffManagementTransitionV1(owner, {
      ...memberTarget,
      clubId: "club-2",
    }, { type: "DEACTIVATE" }),
    errorCode("INVALID_INPUT"),
  );
});

test("15. history draft is privacy-minimal and contains no identity/contact fields", () => {
  const plan = planProClubStaffManagementTransitionV1(owner, memberTarget, {
    type: "CHANGE_ROLE",
    staffRole: "FITNESS_COACH",
  });
  assert.deepEqual(Object.keys(plan.history).sort(), [
    "action",
    "changedBy",
    "clubId",
    "nextAuthorizationRole",
    "nextMembershipStatus",
    "nextStaffRole",
    "nextStaffStatus",
    "previousAuthorizationRole",
    "previousMembershipStatus",
    "previousStaffRole",
    "previousStaffStatus",
    "schemaVersion",
    "userId",
  ].sort());
  const serialized = JSON.stringify(plan.history);
  assert.equal(serialized.includes("email"), false);
  assert.equal(serialized.includes("phone"), false);
  assert.equal(serialized.includes("displayName"), false);
});
