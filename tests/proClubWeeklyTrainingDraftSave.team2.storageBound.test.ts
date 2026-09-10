import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  validateWeeklyTrainingDraft,
  WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES as SERVER_MAX_BYTES,
  WeeklyTrainingDraftSaveError,
} from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";
import { isValidDocumentIdentifier } from "../src/lib/proClubModel.ts";
import { parseProClubWeeklyTrainingDraft } from "../src/lib/proClubWeeklyTraining.ts";
import {
  ProClubWeeklyTrainingDraftSaveClientError,
  saveProClubWeeklyTrainingFreshDraft,
  type ProClubWeeklyTrainingFreshDraftInput,
} from "../src/lib/proClubWeeklyTrainingDraftSaveClient.ts";
import {
  isStorageSafeProClubTrainingDrillReference,
  PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES as CLIENT_MAX_BYTES,
  proClubTrainingUtf8ByteLength,
} from "../src/lib/proClubWeeklyTrainingStorageBounds.ts";

const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fullDraft(drillReference: string): Record<string, unknown> {
  return {
    clubId: "club-a",
    authorUid: "coach-1",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    sessions: [
      {
        sessionDate: "2026-09-07",
        startTime: "09:00",
        location: "Training Ground",
        objective: "Progress through first line",
        phaseOfPlay: "GENERAL",
        plannedLoad: "MODERATE",
        durationMinutes: 60,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Build-up",
            durationMinutes: 30,
            drillReference,
            coachingPoints: ["Body orientation"],
          },
        ],
      },
    ],
  };
}

function clientDraft(drillReference: string): ProClubWeeklyTrainingFreshDraftInput {
  return {
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    sessions: [
      {
        sessionDate: "2026-09-07",
        startTime: "09:00",
        location: "Training Ground",
        objective: "Progress through first line",
        phaseOfPlay: "GENERAL",
        plannedLoad: "MODERATE",
        durationMinutes: 60,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Build-up",
            durationMinutes: 30,
            drillReference,
            coachingPoints: ["Body orientation"],
          },
        ],
      },
    ],
  };
}

function domainAccepts(drillReference: string): boolean {
  return parseProClubWeeklyTrainingDraft(fullDraft(drillReference)).state === "VALID";
}

function serverAccepts(drillReference: string): boolean {
  try {
    validateWeeklyTrainingDraft(fullDraft(drillReference));
    return true;
  } catch (error) {
    assert.ok(error instanceof WeeklyTrainingDraftSaveError);
    assert.equal(error.code, "INVALID_ARGUMENT");
    return false;
  }
}

test("Team2: byte boundary is identical for ASCII, Thai and surrogate-pair Unicode", () => {
  assert.equal(CLIENT_MAX_BYTES, 1_500);
  assert.equal(SERVER_MAX_BYTES, CLIENT_MAX_BYTES);

  const cases = [
    ["a".repeat(1_500), 1_500, true],
    ["a".repeat(1_501), 1_501, false],
    ["ก".repeat(500), 1_500, true],
    ["ก".repeat(501), 1_503, false],
    ["😀".repeat(375), 1_500, true],
    ["😀".repeat(376), 1_504, false],
  ] as const;

  for (const [value, bytes, accepted] of cases) {
    assert.equal(proClubTrainingUtf8ByteLength(value), bytes);
    assert.equal(isStorageSafeProClubTrainingDrillReference(value), accepted);
    assert.equal(domainAccepts(value), accepted);
    assert.equal(serverAccepts(value), accepted);
  }
});

test("Team2: generic slash-free identity is not mistaken for the storage contract", () => {
  const oversized = "x".repeat(1_501);
  assert.equal(isValidDocumentIdentifier(oversized), true);
  assert.equal(isStorageSafeProClubTrainingDrillReference(oversized), false);
  assert.equal(domainAccepts(oversized), false);
  assert.equal(serverAccepts(oversized), false);
});

test("Team2: reserved and path-like Firestore ID forms fail closed in domain and server", () => {
  for (const value of [".", "..", "__name__", "__anything__", "a/b", " padded "]) {
    assert.equal(isStorageSafeProClubTrainingDrillReference(value), false, value);
    assert.equal(domainAccepts(value), false, value);
    assert.equal(serverAccepts(value), false, value);
  }
});

test("Team2: oversized drill references are definitive client validation failures before transport", async () => {
  for (const drillReference of ["x".repeat(1_501), "ก".repeat(501), "😀".repeat(376)]) {
    let called = false;
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraft(
        {
          requestId: REQUEST_ID,
          clubId: "club-a",
          actorUid: "coach-1",
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

test("Team2: UI and trusted server independently enforce byte length rather than maxLength alone", async () => {
  const composer = await readFile(
    "src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx",
    "utf8",
  );
  const server = await readFile(
    "functions/src/proClubWeeklyTrainingDraftSave/core.ts",
    "utf8",
  );

  assert.match(composer, /PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES/);
  assert.match(composer, /proClubTrainingUtf8ByteLength\([^)]*\)\s*>\s*PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES/);
  assert.match(composer, /maxLength=\{PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES\}/);
  assert.match(composer, /UTF-8 bytes/);
  assert.match(server, /Buffer\.byteLength\([^,]+,\s*"utf8"\)/);
  assert.match(server, /WEEKLY_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES/);
});
