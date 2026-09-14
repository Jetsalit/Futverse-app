import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_WRITER_VERIFIED,
  isFunctionBackedProClubWebAvailable,
  isWeeklyTrainingExistingDraftEditAvailable,
  isWeeklyTrainingFreshDraftProductionAvailable,
  isWeeklyTrainingSavedDraftReadAvailable,
} from "../src/config/runtimeCapabilities.ts";

test("Existing-DRAFT edit production capability remains closed until dedicated writer evidence is true", () => {
  assert.equal(PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_WRITER_VERIFIED, false);
  assert.equal(
    isWeeklyTrainingExistingDraftEditAvailable({ productionWriterVerified: false }),
    false,
  );
  assert.equal(
    isWeeklyTrainingExistingDraftEditAvailable({ productionWriterVerified: true }),
    true,
  );
});

test("Existing-DRAFT edit capability does not inherit generic, Fresh-DRAFT or Saved-DRAFT capability", () => {
  assert.equal(isFunctionBackedProClubWebAvailable({ dev: false }), false);
  assert.equal(isWeeklyTrainingFreshDraftProductionAvailable({ productionRulesVerified: true }), true);
  assert.equal(isWeeklyTrainingSavedDraftReadAvailable({ productionIndexVerified: true }), true);
  assert.equal(isWeeklyTrainingExistingDraftEditAvailable({ dev: false }), false);
});

test("Existing-DRAFT edit is available for local Vite dev testing without production activation", () => {
  assert.equal(isWeeklyTrainingExistingDraftEditAvailable({ dev: true }), true);
});
