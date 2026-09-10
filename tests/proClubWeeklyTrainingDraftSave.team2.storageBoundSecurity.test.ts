import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  validateWeeklyTrainingDraft,
  WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES,
  WeeklyTrainingDraftSaveError,
} from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";
import {
  ProClubWeeklyTrainingDraftSaveClientError,
  saveProClubWeeklyTrainingFreshDraft,
  type ProClubWeeklyTrainingFreshDraftInput,
} from "../src/lib/proClubWeeklyTrainingDraftSaveClient.ts";
import type { ProClubWeeklyTrainingDraft } from "../src/lib/proClubWeeklyTraining.ts";
import {
  PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES,
  isStorageSafeProClubTrainingDrillReference,
  proClubTrainingUtf8ByteLength,
} from "../src/lib/proClubWeeklyTrainingStorageBounds.ts";
import { parseProClubWeeklyTrainingDraft } from "../src/lib/proClubWeeklyTraining.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function fullDraft(reference: string): ProClubWeeklyTrainingDraft {
  return {
    clubId: "club-a",
    authorUid: "coach-a",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Storage boundary audit",
    sessions: [{
      sessionDate: "2026-09-07",
      startTime: "09:00",
      location: "Ground A",
      objective: "Build-up",
      phaseOfPlay: "GENERAL",
      plannedLoad: "MODERATE",
      durationMinutes: 60,
      blocks: [{
        blockType: "TACTICAL",
        title: "Pattern",
        durationMinutes: 30,
        drillReference: reference,
        coachingPoints: ["Scan"],
      }],
    }],
  };
}

function freshDraft(reference: string): ProClubWeeklyTrainingFreshDraftInput {
  return {
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Storage boundary audit",
    sessions: [{
      sessionDate: "2026-09-07",
      startTime: "09:00",
      location: "Ground A",
      objective: "Build-up",
      phaseOfPlay: "GENERAL",
      plannedLoad: "MODERATE",
      durationMinutes: 60,
      blocks: [{
        blockType: "TACTICAL",
        title: "Pattern",
        durationMinutes: 30,
        drillReference: reference,
        coachingPoints: ["Scan"],
      }],
    }],
  };
}

function serverAccepts(reference: string): boolean {
  try {
    validateWeeklyTrainingDraft(fullDraft(reference));
    return true;
  } catch (error) {
    assert.ok(error instanceof WeeklyTrainingDraftSaveError);
    assert.equal(error.code, "INVALID_ARGUMENT");
    return false;
  }
}

test("shared and trusted validators expose the same 1500-byte storage contract", () => {
  assert.equal(PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES, 1_500);
  assert.equal(WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES, 1_500);

  const cases = [
    ["a".repeat(1_500), true],
    ["a".repeat(1_501), false],
    ["ก".repeat(500), true],
    ["ก".repeat(501), false],
    ["😀".repeat(375), true],
    ["😀".repeat(376), false],
  ] as const;

  for (const [value, expected] of cases) {
    assert.equal(isStorageSafeProClubTrainingDrillReference(value), expected);
    assert.equal(parseProClubWeeklyTrainingDraft(fullDraft(value)).state === "VALID", expected);
    assert.equal(serverAccepts(value), expected);
  }
});

test("UTF-8 byte counting is byte-based rather than JavaScript length-based", () => {
  const thai = "ก".repeat(501);
  const emoji = "😀".repeat(376);
  assert.ok(thai.length < 1_500);
  assert.ok(emoji.length < 1_500);
  assert.equal(proClubTrainingUtf8ByteLength(thai), 1_503);
  assert.equal(proClubTrainingUtf8ByteLength(emoji), 1_504);
  assert.equal(isStorageSafeProClubTrainingDrillReference(thai), false);
  assert.equal(isStorageSafeProClubTrainingDrillReference(emoji), false);
});

test("reserved/path/padded Firestore identifier forms fail consistently", () => {
  for (const value of [".", "..", "__name__", "__reserved__", "a/b", " padded "]) {
    assert.equal(isStorageSafeProClubTrainingDrillReference(value), false, value);
    assert.equal(parseProClubWeeklyTrainingDraft(fullDraft(value)).state, "INVALID", value);
    assert.equal(serverAccepts(value), false, value);
  }
});

test("oversized multibyte drill reference is rejected before callable transport", async () => {
  let calls = 0;
  await assert.rejects(
    saveProClubWeeklyTrainingFreshDraft(
      {
        requestId: REQUEST_ID,
        clubId: "club-a",
        actorUid: "coach-a",
        draft: freshDraft("😀".repeat(376)),
      },
      async () => {
        calls += 1;
        return { data: null };
      },
    ),
    (error: unknown) =>
      error instanceof ProClubWeeklyTrainingDraftSaveClientError &&
      error.code === "INVALID_ARGUMENT",
  );
  assert.equal(calls, 0);
});

test("UI uses byte guard and does not rely on maxLength alone", async () => {
  const composer = await readFile(
    "src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx",
    "utf8",
  );
  assert.match(composer, /proClubTrainingUtf8ByteLength\(value\)/);
  assert.match(composer, /PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES/);
  assert.match(composer, /UTF-8 bytes/);
  assert.match(composer, /if \(proClubTrainingUtf8ByteLength\(value\) > PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES\) return;/);
});
