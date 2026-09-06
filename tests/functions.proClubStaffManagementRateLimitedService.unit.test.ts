import assert from "node:assert/strict";
import test from "node:test";
import {
  createRateLimitedProClubStaffManagementServiceV1,
  ProClubStaffManagementServiceError,
  type ProClubStaffManagementSourceV1,
} from "../functions/src/proClubStaffManagement/service.ts";
import type { ProClubStaffManagementRateLimiterV1 } from "../functions/src/proClubStaffManagement/rateLimiter.ts";

function fixture(actorRole: "OWNER"|"ADMIN"|"MEMBER" = "OWNER") {
  let targetReads = 0; let applyCalls = 0; let quotaCalls = 0;
  const source: ProClubStaffManagementSourceV1 = {
    async readClub() { return { status: "ACTIVE" }; },
    async readMembership(_clubId, uid) {
      if (uid === "actor") return { authorizationRole: actorRole, status: "ACTIVE" };
      targetReads += 1; return { authorizationRole: "MEMBER", status: "ACTIVE" };
    },
    async readStaffAssignment() { targetReads += 1; return { staffRole: "ASSISTANT_COACH", status: "ACTIVE" }; },
    async applyAtomicPlan() { applyCalls += 1; },
  };
  const limiter: ProClubStaffManagementRateLimiterV1 = {
    async consumeQuota() { quotaCalls += 1; return { allowed: true, attempts: quotaCalls, limit: 30, bucketId: "bucket" }; },
  };
  return { source, limiter, counts: () => ({ targetReads, applyCalls, quotaCalls }) };
}

function expectCode(code: string) { return (error: unknown) => error instanceof ProClubStaffManagementServiceError && error.code === code; }

test("1. hardened service consumes quota only after active OWNER authority", async () => {
  const f = fixture("OWNER");
  const service = createRateLimitedProClubStaffManagementServiceV1(f.source, f.limiter);
  await service.manageStaff({ requesterUid: "actor", requestBody: { clubId: "club-1", targetUid: "target-1", action: { type: "DEACTIVATE" } } });
  assert.deepEqual(f.counts(), { targetReads: 2, applyCalls: 1, quotaCalls: 1 });
});

test("2. MEMBER is denied before quota mutation and before target reads", async () => {
  const f = fixture("MEMBER");
  const service = createRateLimitedProClubStaffManagementServiceV1(f.source, f.limiter);
  await assert.rejects(() => service.manageStaff({ requesterUid: "actor", requestBody: { clubId: "club-1", targetUid: "target-1", action: { type: "DEACTIVATE" } } }), expectCode("FORBIDDEN"));
  assert.deepEqual(f.counts(), { targetReads: 0, applyCalls: 0, quotaCalls: 0 });
});

test("3. exhausted reviewer quota stops before target reads and apply", async () => {
  const f = fixture("OWNER");
  const denyLimiter: ProClubStaffManagementRateLimiterV1 = { async consumeQuota() { return { allowed: false, attempts: 30, limit: 30, bucketId: "bucket" }; } };
  const service = createRateLimitedProClubStaffManagementServiceV1(f.source, denyLimiter);
  await assert.rejects(() => service.manageStaff({ requesterUid: "actor", requestBody: { clubId: "club-1", targetUid: "target-1", action: { type: "DEACTIVATE" } } }), expectCode("RATE_LIMIT_EXCEEDED"));
  assert.deepEqual(f.counts(), { targetReads: 0, applyCalls: 0, quotaCalls: 0 });
});

test("4. malformed request is rejected before quota mutation", async () => {
  const f = fixture("OWNER");
  const service = createRateLimitedProClubStaffManagementServiceV1(f.source, f.limiter);
  await assert.rejects(() => service.manageStaff({ requesterUid: "actor", requestBody: { clubId: "club-1", targetUid: "target-1", action: { type: "CHANGE_ROLE" } } }), expectCode("INVALID_REQUEST"));
  assert.equal(f.counts().quotaCalls, 0);
});

test("5. requester UID remains the only actor identity source", async () => {
  const f = fixture("OWNER");
  const service = createRateLimitedProClubStaffManagementServiceV1(f.source, f.limiter);
  await assert.rejects(() => service.manageStaff({ requesterUid: "actor", requestBody: { clubId: "club-1", targetUid: "target-1", requesterUid: "spoof", action: { type: "DEACTIVATE" } } }), expectCode("INVALID_REQUEST"));
  assert.equal(f.counts().quotaCalls, 0);
});
