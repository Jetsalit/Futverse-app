import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  validateWeeklyTrainingDraft,
  WeeklyTrainingDraftSaveError,
} from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";
import { parseProClubWeeklyTrainingDraft } from "../src/lib/proClubWeeklyTraining.ts";
import {
  ProClubWeeklyTrainingDraftSaveClientError,
  saveProClubWeeklyTrainingFreshDraft,
  type ProClubWeeklyTrainingFreshDraftInput,
} from "../src/lib/proClubWeeklyTrainingDraftSaveClient.ts";
import {
  isStorageSafeProClubTrainingDrillReference,
  isWellFormedProClubTrainingUnicode,
  proClubTrainingUtf8ByteLength,
} from "../src/lib/proClubWeeklyTrainingStorageBounds.ts";

const REQUEST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fullDraft(drillReference: string): Record<string, unknown> {
  return {
    clubId: "club-a",
    authorUid: "coach-a",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Unicode storage proof",
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
        drillReference,
        coachingPoints: ["Scan"],
      }],
    }],
  };
}

function clientDraft(drillReference: string): ProClubWeeklyTrainingFreshDraftInput {
  return {
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Unicode storage proof",
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
        drillReference,
        coachingPoints: ["Scan"],
      }],
    }],
  };
}

function serverAccepts(value: string): boolean {
  try {
    validateWeeklyTrainingDraft(fullDraft(value));
    return true;
  } catch (error) {
    assert.ok(error instanceof WeeklyTrainingDraftSaveError);
    assert.equal(error.code, "INVALID_ARGUMENT");
    return false;
  }
}

test("Team2: every unpaired surrogate shape fails before encoding while valid pairs survive", () => {
  const invalid = [
    "\ud800",
    "\udbff",
    "\udc00",
    "\udfff",
    "\ud800x",
    "x\udc00",
    "\ud800\ud800",
    "\udc00\udc00",
    "\udc00\ud800",
  ];
  for (const value of invalid) {
    assert.equal(isWellFormedProClubTrainingUnicode(value), false, JSON.stringify(value));
    assert.equal(isStorageSafeProClubTrainingDrillReference(value), false, JSON.stringify(value));
    assert.equal(parseProClubWeeklyTrainingDraft(fullDraft(value)).state, "INVALID", JSON.stringify(value));
    assert.equal(serverAccepts(value), false, JSON.stringify(value));
  }

  for (const value of ["😀", "A😀B", "𐐷", "😀".repeat(375)]) {
    assert.equal(isWellFormedProClubTrainingUnicode(value), true, value);
    assert.equal(isStorageSafeProClubTrainingDrillReference(value), true, value);
    assert.equal(parseProClubWeeklyTrainingDraft(fullDraft(value)).state, "VALID", value);
    assert.equal(serverAccepts(value), true, value);
  }
});

test("Team2: valid emoji boundary is measured as UTF-8 bytes, not UTF-16 code units", () => {
  const exact = "😀".repeat(375);
  const overflow = "😀".repeat(376);
  assert.equal(exact.length, 750);
  assert.equal(overflow.length, 752);
  assert.equal(proClubTrainingUtf8ByteLength(exact), 1_500);
  assert.equal(proClubTrainingUtf8ByteLength(overflow), 1_504);
  assert.equal(isStorageSafeProClubTrainingDrillReference(exact), true);
  assert.equal(isStorageSafeProClubTrainingDrillReference(overflow), false);
  assert.equal(serverAccepts(exact), true);
  assert.equal(serverAccepts(overflow), false);
});

test("Team2: ill-formed and overflow values are definitive client failures before callable transport", async () => {
  for (const drillReference of ["\ud800", "\udc00", "\ud800x", "x\udc00", "😀".repeat(376)]) {
    let called = false;
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraft(
        {
          requestId: REQUEST_ID,
          clubId: "club-a",
          actorUid: "coach-a",
          draft: clientDraft(drillReference),
        },
        async () => {
          called = true;
          return { data: null };
        },
      ),
      (error: unknown) =>
        error instanceof ProClubWeeklyTrainingDraftSaveClientError &&
        error.code === "INVALID_ARGUMENT",
    );
    assert.equal(called, false);
  }
});

test("Team2: shared and server validators both check surrogate well-formedness before byte measurement", async () => {
  const shared = await readFile("src/lib/proClubWeeklyTrainingStorageBounds.ts", "utf8");
  const server = await readFile("functions/src/proClubWeeklyTrainingDraftSave/core.ts", "utf8");
  assert.match(shared, /isWellFormedProClubTrainingUnicode\(value\)/);
  assert.match(shared, /charCodeAt/);
  assert.match(server, /wellFormedUnicode\(value\)/);
  assert.match(server, /charCodeAt/);
  assert.match(server, /Buffer\.byteLength\(value, "utf8"\)/);
});
