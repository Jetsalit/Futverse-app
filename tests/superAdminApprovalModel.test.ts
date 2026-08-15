import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessRequestedIntent,
  genericApprovalBlockReason,
  isSafeAccountRole,
} from "../src/lib/accountRolePolicy";
import {
  formatFirestoreDate,
  isClaimMatchingUser,
  resolveStaffClaimView,
  getApprovalActionLabel,
  canExecuteAccountApproval,
  getUserApprovalBadge,
  isBulkApprovalEligibleSet,
  mapCanonicalClaimSnapshot,
  isExactDocumentId,
  normalizeManagedAccountStatus,
  isPendingAccountStatus,
  getManagedAccountStatusDisplay,
  canReviewModeApprove,
  canReviewModeReject,
  resolveClaimDisplayAcademy,
  type ExplicitAccountRoleSelection,
  type RawProfileClaimData,
  type UserReviewMode,
} from "../src/lib/superAdminApprovalModel";
import {
  approveUserAtomically,
  type AtomicAdminMutationDependencies,
} from "../src/lib/firestore/adminUserMutations";

// Fake dependencies for testing atomic mutations without real Firebase
function fakeAtomicDependencies() {
  const publishedUsers: Array<{ targetUid: string; patch: Record<string, unknown> }> = [];
  const publishedLogs: Array<Record<string, unknown>> = [];
  let commitCount = 0;

  const dependencies: AtomicAdminMutationDependencies = {
    timestamp: () => "SERVER_TIMESTAMP",
    async runAccountDecisionTransaction(operation) {
      const stagedUsers: Array<{ targetUid: string; patch: Record<string, unknown> }> = [];
      const stagedLogs: Array<Record<string, unknown>> = [];
      const result = await operation({
        async getUser(targetUid) {
          return {
            exists: true,
            data: {
              uid: targetUid,
              email: "authoritative@test.com",
              role: "USER",
              status: "Inactive",
              requestedRole: "PARENT",
            },
          };
        },
        updateUser(targetUid, patch) {
          stagedUsers.push({ targetUid, patch });
        },
        createAuditLog(log) {
          stagedLogs.push(log);
        },
      });
      commitCount += 1;
      publishedUsers.push(...stagedUsers);
      publishedLogs.push(...stagedLogs);
      return result;
    },
    createBatch: () => {
      const stagedUsers: Array<{ targetUid: string; patch: Record<string, unknown> }> = [];
      const stagedLogs: Array<Record<string, unknown>> = [];
      return {
        updateUser(targetUid, patch) {
          stagedUsers.push({ targetUid, patch });
        },
        createAuditLog(log) {
          stagedLogs.push(log);
        },
        async commit() {
          commitCount += 1;
          publishedUsers.push(...stagedUsers);
          publishedLogs.push(...stagedLogs);
        },
      };
    },
  };

  return {
    dependencies,
    publishedUsers,
    publishedLogs,
    get commitCount() {
      return commitCount;
    },
  };
}

describe("SuperAdmin Approval Model & Intent Classification", () => {
  it("1. PARENT => SAFE_ACCOUNT_INTENT", () => {
    const res = assessRequestedIntent("PARENT");
    assert.equal(res.kind, "SAFE_ACCOUNT_INTENT");
    if (res.kind === "SAFE_ACCOUNT_INTENT") {
      assert.equal(res.intent, "PARENT");
    }
  });

  it("2. SCOUT => SAFE_ACCOUNT_INTENT", () => {
    const res = assessRequestedIntent("SCOUT");
    assert.equal(res.kind, "SAFE_ACCOUNT_INTENT");
    if (res.kind === "SAFE_ACCOUNT_INTENT") {
      assert.equal(res.intent, "SCOUT");
    }
  });

  it("3. COACH => TENANT_MEMBERSHIP_INTENT", () => {
    const res = assessRequestedIntent("COACH");
    assert.equal(res.kind, "TENANT_MEMBERSHIP_INTENT");
    if (res.kind === "TENANT_MEMBERSHIP_INTENT") {
      assert.equal(res.intent, "COACH");
    }
  });

  it("4. ADMIN => TENANT_MEMBERSHIP_INTENT", () => {
    const res = assessRequestedIntent("ADMIN");
    assert.equal(res.kind, "TENANT_MEMBERSHIP_INTENT");
    if (res.kind === "TENANT_MEMBERSHIP_INTENT") {
      assert.equal(res.intent, "ADMIN");
    }
  });

  it("5. missing requestedRole => BLOCKED", () => {
    assert.equal(assessRequestedIntent(undefined).kind, "BLOCKED");
    assert.equal(assessRequestedIntent(null).kind, "BLOCKED");
    assert.equal(assessRequestedIntent("").kind, "BLOCKED");
  });

  it("6. privileged metadata => BLOCKED", () => {
    assert.equal(assessRequestedIntent("SUPERADMIN").kind, "BLOCKED");
    assert.equal(assessRequestedIntent("DATA_ADMIN").kind, "BLOCKED");
  });
});

describe("Explicit Account Approval Selection", () => {
  it("7. explicit approved account role starts empty", () => {
    const initialSelection: ExplicitAccountRoleSelection = "";
    assert.equal(initialSelection, "");
    assert.equal(canExecuteAccountApproval(initialSelection), false);
  });

  it("8. blank selection cannot approve", () => {
    assert.equal(canExecuteAccountApproval(""), false);
    assert.equal(getApprovalActionLabel(""), "Select approved role");
  });

  it("9. explicit PARENT selection valid", () => {
    const selection: ExplicitAccountRoleSelection = "PARENT";
    assert.equal(canExecuteAccountApproval(selection), true);
    assert.equal(getApprovalActionLabel(selection), "Approve as PARENT");
  });

  it("10. requested PARENT does NOT automatically become approved PARENT", () => {
    const user = { requestedRole: "PARENT" };
    let approvedRole: ExplicitAccountRoleSelection = "";
    assert.equal(canExecuteAccountApproval(approvedRole), false);

    approvedRole = "PARENT";
    assert.equal(canExecuteAccountApproval(approvedRole), true);

    approvedRole = "USER";
    assert.equal(canExecuteAccountApproval(approvedRole), true);
    assert.equal(getApprovalActionLabel(approvedRole), "Approve as USER");
  });

  it("11. COACH generic account approval remains blocked", () => {
    assert.notEqual(genericApprovalBlockReason("COACH"), null);
  });
});

describe("Profile Claims Matching & Staff Claim Resolution", () => {
  const targetCoachUser = {
    id: "user-coach-123",
    uid: "user-coach-123",
    email: "coach@academy.test",
    requestedRole: "COACH",
  };

  it("12. exact UID Claim matches", () => {
    const claim: RawProfileClaimData = {
      id: "claim-1",
      userId: "user-coach-123",
      userEmail: "coach@academy.test",
      requestedRole: "COACH",
      requestedAcademyId: "academy-talumball",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    assert.equal(isClaimMatchingUser(claim, targetCoachUser), true);
  });

  it("13. same email + different UID does NOT match", () => {
    const claim: RawProfileClaimData = {
      id: "claim-1",
      userId: "different-uid-999",
      userEmail: "coach@academy.test",
      requestedRole: "COACH",
      status: "PENDING",
    };
    assert.equal(isClaimMatchingUser(claim, targetCoachUser), false);
  });

  it("14. different UID cannot bind", () => {
    const claim: RawProfileClaimData = {
      id: "claim-2",
      userId: "other-user-456",
      requestedRole: "COACH",
      status: "PENDING",
    };
    assert.equal(isClaimMatchingUser(claim, targetCoachUser), false);
  });

  it("15. requested role mismatch does not bind", () => {
    const claim: RawProfileClaimData = {
      id: "claim-1",
      userId: "user-coach-123",
      requestedRole: "ADMIN",
      status: "PENDING",
    };
    assert.equal(isClaimMatchingUser(claim, targetCoachUser), false);
  });

  it("16. valid pending Claim returns requestedAcademyId", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-pending-1",
        userId: "user-coach-123",
        requestedRole: "COACH",
        requestedAcademyId: "academy-talumball",
        status: "PENDING",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "PENDING");
    if (view.state === "PENDING") {
      assert.equal(view.claimId, "claim-pending-1");
      assert.equal(view.academyId, "academy-talumball");
      assert.equal(view.role, "COACH");
    }
  });

  it("17. approved Claim returns approvedAcademyId", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-approved-1",
        userId: "user-coach-123",
        requestedRole: "COACH",
        approvedRole: "COACH",
        approvedAcademyId: "academy-talumball",
        status: "APPROVED",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "APPROVED");
    if (view.state === "APPROVED") {
      assert.equal(view.claimId, "claim-approved-1");
      assert.equal(view.academyId, "academy-talumball");
      assert.equal(view.role, "COACH");
    }
  });

  it("18. rejected Claim represented", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-rejected-1",
        userId: "user-coach-123",
        requestedRole: "COACH",
        requestedAcademyId: "academy-talumball",
        status: "REJECTED",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "REJECTED");
    if (view.state === "REJECTED") {
      assert.equal(view.claimId, "claim-rejected-1");
      assert.equal(view.role, "COACH");
    }
  });

  it("19. conflicting multiple claims fail closed / ambiguous", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-1",
        userId: "user-coach-123",
        requestedRole: "COACH",
        requestedAcademyId: "academy-1",
        status: "PENDING",
      },
      {
        id: "claim-2",
        userId: "user-coach-123",
        requestedRole: "COACH",
        requestedAcademyId: "academy-2",
        status: "PENDING",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
    if (view.state === "AMBIGUOUS") {
      assert.equal(view.claims.length, 2);
    }
  });

  it("19b. zero matching claims returns NO_CLAIM", () => {
    const view = resolveStaffClaimView([], targetCoachUser);
    assert.equal(view.state, "NO_CLAIM");
  });
});

describe("Safe Firestore Date Formatting", () => {
  it("20. Firestore Timestamp-like date works", () => {
    const mockTimestamp = {
      toDate: () => new Date("2026-05-15T12:00:00Z"),
    };
    const formatted = formatFirestoreDate(mockTimestamp);
    assert.equal(formatted, new Date("2026-05-15T12:00:00Z").toLocaleDateString());
  });

  it("21. Date works", () => {
    const d = new Date("2026-08-14T00:00:00Z");
    assert.equal(formatFirestoreDate(d), d.toLocaleDateString());
  });

  it("22. ISO string works", () => {
    const iso = "2026-01-20T08:30:00.000Z";
    assert.equal(formatFirestoreDate(iso), new Date(iso).toLocaleDateString());
  });

  it("23. timestamp number works", () => {
    const ms = 1750000000000;
    assert.equal(formatFirestoreDate(ms), new Date(ms).toLocaleDateString());
  });

  it("24. invalid date => '-'", () => {
    assert.equal(formatFirestoreDate("not-a-date"), "-");
    assert.equal(formatFirestoreDate(new Date(NaN)), "-");
    assert.equal(formatFirestoreDate(""), "-");
    assert.equal(formatFirestoreDate("   "), "-");
  });

  it("25. malformed toDate => '-'", () => {
    const malformed = { toDate: "not-a-function" };
    assert.equal(formatFirestoreDate(malformed), "-");

    const returnsNonDate = { toDate: () => "invalid" };
    assert.equal(formatFirestoreDate(returnsNonDate), "-");
  });

  it("26. throwing toDate => '-'", () => {
    const throwing = {
      toDate: () => {
        throw new Error("Corrupted Timestamp");
      },
    };
    assert.equal(formatFirestoreDate(throwing), "-");
  });

  it("27. null/undefined => '-'", () => {
    assert.equal(formatFirestoreDate(null), "-");
    assert.equal(formatFirestoreDate(undefined), "-");
  });
});

describe("Table Classification Badges & Bulk Eligibility", () => {
  it("28. mixed account/staff set is not bulk eligible", () => {
    const mixedSet = [
      { requestedRole: "PARENT" },
      { requestedRole: "COACH" },
    ];
    assert.equal(isBulkApprovalEligibleSet(mixedSet), false);

    const blockedSet = [
      { requestedRole: "PARENT" },
      { requestedRole: undefined },
    ];
    assert.equal(isBulkApprovalEligibleSet(blockedSet), false);

    const safeSet = [
      { requestedRole: "PARENT" },
      { requestedRole: "SCOUT" },
    ];
    assert.equal(isBulkApprovalEligibleSet(safeSet), true);
  });

  it("28b. table badges classify rows accurately", () => {
    assert.deepEqual(getUserApprovalBadge("PARENT"), {
      label: "PARENT — Account Approval",
      kind: "SAFE_ACCOUNT",
    });
    assert.deepEqual(getUserApprovalBadge("SCOUT"), {
      label: "SCOUT — Account Approval",
      kind: "SAFE_ACCOUNT",
    });
    assert.deepEqual(getUserApprovalBadge("COACH"), {
      label: "COACH — Academy Membership",
      kind: "TENANT_STAFF",
    });
    assert.deepEqual(getUserApprovalBadge("ADMIN"), {
      label: "ADMIN — Academy Membership",
      kind: "TENANT_STAFF",
    });
    assert.deepEqual(getUserApprovalBadge("SUPERADMIN"), {
      label: "Blocked Intent",
      kind: "BLOCKED",
    });
    assert.deepEqual(getUserApprovalBadge(undefined), {
      label: "Blocked Intent",
      kind: "BLOCKED",
    });
  });
});

describe("Backend Mutation Invariants Integration", () => {
  it("29. existing PARENT explicit backend approval remains allowed", async () => {
    const { dependencies, publishedUsers, publishedLogs } = fakeAtomicDependencies();

    await approveUserAtomically({
      actorUid: "sa-actor-1",
      targetUid: "user-parent-1",
      targetEmail: "parent@test.com",
      previousRole: "USER",
      previousStatus: "Inactive",
      requestedRole: "PARENT",
      approvedRole: "PARENT",
    }, dependencies);

    assert.equal(publishedUsers.length, 1);
    assert.equal(publishedUsers[0].patch.role, "PARENT");
    assert.equal(publishedUsers[0].patch.status, "Active");
    assert.equal(publishedLogs.length, 1);
    assert.equal(publishedLogs[0].approvedRole, "PARENT");
  });

  it("30. existing COACH generic approval remains blocked", async () => {
    const { dependencies } = fakeAtomicDependencies();

    await assert.rejects(
      () =>
        approveUserAtomically({
          actorUid: "sa-actor-1",
          targetUid: "user-coach-1",
          targetEmail: "coach@test.com",
          previousRole: "USER",
          previousStatus: "Inactive",
          requestedRole: "COACH",
          approvedRole: "COACH",
        }, dependencies),
      /requires an exact ACTIVE Membership/,
    );
  });
});

describe("Hardened Staff Claim Invariants (Tests 31 - 43)", () => {
  const targetCoachUser = {
    id: "coach-user-777",
    uid: "coach-user-777",
    email: "coach777@academy.test",
    requestedRole: "COACH",
  };

  it("31. canonical snapshot Claim ID wins over stored fake id", () => {
    const storedData = {
      id: "fake-id-stored-in-document",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-exact-1",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    const canonicalDocId = "canonical-firestore-claim-id-999";

    const mapped = mapCanonicalClaimSnapshot(canonicalDocId, storedData);
    assert.equal(mapped.id, "canonical-firestore-claim-id-999");
    assert.notEqual(mapped.id, "fake-id-stored-in-document");

    const view = resolveStaffClaimView([mapped], targetCoachUser);
    assert.equal(view.state, "PENDING");
    if (view.state === "PENDING") {
      assert.equal(view.claimId, "canonical-firestore-claim-id-999");
    }
  });

  it("32. empty requestedAcademyId fails closed", () => {
    const claim: RawProfileClaimData = {
      id: "claim-empty-acad",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    const view = resolveStaffClaimView([claim], targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("33. requestedAcademyId with slash fails closed", () => {
    const claim: RawProfileClaimData = {
      id: "claim-slash-acad",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academies/123",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    const view = resolveStaffClaimView([claim], targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("34. requestedAcademyId with surrounding whitespace fails closed", () => {
    const claimLeading: RawProfileClaimData = {
      id: "claim-leading-ws",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: " academy-123",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    assert.equal(resolveStaffClaimView([claimLeading], targetCoachUser).state, "AMBIGUOUS");

    const claimTrailing: RawProfileClaimData = {
      id: "claim-trailing-ws",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-123 ",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    assert.equal(resolveStaffClaimView([claimTrailing], targetCoachUser).state, "AMBIGUOUS");
  });

  it("35. APPROVED missing approvedAcademyId fails closed", () => {
    const claim: RawProfileClaimData = {
      id: "claim-approved-missing-acad",
      userId: "coach-user-777",
      requestedRole: "COACH",
      approvedRole: "COACH",
      approvedAcademyId: "",
      requestedAcademyId: undefined,
      status: "APPROVED",
      type: "ACADEMY_JOIN",
    };
    const view = resolveStaffClaimView([claim], targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("36. malformed approvedAcademyId fails closed", () => {
    const claim: RawProfileClaimData = {
      id: "claim-malformed-approved-acad",
      userId: "coach-user-777",
      requestedRole: "COACH",
      approvedRole: "COACH",
      approvedAcademyId: "approved/academy/id",
      status: "APPROVED",
      type: "ACADEMY_JOIN",
    };
    const view = resolveStaffClaimView([claim], targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("37. matching UID/role with unknown status fails closed", () => {
    const claimUnknown: RawProfileClaimData = {
      id: "claim-unknown-status",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-123",
      status: "UNKNOWN",
      type: "ACADEMY_JOIN",
    };
    assert.equal(resolveStaffClaimView([claimUnknown], targetCoachUser).state, "AMBIGUOUS");

    const claimActive: RawProfileClaimData = {
      id: "claim-active-status",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-123",
      status: "ACTIVE",
      type: "ACADEMY_JOIN",
    };
    assert.equal(resolveStaffClaimView([claimActive], targetCoachUser).state, "AMBIGUOUS");
  });

  it("38. matching UID/role with missing status fails closed", () => {
    const claimMissingStatus: RawProfileClaimData = {
      id: "claim-no-status",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-123",
      status: undefined,
      type: "ACADEMY_JOIN",
    };
    assert.equal(resolveStaffClaimView([claimMissingStatus], targetCoachUser).state, "AMBIGUOUS");

    const claimEmptyStatus: RawProfileClaimData = {
      id: "claim-empty-status",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-123",
      status: "",
      type: "ACADEMY_JOIN",
    };
    assert.equal(resolveStaffClaimView([claimEmptyStatus], targetCoachUser).state, "AMBIGUOUS");
  });

  it("39. malformed/unsupported relevant staff Claim type fails closed", () => {
    const claimUnsupportedType: RawProfileClaimData = {
      id: "claim-bad-type",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-123",
      status: "PENDING",
      type: "INVALID_JOIN_TYPE",
    };
    assert.equal(resolveStaffClaimView([claimUnsupportedType], targetCoachUser).state, "AMBIGUOUS");
  });

  it("40. valid PENDING claim still resolves correctly", () => {
    const claim: RawProfileClaimData = {
      id: "claim-valid-pending",
      userId: "coach-user-777",
      requestedRole: "COACH",
      requestedAcademyId: "academy-talumball-123",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    const view = resolveStaffClaimView([claim], targetCoachUser);
    assert.equal(view.state, "PENDING");
    if (view.state === "PENDING") {
      assert.equal(view.claimId, "claim-valid-pending");
      assert.equal(view.academyId, "academy-talumball-123");
      assert.equal(view.role, "COACH");
    }
  });

  it("41. valid APPROVED claim still resolves correctly", () => {
    const claim: RawProfileClaimData = {
      id: "claim-valid-approved",
      userId: "coach-user-777",
      requestedRole: "COACH",
      approvedRole: "COACH",
      approvedAcademyId: "academy-talumball-123",
      status: "APPROVED",
      type: "ACADEMY_JOIN",
    };
    const view = resolveStaffClaimView([claim], targetCoachUser);
    assert.equal(view.state, "APPROVED");
    if (view.state === "APPROVED") {
      assert.equal(view.claimId, "claim-valid-approved");
      assert.equal(view.academyId, "academy-talumball-123");
      assert.equal(view.role, "COACH");
    }
  });

  it("42. email-only identity still cannot match", () => {
    const claim: RawProfileClaimData = {
      id: "claim-email-only",
      userId: "different-coach-888",
      userEmail: "coach777@academy.test",
      requestedRole: "COACH",
      requestedAcademyId: "academy-123",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    };
    const view = resolveStaffClaimView([claim], targetCoachUser);
    assert.equal(view.state, "NO_CLAIM");
  });

  it("43. multiple valid/conflicting claims still fail closed", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-pending-A",
        userId: "coach-user-777",
        requestedRole: "COACH",
        requestedAcademyId: "academy-A",
        status: "PENDING",
        type: "ACADEMY_JOIN",
      },
      {
        id: "claim-pending-B",
        userId: "coach-user-777",
        requestedRole: "COACH",
        requestedAcademyId: "academy-B",
        status: "PENDING",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
    if (view.state === "AMBIGUOUS") {
      assert.equal(view.claims.length, 2);
    }
  });
});

describe("Hardening Pass: Bugs 1, 2, 3, 4, 5 Invariants", () => {
  const targetCoachUser = {
    id: "coach-user-999",
    uid: "coach-user-999",
    email: "coach999@academy.test",
    requestedRole: "COACH",
  };

  // Bug 1: Review Mode Guards
  it("Bug 1.1: READ_ONLY_PROFILE mode cannot approve or reject", () => {
    assert.equal(canReviewModeApprove("READ_ONLY_PROFILE", "PENDING", "PARENT", "USER"), false);
    assert.equal(canReviewModeReject("READ_ONLY_PROFILE", "PENDING", "PARENT", "USER"), false);
    assert.equal(canReviewModeApprove("READ_ONLY_PROFILE", "Inactive", "SCOUT", "USER"), false);
    assert.equal(canReviewModeReject("READ_ONLY_PROFILE", "Inactive", "SCOUT", "USER"), false);
  });

  it("Bug 1.2: APPROVAL_REVIEW for non-pending user cannot approve or reject", () => {
    assert.equal(canReviewModeApprove("APPROVAL_REVIEW", "ACTIVE", "PARENT", "USER"), false);
    assert.equal(canReviewModeReject("APPROVAL_REVIEW", "ACTIVE", "PARENT", "USER"), false);
    assert.equal(canReviewModeApprove("APPROVAL_REVIEW", "Active", "PARENT", "USER"), false);
    assert.equal(canReviewModeReject("APPROVAL_REVIEW", "Active", "PARENT", "USER"), false);
    assert.equal(canReviewModeApprove("APPROVAL_REVIEW", "REJECTED", "PARENT", "USER"), false);
    assert.equal(canReviewModeReject("APPROVAL_REVIEW", "REJECTED", "PARENT", "USER"), false);
  });

  it("Bug 1.3: generic decisions require current authoritative role USER", () => {
    for (const role of ["ADMIN", "COACH", "SUPERADMIN", "DATA_ADMIN", "PLAYER", undefined]) {
      assert.equal(canReviewModeApprove("APPROVAL_REVIEW", "PENDING", "PARENT", role), false);
      assert.equal(canReviewModeReject("APPROVAL_REVIEW", "PENDING", "PARENT", role), false);
    }
  });

  it("Bug 1.4: Staff tenant intent never exposes generic Reject Account Request", () => {
    assert.equal(canReviewModeReject("APPROVAL_REVIEW", "PENDING", "COACH", "USER"), false);
    assert.equal(canReviewModeReject("APPROVAL_REVIEW", "PENDING", "ADMIN", "USER"), false);
  });

  it("Bug 1.5: Pending safe account in APPROVAL_REVIEW allows approve and reject", () => {
    assert.equal(canReviewModeApprove("APPROVAL_REVIEW", "PENDING", "PARENT", "USER"), true);
    assert.equal(canReviewModeReject("APPROVAL_REVIEW", "PENDING", "PARENT", "USER"), true);
    assert.equal(canReviewModeApprove("APPROVAL_REVIEW", "Inactive", "SCOUT", "USER"), true);
    assert.equal(canReviewModeReject("APPROVAL_REVIEW", "Inactive", "SCOUT", "USER"), true);
  });

  it("Bug 1.6: BLOCKED requested intent cannot be rejected", () => {
    for (const intent of [undefined, null, {}, [], "UNKNOWN", "SUPERADMIN", "DATA_ADMIN"]) {
      assert.equal(canReviewModeReject("APPROVAL_REVIEW", "PENDING", intent, "USER"), false);
    }
  });

  // Bug 2: Unrelated same-UID claim filtering
  it("Bug 2.1: same UID PLAYER claim + valid COACH claim resolves normally", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-legacy-player",
        userId: "coach-user-999",
        requestedRole: "PLAYER",
        status: "PENDING",
      },
      {
        id: "claim-valid-coach",
        userId: "coach-user-999",
        requestedRole: "COACH",
        requestedAcademyId: "academy-real-123",
        status: "PENDING",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "PENDING");
    if (view.state === "PENDING") {
      assert.equal(view.claimId, "claim-valid-coach");
      assert.equal(view.academyId, "academy-real-123");
      assert.equal(view.role, "COACH");
    }
  });

  it("Bug 2.2: same UID PLAYER-only claim => NO_CLAIM for COACH", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-player-only",
        userId: "coach-user-999",
        requestedRole: "PLAYER",
        status: "PENDING",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "NO_CLAIM");
  });

  it("Bug 2.3: same UID ADMIN claim while target requestedRole COACH => ignored as different tenant role", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-admin",
        userId: "coach-user-999",
        requestedRole: "ADMIN",
        requestedAcademyId: "academy-xyz",
        status: "PENDING",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "NO_CLAIM");
  });

  it("Bug 2.4: malformed staff-relevant COACH claim => AMBIGUOUS", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-malformed-coach",
        userId: "coach-user-999",
        requestedRole: "COACH",
        requestedAcademyId: "academy-xyz",
        status: "PENDING",
        type: "MALFORMED_JOIN_TYPE",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 2.5: PLAYER_CLAIM with requestedAcademyId does not hide a valid COACH claim", () => {
    const view = resolveStaffClaimView([
      {
        id: "claim-player-with-requested-academy",
        userId: "coach-user-999",
        requestedRole: "PLAYER",
        requestedAcademyId: "academy-player-context",
        status: "PENDING",
        type: "PLAYER_CLAIM",
      },
      {
        id: "claim-valid-coach-after-player",
        userId: "coach-user-999",
        requestedRole: "COACH",
        requestedAcademyId: "academy-staff-context",
        status: "PENDING",
        type: "ACADEMY_JOIN",
      },
    ], targetCoachUser);

    assert.equal(view.state, "PENDING");
    if (view.state === "PENDING") {
      assert.equal(view.claimId, "claim-valid-coach-after-player");
      assert.equal(view.academyId, "academy-staff-context");
      assert.equal(view.role, "COACH");
    }
  });

  it("Bug 2.6: PLAYER_CLAIM with academyId only => NO_CLAIM for COACH", () => {
    const view = resolveStaffClaimView([{
      id: "claim-player-academy-only",
      userId: "coach-user-999",
      academyId: "academy-player-context",
      status: "PENDING",
      type: "PLAYER_CLAIM",
    }], targetCoachUser);

    assert.equal(view.state, "NO_CLAIM");
  });

  it("Bug 2.3a: COACH_JOIN with explicit ADMIN role remains a candidate and fails closed", () => {
    const view = resolveStaffClaimView([{
      id: "claim-coach-join-admin-conflict",
      userId: "coach-user-999",
      requestedRole: "ADMIN",
      requestedAcademyId: "academy-conflicting-role",
      status: "PENDING",
      type: "COACH_JOIN",
    }], targetCoachUser);

    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 2.3b: malformed COACH_JOIN cannot be hidden beside a valid COACH claim", () => {
    const view = resolveStaffClaimView([
      {
        id: "claim-valid-coach",
        userId: "coach-user-999",
        requestedRole: "COACH",
        requestedAcademyId: "academy-valid",
        status: "PENDING",
        type: "ACADEMY_JOIN",
      },
      {
        id: "claim-malformed-coach-join",
        userId: "coach-user-999",
        requestedRole: "ADMIN",
        requestedAcademyId: "academy-conflicting-role",
        status: "PENDING",
        type: "COACH_JOIN",
      },
    ], targetCoachUser);

    assert.equal(view.state, "AMBIGUOUS");
    if (view.state === "AMBIGUOUS") {
      assert.deepEqual(
        view.claims.map((claim) => claim.claimId),
        ["claim-valid-coach", "claim-malformed-coach-join"],
      );
    }
  });

  it("Bug 2.7: FUTID_CLAIM with academyId => NO_CLAIM for COACH", () => {
    const view = resolveStaffClaimView([{
      id: "claim-futid-academy",
      userId: "coach-user-999",
      academyId: "academy-player-context",
      status: "PENDING",
      type: "FUTID_CLAIM",
    }], targetCoachUser);

    assert.equal(view.state, "NO_CLAIM");
  });

  it("Bug 2.8: PLAYER_CLAIM with requestedRole COACH => AMBIGUOUS", () => {
    const view = resolveStaffClaimView([{
      id: "claim-player-conflicting-requested-role",
      userId: "coach-user-999",
      requestedRole: "COACH",
      requestedAcademyId: "academy-conflicting-context",
      status: "PENDING",
      type: "PLAYER_CLAIM",
    }], targetCoachUser);

    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 2.9: requestedRole PLAYER with approvedRole COACH => AMBIGUOUS", () => {
    const view = resolveStaffClaimView([{
      id: "claim-player-conflicting-approved-role",
      userId: "coach-user-999",
      requestedRole: "PLAYER",
      approvedRole: "COACH",
      approvedAcademyId: "academy-conflicting-context",
      status: "APPROVED",
      type: "PLAYER_CLAIM",
    }], targetCoachUser);

    assert.equal(view.state, "AMBIGUOUS");
  });

  // Bug 3: APPROVED Claim strict invariants
  it("Bug 3.1: APPROVED without approvedAcademyId => AMBIGUOUS even if requestedAcademyId exists", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-app-no-acad",
        userId: "coach-user-999",
        requestedRole: "COACH",
        approvedRole: "COACH",
        requestedAcademyId: "academy-valid",
        approvedAcademyId: undefined, // Missing authoritative approvedAcademyId!
        status: "APPROVED",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.2: APPROVED without approvedRole => AMBIGUOUS even if requestedRole exists", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-app-no-role",
        userId: "coach-user-999",
        requestedRole: "COACH",
        approvedRole: undefined, // Missing authoritative approvedRole!
        approvedAcademyId: "academy-valid",
        status: "APPROVED",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.3: APPROVED requestedRole / approvedRole conflict => AMBIGUOUS", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-role-conflict",
        userId: "coach-user-999",
        requestedRole: "COACH",
        approvedRole: "ADMIN",
        requestedAcademyId: "academy-valid",
        approvedAcademyId: "academy-valid",
        status: "APPROVED",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.4: APPROVED requestedAcademyId / approvedAcademyId conflict => AMBIGUOUS", () => {
    const claims: RawProfileClaimData[] = [
      {
        id: "claim-acad-conflict",
        userId: "coach-user-999",
        requestedRole: "COACH",
        approvedRole: "COACH",
        requestedAcademyId: "academy-1",
        approvedAcademyId: "academy-2", // Inconsistent academies!
        status: "APPROVED",
        type: "ACADEMY_JOIN",
      },
    ];
    const view = resolveStaffClaimView(claims, targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.3a: APPROVED COACH_JOIN cannot resolve as ADMIN", () => {
    const view = resolveStaffClaimView([{
      id: "claim-approved-coach-join-admin",
      userId: "admin-user-999",
      requestedRole: "ADMIN",
      approvedRole: "ADMIN",
      approvedAcademyId: "academy-valid",
      status: "APPROVED",
      type: "COACH_JOIN",
    }], { id: "admin-user-999", requestedRole: "ADMIN" });

    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.3b: coherent APPROVED COACH_JOIN resolves as COACH", () => {
    const view = resolveStaffClaimView([{
      id: "claim-approved-coach-join",
      userId: "coach-user-999",
      requestedRole: "COACH",
      approvedRole: "COACH",
      approvedAcademyId: "academy-valid",
      status: "APPROVED",
      type: "COACH_JOIN",
    }], targetCoachUser);

    assert.deepEqual(view, {
      state: "APPROVED",
      claimId: "claim-approved-coach-join",
      academyId: "academy-valid",
      role: "COACH",
    });
  });

  it("Bug 3.5: PENDING missing requestedRole cannot fall back to approvedRole", () => {
    const view = resolveStaffClaimView([{
      id: "claim-pending-approved-role-only",
      userId: "coach-user-999",
      approvedRole: "COACH",
      requestedAcademyId: "academy-valid",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    }], targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.6: contradictory safe role does not hide a relevant PENDING staff Claim", () => {
    const view = resolveStaffClaimView([{
      id: "claim-pending-role-conflict",
      userId: "coach-user-999",
      requestedRole: "COACH",
      approvedRole: "PLAYER",
      requestedAcademyId: "academy-valid",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    }], targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.7: REJECTED requestedRole / approvedRole conflict => AMBIGUOUS", () => {
    const view = resolveStaffClaimView([{
      id: "claim-rejected-role-conflict",
      userId: "coach-user-999",
      requestedRole: "COACH",
      approvedRole: "ADMIN",
      requestedAcademyId: "academy-valid",
      status: "REJECTED",
      type: "ACADEMY_JOIN",
    }], targetCoachUser);
    assert.equal(view.state, "AMBIGUOUS");
  });

  it("Bug 3.7b: conflicting PENDING or REJECTED Academy fields => AMBIGUOUS", () => {
    const pending = resolveStaffClaimView([{
      id: "claim-pending-academy-conflict",
      userId: "coach-user-999",
      requestedRole: "COACH",
      requestedAcademyId: "academy-requested",
      approvedAcademyId: "academy-approved",
      status: "PENDING",
      type: "ACADEMY_JOIN",
    }], targetCoachUser);
    assert.equal(pending.state, "AMBIGUOUS");

    const rejected = resolveStaffClaimView([{
      id: "claim-rejected-academy-conflict",
      userId: "coach-user-999",
      requestedRole: "COACH",
      requestedAcademyId: "academy-requested",
      approvedAcademyId: "academy-approved",
      status: "REJECTED",
      type: "ACADEMY_JOIN",
    }], targetCoachUser);
    assert.equal(rejected.state, "AMBIGUOUS");
  });

  it("Bug 3.8: valid legacy PENDING and canonical REJECTED Claims still resolve", () => {
    const legacyPending = resolveStaffClaimView([{
      id: "claim-legacy-pending",
      userId: "coach-user-999",
      requestedRole: "COACH",
      academyId: "academy-legacy",
      status: "PENDING",
    }], targetCoachUser);
    assert.equal(legacyPending.state, "PENDING");

    const canonicalRejected = resolveStaffClaimView([{
      id: "claim-canonical-rejected",
      userId: "coach-user-999",
      requestedRole: "COACH",
      requestedAcademyId: "academy-canonical",
      status: "REJECTED",
      type: "ACADEMY_JOIN",
    }], targetCoachUser);
    assert.equal(canonicalRejected.state, "REJECTED");
  });

  // Bug 4: Profile Claims Academy Resolver
  it("Bug 4.1: Profile Claims Academy resolver handles PENDING, APPROVED, REJECTED, and legacy fallback", () => {
    const pendingClaim = {
      status: "PENDING",
      requestedAcademyId: "acad-req",
      approvedAcademyId: undefined,
      academyId: "acad-leg",
    };
    assert.deepEqual(resolveClaimDisplayAcademy(pendingClaim), {
      academyId: "acad-req",
      label: "Requested",
    });

    const approvedClaim = {
      status: "APPROVED",
      requestedAcademyId: "acad-req",
      approvedAcademyId: "acad-app",
      academyId: "acad-leg",
    };
    assert.deepEqual(resolveClaimDisplayAcademy(approvedClaim), {
      academyId: "acad-app",
      label: "Approved",
    });

    const rejectedClaim = {
      status: "REJECTED",
      requestedAcademyId: "acad-req",
      approvedAcademyId: undefined,
    };
    assert.deepEqual(resolveClaimDisplayAcademy(rejectedClaim), {
      academyId: "acad-req",
      label: "Requested",
    });

    const legacyClaim = {
      status: "PENDING",
      academyId: "acad-legacy-only",
    };
    assert.deepEqual(resolveClaimDisplayAcademy(legacyClaim), {
      academyId: "acad-legacy-only",
      label: "Legacy",
    });

    const missingClaim = {
      status: "PENDING",
    };
    assert.deepEqual(resolveClaimDisplayAcademy(missingClaim), {
      academyId: "-",
    });
  });

  // Bug 5: Account status display normalization
  it("Bug 5.1: normalizeManagedAccountStatus handles casing variants safely", () => {
    assert.equal(normalizeManagedAccountStatus("Active"), "ACTIVE");
    assert.equal(normalizeManagedAccountStatus("ACTIVE"), "ACTIVE");
    assert.equal(normalizeManagedAccountStatus("active"), "ACTIVE");
    assert.equal(normalizeManagedAccountStatus("Inactive"), "INACTIVE");
    assert.equal(normalizeManagedAccountStatus("INACTIVE"), "INACTIVE");
    assert.equal(normalizeManagedAccountStatus("inactive"), "INACTIVE");
    assert.equal(normalizeManagedAccountStatus("SUSPENDED"), "INACTIVE");
    assert.equal(normalizeManagedAccountStatus("PENDING"), "PENDING");
    assert.equal(normalizeManagedAccountStatus("pending"), "PENDING");
    assert.equal(normalizeManagedAccountStatus("REJECTED"), "REJECTED");
    assert.equal(normalizeManagedAccountStatus("rejected"), "REJECTED");
    assert.equal(normalizeManagedAccountStatus(undefined), "");
    assert.equal(normalizeManagedAccountStatus(null), "");
    assert.equal(normalizeManagedAccountStatus(""), "");
    assert.equal(normalizeManagedAccountStatus("UNKNOWN_STATUS"), "");
  });

  it("Bug 5.2: isPendingAccountStatus identifies pending variants", () => {
    assert.equal(isPendingAccountStatus("PENDING"), true);
    assert.equal(isPendingAccountStatus("Inactive"), true);
    assert.equal(isPendingAccountStatus("pending"), false);
    assert.equal(isPendingAccountStatus("INACTIVE"), false);
    assert.equal(isPendingAccountStatus("inactive"), false);
    assert.equal(isPendingAccountStatus("Active"), false);
    assert.equal(isPendingAccountStatus("ACTIVE"), false);
    assert.equal(isPendingAccountStatus("REJECTED"), false);
    assert.equal(isPendingAccountStatus(undefined), false);
    assert.equal(isPendingAccountStatus(null), false);
  });

  it("Bug 5.3: getManagedAccountStatusDisplay returns normalized string safely", () => {
    assert.equal(getManagedAccountStatusDisplay("Active"), "ACTIVE");
    assert.equal(getManagedAccountStatusDisplay("ACTIVE"), "ACTIVE");
    assert.equal(getManagedAccountStatusDisplay("Inactive"), "INACTIVE");
    assert.equal(getManagedAccountStatusDisplay("INACTIVE"), "INACTIVE");
    assert.equal(getManagedAccountStatusDisplay("SUSPENDED"), "INACTIVE");
    assert.equal(getManagedAccountStatusDisplay("PENDING"), "PENDING");
    assert.equal(getManagedAccountStatusDisplay("REJECTED"), "REJECTED");
    assert.equal(getManagedAccountStatusDisplay(undefined), "UNKNOWN");
    assert.equal(getManagedAccountStatusDisplay(null), "UNKNOWN");
    assert.equal(getManagedAccountStatusDisplay({}), "UNKNOWN");
    assert.equal(getManagedAccountStatusDisplay(""), "MISSING");
    assert.equal(getManagedAccountStatusDisplay("   "), "MISSING");
  });
});
