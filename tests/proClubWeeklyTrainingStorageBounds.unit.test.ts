import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES,
  isStorageSafeProClubTrainingDrillReference,
  isWellFormedProClubTrainingUnicode,
  proClubTrainingUtf8ByteLength,
} from "../src/lib/proClubWeeklyTrainingStorageBounds.ts";
import { parseProClubWeeklyTrainingDraft } from "../src/lib/proClubWeeklyTraining.ts";

function draftWithDrillReference(drillReference: string) {
  return {
    clubId: "club-a",
    authorUid: "coach-a",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Storage-safe reference",
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
        coachingPoints: ["Scan before receiving"],
      }],
    }],
  };
}

test("drill reference storage contract is exactly 1500 UTF-8 bytes", () => {
  assert.equal(PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES, 1_500);
  assert.equal(proClubTrainingUtf8ByteLength("a".repeat(1_500)), 1_500);
  assert.equal(isStorageSafeProClubTrainingDrillReference("a".repeat(1_500)), true);
  assert.equal(isStorageSafeProClubTrainingDrillReference("a".repeat(1_501)), false);
});

test("UTF-8 byte bound rejects multibyte overflow independent of JS string length", () => {
  const exactThai = "ก".repeat(500);
  const overflowThai = "ก".repeat(501);
  assert.equal(proClubTrainingUtf8ByteLength(exactThai), 1_500);
  assert.equal(proClubTrainingUtf8ByteLength(overflowThai), 1_503);
  assert.equal(isStorageSafeProClubTrainingDrillReference(exactThai), true);
  assert.equal(isStorageSafeProClubTrainingDrillReference(overflowThai), false);
});

test("well-formed Unicode contract rejects unpaired surrogates before UTF-8 measurement", () => {
  const loneHigh = "\ud800";
  const loneLow = "\udc00";
  const highThenAscii = "\ud800x";
  const validPair = "\ud83d\ude00";

  assert.equal(isWellFormedProClubTrainingUnicode(loneHigh), false);
  assert.equal(isWellFormedProClubTrainingUnicode(loneLow), false);
  assert.equal(isWellFormedProClubTrainingUnicode(highThenAscii), false);
  assert.equal(isWellFormedProClubTrainingUnicode(validPair), true);
  assert.equal(isStorageSafeProClubTrainingDrillReference(loneHigh), false);
  assert.equal(isStorageSafeProClubTrainingDrillReference(loneLow), false);
  assert.equal(isStorageSafeProClubTrainingDrillReference(highThenAscii), false);
  assert.equal(isStorageSafeProClubTrainingDrillReference(validPair), true);
});

test("Firestore-reserved document ID forms are rejected", () => {
  for (const value of [".", "..", "__reserved__", "path/segment", " padded "]) {
    assert.equal(isStorageSafeProClubTrainingDrillReference(value), false, value);
  }
});

test("Weekly Training domain parser enforces byte and well-formed Unicode boundaries", () => {
  assert.equal(parseProClubWeeklyTrainingDraft(draftWithDrillReference("a".repeat(1_500))).state, "VALID");
  assert.equal(parseProClubWeeklyTrainingDraft(draftWithDrillReference("a".repeat(1_501))).state, "INVALID");
  assert.equal(parseProClubWeeklyTrainingDraft(draftWithDrillReference("ก".repeat(500))).state, "VALID");
  assert.equal(parseProClubWeeklyTrainingDraft(draftWithDrillReference("ก".repeat(501))).state, "INVALID");
  assert.equal(parseProClubWeeklyTrainingDraft(draftWithDrillReference("\ud800")).state, "INVALID");
  assert.equal(parseProClubWeeklyTrainingDraft(draftWithDrillReference("\udc00")).state, "INVALID");
  assert.equal(parseProClubWeeklyTrainingDraft(draftWithDrillReference("😀")).state, "VALID");
});
