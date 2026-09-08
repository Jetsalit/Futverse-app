import assert from "node:assert/strict";
import test from "node:test";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import {
  parseLocalAuditVerificationArgs,
  executeLocalAuditVerification,
} from "../scripts/verifyProClubAuditLocal.ts";
import {
  parseLocalStaffCandidateArgs,
  executeLocalStaffCandidateResolution,
} from "../scripts/resolveProClubStaffCandidateLocal.ts";
import {
  parseLocalRenameArgs,
  executeLocalProClubRename,
} from "../scripts/renameProClubLocal.ts";

const PROJECT_ID = "futverse-d7872";
const OPERATOR_UID = "superadmin-local";
const fakeFirestore = { projectId: PROJECT_ID } as unknown as Firestore;
const fakeAuth = {} as Auth;
const app = { options: { projectId: PROJECT_ID } };
const env = { FUTVERSE_LOCAL_OPERATOR_UID: OPERATOR_UID };

const renameRequest = {
  clubId: "club-alpha",
  newName: "Alpha United",
  shortNameChange: { action: "UNCHANGED" },
  reason: "REBRAND",
  reasonNote: null,
  effectiveAt: "2026-09-08T00:00:00.000Z",
  expectedCurrentName: "Alpha FC",
  expectedCurrentShortName: "AFC",
  expectedUpdatedAt: "2026-09-07T00:00:00.000Z",
};

test("all local trusted operation parsers reject operator/requester CLI injection", () => {
  assert.throws(() => parseLocalAuditVerificationArgs([
    "--provisioning-id", "prov-1", "--operator-uid", "attacker",
  ]), /strictly forbidden|forbidden/i);
  assert.throws(() => parseLocalStaffCandidateArgs([
    "--club-id", "club-alpha", "--email", "coach@example.com", "--requesterUid", "attacker",
  ]), /forbidden/i);
  assert.throws(() => parseLocalRenameArgs([
    "--request-json", "rename.json", "--superadmin", "attacker",
  ]), /forbidden/i);
});

test("audit verification is read-only adapter-shaped and binds service request without caller identity", async () => {
  let calls = 0;
  let received: unknown;
  const service = {
    async verifyAudit(request: unknown) {
      calls += 1;
      received = request;
      return {
        status: "VERIFIED" as const,
        provisioningId: "prov-1",
        clubId: "club-alpha",
        ownerUid: "owner-1",
        createdAt: "2026-09-08T00:00:00.000Z",
      };
    },
  };
  const result = await executeLocalAuditVerification(
    { provisioningId: "prov-1" },
    { app, firestore: fakeFirestore, env, service },
  );
  assert.equal(calls, 1);
  assert.deepEqual(received, {
    authorizationHeader: undefined,
    requestBody: { provisioningId: "prov-1" },
  });
  assert.equal(result.status, "VERIFIED");
});

test("candidate dry-run performs no canonical service call", async () => {
  let calls = 0;
  const service = {
    async resolveCandidate() {
      calls += 1;
      throw new Error("must not run");
    },
  } as any;
  const result = await executeLocalStaffCandidateResolution(
    { clubId: "club-alpha", email: "Coach@Example.com", dryRun: true },
    { app, firestore: fakeFirestore, auth: fakeAuth, env, service },
  );
  assert.equal(calls, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.requesterUid, OPERATOR_UID);
  assert.equal(result.email, "coach@example.com");
});

test("candidate live path derives requester exclusively from trusted local env", async () => {
  let received: any;
  const service = {
    async resolveCandidate(request: unknown) {
      received = request;
      return { targetUid: "candidate-1", email: "coach@example.com", displayName: "Coach" };
    },
  } as any;
  const result = await executeLocalStaffCandidateResolution(
    { clubId: "club-alpha", email: "coach@example.com" },
    { app, firestore: fakeFirestore, auth: fakeAuth, env, service },
  );
  assert.equal(result.dryRun, false);
  assert.equal(received.requesterUid, OPERATOR_UID);
  assert.deepEqual(received.requestBody, { clubId: "club-alpha", email: "coach@example.com" });
});

test("rename dry-run validates canonical request and never invokes write service", async () => {
  let calls = 0;
  const service = {
    async renameProClub() {
      calls += 1;
      throw new Error("must not run");
    },
  } as any;
  const result = await executeLocalProClubRename(
    { requestJsonPath: "rename.json", dryRun: true },
    {
      app,
      firestore: fakeFirestore,
      env,
      service,
      readRequestText: () => JSON.stringify(renameRequest),
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.operatorUid, OPERATOR_UID);
  assert.equal(result.requestBody.clubId, "club-alpha");
});

test("rename live path calls canonical service with no authorization-header identity", async () => {
  let received: any;
  const service = {
    async renameProClub(request: unknown) {
      received = request;
      return {
        status: "COMPLETED" as const,
        clubId: "club-alpha",
        changeId: "change-1",
        name: "Alpha United",
        shortName: "AFC",
        changedAt: "2026-09-08T00:01:00.000Z",
        changedBy: OPERATOR_UID,
      };
    },
  } as any;
  const result = await executeLocalProClubRename(
    { requestJsonPath: "rename.json" },
    {
      app,
      firestore: fakeFirestore,
      env,
      service,
      readRequestText: () => JSON.stringify(renameRequest),
    },
  );
  assert.equal(result.dryRun, false);
  assert.equal(received.authorizationHeader, undefined);
  assert.equal(received.requestBody.clubId, "club-alpha");
});

test("project drift fails before any local canonical service can execute", async () => {
  let calls = 0;
  const service = {
    async verifyAudit() {
      calls += 1;
      throw new Error("must not run");
    },
  } as any;
  await assert.rejects(
    () => executeLocalAuditVerification(
      { provisioningId: "prov-1" },
      {
        app: { options: { projectId: "wrong-project" } },
        firestore: fakeFirestore,
        env,
        service,
      },
    ),
    /Project Pinning Violation/,
  );
  assert.equal(calls, 0);
});

test("missing local operator identity fails before service execution", async () => {
  let calls = 0;
  const service = {
    async resolveCandidate() {
      calls += 1;
      throw new Error("must not run");
    },
  } as any;
  await assert.rejects(
    () => executeLocalStaffCandidateResolution(
      { clubId: "club-alpha", email: "coach@example.com" },
      { app, firestore: fakeFirestore, auth: fakeAuth, env: {}, service },
    ),
    /FUTVERSE_LOCAL_OPERATOR_UID/,
  );
  assert.equal(calls, 0);
});
