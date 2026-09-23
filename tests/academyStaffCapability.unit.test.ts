import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACADEMY_FITNESS_CAPABILITIES,
  hasAcademyFitnessCapability,
  isActiveAcademyFitnessCoach,
  resolveAcademyFitnessCapabilities,
} from "../src/lib/academyStaffCapability.ts";

const activeCoach = {
  membershipRole: "COACH",
  membershipStatus: "ACTIVE",
} as const;

test("Academy TenantRole remains ADMIN or COACH; Fitness Coach is a specialty, not membership authority", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const membershipSource = readFileSync(
    path.join(repoRoot, "src/types/Membership.ts"),
    "utf8",
  );
  assert.match(membershipSource, /export type TenantRole = "ADMIN" \| "COACH";/);
  assert.doesNotMatch(membershipSource, /TenantRole[^;]*FITNESS_COACH/);
});

test("active Academy Coach keeps baseline Fitness usage without catalogue authority", () => {
  assert.deepEqual(resolveAcademyFitnessCapabilities(activeCoach), [
    "FITNESS_VIEW",
    "FITNESS_RECORD_RESULTS",
    "FITNESS_USE_IN_TRAINING",
  ]);
  assert.equal(
    hasAcademyFitnessCapability(activeCoach, "FITNESS_MANAGE_CATALOGUE"),
    false,
  );
});

test("active Fitness Coach specialty adds testing and catalogue management without replacing COACH membership", () => {
  const fitnessCoach = {
    ...activeCoach,
    specialties: [{ specialty: "FITNESS_COACH", status: "ACTIVE" }],
  } as const;

  assert.deepEqual(
    resolveAcademyFitnessCapabilities(fitnessCoach),
    ACADEMY_FITNESS_CAPABILITIES,
  );
  assert.equal(isActiveAcademyFitnessCoach(fitnessCoach), true);
  assert.equal(fitnessCoach.membershipRole, "COACH");
});

test("inactive or malformed specialty never grants elevated Fitness capability", () => {
  const inactive = {
    ...activeCoach,
    specialties: [{ specialty: "FITNESS_COACH", status: "INACTIVE" }],
  } as const;
  const malformed = {
    ...activeCoach,
    specialties: [{ specialty: "FITNESS_COACH", status: "active" }],
  } as const;

  assert.equal(
    hasAcademyFitnessCapability(inactive, "FITNESS_MANAGE_TESTING"),
    false,
  );
  assert.equal(
    hasAcademyFitnessCapability(malformed, "FITNESS_MANAGE_CATALOGUE"),
    false,
  );
  assert.equal(isActiveAcademyFitnessCoach(inactive), false);
  assert.equal(isActiveAcademyFitnessCoach(malformed), false);
});

test("specialty never creates authority when Academy membership is not ACTIVE", () => {
  for (const membershipStatus of [
    "PENDING",
    "SUSPENDED",
    "LEFT",
    "REVOKED",
  ] as const) {
    const context = {
      membershipRole: "COACH",
      membershipStatus,
      specialties: [{ specialty: "FITNESS_COACH", status: "ACTIVE" }],
    } as const;

    assert.deepEqual(resolveAcademyFitnessCapabilities(context), []);
    assert.equal(isActiveAcademyFitnessCoach(context), false);
  }
});

test("active Academy Admin retains all Fitness capabilities without requiring a specialty", () => {
  const admin = {
    membershipRole: "ADMIN",
    membershipStatus: "ACTIVE",
  } as const;

  assert.deepEqual(
    resolveAcademyFitnessCapabilities(admin),
    ACADEMY_FITNESS_CAPABILITIES,
  );
});

test("invalid membership context fails closed", () => {
  assert.deepEqual(resolveAcademyFitnessCapabilities(null), []);
  assert.deepEqual(
    resolveAcademyFitnessCapabilities({
      membershipRole: "FITNESS_COACH",
      membershipStatus: "ACTIVE",
    }),
    [],
  );
});

test("domain resolver contains no Firebase persistence or client write primitive", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const modelSource = readFileSync(
    path.join(repoRoot, "src/lib/academyStaffCapability.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    modelSource,
    /firebase|firestore|setDoc|addDoc|updateDoc|deleteDoc|writeBatch/,
  );
});
