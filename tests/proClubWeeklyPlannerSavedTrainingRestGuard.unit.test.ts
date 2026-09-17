import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeeklyPlannerState,
  markWeeklyPlannerDayRest,
} from "../src/components/pro-club/operations/weeklyPlannerUiModel";
import type { ProClubWeeklyPeriodizationBoard } from "../src/lib/proClubWeeklyPeriodizationBoard";

const board: ProClubWeeklyPeriodizationBoard = {
  weekStartDate: "2026-09-14",
  squadLabel: "First Team",
  mainObjective: "Protect saved training while previewing rest days",
  sessions: [
    {
      dayOfWeek: "MONDAY",
      sessionDate: "2026-09-14",
      startTime: "09:00",
      location: "Training Ground A",
      objective: "Saved production training",
      phaseOfPlay: "GENERAL",
      plannedLoad: "LOW",
      durationMinutes: 60,
      blocks: [
        {
          blockType: "WARM_UP",
          title: "Movement preparation",
          durationMinutes: 15,
          coachingPoints: ["Control the range"],
        },
      ],
    },
  ],
};

test("marking Rest cannot hide an authoritative saved Training session", () => {
  const initial = buildWeeklyPlannerState(board);
  const next = markWeeklyPlannerDayRest(initial, "2026-09-14");
  const monday = next.days[0];

  assert.equal(monday.rest, false);
  assert.equal(monday.activities.length, 1);
  assert.equal(monday.activities[0].source, "SAVED_TRAINING");
});
