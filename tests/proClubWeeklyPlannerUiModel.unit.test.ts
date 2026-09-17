import assert from "node:assert/strict";
import test from "node:test";

import {
  addWeeklyPlannerActivity,
  buildWeeklyPlannerState,
  clearWeeklyPlannerDayRest,
  markWeeklyPlannerDayRest,
  removeWeeklyPlannerLocalActivity,
  sortWeeklyPlannerActivities,
  summarizeWeeklyPlannerDay,
  type WeeklyPlannerDay,
  type WeeklyPlannerLocalTrainingActivity,
  type WeeklyPlannerMatchActivity,
  type WeeklyPlannerRecoveryActivity,
} from "../src/components/pro-club/operations/weeklyPlannerUiModel";
import type { ProClubWeeklyPeriodizationBoard } from "../src/lib/proClubWeeklyPeriodizationBoard";

const board: ProClubWeeklyPeriodizationBoard = {
  weekStartDate: "2026-09-14",
  squadLabel: "First Team",
  mainObjective: "Control weekly load",
  sessions: [
    {
      dayOfWeek: "MONDAY",
      sessionDate: "2026-09-14",
      startTime: "08:00",
      location: "Training Ground A",
      durationMinutes: 60,
      phaseOfPlay: "GENERAL",
      objective: "Restore movement quality",
      plannedLoad: "LOW",
      blocks: [
        {
          blockType: "WARM_UP",
          title: "Movement preparation",
          durationMinutes: 15,
          coachingPoints: ["Control the range"],
        },
        {
          blockType: "TECHNICAL",
          title: "Passing rhythm",
          durationMinutes: 45,
          drillReference: "drill-passing-rhythm",
          coachingPoints: ["Receive on the back foot"],
        },
      ],
    },
    {
      dayOfWeek: "MONDAY",
      sessionDate: "2026-09-14",
      startTime: "17:00",
      location: "Training Ground B",
      durationMinutes: 90,
      phaseOfPlay: "IN_POSSESSION",
      objective: "Break the first press",
      plannedLoad: "HIGH",
      blocks: [
        {
          blockType: "TACTICAL",
          title: "Build-up game",
          durationMinutes: 90,
          coachingPoints: ["Create the spare player"],
        },
      ],
    },
    {
      dayOfWeek: "SATURDAY",
      sessionDate: "2026-09-19",
      startTime: "10:00",
      location: "Stadium",
      durationMinutes: 45,
      phaseOfPlay: "SET_PIECES",
      objective: "Match activation",
      plannedLoad: "MODERATE",
      blocks: [
        {
          blockType: "TACTICAL",
          title: "Set-piece rehearsal",
          durationMinutes: 45,
          coachingPoints: ["Confirm roles"],
        },
      ],
    },
  ],
};

function emptyDay(date = "2026-09-15"): WeeklyPlannerDay {
  return {
    date,
    dayOfWeek: "TUESDAY",
    rest: false,
    activities: [],
  };
}

const recovery: WeeklyPlannerRecoveryActivity = {
  id: "local-recovery-1",
  source: "LOCAL_UI",
  activityType: "RECOVERY",
  startTime: "10:00",
  durationMinutes: 45,
  focus: "Recovery & mobility",
  location: "Gym",
  squadScope: "NON_STARTERS",
};

const match1: WeeklyPlannerMatchActivity = {
  id: "local-match-1",
  source: "LOCAL_UI",
  activityType: "MATCH",
  kickoffTime: "09:00",
  competition: "School Cup",
  competitionCategory: "CUP",
  opponent: "School A",
  venue: "Main Stadium",
  squadLabel: "U15",
  squadScope: "ALL_SQUAD",
};

const match2: WeeklyPlannerMatchActivity = {
  ...match1,
  id: "local-match-2",
  kickoffTime: "15:00",
  opponent: "School B",
};

const localTraining: WeeklyPlannerLocalTrainingActivity = {
  id: "local-training-1",
  source: "LOCAL_UI",
  activityType: "TRAINING",
  startTime: "17:00",
  durationMinutes: 60,
  title: "Top-up training",
  focus: "Maintain fitness",
  location: "Training Ground",
  plannedLoad: "MODERATE",
  squadScope: "NON_STARTERS",
};

test("builds exactly seven Monday-to-Sunday days and projects saved sessions", () => {
  const state = buildWeeklyPlannerState(board);

  assert.equal(state.days.length, 7);
  assert.deepEqual(state.days.map((day) => day.dayOfWeek), [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]);
  assert.deepEqual(state.days.map((day) => day.date), [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ]);
  assert.equal(state.days[0].activities.length, 2);
  assert.equal(state.days[1].activities.length, 0);
  assert.equal(state.days[1].rest, false);
  assert.equal(summarizeWeeklyPlannerDay(state.days[1]).label, "Not set");

  const firstActivity = state.days[0].activities[0];
  assert.equal(firstActivity.source, "SAVED_TRAINING");
  assert.equal(firstActivity.activityType, "TRAINING");
  if (firstActivity.source !== "SAVED_TRAINING") assert.fail("expected saved training");
  assert.equal(firstActivity.session.sessionDate, "2026-09-14");
  assert.equal(firstActivity.session.startTime, "08:00");
  assert.equal(firstActivity.session.durationMinutes, 60);
  assert.equal(firstActivity.session.plannedLoad, "LOW");
  assert.equal(firstActivity.session.objective, "Restore movement quality");
  assert.equal(firstActivity.session.location, "Training Ground A");
  assert.equal(firstActivity.session.blocks[1].drillReference, "drill-passing-rhythm");
});

test("summarizes training, recovery, match, multiple-match and mixed days", () => {
  const trainingOnly: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [localTraining],
  };
  const recoveryOnly: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [recovery],
  };
  const oneMatch: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [match1],
  };
  const twoMatches: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [match1, match2],
  };
  const mixed: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [match1, recovery, localTraining],
  };

  assert.equal(summarizeWeeklyPlannerDay(trainingOnly).label, "Training Day");
  assert.equal(summarizeWeeklyPlannerDay(recoveryOnly).label, "Recovery Day");
  assert.equal(summarizeWeeklyPlannerDay(oneMatch).label, "Match Day");
  assert.equal(summarizeWeeklyPlannerDay(twoMatches).detail, "2 matches");
  assert.equal(summarizeWeeklyPlannerDay(mixed).label, "Mixed Day");
});

test("sorts activities by football-day time with stable tie order", () => {
  const sameTimeRecovery = { ...recovery, id: "local-recovery-2", startTime: "09:00" };
  const sorted = sortWeeklyPlannerActivities([
    localTraining,
    sameTimeRecovery,
    match1,
    recovery,
  ]);

  assert.deepEqual(sorted.map((activity) => activity.id), [
    "local-recovery-2",
    "local-match-1",
    "local-recovery-1",
    "local-training-1",
  ]);
});

test("Rest is exclusive and clearing Rest returns an empty day to Not set", () => {
  let state = buildWeeklyPlannerState({ ...board, sessions: [] });
  state = addWeeklyPlannerActivity(state, "2026-09-15", recovery);
  assert.equal(summarizeWeeklyPlannerDay(state.days[1]).label, "Recovery Day");

  state = markWeeklyPlannerDayRest(state, "2026-09-15");
  assert.equal(state.days[1].rest, true);
  assert.equal(state.days[1].activities.length, 0);
  assert.equal(summarizeWeeklyPlannerDay(state.days[1]).label, "Rest Day");

  state = clearWeeklyPlannerDayRest(state, "2026-09-15");
  assert.equal(state.days[1].rest, false);
  assert.equal(summarizeWeeklyPlannerDay(state.days[1]).label, "Not set");
});

test("adding an activity to Rest clears Rest and local removal never removes saved Training", () => {
  let state = buildWeeklyPlannerState(board);
  state = markWeeklyPlannerDayRest(state, "2026-09-16");
  state = addWeeklyPlannerActivity(state, "2026-09-16", localTraining);
  assert.equal(state.days[2].rest, false);
  assert.equal(summarizeWeeklyPlannerDay(state.days[2]).label, "Training Day");

  state = removeWeeklyPlannerLocalActivity(state, "2026-09-16", localTraining.id);
  assert.equal(state.days[2].activities.length, 0);

  const mondaySavedId = state.days[0].activities[0].id;
  const afterSavedRemovalAttempt = removeWeeklyPlannerLocalActivity(
    state,
    "2026-09-14",
    mondaySavedId,
  );
  assert.equal(afterSavedRemovalAttempt.days[0].activities.length, 2);
});
