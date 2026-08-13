import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessTenantCapability,
  canEnterAcademyWorkspace,
  canStartStaffWorkMode,
  canUpdateAcademySettings,
  isAuthoritativeSnapshotMetadata,
  isExactActiveStaffMembership,
  isExactActiveSuperAdmin,
  isExactDocumentId,
  resolveSupportPresentationRole,
  validateSupportSubject,
} from "../src/lib/superAdminSupportModel";
import type { SuperAdminSupportSession } from "../src/types/SuperAdminSupport";

describe("superAdminSupportModel", () => {
  const activeSuperAdmin = {
    uid: "sa-123",
    role: "SUPERADMIN",
    status: "ACTIVE",
  };
  const academyId = "academy-talumball";
  const targetStaffUid = "coach-456";

  const validAdminMembership = {
    userId: targetStaffUid,
    academyId: academyId,
    role: "ADMIN",
    status: "ACTIVE",
  };

  const validCoachMembership = {
    userId: targetStaffUid,
    academyId: academyId,
    role: "COACH",
    status: "ACTIVE",
  };

  it("1. ACTIVE SuperAdmin exact UID accepted", () => {
    assert.equal(isExactActiveSuperAdmin(activeSuperAdmin), true);
  });

  it("2. inactive SuperAdmin rejected", () => {
    assert.equal(
      isExactActiveSuperAdmin({ ...activeSuperAdmin, status: "INACTIVE" }),
      false,
    );
  });

  it("3. malformed SuperAdmin rejected", () => {
    assert.equal(isExactActiveSuperAdmin({ uid: "", role: "SUPERADMIN" }), false);
    assert.equal(isExactActiveSuperAdmin({ uid: "sa/123", role: "SUPERADMIN" }), false);
    assert.equal(isExactActiveSuperAdmin(null), false);
  });

  it("4. exact Academy ID accepted", () => {
    assert.equal(isExactDocumentId(academyId), true);
    assert.equal(canEnterAcademyWorkspace(activeSuperAdmin, academyId), true);
  });

  it("5. empty Academy ID rejected", () => {
    assert.equal(canEnterAcademyWorkspace(activeSuperAdmin, ""), false);
  });

  it("6. slash Academy ID rejected", () => {
    assert.equal(canEnterAcademyWorkspace(activeSuperAdmin, "academies/123"), false);
  });

  it("7. direct workspace needs no Membership", () => {
    assert.equal(canEnterAcademyWorkspace(activeSuperAdmin, academyId), true);
  });

  it("8. exact ACTIVE ADMIN membership accepted", () => {
    assert.equal(
      isExactActiveStaffMembership(validAdminMembership, targetStaffUid, academyId),
      true,
    );
  });

  it("9. exact ACTIVE COACH membership accepted", () => {
    assert.equal(
      isExactActiveStaffMembership(validCoachMembership, targetStaffUid, academyId),
      true,
    );
  });

  it("10. PENDING rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, status: "PENDING" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("11. SUSPENDED rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, status: "SUSPENDED" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("12. LEFT rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, status: "LEFT" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("13. REVOKED rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, status: "REVOKED" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("14. membership document ID mismatch rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        validCoachMembership,
        targetStaffUid,
        academyId,
        "wrong-doc-id",
      ),
      false,
    );
  });

  it("15. membership userId mismatch rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, userId: "other-uid" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("16. membership academyId mismatch rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, academyId: "other-academy" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("17. PLAYER membership role rejected for staff Work As", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, role: "PLAYER" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("18. PARENT rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, role: "PARENT" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("19. SCOUT rejected", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, role: "SCOUT" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("20. SUPERADMIN rejected as target tenant role", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, role: "SUPERADMIN" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("21. DATA_ADMIN rejected as target tenant role", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { ...validCoachMembership, role: "DATA_ADMIN" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("22. actorUid == targetUid rejected", () => {
    assert.equal(
      canStartStaffWorkMode(
        activeSuperAdmin,
        academyId,
        "sa-123", // same as actor
        validCoachMembership,
      ),
      false,
    );
  });

  it("23. email cannot grant authority", () => {
    const membershipWithEmailOnly = {
      email: "admin@academy.com",
      status: "ACTIVE",
      role: "ADMIN",
    };
    assert.equal(
      isExactActiveStaffMembership(
        membershipWithEmailOnly,
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("24. requestedRole cannot grant authority", () => {
    const userDocWithRequestedRole = {
      userId: targetStaffUid,
      academyId: academyId,
      requestedRole: "ADMIN",
      status: "ACTIVE",
    };
    assert.equal(
      isExactActiveStaffMembership(
        userDocWithRequestedRole,
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("25. Work As Admin presentation role resolves ADMIN", () => {
    const session: SuperAdminSupportSession = {
      academyId,
      mode: "WORK_AS_STAFF",
      subject: {
        uid: targetStaffUid,
        role: "ADMIN",
        tenantRole: "ADMIN",
      },
      startedAt: Date.now(),
    };
    assert.equal(resolveSupportPresentationRole(session), "ADMIN");
  });

  it("26. Work As Coach presentation role resolves COACH", () => {
    const session: SuperAdminSupportSession = {
      academyId,
      mode: "WORK_AS_STAFF",
      subject: {
        uid: targetStaffUid,
        role: "COACH",
        tenantRole: "COACH",
      },
      startedAt: Date.now(),
    };
    assert.equal(resolveSupportPresentationRole(session), "COACH");
  });

  it("27. direct Academy workspace presentation stays SUPERADMIN", () => {
    const session: SuperAdminSupportSession = {
      academyId,
      mode: "ACADEMY_WORKSPACE",
      startedAt: Date.now(),
    };
    assert.equal(resolveSupportPresentationRole(session), "SUPERADMIN");
  });

  it("28. malformed subject fails closed", () => {
    assert.equal(validateSupportSubject(null), false);
    assert.equal(validateSupportSubject({ uid: "" }), false);
    assert.equal(validateSupportSubject({ uid: "123", role: "UNKNOWN" }), false);
    assert.equal(
      validateSupportSubject({ uid: "123", role: "ADMIN", tenantRole: "COACH" }),
      false,
    );
  });

  it("29. direct SuperAdmin Academy Workspace can use ADMIN tenant capability", () => {
    const mockHasPermission = () => false;
    assert.equal(
      canAccessTenantCapability("SUPERADMIN", ["ADMIN"], true, mockHasPermission),
      true,
    );
  });

  it("30. Work As ADMIN can use ADMIN tenant capability", () => {
    const mockHasPermission = () => false;
    assert.equal(
      canAccessTenantCapability("ADMIN", ["ADMIN"], true, mockHasPermission),
      true,
    );
  });

  it("31. Work As COACH cannot use ADMIN-only tenant capability", () => {
    const mockHasPermission = (roles: string[]) => roles.includes("ADMIN");
    assert.equal(
      canAccessTenantCapability("COACH", ["ADMIN"], true, mockHasPermission),
      false,
    );
  });

  it("32. normal ADMIN remains allowed outside support mode", () => {
    const mockHasPermission = (roles: string[]) => roles.includes("ADMIN");
    assert.equal(
      canAccessTenantCapability("ADMIN", ["ADMIN"], false, mockHasPermission),
      true,
    );
    assert.equal(
      canAccessTenantCapability("COACH", ["ADMIN"], false, () => false),
      false,
    );
  });

  it("33. malformed support role fails closed for tenant capability", () => {
    const mockHasPermission = () => false;
    assert.equal(
      canAccessTenantCapability("INVALID_ROLE", ["ADMIN"], true, mockHasPermission),
      false,
    );
  });

  it("34. cached/pending authority helper fails closed", () => {
    assert.equal(
      isAuthoritativeSnapshotMetadata({ fromCache: false, hasPendingWrites: false }),
      true,
    );
    assert.equal(
      isAuthoritativeSnapshotMetadata({ fromCache: true, hasPendingWrites: false }),
      false,
    );
    assert.equal(
      isAuthoritativeSnapshotMetadata({ fromCache: false, hasPendingWrites: true }),
      false,
    );
    assert.equal(isAuthoritativeSnapshotMetadata(null), false);
    assert.equal(isAuthoritativeSnapshotMetadata(undefined), false);
  });

  it("35. direct SuperAdmin and Work As ADMIN can update settings, Work As COACH denied", () => {
    assert.equal(canUpdateAcademySettings(true, "SUPERADMIN"), true);
    assert.equal(canUpdateAcademySettings(true, "ADMIN"), true);
    assert.equal(canUpdateAcademySettings(true, "COACH"), false);
  });

  it("36. normal ADMIN and normal COACH can update settings outside support mode (normal COACH preserved)", () => {
    assert.equal(canUpdateAcademySettings(false, "SUPERADMIN", "ADMIN"), true);
    assert.equal(canUpdateAcademySettings(false, "SUPERADMIN", "COACH"), true);
  });

  it("37. malformed WORK_AS_STAFF resolves to NONE and fails capability checks", () => {
    const malformedSession: SuperAdminSupportSession = {
      academyId,
      mode: "WORK_AS_STAFF",
      subject: {
        uid: targetStaffUid,
        role: "PLAYER", // INVALID FOR STAFF
      },
      startedAt: Date.now(),
    };

    const role = resolveSupportPresentationRole(malformedSession);
    assert.equal(role, "NONE");

    const mockHasPermission = () => true;
    assert.equal(
      canAccessTenantCapability(role, ["ADMIN", "COACH"], true, mockHasPermission),
      false,
    );
    assert.equal(canUpdateAcademySettings(true, role), false);
  });
});
