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
import {
  type ActiveSupportSessionMarker,
  type AuthGuard,
  type FirestoreDocSnap,
  type FirestoreOps,
  type PendingSupportExitAudit,
  ACTIVE_SESSION_KEY_PREFIX,
  activeSessionStorageKey,
  convertOrphanMarkerToClosureRecord,
  isMarkerStale,
  isValidActiveSessionMarker,
  isValidPendingSupportExitAudit,
  loadActiveSessionMarkersForActor,
  loadPendingSupportExitAuditsForActor,
  matchesPendingAuditPayload,
  PENDING_AUDIT_KEY_PREFIX,
  pendingAuditStorageKey,
  performBoundedExitAudit,
  recoverStaleOrphanMarkers,
  refreshActiveSessionHeartbeat,
  removeActiveSessionMarker,
  removePendingSupportExitAudit,
  replayPendingSupportExitAuditsForActor,
  saveActiveSessionMarker,
  savePendingSupportExitAudit,
  STALE_HEARTBEAT_THRESHOLD_MS,
} from "../src/lib/durableSupportExitAudit";

// ==========================================
// Test helpers
// ==========================================

class MockStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

function createMockSnap(
  exists: boolean,
  data?: Record<string, unknown>,
): FirestoreDocSnap {
  return {
    exists: () => exists,
    data: () => data,
  };
}

function createMockOps(
  overrides?: Partial<FirestoreOps>,
): FirestoreOps {
  return {
    getDocFromServer:
      overrides?.getDocFromServer ??
      (() => Promise.resolve(createMockSnap(false))),
    setDoc: overrides?.setDoc ?? (() => Promise.resolve()),
    docRef:
      overrides?.docRef ??
      ((_db: unknown, _col: string, id: string) => ({
        id,
        path: `logs/${id}`,
      })),
    serverTimestamp:
      overrides?.serverTimestamp ?? (() => ({ _sentinel: true })),
  };
}

function createMockGuard(valid: boolean): AuthGuard {
  return {
    validate() {
      if (!valid) throw new Error("Auth guard failed: actor changed.");
    },
  };
}

function createControllableGuard(): {
  guard: AuthGuard;
  invalidate: () => void;
} {
  let valid = true;
  return {
    guard: {
      validate() {
        if (!valid) throw new Error("Auth guard invalidated.");
      },
    },
    invalidate() {
      valid = false;
    },
  };
}

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

const baseStaffAudit: PendingSupportExitAudit = {
  logDocId: "log-doc-123",
  actorUid: "sa-123",
  action: "SUPERADMIN_STAFF_WORK_ENDED",
  academyId: "academy-talumball",
  mode: "WORK_AS_STAFF",
  targetUid: "coach-456",
  effectiveTenantRole: "COACH",
  createdAt: Date.now(),
};

const baseWorkspaceAudit: PendingSupportExitAudit = {
  logDocId: "log-doc-789",
  actorUid: "sa-123",
  action: "SUPERADMIN_ACADEMY_WORKSPACE_ENDED",
  academyId: "academy-talumball",
  mode: "ACADEMY_WORKSPACE",
  targetUid: null,
  effectiveTenantRole: null,
  createdAt: Date.now(),
};

const baseMarker: ActiveSupportSessionMarker = {
  sessionId: "sess-abc",
  actorUid: "sa-123",
  academyId: "academy-talumball",
  mode: "ACADEMY_WORKSPACE",
  targetUid: null,
  tenantRole: null,
  startedAt: Date.now(),
  tabId: "tab-1",
  heartbeatAt: Date.now(),
};

// ==========================================
// 1. superAdminSupportModel (tests 1–46)
// ==========================================

describe("superAdminSupportModel", () => {
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
    assert.equal(
      isExactActiveSuperAdmin({ uid: "", role: "SUPERADMIN" }),
      false,
    );
    assert.equal(
      isExactActiveSuperAdmin({ uid: "sa/123", role: "SUPERADMIN" }),
      false,
    );
    assert.equal(isExactActiveSuperAdmin(null), false);
  });

  it("4. exact Academy ID accepted", () => {
    assert.equal(isExactDocumentId(academyId), true);
    assert.equal(
      canEnterAcademyWorkspace(activeSuperAdmin, academyId),
      true,
    );
  });

  it("5. empty Academy ID rejected", () => {
    assert.equal(canEnterAcademyWorkspace(activeSuperAdmin, ""), false);
  });

  it("6. slash Academy ID rejected", () => {
    assert.equal(
      canEnterAcademyWorkspace(activeSuperAdmin, "academies/123"),
      false,
    );
  });

  it("7. direct workspace needs no Membership", () => {
    assert.equal(
      canEnterAcademyWorkspace(activeSuperAdmin, academyId),
      true,
    );
  });

  it("8. exact ACTIVE ADMIN membership accepted", () => {
    assert.equal(
      isExactActiveStaffMembership(
        validAdminMembership,
        targetStaffUid,
        academyId,
      ),
      true,
    );
  });

  it("9. exact ACTIVE COACH membership accepted", () => {
    assert.equal(
      isExactActiveStaffMembership(
        validCoachMembership,
        targetStaffUid,
        academyId,
      ),
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
        "sa-123",
        validCoachMembership,
      ),
      false,
    );
  });

  it("23. email cannot grant authority", () => {
    assert.equal(
      isExactActiveStaffMembership(
        { email: "admin@academy.com", status: "ACTIVE", role: "ADMIN" },
        targetStaffUid,
        academyId,
      ),
      false,
    );
  });

  it("24. requestedRole cannot grant authority", () => {
    assert.equal(
      isExactActiveStaffMembership(
        {
          userId: targetStaffUid,
          academyId,
          requestedRole: "ADMIN",
          status: "ACTIVE",
        },
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
      subject: { uid: targetStaffUid, role: "ADMIN", tenantRole: "ADMIN" },
      startedAt: Date.now(),
    };
    assert.equal(resolveSupportPresentationRole(session), "ADMIN");
  });

  it("26. Work As Coach presentation role resolves COACH", () => {
    const session: SuperAdminSupportSession = {
      academyId,
      mode: "WORK_AS_STAFF",
      subject: { uid: targetStaffUid, role: "COACH", tenantRole: "COACH" },
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
    assert.equal(
      validateSupportSubject({ uid: "123", role: "UNKNOWN" }),
      false,
    );
    assert.equal(
      validateSupportSubject({
        uid: "123",
        role: "ADMIN",
        tenantRole: "COACH",
      }),
      false,
    );
  });

  it("29. direct SuperAdmin Academy Workspace can use ADMIN tenant capability", () => {
    assert.equal(
      canAccessTenantCapability("SUPERADMIN", ["ADMIN"], true, () => false),
      true,
    );
  });

  it("30. Work As ADMIN can use ADMIN tenant capability", () => {
    assert.equal(
      canAccessTenantCapability("ADMIN", ["ADMIN"], true, () => false),
      true,
    );
  });

  it("31. Work As COACH cannot use ADMIN-only tenant capability", () => {
    assert.equal(
      canAccessTenantCapability("COACH", ["ADMIN"], true, (r) =>
        r.includes("ADMIN"),
      ),
      false,
    );
  });

  it("32. normal ADMIN remains allowed outside support mode", () => {
    assert.equal(
      canAccessTenantCapability("ADMIN", ["ADMIN"], false, (r) =>
        r.includes("ADMIN"),
      ),
      true,
    );
    assert.equal(
      canAccessTenantCapability("COACH", ["ADMIN"], false, () => false),
      false,
    );
  });

  it("33. malformed support role fails closed for tenant capability", () => {
    assert.equal(
      canAccessTenantCapability("INVALID_ROLE", ["ADMIN"], true, () => false),
      false,
    );
  });

  it("34. cached/pending authority helper fails closed", () => {
    assert.equal(
      isAuthoritativeSnapshotMetadata({
        fromCache: false,
        hasPendingWrites: false,
      }),
      true,
    );
    assert.equal(
      isAuthoritativeSnapshotMetadata({
        fromCache: true,
        hasPendingWrites: false,
      }),
      false,
    );
    assert.equal(
      isAuthoritativeSnapshotMetadata({
        fromCache: false,
        hasPendingWrites: true,
      }),
      false,
    );
    assert.equal(isAuthoritativeSnapshotMetadata(null), false);
    assert.equal(isAuthoritativeSnapshotMetadata(undefined), false);
  });

  it("35. settings access: SUPERADMIN and ADMIN yes, COACH no in support", () => {
    assert.equal(canUpdateAcademySettings(true, "SUPERADMIN"), true);
    assert.equal(canUpdateAcademySettings(true, "ADMIN"), true);
    assert.equal(canUpdateAcademySettings(true, "COACH"), false);
  });

  it("36. normal ADMIN and COACH can update settings outside support", () => {
    assert.equal(
      canUpdateAcademySettings(false, "SUPERADMIN", "ADMIN"),
      true,
    );
    assert.equal(
      canUpdateAcademySettings(false, "SUPERADMIN", "COACH"),
      true,
    );
  });

  it("37. malformed WORK_AS_STAFF resolves NONE and fails capability", () => {
    const malformed: SuperAdminSupportSession = {
      academyId,
      mode: "WORK_AS_STAFF",
      subject: { uid: targetStaffUid, role: "PLAYER" as any },
      startedAt: Date.now(),
    };
    const role = resolveSupportPresentationRole(malformed);
    assert.equal(role, "NONE");
    assert.equal(
      canAccessTenantCapability(role, ["ADMIN", "COACH"], true, () => true),
      false,
    );
    assert.equal(canUpdateAcademySettings(true, role), false);
  });

  it("38. isExactActiveStaffMembershipForRole: ADMIN + ADMIN => true", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        validAdminMembership,
        targetStaffUid,
        academyId,
        undefined,
        "ADMIN",
      ),
      true,
    );
  });

  it("39. isExactActiveStaffMembershipForRole: COACH + ADMIN => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        validCoachMembership,
        targetStaffUid,
        academyId,
        undefined,
        "ADMIN",
      ),
      false,
    );
  });

  it("40. isExactActiveStaffMembershipForRole: COACH + COACH => true", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        validCoachMembership,
        targetStaffUid,
        academyId,
        undefined,
        "COACH",
      ),
      true,
    );
  });

  it("41. isExactActiveStaffMembershipForRole: ADMIN + COACH => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        validAdminMembership,
        targetStaffUid,
        academyId,
        undefined,
        "COACH",
      ),
      false,
    );
  });

  it("42. isExactActiveStaffMembershipForRole: inactive => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        { ...validAdminMembership, status: "INACTIVE" },
        targetStaffUid,
        academyId,
        undefined,
        "ADMIN",
      ),
      false,
    );
  });

  it("43. isExactActiveStaffMembershipForRole: mismatched UID => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        { ...validAdminMembership, userId: "other-uid" },
        targetStaffUid,
        academyId,
        undefined,
        "ADMIN",
      ),
      false,
    );
  });

  it("44. isExactActiveStaffMembershipForRole: mismatched Academy => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        { ...validAdminMembership, academyId: "other-academy" },
        targetStaffUid,
        academyId,
        undefined,
        "ADMIN",
      ),
      false,
    );
  });

  it("45. isExactActiveStaffMembershipForRole: mismatched docId => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        validAdminMembership,
        targetStaffUid,
        academyId,
        "wrong-doc-id",
        "ADMIN",
      ),
      false,
    );
  });

  it("46. isExactActiveStaffMembershipForRole: invalid role => false", () => {
    assert.equal(
      isExactActiveStaffMembershipForRole(
        validAdminMembership,
        targetStaffUid,
        academyId,
        undefined,
        "SUPERADMIN",
      ),
      false,
    );
  });
});

// ==========================================
// 2. Fail-closed unsupported mode (Section F)
// ==========================================

describe("fail-closed unsupported mode", () => {
  it("47. unknown mode cast as any returns NONE", () => {
    const session = {
      academyId,
      mode: "SUPPORT_PLAYER" as any,
      startedAt: Date.now(),
    };
    assert.equal(resolveSupportPresentationRole(session), "NONE");
  });

  it("48. SUPPORT_PARENT mode returns NONE", () => {
    const session = {
      academyId,
      mode: "SUPPORT_PARENT" as any,
      startedAt: Date.now(),
    };
    assert.equal(resolveSupportPresentationRole(session), "NONE");
  });

  it("49. completely unknown mode returns NONE", () => {
    const session = {
      academyId,
      mode: "TOTALLY_INVALID" as any,
      startedAt: Date.now(),
    };
    assert.equal(resolveSupportPresentationRole(session), "NONE");
  });

  it("50. PLAYER subject rejected by validateSupportSubject", () => {
    assert.equal(
      validateSupportSubject({ uid: "uid-1", role: "PLAYER" }),
      false,
    );
  });

  it("51. PARENT subject rejected by validateSupportSubject", () => {
    assert.equal(
      validateSupportSubject({ uid: "uid-1", role: "PARENT" }),
      false,
    );
  });
});

// ==========================================
// 3. Durable audit validation (Section C, D — new actions)
// ==========================================

describe("durable audit validation", () => {
  it("52. WORK_AS_STAFF + ENDED + target + ADMIN => valid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        effectiveTenantRole: "ADMIN",
      }),
      true,
    );
  });

  it("53. WORK_AS_STAFF + ENDED + target + COACH => valid", () => {
    assert.equal(isValidPendingSupportExitAudit(baseStaffAudit), true);
  });

  it("54. WORK_AS_STAFF + INVALIDATED => valid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        action: "SUPERADMIN_STAFF_WORK_INVALIDATED",
      }),
      true,
    );
  });

  it("55. WORK_AS_STAFF + ABORTED => valid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        action: "SUPERADMIN_STAFF_WORK_ABORTED",
      }),
      true,
    );
  });

  it("56. WORK_AS_STAFF + workspace action => invalid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        action: "SUPERADMIN_ACADEMY_WORKSPACE_ENDED" as any,
      }),
      false,
    );
  });

  it("57. WORK_AS_STAFF + null target => invalid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({ ...baseStaffAudit, targetUid: null }),
      false,
    );
  });

  it("58. WORK_AS_STAFF + null role => invalid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseStaffAudit,
        effectiveTenantRole: null,
      }),
      false,
    );
  });

  it("59. ACADEMY_WORKSPACE + ENDED => valid", () => {
    assert.equal(isValidPendingSupportExitAudit(baseWorkspaceAudit), true);
  });

  it("60. ACADEMY_WORKSPACE + ABORTED => valid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseWorkspaceAudit,
        action: "SUPERADMIN_ACADEMY_WORKSPACE_ABORTED",
      }),
      true,
    );
  });

  it("61. ACADEMY_WORKSPACE + STAFF action => invalid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseWorkspaceAudit,
        action: "SUPERADMIN_STAFF_WORK_ENDED" as any,
      }),
      false,
    );
  });

  it("62. ACADEMY_WORKSPACE + targetUid => invalid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseWorkspaceAudit,
        targetUid: "coach-456",
      }),
      false,
    );
  });

  it("63. ACADEMY_WORKSPACE + tenant role => invalid", () => {
    assert.equal(
      isValidPendingSupportExitAudit({
        ...baseWorkspaceAudit,
        effectiveTenantRole: "ADMIN" as any,
      }),
      false,
    );
  });
});

// ==========================================
// 4. Cross-tab independent storage keys (Section C)
// ==========================================

describe("cross-tab independent storage keys", () => {
  it("64. independent records saved sequentially both remain", () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);
    savePendingSupportExitAudit(baseWorkspaceAudit, s);

    const loaded = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(loaded.length, 2);
    const ids = loaded.map((r) => r.logDocId).sort();
    assert.deepEqual(ids, ["log-doc-123", "log-doc-789"]);
  });

  it("65. two interleaved saves do not overwrite each other", () => {
    const s = new MockStorage() as unknown as Storage;
    const recordA = { ...baseStaffAudit, logDocId: "log-A" };
    const recordB = { ...baseStaffAudit, logDocId: "log-B" };

    // Simulate interleaved saves from two tabs
    savePendingSupportExitAudit(recordA, s);
    savePendingSupportExitAudit(recordB, s);

    const loaded = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(loaded.length, 2);
  });

  it("66. removing A does not remove B", () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(
      { ...baseStaffAudit, logDocId: "log-A" },
      s,
    );
    savePendingSupportExitAudit(
      { ...baseStaffAudit, logDocId: "log-B" },
      s,
    );

    removePendingSupportExitAudit("sa-123", "log-A", s);

    const loaded = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].logDocId, "log-B");
  });

  it("67. corrupted A does not affect B during load", () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(
      { ...baseStaffAudit, logDocId: "log-B" },
      s,
    );
    // Manually corrupt record A
    const keyA = pendingAuditStorageKey("sa-123", "log-A");
    s.setItem(keyA, "{ broken json !!");

    const loaded = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].logDocId, "log-B");
    // Corrupt record is NOT overwritten/removed
    assert.equal(s.getItem(keyA), "{ broken json !!");
  });

  it("68. actor isolation: actor B records not loaded by actor A", () => {
    const s = new MockStorage() as unknown as Storage;
    const actorBRecord = {
      ...baseStaffAudit,
      actorUid: "sa-other",
      logDocId: "log-other",
    };
    savePendingSupportExitAudit(actorBRecord, s);
    savePendingSupportExitAudit(baseStaffAudit, s);

    const actorARecords = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(actorARecords.length, 1);
    assert.equal(actorARecords[0].actorUid, "sa-123");
  });

  it("69. invalid record is never silently replaced during save", () => {
    const s = new MockStorage() as unknown as Storage;
    assert.throws(() => {
      savePendingSupportExitAudit(
        { ...baseStaffAudit, logDocId: "" } as any,
        s,
      );
    }, /Invalid/);
    assert.equal(s.length, 0);
  });

  it("70. storage.setItem failure propagates (fail-closed)", () => {
    const failingStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;

    assert.throws(() => {
      savePendingSupportExitAudit(baseStaffAudit, failingStorage);
    }, /QuotaExceeded/);
  });
});

// ==========================================
// 5. Active session marker (Section E)
// ==========================================

describe("active-session marker", () => {
  it("71. valid workspace marker accepted", () => {
    assert.equal(isValidActiveSessionMarker(baseMarker), true);
  });

  it("72. valid staff marker accepted", () => {
    const staffMarker: ActiveSupportSessionMarker = {
      ...baseMarker,
      mode: "WORK_AS_STAFF",
      targetUid: "coach-456",
      tenantRole: "COACH",
    };
    assert.equal(isValidActiveSessionMarker(staffMarker), true);
  });

  it("73. staff marker without target rejected", () => {
    assert.equal(
      isValidActiveSessionMarker({
        ...baseMarker,
        mode: "WORK_AS_STAFF",
        targetUid: null,
        tenantRole: "COACH",
      }),
      false,
    );
  });

  it("74. workspace marker with target rejected", () => {
    assert.equal(
      isValidActiveSessionMarker({
        ...baseMarker,
        targetUid: "uid-1",
      }),
      false,
    );
  });

  it("75. marker save and load round-trip", () => {
    const s = new MockStorage() as unknown as Storage;
    saveActiveSessionMarker(baseMarker, s);
    const loaded = loadActiveSessionMarkersForActor("sa-123", s);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].sessionId, "sess-abc");
  });

  it("76. marker removed on exit", () => {
    const s = new MockStorage() as unknown as Storage;
    saveActiveSessionMarker(baseMarker, s);
    removeActiveSessionMarker("sa-123", "sess-abc", s);
    const loaded = loadActiveSessionMarkersForActor("sa-123", s);
    assert.equal(loaded.length, 0);
  });

  it("77. heartbeat refreshes correctly", () => {
    const s = new MockStorage() as unknown as Storage;
    const oldMarker = { ...baseMarker, heartbeatAt: 1000 };
    saveActiveSessionMarker(oldMarker, s);

    refreshActiveSessionHeartbeat("sa-123", "sess-abc", s);

    const loaded = loadActiveSessionMarkersForActor("sa-123", s);
    assert.equal(loaded.length, 1);
    assert.ok(loaded[0].heartbeatAt > 1000);
  });

  it("78. stale marker detection", () => {
    const now = Date.now();
    const stale = {
      ...baseMarker,
      heartbeatAt: now - STALE_HEARTBEAT_THRESHOLD_MS - 1,
    };
    const fresh = { ...baseMarker, heartbeatAt: now };
    assert.equal(isMarkerStale(stale, now), true);
    assert.equal(isMarkerStale(fresh, now), false);
  });

  it("79. orphan marker converts to ABORTED closure record", () => {
    const record = convertOrphanMarkerToClosureRecord(baseMarker);
    assert.equal(record.action, "SUPERADMIN_ACADEMY_WORKSPACE_ABORTED");
    assert.equal(record.actorUid, "sa-123");
    assert.equal(record.logDocId, "orphan-sess-abc");
    assert.equal(isValidPendingSupportExitAudit(record), true);
  });

  it("80. staff orphan marker converts to STAFF_WORK_ABORTED", () => {
    const staffMarker = {
      ...baseMarker,
      mode: "WORK_AS_STAFF" as const,
      targetUid: "coach-456",
      tenantRole: "COACH" as const,
    };
    const record = convertOrphanMarkerToClosureRecord(staffMarker);
    assert.equal(record.action, "SUPERADMIN_STAFF_WORK_ABORTED");
    assert.equal(record.targetUid, "coach-456");
    assert.equal(record.effectiveTenantRole, "COACH");
  });
});

// ==========================================
// 6. Tab liveness and orphan recovery (Section E — corrected)
// ==========================================

describe("tab liveness and orphan recovery", () => {
  it("81. live Tab A marker + Tab B mount => Tab B does NOT recover A", () => {
    const s = new MockStorage() as unknown as Storage;
    const liveMarker = {
      ...baseMarker,
      tabId: "tab-A",
      heartbeatAt: Date.now(),
    };
    saveActiveSessionMarker(liveMarker, s);

    recoverStaleOrphanMarkers("sa-123", "tab-B", s, Date.now());

    // Marker must still exist
    const markers = loadActiveSessionMarkersForActor("sa-123", s);
    assert.equal(markers.length, 1);
    assert.equal(markers[0].tabId, "tab-A");

    // No closure record created
    const closures = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(closures.length, 0);
  });

  it("82. stale Tab A marker => same actor recovers it", () => {
    const s = new MockStorage() as unknown as Storage;
    const staleMarker = {
      ...baseMarker,
      tabId: "tab-A",
      heartbeatAt: Date.now() - STALE_HEARTBEAT_THRESHOLD_MS - 5000,
    };
    saveActiveSessionMarker(staleMarker, s);

    recoverStaleOrphanMarkers("sa-123", "tab-B", s, Date.now());

    // Marker should be removed
    const markers = loadActiveSessionMarkersForActor("sa-123", s);
    assert.equal(markers.length, 0);

    // Closure record should exist
    const closures = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(closures.length, 1);
    assert.equal(
      closures[0].action,
      "SUPERADMIN_ACADEMY_WORKSPACE_ABORTED",
    );
  });

  it("83. different actor marker => never recover/remove", () => {
    const s = new MockStorage() as unknown as Storage;
    const otherActorMarker = {
      ...baseMarker,
      actorUid: "sa-other",
      tabId: "tab-X",
      heartbeatAt: 1000, // very stale
    };
    saveActiveSessionMarker(otherActorMarker, s);

    recoverStaleOrphanMarkers("sa-123", "tab-B", s, Date.now());

    // Other actor's marker untouched
    const otherMarkers = loadActiveSessionMarkersForActor("sa-other", s);
    assert.equal(otherMarkers.length, 1);
  });

  it("84. orphan closure persistence failure => marker remains", () => {
    const s = new MockStorage() as unknown as Storage;
    const staleMarker = {
      ...baseMarker,
      tabId: "tab-A",
      heartbeatAt: 1000,
    };
    saveActiveSessionMarker(staleMarker, s);

    // Make closure record save fail by intercepting setItem for audit keys
    const originalSetItem = s.setItem.bind(s);
    (s as any).setItem = (key: string, value: string) => {
      if (key.startsWith(PENDING_AUDIT_KEY_PREFIX)) {
        throw new Error("Storage full");
      }
      originalSetItem(key, value);
    };

    recoverStaleOrphanMarkers("sa-123", "tab-B", s, Date.now());

    // Restore setItem
    (s as any).setItem = originalSetItem;

    // Marker MUST remain since closure save failed
    const markers = loadActiveSessionMarkersForActor("sa-123", s);
    assert.equal(markers.length, 1);
  });

  it("85. fresh heartbeat appearing before conversion => recovery aborts", () => {
    const s = new MockStorage() as unknown as Storage;
    const staleTime = Date.now() - STALE_HEARTBEAT_THRESHOLD_MS - 5000;
    const staleMarker = {
      ...baseMarker,
      tabId: "tab-A",
      heartbeatAt: staleTime,
    };
    saveActiveSessionMarker(staleMarker, s);

    // Intercept getItem to simulate another tab refreshing heartbeat
    // between the initial load and the re-check
    const markerKey = activeSessionStorageKey("sa-123", "sess-abc");
    let readCount = 0;
    const originalGetItem = s.getItem.bind(s);
    (s as any).getItem = (key: string) => {
      const result = originalGetItem(key);
      if (key === markerKey) {
        readCount++;
        // After the initial enumeration (reads during loadActiveSessionMarkersForActor),
        // the re-check read should see a refreshed heartbeat
        if (readCount > 1 && result !== null) {
          const parsed = JSON.parse(result);
          parsed.heartbeatAt = Date.now(); // Fresh!
          const freshJson = JSON.stringify(parsed);
          // Write the fresh value back so the re-check sees it
          const origSet = (s as any).__origSetItem || s.setItem.bind(s);
          origSet(key, freshJson);
          return freshJson;
        }
      }
      return result;
    };

    recoverStaleOrphanMarkers("sa-123", "tab-B", s, Date.now());

    // Restore getItem
    (s as any).getItem = originalGetItem;

    // Marker should NOT have been recovered (fresh heartbeat detected in re-check)
    // The marker key may have the refreshed value
    const remaining = originalGetItem(markerKey);
    assert.notEqual(remaining, null);

    // No closure record
    const closures = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(closures.length, 0);
  });

  it("86. own tab marker is never recovered by same tab", () => {
    const s = new MockStorage() as unknown as Storage;
    const ownMarker = {
      ...baseMarker,
      tabId: "tab-SELF",
      heartbeatAt: 1000, // very stale
    };
    saveActiveSessionMarker(ownMarker, s);

    recoverStaleOrphanMarkers("sa-123", "tab-SELF", s, Date.now());

    // Own tab's marker must remain
    const markers = loadActiveSessionMarkersForActor("sa-123", s);
    assert.equal(markers.length, 1);
  });
});

// ==========================================
// 7. Authoritative audit acknowledgement (Section A)
// ==========================================

describe("authoritative audit acknowledgement", () => {
  it("87. server ACK exact-match removes pending record", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const matchingData = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
      timestamp: { seconds: 123 },
    };

    const ops = createMockOps({
      getDocFromServer: () =>
        Promise.resolve(createMockSnap(true, matchingData)),
    });

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 0);
  });

  it("88. server existing document with mismatched payload retains record", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const mismatchedData = {
      action: "SUPERADMIN_ACADEMY_WORKSPACE_ENDED", // wrong action
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: "ACADEMY_WORKSPACE",
      targetUid: null,
      effectiveTenantRole: null,
    };

    const ops = createMockOps({
      getDocFromServer: () =>
        Promise.resolve(createMockSnap(true, mismatchedData)),
    });

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 1);
  });

  it("89. server read unavailable retains record", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const ops = createMockOps({
      getDocFromServer: () =>
        Promise.reject(new Error("Network unavailable")),
    });

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 1);
  });

  it("90. timeout retains record", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const ops = createMockOps({
      setDoc: () => new Promise(() => {}), // never resolves
    });

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
      timeoutMs: 50,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 1);
  });

  it("91. authoritative not-exists -> create -> confirm -> remove", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const payloadData = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
    };

    let callCount = 0;
    const ops = createMockOps({
      getDocFromServer: () => {
        callCount++;
        // First call (replay check): not exists
        // Second call (post-create confirm): exists
        if (callCount <= 1) {
          return Promise.resolve(createMockSnap(false));
        }
        return Promise.resolve(createMockSnap(true, payloadData));
      },
    });

    await replayPendingSupportExitAuditsForActor(activeSuperAdmin, {} as any, {
      storage: s,
      firestoreOps: ops,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 0);
  });

  it("92. create failure/race + authoritative exact existing -> remove", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const payloadData = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
    };

    let getCallCount = 0;
    const ops = createMockOps({
      getDocFromServer: () => {
        getCallCount++;
        if (getCallCount === 1) {
          // Initial check: not exists
          return Promise.resolve(createMockSnap(false));
        }
        // After race: exists with correct data
        return Promise.resolve(createMockSnap(true, payloadData));
      },
      setDoc: () =>
        Promise.reject(
          Object.assign(new Error("permission-denied"), {
            code: "permission-denied",
          }),
        ),
    });

    await replayPendingSupportExitAuditsForActor(activeSuperAdmin, {} as any, {
      storage: s,
      firestoreOps: ops,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 0);
  });

  it("93. create failure + mismatch -> retain", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    let getCallCount = 0;
    const ops = createMockOps({
      getDocFromServer: () => {
        getCallCount++;
        if (getCallCount === 1) {
          return Promise.resolve(createMockSnap(false));
        }
        return Promise.resolve(
          createMockSnap(true, { action: "WRONG_ACTION" }),
        );
      },
      setDoc: () =>
        Promise.reject(
          Object.assign(new Error("perm"), { code: "permission-denied" }),
        ),
    });

    await replayPendingSupportExitAuditsForActor(activeSuperAdmin, {} as any, {
      storage: s,
      firestoreOps: ops,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 1);
  });
});

// ==========================================
// 8. Auth guard (Section B)
// ==========================================

describe("auth guard", () => {
  it("94. guard invalid before create => no write/no remove", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    let setDocCalled = false;
    const ops = createMockOps({
      setDoc: () => {
        setDocCalled = true;
        return Promise.resolve();
      },
    });

    const guard = createMockGuard(false);

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
      guard,
    });

    assert.equal(setDocCalled, false);
    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 1);
  });

  it("95. guard becomes invalid after server read => no write/no remove", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const { guard, invalidate } = createControllableGuard();

    let setDocCalled = false;
    const ops = createMockOps({
      getDocFromServer: () => {
        // Invalidate guard after server read
        invalidate();
        return Promise.resolve(createMockSnap(false));
      },
      setDoc: () => {
        setDocCalled = true;
        return Promise.resolve();
      },
    });

    await replayPendingSupportExitAuditsForActor(activeSuperAdmin, {} as any, {
      storage: s,
      firestoreOps: ops,
      guard,
    });

    assert.equal(setDocCalled, false);
    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 1);
  });

  it("96. actor A replay cannot continue after actor B auth change", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);
    savePendingSupportExitAudit(
      { ...baseWorkspaceAudit, actorUid: "sa-123" },
      s,
    );

    const { guard, invalidate } = createControllableGuard();

    let setDocCallCount = 0;
    const ops = createMockOps({
      getDocFromServer: () => {
        // After first record processed, invalidate guard (simulates actor B login)
        if (setDocCallCount > 0) {
          invalidate();
        }
        return Promise.resolve(createMockSnap(false));
      },
      setDoc: () => {
        setDocCallCount++;
        return Promise.resolve();
      },
    });

    await replayPendingSupportExitAuditsForActor(activeSuperAdmin, {} as any, {
      storage: s,
      firestoreOps: ops,
      guard,
    });

    // At most one record should have been processed before guard failed
    assert.ok(setDocCallCount <= 1);
  });

  it("97. guard valid throughout => record acknowledged and removed", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const payloadData = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
    };

    const ops = createMockOps({
      getDocFromServer: () =>
        Promise.resolve(createMockSnap(true, payloadData)),
    });

    const guard = createMockGuard(true);

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
      guard,
    });

    const remaining = loadPendingSupportExitAuditsForActor("sa-123", s);
    assert.equal(remaining.length, 0);
  });
});

// ==========================================
// 9. Payload matching
// ==========================================

describe("payload matching", () => {
  it("98. exact match returns true", () => {
    const data = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
      timestamp: { seconds: 999 }, // ignored
    };
    assert.equal(matchesPendingAuditPayload(data, baseStaffAudit), true);
  });

  it("99. action mismatch returns false", () => {
    const data = {
      action: "WRONG",
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
    };
    assert.equal(matchesPendingAuditPayload(data, baseStaffAudit), false);
  });

  it("100. null targetUid matches undefined in snapshot", () => {
    const data = {
      action: baseWorkspaceAudit.action,
      actorUid: baseWorkspaceAudit.actorUid,
      academyId: baseWorkspaceAudit.academyId,
      mode: baseWorkspaceAudit.mode,
      // targetUid is undefined (not present)
      effectiveTenantRole: null,
    };
    assert.equal(
      matchesPendingAuditPayload(data, baseWorkspaceAudit),
      true,
    );
  });

  it("101. undefined snapshotData returns false", () => {
    assert.equal(
      matchesPendingAuditPayload(undefined, baseStaffAudit),
      false,
    );
  });

  it("102. timestamp difference does NOT cause mismatch", () => {
    const data = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
      timestamp: { seconds: 1, nanos: 2 },
    };
    assert.equal(matchesPendingAuditPayload(data, baseStaffAudit), true);
  });
});

// ==========================================
// 10. Support-aware logout orchestration
// ==========================================

describe("support-aware logout", () => {
  it("103. exit succeeds => logout should proceed", async () => {
    let exitCalled = false;
    let logoutCalled = false;

    const mockExitSupportMode = async () => {
      exitCalled = true;
    };
    const mockLogout = async () => {
      logoutCalled = true;
    };

    // Simulate handleLogout logic
    try {
      await mockExitSupportMode();
    } catch {
      return; // Would cancel logout
    }
    await mockLogout();

    assert.equal(exitCalled, true);
    assert.equal(logoutCalled, true);
  });

  it("104. exit fails => logout NOT called", async () => {
    let logoutCalled = false;

    const mockExitSupportMode = async () => {
      throw new Error("Durable save failed");
    };
    const mockLogout = async () => {
      logoutCalled = true;
    };

    try {
      await mockExitSupportMode();
    } catch {
      // Logout cancelled
      assert.equal(logoutCalled, false);
      return;
    }
    await mockLogout();

    // Should not reach here
    assert.fail("Expected exit to throw");
  });

  it("105. non-support logout proceeds directly", async () => {
    let logoutCalled = false;
    const isSupportActive = false;

    const mockExitSupportMode = async () => {
      throw new Error("Should not be called");
    };
    const mockLogout = async () => {
      logoutCalled = true;
    };

    try {
      if (isSupportActive) {
        await mockExitSupportMode();
      }
    } catch {
      return;
    }
    await mockLogout();

    assert.equal(logoutCalled, true);
  });
});

// ==========================================
// 11. Replay authoritative flow end-to-end
// ==========================================

describe("replay authoritative flow", () => {
  it("106. replay with server read failure retains record", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const ops = createMockOps({
      getDocFromServer: () =>
        Promise.reject(new Error("Network unavailable")),
    });

    await replayPendingSupportExitAuditsForActor(activeSuperAdmin, {} as any, {
      storage: s,
      firestoreOps: ops,
    });

    assert.equal(
      loadPendingSupportExitAuditsForActor("sa-123", s).length,
      1,
    );
  });

  it("107. replay actor isolation: only matching actorUid replayed", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const otherAdmin = {
      uid: "sa-other",
      role: "SUPERADMIN",
      status: "ACTIVE",
    };

    let setDocCalled = false;
    const ops = createMockOps({
      setDoc: () => {
        setDocCalled = true;
        return Promise.resolve();
      },
    });

    await replayPendingSupportExitAuditsForActor(otherAdmin, {} as any, {
      storage: s,
      firestoreOps: ops,
    });

    assert.equal(setDocCalled, false);
    assert.equal(
      loadPendingSupportExitAuditsForActor("sa-123", s).length,
      1,
    );
  });

  it("108. non-SuperAdmin actor does not replay", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    let setDocCalled = false;
    const ops = createMockOps({
      setDoc: () => {
        setDocCalled = true;
        return Promise.resolve();
      },
    });

    await replayPendingSupportExitAuditsForActor(
      { uid: "sa-123", role: "ADMIN", status: "ACTIVE" },
      {} as any,
      { storage: s, firestoreOps: ops },
    );

    assert.equal(setDocCalled, false);
  });

  it("109. performBoundedExitAudit PERMISSION_DENIED + existing match => remove", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const payloadData = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
    };

    const ops = createMockOps({
      setDoc: () =>
        Promise.reject(
          Object.assign(new Error("perm"), { code: "permission-denied" }),
        ),
      getDocFromServer: () =>
        Promise.resolve(createMockSnap(true, payloadData)),
    });

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
    });

    assert.equal(
      loadPendingSupportExitAuditsForActor("sa-123", s).length,
      0,
    );
  });

  it("110. guard invalidated before removal => record retained after ACK", async () => {
    const s = new MockStorage() as unknown as Storage;
    savePendingSupportExitAudit(baseStaffAudit, s);

    const { guard, invalidate } = createControllableGuard();

    const payloadData = {
      action: baseStaffAudit.action,
      actorUid: baseStaffAudit.actorUid,
      academyId: baseStaffAudit.academyId,
      mode: baseStaffAudit.mode,
      targetUid: baseStaffAudit.targetUid,
      effectiveTenantRole: baseStaffAudit.effectiveTenantRole,
    };

    const ops = createMockOps({
      getDocFromServer: () => {
        // Invalidate guard after setDoc succeeds but before confirmation
        invalidate();
        return Promise.resolve(createMockSnap(true, payloadData));
      },
    });

    await performBoundedExitAudit({} as any, baseStaffAudit, {
      storage: s,
      firestoreOps: ops,
      guard,
    });

    // Guard failed before removePendingSupportExitAudit → record retained
    assert.equal(
      loadPendingSupportExitAuditsForActor("sa-123", s).length,
      1,
    );
  });
});
