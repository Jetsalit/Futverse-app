import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAcademyAccessState } from "../functions/src/superAdminAccessControl/core.ts";

function academyMembership(role: "ADMIN" | "COACH", status: "ACTIVE" | "SUSPENDED") {
  const timestamp = new Date("2026-01-01T00:00:00.000Z");
  return {
    userId: "coach",
    academyId: "academy",
    role,
    status,
    source: "LEGACY_MIGRATION",
    joinedAt: timestamp,
    joinedBy: "superadmin",
    updatedAt: timestamp,
  };
}

function fitnessSpecialty(status: "ACTIVE" | "INACTIVE" = "ACTIVE") {
  const timestamp = { toDate: () => new Date("2026-01-01T00:00:00.000Z") };
  return {
    schemaVersion: 1,
    specialty: "FITNESS_COACH",
    status,
    createdAt: timestamp,
    createdBy: "superadmin",
    updatedAt: timestamp,
    updatedBy: "superadmin",
  };
}

test("rejects reactivating a suspended Academy ADMIN while Fitness Coach specialty is active", () => {
  const decision = resolveAcademyAccessState(
    academyMembership("ADMIN", "SUSPENDED"),
    fitnessSpecialty(),
    "ADMIN",
    false,
  );

  assert.equal(decision.state, "MANUAL_REVIEW");
});

test("allows suspended Academy COACH reactivation with its active Fitness Coach specialty", () => {
  const decision = resolveAcademyAccessState(
    academyMembership("COACH", "SUSPENDED"),
    fitnessSpecialty(),
    "COACH",
    false,
  );

  assert.equal(decision.state, "REACTIVATE");
  assert.equal(decision.actionType, "ACCESS_REACTIVATED");
});

test("allows suspended Academy ADMIN reactivation when no active specialty exists", () => {
  const decision = resolveAcademyAccessState(
    academyMembership("ADMIN", "SUSPENDED"),
    null,
    "ADMIN",
    false,
  );

  assert.equal(decision.state, "REACTIVATE");
  assert.equal(decision.actionType, "ACCESS_REACTIVATED");
});
