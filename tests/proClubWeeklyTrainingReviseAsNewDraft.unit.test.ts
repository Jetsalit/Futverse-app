import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFreshWeeklyTrainingDraftFromSavedDraft } from "../src/lib/proClubWeeklyTrainingReviseAsNewDraft";
import type { ProClubWeeklyTrainingDraft } from "../src/lib/proClubWeeklyTraining";

const sourceDraft: ProClubWeeklyTrainingDraft = {
  clubId: "club-a",
  authorUid: "head-coach-a",
  weekStartDate: "2026-09-14",
  squadLabel: "First Team",
  mainObjective: "Prepare for opening fixture",
  secondaryObjective: "Set-piece detail",
  headCoachNote: "Source Head Coach note",
  technicalDirectorNote: "Closed field must not be copied",
  sessions: [
    {
      sessionDate: "2026-09-15",
      startTime: "16:00",
      location: "Main pitch",
      objective: "Pressing and transition",
      phaseOfPlay: "OUT_OF_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 90,
      blocks: [
        {
          blockType: "TACTICAL",
          title: "Mid-block press",
          durationMinutes: 30,
          drillReference: "pressing-drill-01",
          coachingPoints: ["Protect central lane", "Trigger on backward pass"],
        },
      ],
    },
  ],
};

test("saved DRAFT becomes a fresh-DRAFT input without tenant, actor or TD-only fields", () => {
  const result = buildFreshWeeklyTrainingDraftFromSavedDraft(sourceDraft);

  assert.deepEqual(result, {
    weekStartDate: "2026-09-14",
    squadLabel: "First Team",
    mainObjective: "Prepare for opening fixture",
    secondaryObjective: "Set-piece detail",
    headCoachNote: "Source Head Coach note",
    sessions: [
      {
        sessionDate: "2026-09-15",
        startTime: "16:00",
        location: "Main pitch",
        objective: "Pressing and transition",
        phaseOfPlay: "OUT_OF_POSSESSION",
        plannedLoad: "MODERATE",
        durationMinutes: 90,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Mid-block press",
            durationMinutes: 30,
            drillReference: "pressing-drill-01",
            coachingPoints: ["Protect central lane", "Trigger on backward pass"],
          },
        ],
      },
    ],
  });

  assert.equal("clubId" in result, false);
  assert.equal("authorUid" in result, false);
  assert.equal("technicalDirectorNote" in result, false);
});

test("fresh-DRAFT conversion deep-copies nested arrays so the source remains immutable", () => {
  const result = buildFreshWeeklyTrainingDraftFromSavedDraft(sourceDraft);

  assert.notEqual(result.sessions, sourceDraft.sessions);
  assert.notEqual(result.sessions[0]?.blocks, sourceDraft.sessions[0]?.blocks);
  assert.notEqual(
    result.sessions[0]?.blocks[0]?.coachingPoints,
    sourceDraft.sessions[0]?.blocks[0]?.coachingPoints,
  );
});
