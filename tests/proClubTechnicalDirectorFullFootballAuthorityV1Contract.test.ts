import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const contractPath =
  "docs/PRO_CLUB_TECHNICAL_DIRECTOR_FULL_FOOTBALL_AUTHORITY_V1_CONTRACT.md";
const modelPath =
  "src/lib/proClubTechnicalDirectorFullFootballAuthority.ts";

test("Technical Director Full Football Authority V1 contract freezes requested football capabilities", () => {
  const contract = readFileSync(contractPath, "utf8");
  const model = readFileSync(modelPath, "utf8");

  for (const phrase of [
    "view every football module/page",
    "write daily training plans",
    "write weekly training plans",
    "review submitted technical work",
    "request revision",
    "approve submitted technical work",
    "create and edit football assessments/evaluations",
  ]) {
    assert.equal(contract.toLowerCase().includes(phrase.toLowerCase()), true);
  }

  for (const field of [
    "canViewAllFootballModules",
    "canWriteDailyTrainingPlan",
    "canWriteWeeklyTrainingPlan",
    "canReviewTechnicalWork",
    "canRequestRevision",
    "canApproveTechnicalWork",
    "canCreateAssessment",
    "canEditAssessment",
  ]) {
    assert.equal(model.includes(field), true);
  }
});

test("contract preserves tenant authority and forbids audit deletion", () => {
  const contract = readFileSync(contractPath, "utf8");
  const model = readFileSync(modelPath, "utf8");

  assert.equal(
    contract.includes("does not replace or mutate tenant authorization"),
    true,
  );
  assert.equal(contract.includes("cannot delete audit/history records"), true);
  assert.equal(model.includes("canDeleteAuditHistory: false"), true);
  assert.equal(model.includes("canMutateTenantAuthority: false"), true);
});

test("contract records current blockers instead of pretending production is already enabled", () => {
  const contract = readFileSync(contractPath, "utf8");

  assert.equal(contract.includes("currently gates authoring to `HEAD_COACH`"), true);
  assert.equal(
    contract.includes("no dedicated Pro Club production assessment surface is currently wired"),
    true,
  );
  assert.equal(
    contract.includes("dashboard surface is currently disabled/coming soon"),
    true,
  );
  assert.equal(
    contract.includes("does not modify Firestore Rules, production runtime UI, Hosting, Functions or production data"),
    true,
  );
});
