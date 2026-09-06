import assert from "node:assert/strict";
import test from "node:test";
import { validateProPlayerOnboardingV1 } from "../src/lib/proPlayerOnboardingV1.ts";
import { validateProPlayerOnboardingV1Server } from "../functions/src/proPlayerOnboardingClaimSubmission/contract.ts";

function validProfile() {
  return {
    schemaVersion: 1,
    firstName: "Somchai",
    lastName: "Player",
    nickname: "Chai",
    nationality: "Thai",
    dateOfBirth: "2000-01-02",
    primaryPosition: "ST",
    secondaryPosition: "RW",
    heightCm: 180,
    weightKg: 75,
    preferredFoot: "RIGHT",
    currentEquipment: { shoeSize: 43, shoeSizeSystem: "EU", bootBrand: "Generic", bootModel: "Speed" },
    currentClubName: null,
    leagueLevel: "FREE_AGENT",
    contractExpiryDate: null,
    expectedSalary: { monthlyAmount: 45000, currency: "THB", visibility: "PRIVATE" },
    profileImageUrl: null,
    careerHistory: [],
  };
}

const mutations: Array<(profile: any) => void> = [
  (p) => { p.schemaVersion = 2; },
  (p) => { p.firstName = " padded "; },
  (p) => { p.secondaryPosition = p.primaryPosition; },
  (p) => { p.currentEquipment.shoeSize = 0; },
  (p) => { p.expectedSalary.monthlyAmount = 45000.5; },
  (p) => { p.expectedSalary.currency = "USD"; },
  (p) => { p.expectedSalary.visibility = "PUBLIC"; },
  (p) => { p.currentClubName = "Club"; },
  (p) => { p.unknownField = true; },
  (p) => { p.careerHistory = [{ clubName: "Club", leagueLevel: "T1", fromDate: "2024-01-01", toDate: "2023-01-01", position: "ST", appearances: 1, starts: 1, substituteAppearances: 1, minutesPlayed: 90, goals: 1, assists: 0 }]; },
];

test("client and server Pro Player onboarding validators accept the same canonical profile", () => {
  const value = validProfile();
  assert.equal(validateProPlayerOnboardingV1(value), true);
  assert.equal(validateProPlayerOnboardingV1Server(value), true);
});

test("client and server validators reject the same adversarial drift cases", () => {
  for (const mutate of mutations) {
    const value = structuredClone(validProfile());
    mutate(value);
    assert.equal(validateProPlayerOnboardingV1(value), false);
    assert.equal(validateProPlayerOnboardingV1Server(value), false);
  }
});
