import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessTenantCapability,
  canEnterAcademyWorkspace,
  canStartStaffWorkMode,
  canUpdateAcademySettings,
  isAuthoritativeSnapshotMetadata,
  isExactActiveStaffMembership,
  isExactActiveStaffMembershipForRole,
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

  it("38. isExactActiveStaffMembershipForRole: expected ADMIN + membership ADMIN => true", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(validAdminMembership, targetStaffUid, academyId, undefined, "ADMIN"),
      true,
    );
  });

  it("39. isExactActiveStaffMembershipForRole: expected ADMIN + membership COACH => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(validCoachMembership, targetStaffUid, academyId, undefined, "ADMIN"),
      false,
    );
  });

  it("40. isExactActiveStaffMembershipForRole: expected COACH + membership COACH => true", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(validCoachMembership, targetStaffUid, academyId, undefined, "COACH"),
      true,
    );
  });

  it("41. isExactActiveStaffMembershipForRole: expected COACH + membership ADMIN => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(validAdminMembership, targetStaffUid, academyId, undefined, "COACH"),
      false,
    );
  });

  it("42. isExactActiveStaffMembershipForRole: inactive => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole({ ...validAdminMembership, status: "INACTIVE" }, targetStaffUid, academyId, undefined, "ADMIN"),
      false,
    );
  });

  it("43. isExactActiveStaffMembershipForRole: mismatched UID => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole({ ...validAdminMembership, userId: "other-uid" }, targetStaffUid, academyId, undefined, "ADMIN"),
      false,
    );
  });

  it("44. isExactActiveStaffMembershipForRole: mismatched Academy => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole({ ...validAdminMembership, academyId: "other-academy" }, targetStaffUid, academyId, undefined, "ADMIN"),
      false,
    );
  });

  it("45. isExactActiveStaffMembershipForRole: mismatched document ID => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(validAdminMembership, targetStaffUid, academyId, "wrong-doc-id", "ADMIN"),
      false,
    );
  });

  it("46. isExactActiveStaffMembershipForRole: invalid expected role => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(validAdminMembership, targetStaffUid, academyId, undefined, "SUPERADMIN"),
      false,
    );
  });
});

describe("durableSupportExitAudit", () => {
  const baseStaffAudit = {
    logDocId: "log-doc-123",
    actorUid: "sa-123",
    action: "SUPERADMIN_STAFF_WORK_ENDED" as const,
    academyId: "academy-talumball",
    mode: "WORK_AS_STAFF" as const,
    targetUid: "coach-456",
    effectiveTenantRole: "COACH" as const,
    createdAt: Date.now(),
  };

  const baseWorkspaceAudit = {
    logDocId: "log-doc-789",
    actorUid: "sa-123",
    action: "SUPERADMIN_ACADEMY_WORKSPACE_ENDED" as const,
    academyId: "academy-talumball",
    mode: "ACADEMY_WORKSPACE" as const,
    targetUid: null,
    effectiveTenantRole: null,
    createdAt: Date.now(),
  };

  class MockStorage {
    private store = new Map<string, string>();
    get length() { return this.store.size; }
    clear() { this.store.clear(); }
    getItem(key: string) { return this.store.get(key) ?? null; }
    key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
    removeItem(key: string) { this.store.delete(key); }
    setItem(key: string, value: string) { this.store.set(key, value); }
  }

  it("47. WORK_AS_STAFF + STAFF_WORK_ENDED + target + ADMIN => valid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        effectiveTenantRole: "ADMIN",
      }),
      true,
    );
  });

  it("48. WORK_AS_STAFF + STAFF_WORK_ENDED + target + COACH => valid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        effectiveTenantRole: "COACH",
      }),
      true,
    );
  });

  it("49. WORK_AS_STAFF + workspace action => invalid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        action: "SUPERADMIN_ACADEMY_WORKSPACE_ENDED" as any,
      }),
      false,
    );
  });

  it("50. WORK_AS_STAFF + null target => invalid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        targetUid: null,
      }),
      false,
    );
  });

  it("51. WORK_AS_STAFF + null role => invalid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        effectiveTenantRole: null,
      }),
      false,
    );
  });

  it("52. WORK_AS_STAFF + SUPERADMIN role => invalid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        effectiveTenantRole: "SUPERADMIN" as any,
      }),
      false,
    );
  });

  it("53. ACADEMY_WORKSPACE + WORKSPACE_ENDED + null target/null role => valid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit(baseWorkspaceAudit),
      true,
    );
  });

  it("54. ACADEMY_WORKSPACE + STAFF_WORK_ENDED => invalid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseWorkspaceAudit,
        action: "SUPERADMIN_STAFF_WORK_ENDED" as any,
      }),
      false,
    );
  });

  it("55. ACADEMY_WORKSPACE + targetUid => invalid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseWorkspaceAudit,
        targetUid: "coach-456",
      }),
      false,
    );
  });

  it("56. ACADEMY_WORKSPACE + tenant role => invalid", async () => {
    const { isValidPendingSupportExitAudit } = await import("../src/lib/durableSupportExitAudit");
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseWorkspaceAudit,
        effectiveTenantRole: "ADMIN" as any,
      }),
      false,
    );
  });

  it("57. storage integrity: valid existing record preserved when adding another record", async () => {
    const {
      savePendingSupportExitAudit,
      loadPendingSupportExitAudits,
    } = await import("../src/lib/durableSupportExitAudit");
    const mockStorage = new MockStorage() as unknown as Storage;

    savePendingSupportExitAudit(baseStaffAudit, mockStorage);
    savePendingSupportExitAudit(baseWorkspaceAudit, mockStorage);

    const loaded = loadPendingSupportExitAudits(mockStorage);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].logDocId, "log-doc-123");
    assert.equal(loaded[1].logDocId, "log-doc-789");
  });

  it("58. storage integrity: malformed existing JSON causes save to throw and preserves raw value", async () => {
    const { savePendingSupportExitAudit, PENDING_AUDIT_STORAGE_KEY } = await import("../src/lib/durableSupportExitAudit");
    const mockStorage = new MockStorage() as unknown as Storage;
    const corruptRaw = "{ broken json !!";
    mockStorage.setItem(PENDING_AUDIT_STORAGE_KEY, corruptRaw);

    assert.throws(() => {
      savePendingSupportExitAudit(baseStaffAudit, mockStorage);
    }, /JSON parse error/);

    assert.equal(mockStorage.getItem(PENDING_AUDIT_STORAGE_KEY), corruptRaw);
  });

  it("59. storage integrity: non-array existing JSON causes save to throw and preserves raw value", async () => {
    const { savePendingSupportExitAudit, PENDING_AUDIT_STORAGE_KEY } = await import("../src/lib/durableSupportExitAudit");
    const mockStorage = new MockStorage() as unknown as Storage;
    const objectRaw = JSON.stringify({ notAnArray: true });
    mockStorage.setItem(PENDING_AUDIT_STORAGE_KEY, objectRaw);

    assert.throws(() => {
      savePendingSupportExitAudit(baseStaffAudit, mockStorage);
    }, /expected array/);

    assert.equal(mockStorage.getItem(PENDING_AUDIT_STORAGE_KEY), objectRaw);
  });

  it("60. storage integrity: existing array containing an invalid record causes save to throw and preserves raw value", async () => {
    const { savePendingSupportExitAudit, PENDING_AUDIT_STORAGE_KEY } = await import("../src/lib/durableSupportExitAudit");
    const mockStorage = new MockStorage() as unknown as Storage;
    const invalidArrayRaw = JSON.stringify([baseStaffAudit, { invalid: "record" }]);
    mockStorage.setItem(PENDING_AUDIT_STORAGE_KEY, invalidArrayRaw);

    assert.throws(() => {
      savePendingSupportExitAudit(baseWorkspaceAudit, mockStorage);
    }, /invalid record at index 1/);

    assert.equal(mockStorage.getItem(PENDING_AUDIT_STORAGE_KEY), invalidArrayRaw);
  });

  it("61. storage integrity: no storage key => strict load returns []", async () => {
    const { loadPendingSupportExitAuditsStrict } = await import("../src/lib/durableSupportExitAudit");
    const mockStorage = new MockStorage() as unknown as Storage;
    assert.deepEqual(loadPendingSupportExitAuditsStrict(mockStorage), []);
  });

  it("62. storage integrity: existing empty-string value => savePendingSupportExitAudit throws and preserves raw value", async () => {
    const { savePendingSupportExitAudit, PENDING_AUDIT_STORAGE_KEY } = await import("../src/lib/durableSupportExitAudit");
    const mockStorage = new MockStorage() as unknown as Storage;
    mockStorage.setItem(PENDING_AUDIT_STORAGE_KEY, "");

    assert.throws(() => {
      savePendingSupportExitAudit(baseStaffAudit, mockStorage);
    }, /JSON parse error/);

    assert.equal(mockStorage.getItem(PENDING_AUDIT_STORAGE_KEY), "");
  });

  it("63. storage integrity: storage.getItem throwing => savePendingSupportExitAudit throws and performs no write", async () => {
    const { savePendingSupportExitAudit, PENDING_AUDIT_STORAGE_KEY } = await import("../src/lib/durableSupportExitAudit");
    let setItemCalled = false;
    const failingStorage = {
      getItem: () => {
        throw new Error("Simulated storage access denied");
      },
      setItem: () => {
        setItemCalled = true;
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;

    assert.throws(() => {
      savePendingSupportExitAudit(baseStaffAudit, failingStorage);
    }, /Simulated storage access denied/);

    assert.equal(setItemCalled, false);
  });

  it("64. actor isolation: only authenticated SuperAdmin matching actorUid replays", async () => {
    const {
      savePendingSupportExitAudit,
      replayPendingSupportExitAuditsForActor,
      loadPendingSupportExitAudits,
    } = await import("../src/lib/durableSupportExitAudit");
    const mockStorage = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, mockStorage);

    // Another SuperAdmin with different UID attempts replay
    const otherSuperAdmin = { uid: "other-sa-999", role: "SUPERADMIN", status: "ACTIVE" };
    const mockDb = {} as any;
    await replayPendingSupportExitAuditsForActor(otherSuperAdmin, mockDb, mockStorage);

    // Record must NOT be touched or removed
    assert.equal(loadPendingSupportExitAudits(mockStorage).length, 1);
  });
});
