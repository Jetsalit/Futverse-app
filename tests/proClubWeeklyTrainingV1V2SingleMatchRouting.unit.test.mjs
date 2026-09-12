import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { repairProClubWeeklyTrainingV1V2SingleMatchRouting } from "../scripts/repairProClubWeeklyTrainingV1V2SingleMatchRouting.mjs";

const DEFECTIVE_ROOT_HEAD = "e90a06713e3c0f86fd8ede63a768e3d0b4c2e8b0";
const defectiveRoot = execFileSync(
  "git",
  ["show", `${DEFECTIVE_ROOT_HEAD}:firestore.rules`],
  { encoding: "utf8" },
);
const repaired = repairProClubWeeklyTrainingV1V2SingleMatchRouting(defectiveRoot);

const weeklyPlanMatch = "match /proClubs/{clubId}/weeklyTrainingPlans/{planId} {";

test("repair collapses the exact historical defective Weekly Training path to one canonical match tree", () => {
  assert.equal(defectiveRoot.split(weeklyPlanMatch).length - 1, 2);
  assert.equal(repaired.split(weeklyPlanMatch).length - 1, 1);
});

test("create dispatch is schema-first at plan, session and block levels", () => {
  assert.match(
    repaired,
    /allow create: if request\.resource\.data\.get\('schemaVersion', 0\) == 2[\s\S]*proClubWeeklyTrainingValidPlanCreateV2[\s\S]*schemaVersion', 0\) == 1[\s\S]*proClubWeeklyTrainingValidDraftPlanCreateV1/,
  );
  assert.match(
    repaired,
    /allow create: if request\.resource\.data\.get\('schemaVersion', 0\) == 2[\s\S]*proClubWeeklyTrainingValidSessionCreateV2[\s\S]*proClubWeeklyTrainingValidSessionCreateV1/,
  );
  assert.match(
    repaired,
    /allow create: if request\.resource\.data\.get\('schemaVersion', 0\) == 2[\s\S]*proClubWeeklyTrainingValidBlockCreateV2[\s\S]*proClubWeeklyTrainingValidBlockCreateV1/,
  );
});

test("updates remain explicitly schema-v1-only so V2 stays fresh-create-only", () => {
  const v1OnlyGuard = /resource\.data\.get\('schemaVersion', 0\) == 1\s+&& request\.resource\.data\.get\('schemaVersion', 0\) == 1/g;
  assert.equal([...repaired.matchAll(v1OnlyGuard)].length, 3);
  assert.match(repaired, /proClubWeeklyTrainingValidDraftPlanUpdateV1/);
  assert.match(repaired, /proClubWeeklyTrainingValidSessionUpdateV1/);
  assert.match(repaired, /proClubWeeklyTrainingValidBlockUpdateV1/);
});

test("repair is fail-closed and cannot be applied twice", () => {
  assert.throws(
    () => repairProClubWeeklyTrainingV1V2SingleMatchRouting(repaired),
    /Missing expected duplicate schema-v2 weeklyTrainingPlans match/,
  );
});

test("repair preserves manifest path and V2 validators", () => {
  assert.match(repaired, /weeklyTrainingDraftCreateRequests\/\{planId\}/);
  assert.match(repaired, /proClubWeeklyTrainingValidManifestCreateV2/);
  assert.match(repaired, /proClubWeeklyTrainingValidPlanCreateV2/);
  assert.match(repaired, /proClubWeeklyTrainingValidSessionCreateV2/);
  assert.match(repaired, /proClubWeeklyTrainingValidBlockCreateV2/);
});
