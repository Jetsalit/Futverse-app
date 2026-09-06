import assert from "node:assert/strict";
import test from "node:test";
import { getProClubStaffManagementUiPolicyV1 } from "../src/lib/proClubStaffManagementUi.ts";

const entry = {
  schemaVersion: 1 as const,
  clubId: "club-1",
  userId: "staff-1",
  displayName: "Coach One",
  authorizationRole: "MEMBER" as const,
  membershipStatus: "ACTIVE" as const,
  staffRole: "HEAD_COACH" as const,
  staffStatus: "ACTIVE" as const,
};

test("owner can manage active MEMBER staff", () => {
  const policy = getProClubStaffManagementUiPolicyV1({ actorRole: "OWNER", actorUid: "owner-1", entry });
  assert.equal(policy.canManage, true);
  assert.equal(policy.canChangeRole, true);
  assert.equal(policy.canDeactivate, true);
  assert.equal(policy.canMarkLeft, true);
  assert.equal(policy.canReactivate, false);
});

test("admin can manage active MEMBER staff", () => {
  const policy = getProClubStaffManagementUiPolicyV1({ actorRole: "ADMIN", actorUid: "admin-1", entry });
  assert.equal(policy.canManage, true);
});

test("admin cannot manage ADMIN target", () => {
  const policy = getProClubStaffManagementUiPolicyV1({
    actorRole: "ADMIN",
    actorUid: "admin-1",
    entry: { ...entry, userId: "admin-2", authorizationRole: "ADMIN" },
  });
  assert.equal(policy.canManage, false);
  assert.equal(policy.reason, "OWNER_REQUIRED_FOR_ADMIN");
});

test("owner can manage ADMIN target", () => {
  const policy = getProClubStaffManagementUiPolicyV1({
    actorRole: "OWNER",
    actorUid: "owner-1",
    entry: { ...entry, userId: "admin-2", authorizationRole: "ADMIN" },
  });
  assert.equal(policy.canManage, true);
});

test("OWNER target remains protected", () => {
  const policy = getProClubStaffManagementUiPolicyV1({
    actorRole: "OWNER",
    actorUid: "owner-1",
    entry: { ...entry, userId: "owner-2", authorizationRole: "OWNER" },
  });
  assert.equal(policy.canManage, false);
  assert.equal(policy.reason, "OWNER_TARGET_PROTECTED");
});

test("self-management remains blocked", () => {
  const policy = getProClubStaffManagementUiPolicyV1({
    actorRole: "OWNER",
    actorUid: "staff-1",
    entry,
  });
  assert.equal(policy.canManage, false);
  assert.equal(policy.reason, "SELF_MANAGEMENT_BLOCKED");
});

test("non-active target cannot be managed from active-only roster UI", () => {
  const policy = getProClubStaffManagementUiPolicyV1({
    actorRole: "OWNER",
    actorUid: "owner-1",
    entry: { ...entry, membershipStatus: "INACTIVE", staffStatus: "INACTIVE" },
  });
  assert.equal(policy.canManage, false);
  assert.equal(policy.canReactivate, false);
  assert.equal(policy.reason, "ACTIVE_TARGET_REQUIRED");
});
