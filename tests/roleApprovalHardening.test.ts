import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRIVILEGED_ACCOUNT_ROLES,
  REGISTRATION_INTENTS,
  SAFE_ACCOUNT_ROLES,
  TENANT_MEMBERSHIP_ROLES,
  assessRequestedIntent,
  genericApprovalBlockReason,
  isSafeAccountRole,
} from "../src/lib/accountRolePolicy.js";
import {
  APPROVED_ACCOUNT_STATUS,
  BULK_APPROVED_ROLE,
  MAX_ATOMIC_BULK_APPROVAL_USERS,
  approveUserAtomically,
  bulkApproveUsersAtomically,
  rejectUserAtomically,
  updateUserRoleAtomically,
  updateUserStatusAtomically,
  type AtomicAdminMutationDependencies,
} from "../src/lib/firestore/adminUserMutations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

interface PublishedWrite {
  targetUid: string;
  patch: Record<string, unknown>;
}

function fakeAtomicDependencies(options: {
  failUserQueue?: boolean;
  failLogQueue?: boolean;
  failCommit?: boolean;
} = {}) {
  const publishedUsers: PublishedWrite[] = [];
  const publishedLogs: Array<Record<string, unknown>> = [];
  let commitCount = 0;

  const dependencies: AtomicAdminMutationDependencies = {
    timestamp: () => "SERVER_TIMESTAMP",
    createBatch: () => {
      const stagedUsers: PublishedWrite[] = [];
      const stagedLogs: Array<Record<string, unknown>> = [];
      return {
        updateUser(targetUid, patch) {
          if (options.failUserQueue) throw new Error("simulated User-write failure");
          stagedUsers.push({ targetUid, patch });
        },
        createAuditLog(log) {
          if (options.failLogQueue) throw new Error("simulated audit-log failure");
          stagedLogs.push(log);
        },
        async commit() {
          commitCount += 1;
          if (options.failCommit) throw new Error("simulated atomic commit failure");
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

function target(requestedRole: unknown) {
  return {
    targetUid: "target-user",
    targetEmail: "target@example.test",
    previousRole: "USER",
    previousStatus: "Inactive",
    requestedRole,
  };
}

describe("Access A6 role policy", () => {
  it("defines the exact registration, account, tenant, and privileged role sets", () => {
    assert.deepEqual(REGISTRATION_INTENTS, ["COACH", "PLAYER", "SCOUT", "PARENT"]);
    assert.deepEqual(SAFE_ACCOUNT_ROLES, ["USER", "PLAYER", "SCOUT", "PARENT"]);
    assert.deepEqual(TENANT_MEMBERSHIP_ROLES, ["ADMIN", "COACH"]);
    assert.deepEqual(PRIVILEGED_ACCOUNT_ROLES, ["SUPERADMIN", "DATA_ADMIN"]);
  });

  it("keeps Login choices and the Firestore Rules allowlist synchronized with production policy", () => {
    const loginSource = readFileSync(path.join(repoRoot, "src/components/Login.tsx"), "utf8");
    const rulesSource = readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");
    const allowlistBody = rulesSource.match(
      /function validRegistrationRequestedRole\(userData\)[\s\S]*?in \[([\s\S]*?)\];/,
    )?.[1];
    assert.ok(allowlistBody, "requestedRole Rules allowlist must be explicit");
    const rulesIntents = [...allowlistBody.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);

    assert.deepEqual(rulesIntents, REGISTRATION_INTENTS);
    assert.match(loginSource, /REGISTRATION_INTENT_OPTIONS\.map/);
    assert.doesNotMatch(loginSource, /\{\s*id:\s*"COACH"/);
  });

  it("labels safe, Membership-bound, privileged, missing, and malformed legacy intent safely", () => {
    assert.equal(assessRequestedIntent("PLAYER").kind, "SAFE_ACCOUNT_INTENT");
    assert.equal(assessRequestedIntent("ADMIN").kind, "TENANT_MEMBERSHIP_INTENT");
    assert.equal(assessRequestedIntent("COACH").kind, "TENANT_MEMBERSHIP_INTENT");
    assert.equal(assessRequestedIntent("SUPERADMIN").kind, "BLOCKED");
    assert.equal(assessRequestedIntent(undefined).display, "Missing (blocked requested intent)");
    assert.equal(assessRequestedIntent(null).display, "null (blocked requested intent)");
    assert.equal(assessRequestedIntent({ role: "PLAYER" }).display, "Object (blocked requested intent)");
    assert.equal(assessRequestedIntent(["PLAYER"]).display, "Array (blocked requested intent)");
  });

  it("permits only safe global roles in generic account role controls", () => {
    for (const role of SAFE_ACCOUNT_ROLES) assert.equal(isSafeAccountRole(role), true);
    for (const role of [...TENANT_MEMBERSHIP_ROLES, ...PRIVILEGED_ACCOUNT_ROLES]) {
      assert.equal(isSafeAccountRole(role), false);
    }
  });
});

describe("Access A6 atomic administrative mutations", () => {
  it("individual approval uses the explicit approvedRole and never copies requestedRole", async () => {
    const fake = fakeAtomicDependencies();
    await approveUserAtomically({
      ...target("SCOUT"),
      actorUid: "super-admin",
      approvedRole: "PLAYER",
    }, fake.dependencies);

    assert.equal(fake.commitCount, 1);
    assert.deepEqual(fake.publishedUsers[0], {
      targetUid: "target-user",
      patch: {
        role: "PLAYER",
        status: APPROVED_ACCOUNT_STATUS,
        approvedBy: "super-admin",
        approvedAt: "SERVER_TIMESTAMP",
        updatedAt: "SERVER_TIMESTAMP",
      },
    });
    assert.equal(fake.publishedLogs[0]?.actorUid, "super-admin");
    assert.equal(fake.publishedLogs[0]?.targetUid, "target-user");
    assert.equal(fake.publishedLogs[0]?.approvedRole, "PLAYER");
    assert.equal(fake.publishedLogs[0]?.requestedIntent, "SCOUT (requested account intent)");
  });

  it("fails closed for privileged, unknown, malformed, and Membership-bound requested intent", async () => {
    for (const requestedRole of [
      "SUPERADMIN",
      "DATA_ADMIN",
      "UNKNOWN",
      undefined,
      null,
      {},
      [],
      "ADMIN",
      "COACH",
    ]) {
      const fake = fakeAtomicDependencies();
      await assert.rejects(
        approveUserAtomically({
          ...target(requestedRole),
          actorUid: "super-admin",
          approvedRole: "USER",
        }, fake.dependencies),
      );
      assert.equal(fake.commitCount, 0);
      assert.deepEqual(fake.publishedUsers, []);
      assert.deepEqual(fake.publishedLogs, []);
    }
  });

  it("requires an explicit safe approvedRole", async () => {
    for (const approvedRole of ["ADMIN", "COACH", "SUPERADMIN", "DATA_ADMIN", "UNKNOWN", null]) {
      const fake = fakeAtomicDependencies();
      await assert.rejects(approveUserAtomically({
        ...target("PARENT"),
        actorUid: "super-admin",
        approvedRole,
      }, fake.dependencies));
      assert.equal(fake.commitCount, 0);
    }
  });

  it("bulk approval commits once and produces only USER / Active", async () => {
    const fake = fakeAtomicDependencies();
    await bulkApproveUsersAtomically({
      actorUid: "super-admin",
      targets: [
        target("PLAYER"),
        { ...target("SCOUT"), targetUid: "target-two" },
      ],
    }, fake.dependencies);

    assert.equal(BULK_APPROVED_ROLE, "USER");
    assert.equal(fake.commitCount, 1);
    assert.equal(fake.publishedUsers.length, 2);
    assert.equal(fake.publishedLogs.length, 2);
    for (const write of fake.publishedUsers) {
      assert.equal(write.patch.role, "USER");
      assert.equal(write.patch.status, "Active");
    }
    for (const log of fake.publishedLogs) {
      assert.equal(log.approvedRole, "USER");
      assert.equal(log.action, "USER_BULK_APPROVED");
    }
  });

  it("bulk approval refuses an entire selection containing blocked metadata", async () => {
    const fake = fakeAtomicDependencies();
    await assert.rejects(bulkApproveUsersAtomically({
      actorUid: "super-admin",
      targets: [
        target("PARENT"),
        { ...target("SUPERADMIN"), targetUid: "crafted-legacy" },
      ],
    }, fake.dependencies), /Bulk approval blocked/);
    assert.equal(fake.commitCount, 0);
    assert.deepEqual(fake.publishedUsers, []);
    assert.deepEqual(fake.publishedLogs, []);
  });

  it("enforces the exact atomic Firestore batch limit before queuing writes", async () => {
    const fake = fakeAtomicDependencies();
    const targets = Array.from(
      { length: MAX_ATOMIC_BULK_APPROVAL_USERS + 1 },
      (_, index) => ({ ...target("SCOUT"), targetUid: `target-${index}` }),
    );
    await assert.rejects(
      bulkApproveUsersAtomically({ actorUid: "super-admin", targets }, fake.dependencies),
      /limited to/,
    );
    assert.equal(fake.commitCount, 0);
  });

  it("simulated audit-log failure leaves the User unpublished", async () => {
    const fake = fakeAtomicDependencies({ failLogQueue: true });
    await assert.rejects(approveUserAtomically({
      ...target("PLAYER"),
      actorUid: "super-admin",
      approvedRole: "PLAYER",
    }, fake.dependencies), /audit-log failure/);
    assert.equal(fake.commitCount, 0);
    assert.deepEqual(fake.publishedUsers, []);
    assert.deepEqual(fake.publishedLogs, []);
  });

  it("simulated User-write failure creates no audit log", async () => {
    const fake = fakeAtomicDependencies({ failUserQueue: true });
    await assert.rejects(rejectUserAtomically({
      ...target("SCOUT"),
      actorUid: "super-admin",
      rejectionReason: "Rejected by admin",
    }, fake.dependencies), /User-write failure/);
    assert.equal(fake.commitCount, 0);
    assert.deepEqual(fake.publishedUsers, []);
    assert.deepEqual(fake.publishedLogs, []);
  });

  it("simulated commit failure publishes neither side", async () => {
    const fake = fakeAtomicDependencies({ failCommit: true });
    await assert.rejects(updateUserStatusAtomically({
      ...target("PARENT"),
      actorUid: "super-admin",
      approvedStatus: "ACTIVE",
    }, fake.dependencies), /atomic commit failure/);
    assert.equal(fake.commitCount, 1);
    assert.deepEqual(fake.publishedUsers, []);
    assert.deepEqual(fake.publishedLogs, []);
  });

  it("role and status updates are atomic, safe-listed, and self-protected", async () => {
    const roleFake = fakeAtomicDependencies();
    await updateUserRoleAtomically({
      ...target("PARENT"),
      actorUid: "super-admin",
      approvedRole: "SCOUT",
    }, roleFake.dependencies);
    assert.equal(roleFake.publishedUsers[0]?.patch.role, "SCOUT");
    assert.equal(roleFake.publishedLogs[0]?.approvedRole, "SCOUT");

    await assert.rejects(updateUserRoleAtomically({
      ...target("COACH"),
      actorUid: "super-admin",
      approvedRole: "COACH",
    }, fakeAtomicDependencies().dependencies), /safe account role/);

    await assert.rejects(updateUserStatusAtomically({
      ...target("SCOUT"),
      targetUid: "super-admin",
      actorUid: "super-admin",
      approvedStatus: "INACTIVE",
    }, fakeAtomicDependencies().dependencies), /cannot change their own/);
  });

  it(
    "all exposed administrative User controls route through atomic helpers and bulk approval stays out of the mixed-intent UI",
    () => {
      const portalSource = readFileSync(
        path.join(repoRoot, "src/components/SuperadminPortal.tsx"),
        "utf8",
      );

      assert.doesNotMatch(
        portalSource,
        /\bupdateDoc\b|\bsetDoc\b|\baddDoc\b|\bdeleteDoc\b|\brunTransaction\b|\bwriteBatch\b|\bupdateUserStatus\s*\(/,
      );

      for (const helper of [
        "approveUserAtomically",
        "rejectUserAtomically",
        "updateUserRoleAtomically",
        "updateUserStatusAtomically",
      ]) {
        assert.match(
          portalSource,
          new RegExp(`\\b${helper}\\b`),
        );
      }

      assert.doesNotMatch(
        portalSource,
        /\bbulkApproveUsersAtomically\b/,
      );

      assert.doesNotMatch(
        portalSource,
        /Approve Filtered as USER/,
      );
    },
  );

  it("explains why tenant intent cannot enter generic approval", () => {
    assert.match(genericApprovalBlockReason("ADMIN") || "", /ACTIVE Membership/);
    assert.match(genericApprovalBlockReason("COACH") || "", /Membership/);
  });
});
