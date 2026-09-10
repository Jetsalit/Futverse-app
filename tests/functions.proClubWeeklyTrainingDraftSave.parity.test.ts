import assert from "node:assert/strict";
import { test } from "node:test";

import {
  validateWeeklyTrainingDraft,
  WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES,
  WeeklyTrainingDraftSaveError,
} from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

function canonicalDraft(): Record<string, unknown> {
  return {
    clubId: "club-a",
    authorUid: "ignored-payload-author",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    sessions: [
      {
        sessionDate: "2026-09-07",
        startTime: "09:00",
        location: "Training Ground A",
        objective: "Progress through first line",
        phaseOfPlay: "GENERAL",
        plannedLoad: "MODERATE",
        durationMinutes: 60,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Build-up",
            durationMinutes: 30,
            coachingPoints: ["Body orientation"],
          },
        ],
      },
    ],
  };
}

function withDrillReference(reference: string): Record<string, unknown> {
  const draft = canonicalDraft();
  const sessions = draft.sessions as Array<Record<string, unknown>>;
  const blocks = sessions[0].blocks as Array<Record<string, unknown>>;
  blocks[0] = { ...blocks[0], drillReference: reference };
  return draft;
}

function expectInvalid(draft: unknown): void {
  assert.throws(
    () => validateWeeklyTrainingDraft(draft),
    (error: unknown) =>
      error instanceof WeeklyTrainingDraftSaveError &&
      error.code === "INVALID_ARGUMENT",
  );
}

test("server validator rejects whitespace-padded clubId like canonical domain identity validation", () => {
  expectInvalid({ ...canonicalDraft(), clubId: " club-a " });
});

test("server validator rejects whitespace-padded drillReference like canonical document identity validation", () => {
  expectInvalid(withDrillReference(" drill-123 "));
});

test("trusted server drill-reference contract is 1500 UTF-8 bytes", () => {
  assert.equal(WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES, 1_500);
  assert.equal(validateWeeklyTrainingDraft(withDrillReference("a".repeat(1_500))).sessions[0].blocks[0].drillReference, "a".repeat(1_500));
  expectInvalid(withDrillReference("a".repeat(1_501)));
  assert.equal(validateWeeklyTrainingDraft(withDrillReference("ก".repeat(500))).sessions[0].blocks[0].drillReference, "ก".repeat(500));
  expectInvalid(withDrillReference("ก".repeat(501)));
});

test("trusted server rejects reserved Firestore document ID forms", () => {
  for (const value of [".", "..", "__reserved__", "path/segment"]) {
    expectInvalid(withDrillReference(value));
  }
});

test("whitespace-only Technical Director note normalizes to empty and remains non-persisted", () => {
  const result = validateWeeklyTrainingDraft({
    ...canonicalDraft(),
    technicalDirectorNote: "   ",
  });
  assert.equal(result.clubId, "club-a");
  assert.equal("technicalDirectorNote" in result, false);
});

test("non-empty Technical Director note remains fail-closed", () => {
  expectInvalid({
    ...canonicalDraft(),
    technicalDirectorNote: "TD review note",
  });
});
