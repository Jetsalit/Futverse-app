import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluateBootstrapPlan, DocumentSnapshot, BootstrapActor } from "../src/services/bootstrapLegacyAdminCore.js"; // or .ts if your runner supports it directly without ext

function mockTimestamp() {
  return "SERVER_TIMESTAMP";
}

const SUPERADMIN_UID = "superadmin-123";
const TARGET_ACADEMY = "BaBH6XFlcSgpYTbDLhmbBshp2rm1";
const TARGET_UID = "BaBH6XFlcSgpYTbDLhmbBshp2rm1";
const INVITE_CODE = "FUT-TDIZ";
const CONFIRM_TEXT = "BOOTSTRAP_TALUMBALL_MAX_ADMIN";

const mockActor = (data: Partial<BootstrapActor> = {}): BootstrapActor => ({
  uid: SUPERADMIN_UID,
  role: "SUPERADMIN",
  confirmation: CONFIRM_TEXT,
  ...data
});

const mockAcademy = (data: any = {}, id = TARGET_ACADEMY): DocumentSnapshot => ({
  exists: true,
  id,
  data: { name: "Talumball Academy", inviteCode: INVITE_CODE, ...data }
});

const mockUser = (data: any = {}, id = TARGET_UID): DocumentSnapshot => ({
  exists: true,
  id,
  data: { uid: TARGET_UID, role: "ADMIN", status: "Active", ...data }
});

const mockEmpty = (id = "some-id"): DocumentSnapshot => ({ exists: false, id });

describe("BootstrapLegacyAdmin Pure Module", () => {
  it("1. Non-SUPERADMIN is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor({ role: "ADMIN" }), mockAcademy(), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /UNAUTHORIZED: SUPERADMIN role required/);
  });

  it("2. Wrong confirmation is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor({ confirmation: "WRONG" }), mockAcademy(), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /Confirmation code mismatch/);
  });

  it("3. Actor UID missing is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor({ uid: "" }), mockAcademy(), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /Actor UID is missing/);
  });

  it("4. Academy missing is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor(), mockEmpty(TARGET_ACADEMY), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /Academy .* does not exist/);
  });

  it("5. Academy ID mismatch is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor(), mockAcademy({}, "WRONG_ID"), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /Academy document ID mismatch/);
  });

  it("6. Academy name mismatch is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor(), mockAcademy({ name: "Wrong Name" }), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /Academy name mismatch/);
  });

  it("7. Academy inviteCode missing or mismatch is rejected", () => {
    let res = evaluateBootstrapPlan(mockActor(), mockAcademy({ inviteCode: "" }), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /Academy inviteCode missing/);

    res = evaluateBootstrapPlan(mockActor(), mockAcademy({ inviteCode: "WRONG" }), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /Academy inviteCode mismatch/);
  });

  it("8. User missing is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockEmpty(TARGET_UID), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /User .* does not exist/);
  });

  it("9. User ID mismatch is rejected", () => {
    const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser({}, "WRONG_ID"), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /User document ID mismatch/);
  });

  it("10. User uid inside doc missing or mismatch is rejected", () => {
    let res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser({ uid: "" }), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /User data.uid missing/);

    res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser({ uid: "WRONG" }), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "REJECTED");
    assert.match((res as any).reason, /User data.uid mismatch/);
  });

  it("11. User role USER/PLAYER/COACH/inactive is rejected", () => {
    const roles = ["USER", "PLAYER", "COACH"];
    for (const r of roles) {
      const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser({ role: r }), mockEmpty(), mockEmpty(), mockTimestamp);
      assert.strictEqual(res.status, "REJECTED", `Role ${r} should be rejected`);
      assert.match((res as any).reason, /User role mismatch/);
    }

    const res2 = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser({ status: "Inactive" }), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res2.status, "REJECTED");
    assert.match((res2 as any).reason, /User status mismatch/);
  });

  it("12. Membership conflicts are rejected", () => {
    const testCases = [
      { userId: "WRONG" },
      { academyId: "WRONG" },
      { role: "COACH" },
      { source: "APP" },
      { status: "INACTIVE" },
      { approvalClaimId: "123" }
    ];

    for (const mod of testCases) {
      const member = {
        exists: true,
        id: TARGET_UID,
        data: {
          userId: TARGET_UID,
          academyId: TARGET_ACADEMY,
          role: "ADMIN",
          source: "LEGACY_MIGRATION",
          status: "ACTIVE",
          ...mod
        }
      };
      const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser(), member, mockEmpty(), mockTimestamp);
      assert.strictEqual(res.status, "REJECTED");
      assert.match((res as any).reason, /Membership/);
    }
  });

  it("13. Invite conflicts are rejected", () => {
    const testCases = [
      { academyId: "WRONG" },
      { inviteCode: "WRONG" },
      { status: "INACTIVE" }
    ];

    for (const mod of testCases) {
      const invite = {
        exists: true,
        id: INVITE_CODE,
        data: { academyId: TARGET_ACADEMY, inviteCode: INVITE_CODE, status: "ACTIVE", ...mod }
      };
      const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser(), mockEmpty(), invite, mockTimestamp);
      assert.strictEqual(res.status, "REJECTED");
      assert.match((res as any).reason, /Invite/);
    }
  });

  it("14. Exact write plan for new state", () => {
    const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser(), mockEmpty(), mockEmpty(), mockTimestamp);
    assert.strictEqual(res.status, "SUCCESS");
    if (res.status !== "SUCCESS") return;

    assert.strictEqual(res.plan.length, 3);

    const memberWrite = res.plan.find(p => p.type === "SET_MEMBER");
    assert.ok(memberWrite);
    assert.deepStrictEqual(memberWrite.data, {
      userId: TARGET_UID,
      academyId: TARGET_ACADEMY,
      role: "ADMIN",
      status: "ACTIVE",
      source: "LEGACY_MIGRATION",
      joinedAt: "SERVER_TIMESTAMP",
      joinedBy: SUPERADMIN_UID,
      updatedAt: "SERVER_TIMESTAMP"
    });

    const userWrite = res.plan.find(p => p.type === "MERGE_USER");
    assert.ok(userWrite);
    assert.deepStrictEqual(userWrite.data, {
      activeAcademyId: TARGET_ACADEMY,
      academyId: TARGET_ACADEMY,
      tenantRole: "ADMIN",
      role: "ADMIN",
      status: "Active",
      updatedAt: "SERVER_TIMESTAMP"
    });

    const inviteWrite = res.plan.find(p => p.type === "SET_INVITE");
    assert.ok(inviteWrite);
    assert.deepStrictEqual(inviteWrite.data, {
      inviteCode: INVITE_CODE,
      academyId: TARGET_ACADEMY,
      status: "ACTIVE",
      createdAt: "SERVER_TIMESTAMP",
      createdBy: SUPERADMIN_UID,
      updatedAt: "SERVER_TIMESTAMP",
      updatedBy: SUPERADMIN_UID
    });
  });

  it("15. Partial Idempotency A, B, C", () => {
    const exactUser = mockUser({ activeAcademyId: TARGET_ACADEMY, academyId: TARGET_ACADEMY, tenantRole: "ADMIN", role: "ADMIN", status: "Active" });
    const exactMember = { exists: true, id: TARGET_UID, data: { userId: TARGET_UID, academyId: TARGET_ACADEMY, role: "ADMIN", source: "LEGACY_MIGRATION", status: "ACTIVE", joinedAt: "OLD_TIME", joinedBy: "OLD_USER", updatedAt: "OLD_UPDATED_AT" } };
    const exactInvite = { exists: true, id: INVITE_CODE, data: { inviteCode: INVITE_CODE, academyId: TARGET_ACADEMY, status: "ACTIVE", createdAt: "OLD_TIME", createdBy: "OLD_USER", updatedAt: "OLD_UPDATED_AT", updatedBy: "OLD_UPDATED_BY" } };

    // A: Missing User pointers -> MERGE_USER only
    const resA = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser(), exactMember, exactInvite, mockTimestamp);
    assert.strictEqual(resA.status, "SUCCESS");
    if (resA.status === "SUCCESS") {
      assert.strictEqual(resA.plan.length, 1);
      assert.strictEqual(resA.plan[0].type, "MERGE_USER");
    }

    // B: Missing Membership -> SET_MEMBER only
    const resB = evaluateBootstrapPlan(mockActor(), mockAcademy(), exactUser, mockEmpty(), exactInvite, mockTimestamp);
    assert.strictEqual(resB.status, "SUCCESS");
    if (resB.status === "SUCCESS") {
      assert.strictEqual(resB.plan.length, 1);
      assert.strictEqual(resB.plan[0].type, "SET_MEMBER");
    }

    // C: Missing Invite -> SET_INVITE only
    const resC = evaluateBootstrapPlan(mockActor(), mockAcademy(), exactUser, exactMember, mockEmpty(), mockTimestamp);
    assert.strictEqual(resC.status, "SUCCESS");
    if (resC.status === "SUCCESS") {
      assert.strictEqual(resC.plan.length, 1);
      assert.strictEqual(resC.plan[0].type, "SET_INVITE");
    }
  });

  it("16D. Existing correct Membership is preserved (No SET_MEMBER produced)", () => {
    const exactUser = mockUser({ role: "ADMIN", status: "Active" }); // Missing pointers
    const oldMemberData = { userId: TARGET_UID, academyId: TARGET_ACADEMY, role: "ADMIN", source: "LEGACY_MIGRATION", status: "ACTIVE", joinedAt: "OLD_JOINED_AT", joinedBy: "OLD_JOINED_BY", updatedAt: "OLD_MEMBER_UPDATED_AT" };
    const oldMember = { exists: true, id: TARGET_UID, data: oldMemberData };

    const exactInvite = { exists: true, id: INVITE_CODE, data: { inviteCode: INVITE_CODE, academyId: TARGET_ACADEMY, status: "ACTIVE", createdAt: "OLD_CREATED_AT", createdBy: "OLD_CREATED_BY", updatedAt: "OLD_INVITE_UPDATED_AT", updatedBy: "OLD_UPDATED_BY" } };

    const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), exactUser, oldMember, exactInvite, mockTimestamp);
    assert.strictEqual(res.status, "SUCCESS");
    if (res.status === "SUCCESS") {
      assert.strictEqual(res.plan.length, 1);
      assert.strictEqual(res.plan[0].type, "MERGE_USER");

      const memberWrite = res.plan.find(p => p.type === "SET_MEMBER");
      assert.strictEqual(memberWrite, undefined, "There must be NO SET_MEMBER action.");

      assert.strictEqual(oldMember.data.joinedAt, "OLD_JOINED_AT");
      assert.strictEqual(oldMember.data.joinedBy, "OLD_JOINED_BY");
    }
  });

  it("16E. Existing correct Invite is preserved (No SET_INVITE produced)", () => {
    const exactUser = mockUser({ activeAcademyId: TARGET_ACADEMY, academyId: TARGET_ACADEMY, tenantRole: "ADMIN", role: "ADMIN", status: "Active" });
    const oldInviteData = { inviteCode: INVITE_CODE, academyId: TARGET_ACADEMY, status: "ACTIVE", createdAt: "OLD_CREATED_AT", createdBy: "OLD_CREATED_BY", updatedAt: "OLD_INVITE_UPDATED_AT", updatedBy: "OLD_UPDATED_BY" };
    const oldInvite = { exists: true, id: INVITE_CODE, data: oldInviteData };

    const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), exactUser, mockEmpty(), oldInvite, mockTimestamp);
    assert.strictEqual(res.status, "SUCCESS");
    if (res.status === "SUCCESS") {
      assert.strictEqual(res.plan.length, 1);
      assert.strictEqual(res.plan[0].type, "SET_MEMBER");

      const inviteWrite = res.plan.find(p => p.type === "SET_INVITE");
      assert.strictEqual(inviteWrite, undefined, "There must be NO SET_INVITE action.");

      assert.strictEqual(oldInvite.data.createdAt, "OLD_CREATED_AT");
      assert.strictEqual(oldInvite.data.createdBy, "OLD_CREATED_BY");
    }
  });

  it("16F. Malformed existing documents are rejected", () => {
    // Malformed Membership
    const malformedMember = { exists: true, id: TARGET_UID, data: { joinedAt: "OLD_JOINED_AT", joinedBy: "OLD_JOINED_BY" } };
    const res1 = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser(), malformedMember, mockEmpty(), mockTimestamp);
    assert.strictEqual(res1.status, "REJECTED");
    assert.match((res1 as any).reason, /Membership/);

    // Malformed Invite
    const malformedInvite = { exists: true, id: INVITE_CODE, data: { createdAt: "OLD_CREATED_AT", createdBy: "OLD_CREATED_BY" } };
    const res2 = evaluateBootstrapPlan(mockActor(), mockAcademy(), mockUser(), mockEmpty(), malformedInvite, mockTimestamp);
    assert.strictEqual(res2.status, "REJECTED");
    assert.match((res2 as any).reason, /Invite/);
  });

  it("17. Immutability of inputs", () => {
    const userIn = mockUser();
    const acaIn = mockAcademy();

    Object.freeze(userIn);
    Object.freeze(userIn.data);
    Object.freeze(acaIn);
    Object.freeze(acaIn.data);

    // If mutated, strict mode throws TypeError
    evaluateBootstrapPlan(mockActor(), acaIn, userIn, mockEmpty(), mockEmpty(), mockTimestamp);

    assert.ok(true, "Inputs were not mutated.");
  });

  it("18. Fully exact state returns ALREADY_BOOTSTRAPPED with zero writes", () => {
    const exactUser = mockUser({ activeAcademyId: TARGET_ACADEMY, academyId: TARGET_ACADEMY, tenantRole: "ADMIN", role: "ADMIN", status: "Active" });
    const exactMember = { exists: true, id: TARGET_UID, data: { userId: TARGET_UID, academyId: TARGET_ACADEMY, role: "ADMIN", source: "LEGACY_MIGRATION", status: "ACTIVE", joinedAt: "OLD_TIME", joinedBy: "OLD_USER", updatedAt: "OLD_UPDATED_AT" } };
    const exactInvite = { exists: true, id: INVITE_CODE, data: { inviteCode: INVITE_CODE, academyId: TARGET_ACADEMY, status: "ACTIVE", createdAt: "OLD_TIME", createdBy: "OLD_USER", updatedAt: "OLD_UPDATED_AT", updatedBy: "OLD_UPDATED_BY" } };

    const res = evaluateBootstrapPlan(mockActor(), mockAcademy(), exactUser, exactMember, exactInvite, mockTimestamp);
    assert.strictEqual(res.status, "ALREADY_BOOTSTRAPPED");
    if (res.status === "ALREADY_BOOTSTRAPPED") {
      assert.strictEqual(res.plan.length, 0);
    }
  });
  it("19. Near-exact schema metadata fails closed", () => {
    const memberWithNullUpdatedAt = {
      exists: true,
      id: TARGET_UID,
      data: {
        userId: TARGET_UID,
        academyId: TARGET_ACADEMY,
        role: "ADMIN",
        status: "ACTIVE",
        source: "LEGACY_MIGRATION",
        joinedAt: "OLD_JOINED_AT",
        joinedBy: "OLD_JOINED_BY",
        updatedAt: null
      }
    };

    const res1 = evaluateBootstrapPlan(
      mockActor(), mockAcademy(), mockUser(), memberWithNullUpdatedAt, mockEmpty(), mockTimestamp
    );
    assert.strictEqual(res1.status, "REJECTED");
    assert.match((res1 as any).reason, /Membership updatedAt missing/);

    const inviteWithNullUpdatedBy = {
      exists: true,
      id: INVITE_CODE,
      data: {
        inviteCode: INVITE_CODE,
        academyId: TARGET_ACADEMY,
        status: "ACTIVE",
        createdAt: "OLD_CREATED_AT",
        createdBy: "OLD_CREATED_BY",
        updatedAt: "OLD_UPDATED_AT",
        updatedBy: null
      }
    };

    const res2 = evaluateBootstrapPlan(
      mockActor(), mockAcademy(), mockUser(), mockEmpty(), inviteWithNullUpdatedBy, mockTimestamp
    );
    assert.strictEqual(res2.status, "REJECTED");
    assert.match((res2 as any).reason, /Invite updatedBy missing/);
  });

  it("20. Extra Membership or Invite fields fail closed", () => {
    const memberWithExtraField = {
      exists: true,
      id: TARGET_UID,
      data: {
        userId: TARGET_UID,
        academyId: TARGET_ACADEMY,
        role: "ADMIN",
        status: "ACTIVE",
        source: "LEGACY_MIGRATION",
        joinedAt: "OLD_JOINED_AT",
        joinedBy: "OLD_JOINED_BY",
        updatedAt: "OLD_UPDATED_AT",
        unexpectedField: true
      }
    };

    const res1 = evaluateBootstrapPlan(
      mockActor(), mockAcademy(), mockUser(), memberWithExtraField, mockEmpty(), mockTimestamp
    );
    assert.strictEqual(res1.status, "REJECTED");
    assert.match((res1 as any).reason, /Membership schema conflict/);

    const inviteWithExtraField = {
      exists: true,
      id: INVITE_CODE,
      data: {
        inviteCode: INVITE_CODE,
        academyId: TARGET_ACADEMY,
        status: "ACTIVE",
        createdAt: "OLD_CREATED_AT",
        createdBy: "OLD_CREATED_BY",
        updatedAt: "OLD_UPDATED_AT",
        updatedBy: "OLD_UPDATED_BY",
        unexpectedField: true
      }
    };

    const res2 = evaluateBootstrapPlan(
      mockActor(), mockAcademy(), mockUser(), mockEmpty(), inviteWithExtraField, mockTimestamp
    );
    assert.strictEqual(res2.status, "REJECTED");
    assert.match((res2 as any).reason, /Invite schema conflict/);
  });

  it("21. Existing tenant pointer conflicts fail closed", () => {
    const activeConflict = evaluateBootstrapPlan(
      mockActor(),
      mockAcademy(),
      mockUser({ activeAcademyId: "OTHER_ACADEMY" }),
      mockEmpty(),
      mockEmpty(),
      mockTimestamp
    );
    assert.strictEqual(activeConflict.status, "REJECTED");
    assert.match((activeConflict as any).reason, /activeAcademyId conflict/);

    const academyConflict = evaluateBootstrapPlan(
      mockActor(),
      mockAcademy(),
      mockUser({ academyId: "OTHER_ACADEMY" }),
      mockEmpty(),
      mockEmpty(),
      mockTimestamp
    );
    assert.strictEqual(academyConflict.status, "REJECTED");
    assert.match((academyConflict as any).reason, /academyId conflict/);

    const roleConflict = evaluateBootstrapPlan(
      mockActor(),
      mockAcademy(),
      mockUser({ tenantRole: "COACH" }),
      mockEmpty(),
      mockEmpty(),
      mockTimestamp
    );
    assert.strictEqual(roleConflict.status, "REJECTED");
    assert.match((roleConflict as any).reason, /tenantRole conflict/);
  });
});
