import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE,
  PRODUCTION_WEEKLY_TRAINING_FRESH_DRAFT_RULES_VERIFIED,
  isFunctionBackedProClubWebAvailable,
  isWeeklyTrainingFreshDraftProductionAvailable,
} from "../src/config/runtimeCapabilities.ts";

test("dedicated Weekly Training production capability stays fail-closed until reviewed Rules evidence is true", () => {
  assert.equal(PRODUCTION_WEEKLY_TRAINING_FRESH_DRAFT_RULES_VERIFIED, false);
  assert.equal(PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE, false);
  assert.equal(
    isWeeklyTrainingFreshDraftProductionAvailable({ productionRulesVerified: false }),
    false,
  );
  assert.equal(
    isWeeklyTrainingFreshDraftProductionAvailable({ productionRulesVerified: true }),
    true,
  );
});

test("dedicated production capability does not change generic Function-backed Spark boundary", () => {
  assert.equal(isFunctionBackedProClubWebAvailable({ dev: false }), false);
  assert.equal(isFunctionBackedProClubWebAvailable({ dev: true }), true);
  assert.equal(isWeeklyTrainingFreshDraftProductionAvailable({}), false);
});
