import assert from "node:assert/strict";
import test from "node:test";
import type { ProClubWeeklyPeriodizationBoard } from "../src/lib/proClubWeeklyPeriodizationBoard";
import {
  buildWeeklyPlannerState,
  summarizeWeeklyPlannerDay,
} from "../src/components/pro-club/operations/weeklyPlannerUiModel";

const board: ProClubWeeklyPeriodizationBoard = {
  weekStartDate: "2026-09-14",
  squadLabel: "First Team",
  mainObjective: "Prepare the team for the weekend fixture",
  sessions: [
    {
      sessionDate: "2026-09-14",
      dayOfWeek: "MONDAY",
      startTime: "08:00",
      location: "Training Ground A",
      objective: "Restore movement quality",
      phaseOfPlay: "GENERAL",
      plannedLoad: "LOW",
      durationMinutes: 60,
      blocks: [
        {
          blockType: "WARM_UP",
          title: "Movement preparation",
          durationMinutes: 15,
          coachingPoints: ["Smooth movement"],
        },
      ],
    },
    {
      sessionDate: "2026-09-14",
      dayOfWeek: "MONDAY",
      startTime: "17:00",
      location: "Training Ground A",
      objective: "Passing rhythm",
      phaseOfPlay: "IN_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 75,
      blocks: [
        {
          blockType: "TECHNICAL",
          title: "Passing rhythm",
          durationMinutes: 20,
          drillReference: "drill-passing-rhythm",
          coachingPoints: ["Play forward when possible"],
        },
      ],
    },
    {
      sessionDate: "2026-09-19",
      dayOfWeek: "SATURDAY",
      startTime: "10:00",
      location: "Training Ground B",
      objective: "Match preparation",
      phaseOfPlay: "SET_PIECES",
      plannedLoad: "LOW",
      durationMinutes: 45,
      blocks: [
        {
          blockType: "TACTICAL",
          title: "Set-piece walk-through",
          durationMinutes: 20,
          coachingPoints: ["Confirm roles"],
        },
      ],
    },
  ],
};

test("projects the existing Weekly board into exactly seven Monday-to-Sunday days", () => {
  const state = buildWeeklyPlannerState(board);

  assert.equal(state.weekStartDate, "2026-09-14");
  assert.equal(state.days.length, 7);
  assert.deepEqual(
    state.days.map((day) => day.dayOfWeek),
    [
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ],
  );
  assert.deepEqual(
    state.days.map((day) => day.date),
    [
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ],
  );
});

test("keeps multiple saved training sessions on the same day without inventing Rest", () => {
  const state = buildWeeklyPlannerState(board);
  const monday = state.days[0];
  const tuesday = state.days[1];
  const saturday = state.days[5];

  assert.equal(monday.activities.length, 2);
  assert.equal(saturday.activities.length, 1);
  assert.equal(tuesday.activities.length, 0);
  assert.equal(tuesday.rest, false);
  assert.equal(summarizeWeeklyPlannerDay(tuesday).label, "Not set");

  const morning = monday.activities[0];
  assert.equal(morning.source, "SAVED_TRAINING");
  assert.equal(morning.activityType, "TRAINING");
  if (morning.source !== "SAVED_TRAINING") {
    assert.fail("Expected saved training activity");
  }
  assert.equal(morning.squadScope, "ALL_SQUAD");
  assert.equal(morning.session.sessionDate, "2026-09-14");
  assert.equal(morning.session.startTime, "08:00");
  assert.equal(morning.session.durationMinutes, 60);
  assert.equal(morning.session.plannedLoad, "LOW");
  assert.equal(morning.session.objective, "Restore movement quality");
  assert.equal(morning.session.location, "Training Ground A");
  assert.deepEqual(morning.session.blocks, board.sessions[0].blocks);
});
