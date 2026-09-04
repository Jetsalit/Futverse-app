import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import {
  ERROR_CODES,
  ProClubProvisioningError,
  validateAndNormalizeProvisioningRequest,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  createProClubProvisioningService,
  type ProClubProvisioningService,
} from "../functions/src/proClubProvisioning/service.ts";
import {
  assertPinnedProject,
  createLocalTrustedOperatorVerifier,
  EXPECTED_PROJECT_ID,
  LOCAL_OPERATOR_ENV_KEY,
  resolveTrustedLocalOperatorUid,
} from "../scripts/lib/localTrustedOperatorVerifier.ts";
import {
  executeLocalProClubProvisioning,
  parseProvisioningCliArgs,
  runLocalProvisioningCli,
  type LocalProvisioningCliOptions,
} from "../scripts/provisionProClubLocal.ts";

/**
 * Deterministic in-memory Firestore double for unit testing.
 * Strictly simulates the transactional read/write contract required by ProClubProvisioningService.
 */
class InMemoryFirestore {
  readonly projectId: string;
  public documents: Map<string, any>;

  constructor(
    projectId: string = EXPECTED_PROJECT_ID,
    initialData: Record<string, any> = {},
  ) {
    this.projectId = projectId;
    this.documents = new Map(Object.entries(initialData));
  }

  collection(collName: string) {
    return {
      doc: (docId: string) => {
        const fullPath = `${collName}/${docId}`;
        return {
          id: docId,
          path: fullPath,
          collection: (subCollName: string) => ({
            doc: (subDocId: string) => ({
              id: subDocId,
              path: `${fullPath}/${subCollName}/${subDocId}`,
            }),
          }),
        };
      },
    };
  }

  async runTransaction<T>(
    updateFunction: (transaction: any) => Promise<T>,
  ): Promise<T> {
    const stagedWrites: Map<string, any> = new Map();
    const transaction = {
      get: async (ref: { path: string }) => {
        const staged = stagedWrites.get(ref.path);
        const data = staged !== undefined ? staged : this.documents.get(ref.path);
        return {
          id: ref.path.split("/").pop(),
          exists: data !== undefined,
          data: () => (data !== undefined ? JSON.parse(JSON.stringify(data)) : undefined),
        };
      },
      set: (ref: { path: string }, data: any) => {
        stagedWrites.set(ref.path, JSON.parse(JSON.stringify(data)));
      },
    };

    const result = await updateFunction(transaction);
    for (const [path, data] of stagedWrites.entries()) {
      this.documents.set(path, data);
    }
    return result;
  }
}

function createSeedData(): Record<string, any> {
  return {
    "users/user-superadmin-789": {
      role: "SUPERADMIN",
      status: "ACTIVE",
      name: "Platform SuperAdmin",
    },
    "users/user-superadmin-second": {
      role: "SUPERADMIN",
      status: "ACTIVE",
      name: "Second Platform SuperAdmin",
    },
    "users/user-inactive-superadmin": {
      role: "SUPERADMIN",
      status: "INACTIVE",
      name: "Inactive SuperAdmin",
    },
    "users/user-coach-123": {
      role: "COACH",
      status: "ACTIVE",
      name: "Head Coach",
    },
    "users/user-owner-123": {
      role: "COACH",
      status: "ACTIVE",
      name: "Prospective Club Owner",
    },
    "users/user-owner-second": {
      role: "COACH",
      status: "ACTIVE",
      name: "Second Prospective Club Owner",
    },
  };
}

const baseCliOptions: LocalProvisioningCliOptions = {
  provisioningId: "prov-lampang-001",
  clubId: "club-lampang",
  name: "Lampang FC",
  shortName: "LFC",
  level: "T1",
  country: "TH",
  logoUrl: "https://example.com/logo.png",
  initialOwnerUid: "user-owner-123",
  dryRun: false,
  jsonOutput: false,
};

test("FUTVERSE Local Trusted Operator Auth Bridge & CLI Test Suite", async (t) => {
  await t.test("1. Missing FUTVERSE_LOCAL_OPERATOR_UID fails closed", async () => {
    // Both undefined and missing keys fail closed
    for (const env of [{}, { [LOCAL_OPERATOR_ENV_KEY]: undefined }]) {
      assert.throws(
        () => resolveTrustedLocalOperatorUid(env),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL &&
          err.message.includes("is not set"),
      );

      const verifier = createLocalTrustedOperatorVerifier({ env });
      await assert.rejects(
        verifier.verifyAuthorizationHeader("Bearer any-token"),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      );
    }
  });

  await t.test("2. Malformed FUTVERSE_LOCAL_OPERATOR_UID fails closed", async () => {
    const malformedUids = [
      "",
      "   ",
      "\t\n",
      "user/with/slash",
      " user-leading-space",
      "user-trailing-space ",
      "user with spaces",
    ];

    for (const badUid of malformedUids) {
      assert.throws(
        () => resolveTrustedLocalOperatorUid({ [LOCAL_OPERATOR_ENV_KEY]: badUid }),
        (err) =>
          err instanceof ProClubProvisioningError &&
          err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      );
    }
  });

  await t.test("3. Request/body/input payload cannot override requester UID", () => {
    // 3a. Core level: caller-supplied requestingSuperAdminUid is rejected by core schema
    const callerPayloadWithRequester = {
      provisioningId: "prov-001",
      clubId: "club-001",
      name: "Club One",
      level: "T1",
      initialOwnerUid: "user-owner-123",
      requestingSuperAdminUid: "attacker-override-uid",
    };

    assert.throws(
      () =>
        validateAndNormalizeProvisioningRequest(
          callerPayloadWithRequester,
          "verified-superadmin-uid",
          "2026-09-04T00:00:00.000Z",
        ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.INVALID_PROVISIONING_REQUEST &&
        err.message.includes("requestingSuperAdminUid"),
    );

    // 3b. Local verifier strictly ignores any passed authorization header or body
    const verifier = createLocalTrustedOperatorVerifier({
      env: { [LOCAL_OPERATOR_ENV_KEY]: "trusted-operator-uid" },
    });
    return verifier
      .verifyAuthorizationHeader("Bearer attacker-token-claiming-another-uid")
      .then((resolvedUid) => {
        assert.equal(resolvedUid, "trusted-operator-uid");
      });
  });

  await t.test("4. CLI arguments reject --requester-uid, --requesterUid, --operator-uid, --operatorUid", () => {
    const forbiddenFlags = [
      "--requester-uid",
      "--requesterUid",
      "--requester_uid",
      "--operator-uid",
      "--operatorUid",
      "--operator_uid",
      "--superadmin-uid",
      "--superadminUid",
      "--admin-uid",
      "--adminUid",
      "--caller-uid",
      "--callerUid",
      "--requester",
      "--operator",
    ];

    for (const flag of forbiddenFlags) {
      assert.throws(
        () =>
          parseProvisioningCliArgs([
            flag,
            "injected-uid",
            "--provisioning-id",
            "prov-001",
            "--club-id",
            "club-001",
            "--name",
            "Club One",
            "--level",
            "T1",
            "--initial-owner-uid",
            "owner-001",
          ]),
        (err) =>
          err instanceof Error &&
          err.message.includes("Security Violation") &&
          err.message.includes("strictly forbidden"),
      );

      // Also reject inline flag=value format
      assert.throws(
        () =>
          parseProvisioningCliArgs([
            `${flag}=injected-uid`,
            "--provisioning-id",
            "prov-001",
            "--club-id",
            "club-001",
            "--name",
            "Club One",
            "--level",
            "T1",
            "--initial-owner-uid",
            "owner-001",
          ]),
        (err) =>
          err instanceof Error &&
          err.message.includes("Security Violation") &&
          err.message.includes("strictly forbidden"),
      );
    }
  });

  await t.test("5. initialOwnerUid cannot become requester UID", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());
    const targetOwnerUid = "user-owner-123";

    // 5a. When operator UID is configured as SUPERADMIN, initialOwnerUid is preserved as owner, not requester
    const result = await executeLocalProClubProvisioning(
      { ...baseCliOptions, initialOwnerUid: targetOwnerUid },
      {
        app: { options: { projectId: EXPECTED_PROJECT_ID } },
        firestore: memoryStore as unknown as Firestore,
        env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-789" },
      },
    );

    assert.equal(result.ok, true);
    if (result.dryRun === false) {
      assert.equal(result.ownerUid, targetOwnerUid);
      assert.equal(result.requestingSuperAdminUid, "user-superadmin-789");
      assert.notEqual(result.requestingSuperAdminUid, targetOwnerUid);
    }

    // 5b. When FUTVERSE_LOCAL_OPERATOR_UID is missing, initialOwnerUid does NOT become fallback requester
    await assert.rejects(
      executeLocalProClubProvisioning(
        { ...baseCliOptions, initialOwnerUid: targetOwnerUid },
        {
          app: { options: { projectId: EXPECTED_PROJECT_ID } },
          firestore: memoryStore as unknown as Firestore,
          env: {}, // Missing operator config
        },
      ),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
    );
  });

  await t.test("6. Configured active SUPERADMIN succeeds", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());

    const result = await executeLocalProClubProvisioning(baseCliOptions, {
      app: { options: { projectId: EXPECTED_PROJECT_ID } },
      firestore: memoryStore as unknown as Firestore,
      env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-789" },
    });

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, false);
    if (!result.dryRun) {
      assert.equal(result.status, "COMPLETED");
      assert.equal(result.provisioningId, "prov-lampang-001");
      assert.equal(result.clubId, "club-lampang");
      assert.equal(result.ownerUid, "user-owner-123");
      assert.equal(result.requestingSuperAdminUid, "user-superadmin-789");
      assert.equal(result.isReplay, false);
    }

    // Verify written documents in memory store
    const clubDoc = memoryStore.documents.get("proClubs/club-lampang");
    assert.ok(clubDoc);
    assert.equal(clubDoc.name, "Lampang FC");
    assert.equal(clubDoc.status, "ACTIVE");

    const memberDoc = memoryStore.documents.get(
      "proClubs/club-lampang/members/user-owner-123",
    );
    assert.ok(memberDoc);
    assert.equal(memberDoc.authorizationRole, "OWNER");
    assert.equal(memberDoc.status, "ACTIVE");

    const auditDoc = memoryStore.documents.get(
      "proClubProvisioningAudits/prov-lampang-001",
    );
    assert.ok(auditDoc);
    assert.equal(auditDoc.requestingSuperAdminUid, "user-superadmin-789");
    assert.equal(auditDoc.status, "COMPLETED");
  });

  await t.test("7. Configured non-SUPERADMIN rejected by existing Firestore transaction authorization", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());

    // user-coach-123 is ACTIVE but role is COACH, not SUPERADMIN
    await assert.rejects(
      executeLocalProClubProvisioning(baseCliOptions, {
        app: { options: { projectId: EXPECTED_PROJECT_ID } },
        firestore: memoryStore as unknown as Firestore,
        env: { [LOCAL_OPERATOR_ENV_KEY]: "user-coach-123" },
      }),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL &&
        err.message.includes("not a SUPERADMIN"),
    );

    // Verify zero documents were created
    assert.equal(memoryStore.documents.has("proClubs/club-lampang"), false);
    assert.equal(
      memoryStore.documents.has("proClubs/club-lampang/members/user-owner-123"),
      false,
    );
    assert.equal(
      memoryStore.documents.has("proClubProvisioningAudits/prov-lampang-001"),
      false,
    );
  });

  await t.test("8. Configured inactive SUPERADMIN rejected by existing Firestore transaction authorization", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());

    // user-inactive-superadmin is SUPERADMIN but status is INACTIVE
    await assert.rejects(
      executeLocalProClubProvisioning(baseCliOptions, {
        app: { options: { projectId: EXPECTED_PROJECT_ID } },
        firestore: memoryStore as unknown as Firestore,
        env: { [LOCAL_OPERATOR_ENV_KEY]: "user-inactive-superadmin" },
      }),
      (err) =>
        err instanceof ProClubProvisioningError &&
        err.code === ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL &&
        err.message.includes("account is not active"),
    );

    // Verify zero documents were created
    assert.equal(memoryStore.documents.has("proClubs/club-lampang"), false);
  });

  await t.test("9. Same provisioningId replay remains idempotent", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());

    // First execution: new provisioning
    const firstResult = await executeLocalProClubProvisioning(baseCliOptions, {
      app: { options: { projectId: EXPECTED_PROJECT_ID } },
      firestore: memoryStore as unknown as Firestore,
      env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-789" },
    });
    assert.equal(firstResult.ok, true);
    if (firstResult.dryRun === false) {
      assert.equal(firstResult.isReplay, false);
    }

    // Capture documents snapshot
    const clubBefore = memoryStore.documents.get("proClubs/club-lampang");
    const auditBefore = memoryStore.documents.get(
      "proClubProvisioningAudits/prov-lampang-001",
    );

    // Second execution: exact replay
    const replayResult = await executeLocalProClubProvisioning(baseCliOptions, {
      app: { options: { projectId: EXPECTED_PROJECT_ID } },
      firestore: memoryStore as unknown as Firestore,
      env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-789" },
    });

    assert.equal(replayResult.ok, true);
    if (replayResult.dryRun === false) {
      assert.equal(replayResult.status, "COMPLETED");
      assert.equal(replayResult.isReplay, true);
      assert.equal(replayResult.provisioningId, "prov-lampang-001");
      assert.equal(replayResult.createdAt, auditBefore.createdAt);
    }

    // Verify documents remain unchanged
    const clubAfter = memoryStore.documents.get("proClubs/club-lampang");
    assert.deepEqual(clubAfter, clubBefore);
  });

  await t.test("10. Same provisioningId with different requester triggers error", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());

    // Initial provision under SuperAdmin A
    await executeLocalProClubProvisioning(baseCliOptions, {
      app: { options: { projectId: EXPECTED_PROJECT_ID } },
      firestore: memoryStore as unknown as Firestore,
      env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-789" },
    });

    // Replay attempt under SuperAdmin B (user-superadmin-second)
    await assert.rejects(
      executeLocalProClubProvisioning(baseCliOptions, {
        app: { options: { projectId: EXPECTED_PROJECT_ID } },
        firestore: memoryStore as unknown as Firestore,
        env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-second" },
      }),
      (err) =>
        err instanceof ProClubProvisioningError &&
        (err.code === ERROR_CODES.PROVISIONING_ID_CONFLICT ||
          err.code === ERROR_CODES.PROVISIONING_INTEGRITY),
    );
  });

  await t.test("11. Expected project accepted", () => {
    const validApp = { options: { projectId: EXPECTED_PROJECT_ID } };
    const validFirestore = { projectId: EXPECTED_PROJECT_ID };

    assert.doesNotThrow(() =>
      assertPinnedProject(validApp, validFirestore, EXPECTED_PROJECT_ID),
    );
  });

  await t.test("12. Wrong project rejected before provisioning call", () => {
    const wrongApp = { options: { projectId: "other-firebase-project" } };
    const wrongFirestore = { projectId: "other-firebase-project" };

    assert.throws(
      () => assertPinnedProject(wrongApp, wrongFirestore, EXPECTED_PROJECT_ID),
      (err) =>
        err instanceof Error &&
        err.message.includes("Project Pinning Violation") &&
        err.message.includes("does not match pinned expected project"),
    );

    // App matches but Firestore instance points elsewhere
    assert.throws(
      () =>
        assertPinnedProject(
          { options: { projectId: EXPECTED_PROJECT_ID } },
          { projectId: "mismatched-firestore-project" },
          EXPECTED_PROJECT_ID,
        ),
      (err) =>
        err instanceof Error &&
        err.message.includes("Project Pinning Violation") &&
        err.message.includes("Firestore instance project"),
    );
  });

  await t.test("13. Unknown/unresolved project rejected before provisioning call", () => {
    const unconfiguredApps = [
      null,
      undefined,
      {},
      { options: {} },
      { options: { projectId: "" } },
      { options: { projectId: "   " } },
      { options: { projectId: null } },
      { options: { projectId: undefined } },
    ];

    for (const app of unconfiguredApps) {
      assert.throws(
        () => assertPinnedProject(app as any, null, EXPECTED_PROJECT_ID),
        (err) =>
          err instanceof Error &&
          err.message.includes("Project Pinning Violation") &&
          err.message.includes("Unable to resolve Firebase Admin app project ID"),
      );
    }
  });

  await t.test("14. Dry-run mode validates arguments and schema with zero writes", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());

    const result = await executeLocalProClubProvisioning(
      { ...baseCliOptions, dryRun: true },
      {
        app: { options: { projectId: EXPECTED_PROJECT_ID } },
        firestore: memoryStore as unknown as Firestore,
        env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-789" },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    if (result.dryRun) {
      assert.equal(result.status, "READY_FOR_PROVISIONING");
      assert.equal(result.targetProjectId, EXPECTED_PROJECT_ID);
      assert.equal(result.operatorUid, "user-superadmin-789");
      assert.equal(result.requestPayload.clubId, "club-lampang");
    }

    // Zero writes performed
    assert.equal(memoryStore.documents.has("proClubs/club-lampang"), false);
    assert.equal(
      memoryStore.documents.has("proClubProvisioningAudits/prov-lampang-001"),
      false,
    );
  });

  await t.test("15. CLI runner handles valid invocation, formatting and error reporting", async () => {
    const memoryStore = new InMemoryFirestore(EXPECTED_PROJECT_ID, createSeedData());
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    const exitCode = await runLocalProvisioningCli(
      [
        "--provisioning-id",
        "prov-lampang-001",
        "--club-id",
        "club-lampang",
        "--name",
        "Lampang FC",
        "--level",
        "T1",
        "--initial-owner-uid",
        "user-owner-123",
        "--json",
      ],
      {
        stdout: (msg) => stdoutLines.push(msg),
        stderr: (msg) => stderrLines.push(msg),
      },
      {
        app: { options: { projectId: EXPECTED_PROJECT_ID } },
        firestore: memoryStore as unknown as Firestore,
        env: { [LOCAL_OPERATOR_ENV_KEY]: "user-superadmin-789" },
      },
    );

    assert.equal(exitCode, 0);
    assert.equal(stderrLines.length, 0);
    assert.ok(stdoutLines.length > 0);
    const parsedJson = JSON.parse(stdoutLines.join(""));
    assert.equal(parsedJson.ok, true);
    assert.equal(parsedJson.status, "COMPLETED");
    assert.equal(parsedJson.clubId, "club-lampang");
  });
});
