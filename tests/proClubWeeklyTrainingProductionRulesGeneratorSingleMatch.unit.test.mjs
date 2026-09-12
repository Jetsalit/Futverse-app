import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { applyProClubWeeklyTrainingProductionPersistenceV1Rules } from "../scripts/applyProClubWeeklyTrainingProductionPersistenceV1Rules.mjs";

const CLEAN_IMPLEMENTATION_BASE = "b580ee8c1a92f00863cbeb24c3c1fe8dfb02be04";
const cleanRoot = execFileSync(
  "git",
  ["show", `${CLEAN_IMPLEMENTATION_BASE}:firestore.rules`],
  { encoding: "utf8" },
);

const generated = applyProClubWeeklyTrainingProductionPersistenceV1Rules(cleanRoot);
const weeklyPlanMatch = "match /proClubs/{clubId}/weeklyTrainingPlans/{planId} {";

test("production Rules generator emits one canonical Weekly Training match tree", () => {
  assert.equal(generated.split(weeklyPlanMatch).length - 1, 1);
});

test("generated create routing dispatches schema 1 and 2 before expensive validators", () => {
  assert.match(generated, /request\.resource\.data\.get\('schemaVersion', 0\) == 2/);
  assert.match(generated, /proClubWeeklyTrainingValidPlanCreateV2\(clubId, planId\)/);
  assert.match(generated, /proClubWeeklyTrainingValidDraftPlanCreateV1\(clubId\)/);
  assert.match(generated, /proClubWeeklyTrainingValidSessionCreateV2/);
  assert.match(generated, /proClubWeeklyTrainingValidSessionCreateV1/);
  assert.match(generated, /proClubWeeklyTrainingValidBlockCreateV2/);
  assert.match(generated, /proClubWeeklyTrainingValidBlockCreateV1/);
});

test("generated Rules preserve the legacy V1 update expressions without extra schema guards", () => {
  assert.match(generated, /allow update: if proClubWeeklyTrainingValidDraftPlanUpdateV1\(clubId\);/);
  assert.match(generated, /allow update: if proClubWeeklyTrainingValidSessionUpdateV1\(/);
  assert.match(generated, /allow update: if proClubWeeklyTrainingValidBlockUpdateV1\(/);
  assert.doesNotMatch(
    generated,
    /allow update: if resource\.data\.get\('schemaVersion', 0\) == 1\s+&& request\.resource\.data\.get\('schemaVersion', 0\) == 1/,
  );
});

test("generated Rules preserve manifest and canonical V2 block enums", () => {
  assert.match(generated, /weeklyTrainingDraftCreateRequests\/\{planId\}/);
  assert.match(generated, /'GAME'/);
  assert.match(generated, /'CONDITIONING'/);
  assert.doesNotMatch(generated, /'PHYSICAL'/);
  assert.doesNotMatch(generated, /'SMALL_SIDED_GAME'/);
  assert.doesNotMatch(generated, /'SET_PIECE'/);
});
