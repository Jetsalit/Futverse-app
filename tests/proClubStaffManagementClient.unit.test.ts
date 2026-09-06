import assert from "node:assert/strict";
import test from "node:test";
import {
  ProClubStaffManagementClientError,
  createProClubStaffManagementRepository,
  parseProClubStaffManagementResponseV1,
} from "../src/lib/proClubStaffManagementRepository.ts";

const changeRole = { type: "CHANGE_ROLE", staffRole: "HEAD_COACH" } as const;

test("1. parses exact CHANGE_ROLE success response", () => {
  const result = parseProClubStaffManagementResponseV1({
    ok: true,
    action: "CHANGE_ROLE",
    staffRole: "HEAD_COACH",
    membershipStatus: "ACTIVE",
    staffStatus: "ACTIVE",
  }, changeRole);
  assert.equal(result.staffRole, "HEAD_COACH");
});

test("2. rejects action/result mismatch and unexpected fields", () => {
  assert.throws(() => parseProClubStaffManagementResponseV1({
    ok: true,
    action: "DEACTIVATE",
    staffRole: "HEAD_COACH",
    membershipStatus: "INACTIVE",
    staffStatus: "INACTIVE",
  }, changeRole), ProClubStaffManagementClientError);

  assert.throws(() => parseProClubStaffManagementResponseV1({
    ok: true,
    action: "CHANGE_ROLE",
    staffRole: "HEAD_COACH",
    membershipStatus: "ACTIVE",
    staffStatus: "ACTIVE",
    changedBy: "owner-1",
  }, changeRole), ProClubStaffManagementClientError);
});

test("3. validates state semantics for DEACTIVATE, REACTIVATE and MARK_LEFT", () => {
  assert.equal(parseProClubStaffManagementResponseV1({
    ok: true, action: "DEACTIVATE", staffRole: "ANALYST",
    membershipStatus: "INACTIVE", staffStatus: "INACTIVE",
  }, { type: "DEACTIVATE" }).membershipStatus, "INACTIVE");

  assert.equal(parseProClubStaffManagementResponseV1({
    ok: true, action: "REACTIVATE", staffRole: "ANALYST",
    membershipStatus: "ACTIVE", staffStatus: "ACTIVE",
  }, { type: "REACTIVATE" }).staffStatus, "ACTIVE");

  assert.equal(parseProClubStaffManagementResponseV1({
    ok: true, action: "MARK_LEFT", staffRole: "ANALYST",
    membershipStatus: "LEFT", staffStatus: "LEFT",
  }, { type: "MARK_LEFT" }).membershipStatus, "LEFT");

  assert.throws(() => parseProClubStaffManagementResponseV1({
    ok: true, action: "DEACTIVATE", staffRole: "ANALYST",
    membershipStatus: "ACTIVE", staffStatus: "INACTIVE",
  }, { type: "DEACTIVATE" }), ProClubStaffManagementClientError);
});

test("4. repository never sends requester UID and revalidates auth after success", async () => {
  let actor = "owner-1";
  let captured: unknown;
  const repository = createProClubStaffManagementRepository(
    () => actor,
    async (data) => {
      captured = data;
      return { data: {
        ok: true,
        action: "CHANGE_ROLE",
        staffRole: "HEAD_COACH",
        membershipStatus: "ACTIVE",
        staffStatus: "ACTIVE",
      } };
    },
  );

  const result = await repository.manageStaff({
    clubId: "club-1",
    targetUid: "staff-1",
    action: changeRole,
  }, "owner-1");

  assert.equal(result.staffRole, "HEAD_COACH");
  assert.deepEqual(captured, {
    clubId: "club-1",
    targetUid: "staff-1",
    action: changeRole,
  });
  assert.equal(JSON.stringify(captured).includes("requesterUid"), false);

  actor = "other-user";
  await assert.rejects(() => repository.manageStaff({
    clubId: "club-1",
    targetUid: "staff-1",
    action: { type: "DEACTIVATE" },
  }, "owner-1"), (error: unknown) => {
    assert.equal((error as ProClubStaffManagementClientError).code, "AUTH_CHANGED");
    return true;
  });
});

test("5. self-management is blocked client-side before callable", async () => {
  let called = false;
  const repository = createProClubStaffManagementRepository(
    () => "owner-1",
    async () => { called = true; return { data: {} }; },
  );

  await assert.rejects(() => repository.manageStaff({
    clubId: "club-1",
    targetUid: "owner-1",
    action: { type: "DEACTIVATE" },
  }, "owner-1"), (error: unknown) => {
    assert.equal((error as ProClubStaffManagementClientError).code, "SELF_MANAGEMENT_BLOCKED");
    return true;
  });
  assert.equal(called, false);
});

test("6. malformed identifiers and malformed actions are blocked before callable", async () => {
  let calls = 0;
  const repository = createProClubStaffManagementRepository(
    () => "owner-1",
    async () => { calls += 1; return { data: {} }; },
  );

  for (const request of [
    { clubId: " club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
    { clubId: "club-1", targetUid: "staff/1", action: { type: "DEACTIVATE" } },
    { clubId: "club-1", targetUid: "staff-1", action: { type: "CHANGE_ROLE", staffRole: "OWNER" } },
  ] as any[]) {
    await assert.rejects(() => repository.manageStaff(request, "owner-1"), (error: unknown) => {
      assert.equal((error as ProClubStaffManagementClientError).code, "INVALID_DATA");
      return true;
    });
  }
  assert.equal(calls, 0);
});

test("7. maps privileged callable errors without raw backend leakage", async () => {
  const cases = [
    ["functions/permission-denied", "REVIEWER_REQUIRED"],
    ["functions/not-found", "TARGET_UNAVAILABLE"],
    ["functions/aborted", "CONFLICT"],
    ["functions/resource-exhausted", "RATE_LIMITED"],
    ["functions/invalid-argument", "INVALID_DATA"],
    ["functions/failed-precondition", "UNAVAILABLE"],
  ] as const;

  for (const [functionCode, expectedCode] of cases) {
    const repository = createProClubStaffManagementRepository(
      () => "owner-1",
      async () => {
        throw Object.assign(new Error("Sensitive backend detail target=secret"), { code: functionCode });
      },
    );
    await assert.rejects(() => repository.manageStaff({
      clubId: "club-1",
      targetUid: "staff-1",
      action: { type: "DEACTIVATE" },
    }, "owner-1"), (error: unknown) => {
      assert.equal((error as ProClubStaffManagementClientError).code, expectedCode);
      assert.equal(JSON.stringify(error).includes("Sensitive backend detail"), false);
      return true;
    });
  }
});

test("8. auth change after callable rejection wins over backend error", async () => {
  let actor = "owner-1";
  const repository = createProClubStaffManagementRepository(
    () => actor,
    async () => {
      actor = "other-user";
      throw Object.assign(new Error("backend conflict"), { code: "functions/aborted" });
    },
  );

  await assert.rejects(() => repository.manageStaff({
    clubId: "club-1",
    targetUid: "staff-1",
    action: { type: "DEACTIVATE" },
  }, "owner-1"), (error: unknown) => {
    assert.equal((error as ProClubStaffManagementClientError).code, "AUTH_CHANGED");
    return true;
  });
});
