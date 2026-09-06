import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProPlayerOnboardingClaimV1,
  planProPlayerOnboardingClaimDecisionV1,
  ProPlayerOnboardingClaimError,
} from "../src/lib/proPlayerOnboardingClaimV1";
import type { ProPlayerOnboardingV1 } from "../src/lib/proPlayerOnboardingV1";

function profile(overrides: Partial<ProPlayerOnboardingV1> = {}): ProPlayerOnboardingV1 {
  return {
    schemaVersion: 1,
    firstName: "Somchai",
    lastName: "Jaidee",
    nickname: "Boy",
    nationality: "Thai",
    dateOfBirth: "1998-05-20",
    primaryPosition: "CM",
    secondaryPosition: "DM",
    heightCm: 178,
    weightKg: 72,
    preferredFoot: "RIGHT",
    currentEquipment: {
      shoeSize: 42,
      shoeSizeSystem: "EU",
      bootBrand: "Nike",
      bootModel: "Tiempo",
    },
    currentClubName: null,
    leagueLevel: "FREE_AGENT",
    contractExpiryDate: null,
    expectedSalary: {
      monthlyAmount: 45000,
      currency: "THB",
      visibility: "PRIVATE",
    },
    profileImageUrl: null,
    careerHistory: [],
    ...overrides,
  };
}

const reviewer = { uid: "superadmin-1", role: "SUPERADMIN", status: "ACTIVE" };

test("self-service claim is deterministic PENDING intent owned by the authenticated user id", () => {
  const claim = buildProPlayerOnboardingClaimV1("player-user-1", profile());
  assert.equal(claim.schemaVersion, 1);
  assert.equal(claim.type, "PRO_PLAYER_SELF_SERVICE_ONBOARDING");
  assert.equal(claim.userId, "player-user-1");
  assert.equal(claim.status, "PENDING");
});

test("invalid user id or invalid onboarding payload is rejected", () => {
  assert.throws(() => buildProPlayerOnboardingClaimV1(" bad ", profile()), ProPlayerOnboardingClaimError);
  assert.throws(() => buildProPlayerOnboardingClaimV1("player-user-1", profile({ currentClubName: "Club", leagueLevel: "FREE_AGENT" })), ProPlayerOnboardingClaimError);
});

test("only ACTIVE SUPERADMIN reviewer may decide a global pro-player claim", () => {
  const claim = buildProPlayerOnboardingClaimV1("player-user-1", profile());
  for (const actor of [
    { uid: "admin-1", role: "ADMIN", status: "ACTIVE" },
    { uid: "player-1", role: "PLAYER", status: "ACTIVE" },
    { uid: "superadmin-1", role: "SUPERADMIN", status: "INACTIVE" },
  ]) {
    assert.throws(
      () => planProPlayerOnboardingClaimDecisionV1(actor, claim, { type: "REJECT" }),
      (error: unknown) => error instanceof ProPlayerOnboardingClaimError && error.code === "REVIEWER_REQUIRED",
    );
  }
});

test("approval separates public profile from private expected salary", () => {
  const claim = buildProPlayerOnboardingClaimV1("player-user-1", profile());
  const result = planProPlayerOnboardingClaimDecisionV1(reviewer, claim, {
    type: "APPROVE",
    playerKey: "player-key-1",
    futId: "FUT-TH-000001",
  });
  assert.equal(result.kind, "APPROVED");
  if (result.kind !== "APPROVED") return;

  assert.equal(Object.prototype.hasOwnProperty.call(result.value.publicProfile, "expectedSalary"), false);
  assert.deepEqual(result.value.privateMarketPreference.expectedSalary, claim.profile.expectedSalary);
  assert.equal(result.value.publicProfile.playerKey, "player-key-1");
  assert.equal(result.value.publicProfile.futId, "FUT-TH-000001");
});

test("approval preserves Player Identity Foundation source and account binding", () => {
  const claim = buildProPlayerOnboardingClaimV1("player-user-1", profile());
  const result = planProPlayerOnboardingClaimDecisionV1(reviewer, claim, {
    type: "APPROVE",
    playerKey: "player-key-1",
    futId: "FUT-TH-000001",
  });
  assert.equal(result.kind, "APPROVED");
  if (result.kind !== "APPROVED") return;
  assert.deepEqual(result.value.identityIssuance, {
    playerKey: "player-key-1",
    futId: "FUT-TH-000001",
    source: "SUPERADMIN_ISSUANCE",
  });
  assert.deepEqual(result.value.accountBinding, {
    schemaVersion: 1,
    userId: "player-user-1",
    playerKey: "player-key-1",
    futId: "FUT-TH-000001",
  });
});

test("malformed playerKey or FUTID fails closed", () => {
  const claim = buildProPlayerOnboardingClaimV1("player-user-1", profile());
  assert.throws(
    () => planProPlayerOnboardingClaimDecisionV1(reviewer, claim, { type: "APPROVE", playerKey: "bad/key", futId: "FUT-TH-000001" }),
    (error: unknown) => error instanceof ProPlayerOnboardingClaimError && error.code === "INVALID_IDENTITY",
  );
  assert.throws(
    () => planProPlayerOnboardingClaimDecisionV1(reviewer, claim, { type: "APPROVE", playerKey: "player-key-1", futId: "bad" }),
    (error: unknown) => error instanceof ProPlayerOnboardingClaimError && error.code === "INVALID_IDENTITY",
  );
});

test("APPROVED and REJECTED claims are terminal in V1", () => {
  const pending = buildProPlayerOnboardingClaimV1("player-user-1", profile());
  for (const status of ["APPROVED", "REJECTED"] as const) {
    const claim = { ...pending, status };
    assert.throws(
      () => planProPlayerOnboardingClaimDecisionV1(reviewer, claim, { type: "REJECT" }),
      (error: unknown) => error instanceof ProPlayerOnboardingClaimError && error.code === "INVALID_TRANSITION",
    );
  }
});

test("rejection preserves the claim profile instead of deleting history", () => {
  const claim = buildProPlayerOnboardingClaimV1("player-user-1", profile());
  const result = planProPlayerOnboardingClaimDecisionV1(reviewer, claim, { type: "REJECT" });
  assert.equal(result.kind, "REJECTED");
  if (result.kind !== "REJECTED") return;
  assert.equal(result.claim.status, "REJECTED");
  assert.deepEqual(result.claim.profile, claim.profile);
});
