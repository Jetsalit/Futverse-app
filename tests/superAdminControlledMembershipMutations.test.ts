import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  mutateMembershipStatusAtomically,
  type ControlledMembershipMutationDependencies,
} from "../src/lib/firestore/superAdminControlledMembershipMutations";

const adapterPath = path.join(
  process.cwd(),
  "src/lib/firestore/superAdminControlledMembershipMutations.ts",
);

function actorData(
  overrides: Record<string, unknown> = {},
) {
  return {
    uid: "superadmin",
    role: "SUPERADMIN",
    status: "Active",
    ...overrides,
  };
}

function membershipData(
  overrides: Record<string, unknown> = {},
) {
  return {
    userId: "coach-1",
    academyId: "academy-a",
    role: "COACH",
    status: "ACTIVE",
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: "joined-at",
    joinedBy: "superadmin",
    updatedAt: "updated-at",
    ...overrides,
  };
}

function baseInput() {
  return {
    actorUid: "superadmin",
    targetUid: "coach-1",
    academyId: "academy-a",
    action: "SUSPEND" as const,
    expectedStatus: "ACTIVE" as const,
    expectedRole: "COACH" as const,
    expectedSource:
      "SUPERADMIN_ASSIGNMENT" as const,
  };
}

interface HarnessOptions {
  authenticatedUid?: string | null;
  actor?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
}

function createHarness(
  options: HarnessOptions = {},
) {
  const authenticatedUid =
    options.authenticatedUid === undefined
      ? "superadmin"
      : options.authenticatedUid;

  const actor =
    options.actor === undefined
      ? actorData()
      : options.actor;

  const membership =
    options.membership === undefined
      ? membershipData()
      : options.membership;

  const updates: Array<{
    academyId: string;
    uid: string;
    patch: Record<string, unknown>;
  }> = [];

  const logs:
    Array<Record<string, unknown>> = [];

  let transactionRuns = 0;

  const dependencies:
    ControlledMembershipMutationDependencies = {
      getAuthenticatedUid() {
        return authenticatedUid;
      },

      async runControlledMembershipTransaction(
        operation,
      ) {
        transactionRuns += 1;

        return operation({
          async getUser(uid) {
            assert.equal(
              uid,
              "superadmin",
            );

            return actor
              ? {
                  exists: true,
                  data: actor,
                }
              : {
                  exists: false,
                };
          },

          async getMembership(
            academyId,
            uid,
          ) {
            assert.equal(
              academyId,
              "academy-a",
            );

            assert.equal(
              uid,
              "coach-1",
            );

            return membership
              ? {
                  exists: true,
                  data: membership,
                }
              : {
                  exists: false,
                };
          },

          updateMembership(
            academyId,
            uid,
            patch,
          ) {
            updates.push({
              academyId,
              uid,
              patch,
            });
          },

          createAuditLog(log) {
            logs.push(log);
          },
        });
      },

      timestamp() {
        return "SERVER_TIMESTAMP";
      },
    };

  return {
    dependencies,
    updates,
    logs,
    get transactionRuns() {
      return transactionRuns;
    },
  };
}

describe(
  "SuperAdmin Controlled Membership Mutations",
  () => {
    it("1. owns no account-role or Membership-delete mutation path", () => {
      const source =
        fs.readFileSync(
          adapterPath,
          "utf8",
        );

      assert.doesNotMatch(
        source,
        /\bupdateUser\b|\bsetUser\b|\bdeleteMembership\b|\bdeleteDoc\b/,
      );

      assert.doesNotMatch(
        source,
        /users\.role|tenantRole|activeAcademyId/,
      );
    });

    it("2. atomically suspends the authoritative ACTIVE Membership and audits it", async () => {
      const harness =
        createHarness();

      const result =
        await mutateMembershipStatusAtomically(
          baseInput(),
          harness.dependencies,
        );

      assert.equal(
        harness.transactionRuns,
        1,
      );

      assert.deepEqual(
        harness.updates,
        [
          {
            academyId:
              "academy-a",
            uid:
              "coach-1",
            patch: {
              status:
                "SUSPENDED",
              updatedAt:
                "SERVER_TIMESTAMP",
            },
          },
        ],
      );

      assert.equal(
        harness.logs.length,
        1,
      );

      assert.deepEqual(
        harness.logs[0],
        {
          action:
            "SUPERADMIN_MEMBERSHIP_STATUS_CHANGED",
          actorUid:
            "superadmin",
          targetUid:
            "coach-1",
          targetUser:
            "coach-1",
          academyId:
            "academy-a",
          controlledAction:
            "SUSPEND",
          previousStatus:
            "ACTIVE",
          newStatus:
            "SUSPENDED",
          membershipRole:
            "COACH",
          membershipSource:
            "SUPERADMIN_ASSIGNMENT",
          timestamp:
            "SERVER_TIMESTAMP",
        },
      );

      assert.equal(
        result.previousStatus,
        "ACTIVE",
      );

      assert.equal(
        result.newStatus,
        "SUSPENDED",
      );
    });

    it("3. rejects missing or mismatched authenticated Firebase actor before transaction", async () => {
      for (
        const authenticatedUid
        of [null, "different-user"]
      ) {
        const harness =
          createHarness({
            authenticatedUid,
          });

        await assert.rejects(
          mutateMembershipStatusAtomically(
            baseInput(),
            harness.dependencies,
          ),
          /Authenticated Firebase actor/,
        );

        assert.equal(
          harness.transactionRuns,
          0,
        );
      }
    });

    it("4. revalidates ACTIVE SUPERADMIN from the authoritative User document", async () => {
      const scenarios = [
        actorData({
          status: "Inactive",
        }),
        actorData({
          role: "ADMIN",
        }),
        actorData({
          uid: "other-user",
        }),
      ];

      for (const actor of scenarios) {
        const harness =
          createHarness({
            actor,
          });

        await assert.rejects(
          mutateMembershipStatusAtomically(
            baseInput(),
            harness.dependencies,
          ),
        );

        assert.equal(
          harness.updates.length,
          0,
        );

        assert.equal(
          harness.logs.length,
          0,
        );
      }
    });

    it("5. missing authoritative Membership fails closed", async () => {
      const harness =
        createHarness({
          membership: null,
        });

      await assert.rejects(
        mutateMembershipStatusAtomically(
          baseInput(),
          harness.dependencies,
        ),
        /Membership no longer exists/,
      );

      assert.equal(
        harness.updates.length,
        0,
      );

      assert.equal(
        harness.logs.length,
        0,
      );
    });

    it("6. malformed or cross-identity Membership evidence fails closed", async () => {
      const scenarios = [
        membershipData({
          userId:
            "different-user",
        }),
        membershipData({
          academyId:
            "academy-b",
        }),
        membershipData({
          unexpectedField:
            true,
        }),
        membershipData({
          joinedBy:
            " bad-actor",
        }),
      ];

      for (
        const membership of scenarios
      ) {
        const harness =
          createHarness({
            membership,
          });

        await assert.rejects(
          mutateMembershipStatusAtomically(
            baseInput(),
            harness.dependencies,
          ),
        );

        assert.equal(
          harness.updates.length,
          0,
        );

        assert.equal(
          harness.logs.length,
          0,
        );
      }
    });

    it("7. stale status, role or source from the review snapshot fails closed", async () => {
      const scenarios = [
        {
          membership:
            membershipData({
              status: "SUSPENDED",
            }),
        },
        {
          membership:
            membershipData({
              role: "ADMIN",
            }),
        },
        {
          membership:
            membershipData({
              source: "INVITE",
            }),
        },
      ];

      for (
        const scenario of scenarios
      ) {
        const harness =
          createHarness(scenario);

        await assert.rejects(
          mutateMembershipStatusAtomically(
            baseInput(),
            harness.dependencies,
          ),
          /changed during review/,
        );

        assert.equal(
          harness.updates.length,
          0,
        );

        assert.equal(
          harness.logs.length,
          0,
        );
      }
    });

    it("8. persisted terminal states remain blocked even when expected state matches", async () => {
      for (
        const status
        of ["LEFT", "REVOKED"] as const
      ) {
        const harness =
          createHarness({
            membership:
              membershipData({
                status,
              }),
          });

        await assert.rejects(
          mutateMembershipStatusAtomically(
            {
              ...baseInput(),
              action:
                "REACTIVATE",
              expectedStatus:
                status,
            },
            harness.dependencies,
          ),
        );

        assert.equal(
          harness.updates.length,
          0,
        );
      }
    });

    it("9. SUSPENDED Membership can be reactivated using persisted authoritative state", async () => {
      const harness =
        createHarness({
          membership:
            membershipData({
              status:
                "SUSPENDED",
            }),
        });

      const result =
        await mutateMembershipStatusAtomically(
          {
            ...baseInput(),
            action:
              "REACTIVATE",
            expectedStatus:
              "SUSPENDED",
          },
          harness.dependencies,
        );

      assert.equal(
        result.newStatus,
        "ACTIVE",
      );

      assert.deepEqual(
        harness.updates[0]?.patch,
        {
          status:
            "ACTIVE",
          updatedAt:
            "SERVER_TIMESTAMP",
        },
      );
    });

    it("10. approvalClaimId schema remains source-bound and is never rewritten", async () => {
      const missingClaimId =
        createHarness({
          membership:
            membershipData({
              source:
                "CLAIM_APPROVAL",
            }),
        });

      await assert.rejects(
        mutateMembershipStatusAtomically(
          {
            ...baseInput(),
            expectedSource:
              "CLAIM_APPROVAL",
          },
          missingClaimId.dependencies,
        ),
        /approvalClaimId/,
      );

      const illegalClaimId =
        createHarness({
          membership:
            membershipData({
              approvalClaimId:
                "claim-1",
            }),
        });

      await assert.rejects(
        mutateMembershipStatusAtomically(
          baseInput(),
          illegalClaimId.dependencies,
        ),
        /must not contain approvalClaimId/,
      );

      const canonicalClaim =
        createHarness({
          membership:
            membershipData({
              source:
                "CLAIM_APPROVAL",
              approvalClaimId:
                "claim-1",
            }),
        });

      await mutateMembershipStatusAtomically(
        {
          ...baseInput(),
          expectedSource:
            "CLAIM_APPROVAL",
        },
        canonicalClaim.dependencies,
      );

      assert.deepEqual(
        canonicalClaim.updates[0]?.patch,
        {
          status:
            "SUSPENDED",
          updatedAt:
            "SERVER_TIMESTAMP",
        },
      );
    });
  },
);
