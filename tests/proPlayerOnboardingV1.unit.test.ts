import test from "node:test";
import assert from "node:assert/strict";
import {
  containsLegacyMarketValueField,
  validateProPlayerOnboardingV1,
} from "../src/lib/proPlayerOnboardingV1";

function validProfile(): Record<string, any> {
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
      shoeSize: 42.5,
      shoeSizeSystem: "EU",
      bootBrand: "Nike",
      bootModel: "Tiempo Legend",
    },
    currentClubName: "Lampang FC",
    leagueLevel: "T2",
    contractExpiryDate: "2027-05-31",
    expectedSalary: {
      monthlyAmount: 45000,
      currency: "THB",
      visibility: "AUTHORIZED_CLUB_ONLY",
    },
    profileImageUrl: "https://example.com/player.jpg",
    careerHistory: [
      {
        clubName: "Chiangmai FC",
        leagueLevel: "T2",
        fromDate: "2023-06-01",
        toDate: "2025-05-31",
        position: "CM",
        appearances: 40,
        starts: 30,
        substituteAppearances: 10,
        minutesPlayed: 2900,
        goals: 5,
        assists: 8,
      },
    ],
  };
}

test("accepts canonical Pro Player Onboarding V1 profile", () => {
  assert.equal(validateProPlayerOnboardingV1(validProfile()), true);
});

test("rejects legacy marketValue field from V1 contract", () => {
  const profile = { ...validProfile(), marketValue: "1,000,000 THB" };
  assert.equal(containsLegacyMarketValueField(profile), true);
  assert.equal(validateProPlayerOnboardingV1(profile), false);
});

test("requires positive whole-THB expected monthly salary", () => {
  const profile = validProfile();
  profile.expectedSalary = {
    monthlyAmount: 0,
    currency: "THB",
    visibility: "AUTHORIZED_CLUB_ONLY",
  };
  assert.equal(validateProPlayerOnboardingV1(profile), false);
});

test("requires salary visibility to be private or authorized-club only", () => {
  const profile = validProfile();
  profile.expectedSalary = {
    monthlyAmount: 45000,
    currency: "THB",
    visibility: "PUBLIC",
  };
  assert.equal(validateProPlayerOnboardingV1(profile), false);
});

test("allows a free agent only when current club and contract expiry are empty", () => {
  const profile = validProfile();
  profile.leagueLevel = "FREE_AGENT";
  profile.currentClubName = null;
  profile.contractExpiryDate = null;
  assert.equal(validateProPlayerOnboardingV1(profile), true);

  profile.currentClubName = "Old Club";
  assert.equal(validateProPlayerOnboardingV1(profile), false);
});

test("rejects secondary position equal to primary position", () => {
  const profile = validProfile();
  profile.secondaryPosition = "CM";
  assert.equal(validateProPlayerOnboardingV1(profile), false);
});

test("rejects impossible career-history date ranges", () => {
  const profile = validProfile();
  profile.careerHistory[0] = {
    ...profile.careerHistory[0],
    fromDate: "2025-06-01",
    toDate: "2025-05-31",
  };
  assert.equal(validateProPlayerOnboardingV1(profile), false);
});

test("rejects career-history appearance totals that do not reconcile", () => {
  const profile = validProfile();
  profile.careerHistory[0] = {
    ...profile.careerHistory[0],
    appearances: 10,
    starts: 8,
    substituteAppearances: 5,
  };
  assert.equal(validateProPlayerOnboardingV1(profile), false);
});
