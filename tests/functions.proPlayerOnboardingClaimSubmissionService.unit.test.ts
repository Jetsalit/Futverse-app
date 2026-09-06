import assert from "node:assert/strict";
import test from "node:test";
import {
  createProPlayerClaimSubmissionServiceV1,
  PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES,
  type ProPlayerClaimSubmissionSourceV1,
  type ProPlayerClaimSubmissionTransactionV1,
} from "../functions/src/proPlayerOnboardingClaimSubmission/service.ts";

function profile() {
  return {
    schemaVersion: 1 as const,
    firstName: "Somchai",
    lastName: "Player",
    nickname: "Chai",
    nationality: "Thai",
    dateOfBirth: "2000-01-02",
    primaryPosition: "ST",
    secondaryPosition: "RW",
    heightCm: 180,
    weightKg: 75,
    preferredFoot: "RIGHT" as const,
    currentEquipment: { shoeSize: 43, shoeSizeSystem: "EU" as const, bootBrand: "Generic", bootModel: "Speed" },
    currentClubName: null,
    leagueLevel: "FREE_AGENT" as const,
    contractExpiryDate: null,
    expectedSalary: { monthlyAmount: 45000, currency: "THB" as const, visibility: "PRIVATE" as const },
    profileImageUrl: null,
    careerHistory: [],
  };
}

class FakeSource implements ProPlayerClaimSubmissionSourceV1 {
  user: Record<string, unknown> | null = { uid: "player-1", role: "PLAYER", status: "ACTIVE" };
  claim: Record<string, unknown> | null = null;
  binding: Record<string, unknown> | null = null;
  created: Record<string, unknown> | null = null;
  async runSubmissionTransaction<T>(operation: (tx: ProPlayerClaimSubmissionTransactionV1) => Promise<T>): Promise<T> {
    return operation({
      getUser: async () => this.user ? { exists: true, data: this.user } : { exists: false },
      getClaim: async () => this.claim ? { exists: true, data: this.claim } : { exists: false },
      getBinding: async () => this.binding ? { exists: true, data: this.binding } : { exists: false },
      createClaim: (_uid, data) => { if (this.claim) throw new Error("CREATE_OVERWRITE"); this.created = data; },
    });
  }
}

function limiter(allowed = true) {
  return { consumeQuota: async () => ({ allowed, attempts: allowed ? 1 : 10, limit: 10, bucketId: "bucket" }) };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: any) => error?.code === code);
}

test("active canonical PLAYER creates exactly one PENDING self claim", async () => {
  const source = new FakeSource();
  const service = createProPlayerClaimSubmissionServiceV1(source, limiter());
  const result = await service.submitClaim({ requesterUid: "player-1", requestBody: { profile: profile() } });
  assert.deepEqual(result, { status: "PENDING", created: true, idempotent: false });
  assert.equal(source.created?.userId, "player-1");
  assert.equal(source.created?.status, "PENDING");
  assert.equal((source.created?.profile as any)?.expectedSalary?.monthlyAmount, 45000);
  assert.equal(Object.prototype.hasOwnProperty.call(source.created ?? {}, "playerKey"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(source.created ?? {}, "futId"), false);
});

test("role/status are revalidated from canonical user snapshot", async () => {
  for (const user of [
    { uid: "player-1", role: "ADMIN", status: "ACTIVE" },
    { uid: "player-1", role: "PLAYER", status: "INACTIVE" },
  ]) {
    const source = new FakeSource(); source.user = user;
    await expectCode(
      createProPlayerClaimSubmissionServiceV1(source, limiter()).submitClaim({ requesterUid: "player-1", requestBody: { profile: profile() } }),
      PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.FORBIDDEN,
    );
  }
});

test("stored canonical uid mismatch fails closed", async () => {
  const source = new FakeSource(); source.user = { uid: "other", role: "PLAYER", status: "ACTIVE" };
  await expectCode(
    createProPlayerClaimSubmissionServiceV1(source, limiter()).submitClaim({ requesterUid: "player-1", requestBody: { profile: profile() } }),
    PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_DATA,
  );
});

test("existing account binding blocks claim creation", async () => {
  const source = new FakeSource(); source.binding = { userId: "player-1", playerKey: "pk", futId: "FUT-X" };
  await expectCode(
    createProPlayerClaimSubmissionServiceV1(source, limiter()).submitClaim({ requesterUid: "player-1", requestBody: { profile: profile() } }),
    PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT,
  );
  assert.equal(source.created, null);
});

test("same existing PENDING claim is idempotent and never overwritten", async () => {
  const source = new FakeSource();
  source.claim = { schemaVersion: 1, type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING", userId: "player-1", status: "PENDING", profile: profile() };
  const result = await createProPlayerClaimSubmissionServiceV1(source, limiter()).submitClaim({ requesterUid: "player-1", requestBody: { profile: profile() } });
  assert.deepEqual(result, { status: "PENDING", created: false, idempotent: true });
  assert.equal(source.created, null);
});

test("different or terminal existing claim fails closed without overwrite", async () => {
  for (const claim of [
    { schemaVersion: 1, type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING", userId: "player-1", status: "APPROVED", profile: profile() },
    { schemaVersion: 1, type: "PRO_PLAYER_SELF_SERVICE_ONBOARDING", userId: "player-1", status: "PENDING", profile: { ...profile(), nickname: "Different" } },
  ]) {
    const source = new FakeSource(); source.claim = claim;
    await expectCode(
      createProPlayerClaimSubmissionServiceV1(source, limiter()).submitClaim({ requesterUid: "player-1", requestBody: { profile: profile() } }),
      PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT,
    );
    assert.equal(source.created, null);
  }
});

test("invalid request and rate limit fail before claim creation", async () => {
  const source = new FakeSource();
  await expectCode(
    createProPlayerClaimSubmissionServiceV1(source, limiter()).submitClaim({ requesterUid: "player-1", requestBody: { profile: { schemaVersion: 1 } } }),
    PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_REQUEST,
  );
  await expectCode(
    createProPlayerClaimSubmissionServiceV1(source, limiter(false)).submitClaim({ requesterUid: "player-1", requestBody: { profile: profile() } }),
    PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.RATE_LIMIT_EXCEEDED,
  );
  assert.equal(source.created, null);
});
