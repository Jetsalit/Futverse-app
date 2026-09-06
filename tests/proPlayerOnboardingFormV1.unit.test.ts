import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProPlayerOnboardingV1FromDraft,
  createEmptyProPlayerCareerHistoryDraftV1,
  createInitialProPlayerOnboardingDraftV1,
  PRO_PLAYER_POSITION_OPTIONS_V1,
} from "../src/lib/proPlayerOnboardingFormV1";

function validDraft() {
  return {
    ...createInitialProPlayerOnboardingDraftV1(),
    firstName: " Somchai ",
    lastName: " Jaidee ",
    nickname: " Boy ",
    nationality: " Thai ",
    dateOfBirth: "1998-05-20",
    primaryPosition: "CM",
    secondaryPosition: "DM",
    heightCm: "178",
    weightKg: "72.5",
    preferredFoot: "RIGHT" as const,
    shoeSize: "42.5",
    shoeSizeSystem: "EU" as const,
    bootBrand: " Nike ",
    bootModel: " Tiempo Legend ",
    currentClubName: "stale club value",
    leagueLevel: "FREE_AGENT" as const,
    contractExpiryDate: "2027-05-31",
    expectedMonthlySalary: "45000",
    salaryVisibility: "PRIVATE" as const,
    profileImageUrl: "",
  };
}

test("canonical position options exclude UNKNOWN and contain expected pro positions", () => {
  assert.equal(PRO_PLAYER_POSITION_OPTIONS_V1.includes("CM"), true);
  assert.equal((PRO_PLAYER_POSITION_OPTIONS_V1 as readonly string[]).includes("UNKNOWN"), false);
});

test("initial form draft is intentionally incomplete and defaults to private free-agent intent", () => {
  const draft = createInitialProPlayerOnboardingDraftV1();
  assert.equal(draft.leagueLevel, "FREE_AGENT");
  assert.equal(draft.salaryVisibility, "PRIVATE");
  assert.equal(buildProPlayerOnboardingV1FromDraft(draft).ok, false);
});

test("builds canonical V1 profile and trims presentation inputs", () => {
  const result = buildProPlayerOnboardingV1FromDraft(validDraft());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.profile.firstName, "Somchai");
  assert.equal(result.profile.lastName, "Jaidee");
  assert.equal(result.profile.currentEquipment.bootBrand, "Nike");
  assert.equal(result.profile.expectedSalary.monthlyAmount, 45000);
  assert.equal(result.profile.expectedSalary.currency, "THB");
  assert.equal(Object.prototype.hasOwnProperty.call(result.profile, "marketValue"), false);
});

test("free agent normalization clears stale club and contract values", () => {
  const result = buildProPlayerOnboardingV1FromDraft(validDraft());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.profile.currentClubName, null);
  assert.equal(result.profile.contractExpiryDate, null);
});

test("non-free-agent requires current club", () => {
  const draft = { ...validDraft(), leagueLevel: "T2" as const, currentClubName: "" };
  const result = buildProPlayerOnboardingV1FromDraft(draft);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.errors.currentClubName, "Current club is required unless you are a free agent.");
});

test("secondary position cannot equal primary position", () => {
  const draft = { ...validDraft(), secondaryPosition: "CM" };
  const result = buildProPlayerOnboardingV1FromDraft(draft);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.secondaryPosition, /different/);
});

test("expected monthly salary must be positive whole THB", () => {
  for (const expectedMonthlySalary of ["0", "45000.5", "abc", ""]) {
    const result = buildProPlayerOnboardingV1FromDraft({ ...validDraft(), expectedMonthlySalary });
    assert.equal(result.ok, false, expectedMonthlySalary);
  }
});

test("career history preserves append-style entries and validates reconciliation", () => {
  const career = {
    ...createEmptyProPlayerCareerHistoryDraftV1(),
    clubName: "Chiangmai FC",
    leagueLevel: "T2" as const,
    fromDate: "2023-06-01",
    toDate: "2025-05-31",
    position: "CM",
    appearances: "40",
    starts: "30",
    substituteAppearances: "10",
    minutesPlayed: "2900",
    goals: "5",
    assists: "8",
  };
  const result = buildProPlayerOnboardingV1FromDraft({ ...validDraft(), careerHistory: [career] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.profile.careerHistory.length, 1);
  assert.equal(result.profile.careerHistory[0].clubName, "Chiangmai FC");

  const invalid = buildProPlayerOnboardingV1FromDraft({
    ...validDraft(),
    careerHistory: [{ ...career, appearances: "10", starts: "8", substituteAppearances: "5" }],
  });
  assert.equal(invalid.ok, false);
});

test("career history rejects end date before start date", () => {
  const career = {
    ...createEmptyProPlayerCareerHistoryDraftV1(),
    clubName: "Old Club",
    leagueLevel: "T3" as const,
    fromDate: "2025-06-01",
    toDate: "2025-05-31",
    position: "CB",
  };
  const result = buildProPlayerOnboardingV1FromDraft({ ...validDraft(), careerHistory: [career] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors["careerHistory.0.toDate"], /before/);
});
