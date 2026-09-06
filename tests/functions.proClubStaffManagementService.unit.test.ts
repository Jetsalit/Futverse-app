import assert from "node:assert/strict";
import test from "node:test";
import {
  createProClubStaffManagementServiceV1,
  ProClubStaffManagementServiceError,
  type ProClubStaffManagementSourceV1,
} from "../functions/src/proClubStaffManagement/service.ts";

function createSource(options: {
  clubStatus?: "ACTIVE" | "INACTIVE";
  actorRole?: "OWNER" | "ADMIN" | "MEMBER";
  actorStatus?: "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED";
  targetRole?: "OWNER" | "ADMIN" | "MEMBER";
  targetMembershipStatus?: "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED";
  targetStaffRole?: "ASSISTANT_COACH" | "HEAD_COACH" | "MANAGER" | "ANALYST";
  targetStaffStatus?: "ACTIVE" | "INACTIVE" | "LEFT";
  missingClub?: boolean;
  missingActor?: boolean;
  missingTargetMembership?: boolean;
  missingTargetStaff?: boolean;
} = {}) {
  let applyCalls = 0;
  let lastApply: any = null;
  const source: ProClubStaffManagementSourceV1 = {
    async readClub() {
      if (options.missingClub) return null;
      return { status: options.clubStatus ?? "ACTIVE" };
    },
    async readMembership(_clubId, uid) {
      if (uid === "owner-1" || uid === "admin-1" || uid === "member-actor") {
        if (options.missingActor) return null;
        return {
          authorizationRole:
            options.actorRole ?? (uid === "owner-1" ? "OWNER" : uid === "admin-1" ? "ADMIN" : "MEMBER"),
          status: options.actorStatus ?? "ACTIVE",
        };
      }
      if (options.missingTargetMembership) return null;
      return {
        authorizationRole: options.targetRole ?? "MEMBER",
        status: options.targetMembershipStatus ?? "ACTIVE",
      };
    },
    async readStaffAssignment() {
      if (options.missingTargetStaff) return null;
      return {
        staffRole: options.targetStaffRole ?? "ASSISTANT_COACH",
        status: options.targetStaffStatus ?? "ACTIVE",
      };
    },
    async applyAtomicPlan(input) {
      applyCalls += 1;
      lastApply = input;
    },
  };
  return { source, getApplyCalls: () => applyCalls, getLastApply: () => lastApply };
}

function expectCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ProClubStaffManagementServiceError);
    assert.equal(error.code, code);
    return true;
  };
}

test("1. OWNER role change re-reads canonical state and applies one atomic plan", async () => {
  const fixture = createSource();
  const service = createProClubStaffManagementServiceV1(fixture.source);
  const plan = await service.manageStaff({
    requesterUid: "owner-1",
    requestBody: {
      clubId: "club-1",
      targetUid: "staff-1",
      action: { type: "CHANGE_ROLE", staffRole: "HEAD_COACH" },
    },
  });
  assert.equal(plan.membership.authorizationRole, "MEMBER");
  assert.equal(plan.staff.staffRole, "HEAD_COACH");
  assert.equal(fixture.getApplyCalls(), 1);
  assert.equal(fixture.getLastApply().requesterUid, "owner-1");
});

test("2. caller cannot provide actor identity in request body", async () => {
  const fixture = createSource();
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "owner-1",
      requestBody: {
        clubId: "club-1",
        targetUid: "staff-1",
        requesterUid: "spoofed-owner",
        action: { type: "DEACTIVATE" },
      },
    }),
    expectCode("INVALID_REQUEST"),
  );
  assert.equal(fixture.getApplyCalls(), 0);
});

test("3. unauthenticated requester is rejected before reads", async () => {
  const fixture = createSource();
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "",
      requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
    }),
    expectCode("UNAUTHORIZED"),
  );
  assert.equal(fixture.getApplyCalls(), 0);
});

test("4. inactive club is denied before target mutation", async () => {
  const fixture = createSource({ clubStatus: "INACTIVE" });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "owner-1",
      requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
    }),
    expectCode("FORBIDDEN"),
  );
  assert.equal(fixture.getApplyCalls(), 0);
});

test("5. missing actor membership is denied", async () => {
  const fixture = createSource({ missingActor: true });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "owner-1",
      requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
    }),
    expectCode("FORBIDDEN"),
  );
});

test("6. MEMBER requester remains denied by canonical transition authority", async () => {
  const fixture = createSource({ actorRole: "MEMBER" });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "member-actor",
      requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
    }),
    expectCode("FORBIDDEN"),
  );
  assert.equal(fixture.getApplyCalls(), 0);
});

test("7. ADMIN cannot manage ADMIN target", async () => {
  const fixture = createSource({ targetRole: "ADMIN" });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "admin-1",
      requestBody: { clubId: "club-1", targetUid: "admin-2", action: { type: "DEACTIVATE" } },
    }),
    expectCode("FORBIDDEN"),
  );
});

test("8. OWNER target remains protected", async () => {
  const fixture = createSource({ targetRole: "OWNER" });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "owner-1",
      requestBody: { clubId: "club-1", targetUid: "owner-2", action: { type: "CHANGE_ROLE", staffRole: "MANAGER" } },
    }),
    expectCode("FORBIDDEN"),
  );
});

test("9. missing target canonical document is NOT_FOUND and no apply occurs", async () => {
  const fixture = createSource({ missingTargetStaff: true });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "owner-1",
      requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
    }),
    expectCode("NOT_FOUND"),
  );
  assert.equal(fixture.getApplyCalls(), 0);
});

test("10. mismatched canonical state becomes CONFLICT", async () => {
  const fixture = createSource({ targetStaffStatus: "INACTIVE" });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "owner-1",
      requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
    }),
    expectCode("CONFLICT"),
  );
  assert.equal(fixture.getApplyCalls(), 0);
});

test("11. DEACTIVATE plan changes membership and staff together", async () => {
  const fixture = createSource();
  const service = createProClubStaffManagementServiceV1(fixture.source);
  const plan = await service.manageStaff({
    requesterUid: "owner-1",
    requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "DEACTIVATE" } },
  });
  assert.equal(plan.membership.status, "INACTIVE");
  assert.equal(plan.staff.status, "INACTIVE");
  assert.equal(plan.history.nextMembershipStatus, "INACTIVE");
  assert.equal(plan.history.nextStaffStatus, "INACTIVE");
});

test("12. REACTIVATE only succeeds from aligned INACTIVE state", async () => {
  const fixture = createSource({ targetMembershipStatus: "INACTIVE", targetStaffStatus: "INACTIVE" });
  const service = createProClubStaffManagementServiceV1(fixture.source);
  const plan = await service.manageStaff({
    requesterUid: "owner-1",
    requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "REACTIVATE" } },
  });
  assert.equal(plan.membership.status, "ACTIVE");
  assert.equal(plan.staff.status, "ACTIVE");
});

test("13. MARK_LEFT produces terminal pair and append-only history draft", async () => {
  const fixture = createSource();
  const service = createProClubStaffManagementServiceV1(fixture.source);
  const plan = await service.manageStaff({
    requesterUid: "owner-1",
    requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "MARK_LEFT" } },
  });
  assert.equal(plan.membership.status, "LEFT");
  assert.equal(plan.staff.status, "LEFT");
  assert.equal(plan.history.action, "MARK_LEFT");
  assert.equal(plan.history.changedBy, "owner-1");
});

test("14. malformed CHANGE_ROLE action is rejected before apply", async () => {
  const fixture = createSource();
  const service = createProClubStaffManagementServiceV1(fixture.source);
  await assert.rejects(
    () => service.manageStaff({
      requesterUid: "owner-1",
      requestBody: { clubId: "club-1", targetUid: "staff-1", action: { type: "CHANGE_ROLE" } },
    }),
    expectCode("INVALID_REQUEST"),
  );
  assert.equal(fixture.getApplyCalls(), 0);
});
