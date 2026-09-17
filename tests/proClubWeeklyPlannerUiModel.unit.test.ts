import assert from "node:assert/strict";
import test from "node:test";

import {
  addWeeklyPlannerActivity,
  buildWeeklyPlannerState,
  clearWeeklyPlannerDayRest,
  markWeeklyPlannerDayRest,
  sortWeeklyPlannerActivities,
  summarizeWeeklyPlannerDay,
  type WeeklyPlannerDay,
  type WeeklyPlannerLocalActivity,
  type WeeklyPlannerMatchActivity,
  type WeeklyPlannerRecoveryActivity,
  type WeeklyPlannerLocalTrainingActivity,
} from "../src/components/pro-club/operations/weeklyPlannerUiModel";
import type { ProClubWeeklyPeriodizationBoard } from "../src/lib/proClubWeeklyPeriodizationBoard";

const board: ProClubWeeklyPeriodizationBoard = {
  weekStartDate: "2026-09-14",
  squadLabel: "First Team",
  mainObjective: "Control weekly load around match demands",
  secondaryObjective: "Protect high-speed exposure",
  sessions: [
    {
      dayOfWeek: "MONDAY",
      sessionDate: "2026-09-14",
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
          coachingPoints: ["Control range"],
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
      objective: "Reintroduce football-specific load",
      phaseOfPlay: "IN_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 75,
      blocks: [
        {
          blockType: "TACTICAL",
          title: "Positional play",
          durationMinutes: 75,
          coachingPoints: ["Create the third-player option"],
        },
      ],
    },
    {
      dayOfWeek: "SATURDAY",
      sessionDate: "2026-09-19",
      startTime: "10:00",
      location: "Stadium",
      objective: "Final match preparation",
      phaseOfPlay: "SET_PIECES",
      plannedLoad: "LOW",
      durationMinutes: 45,
      blocks: [
        {
          blockType: "TACTICAL",
          title: "Set-piece rehearsal",
          durationMinutes: 45,
          coachingPoints: ["Own first contact"],
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

const localTraining: WeeklyPlannerLocalTrainingActivity = {
  id: "local-training-1",
  source: "LOCAL_UI",
  activityType: "TRAINING",
  startTime: "17:00",
  durationMinutes: 75,
  title: "Top-up training",
  focus: "Maintain fitness for non-starters",
  location: "Training Ground A",
  plannedLoad: "MODERATE",
  squadScope: "NON_STARTERS",
};

const recovery: WeeklyPlannerRecoveryActivity = {
  id: "local-recovery-1",
  source: "LOCAL_UI",
  activityType: "RECOVERY",
  startTime: "10:00",
  durationMinutes: 45,
  focus: "Recovery & mobility",
  location: "Recovery Room",
  squadScope: "ALL_SQUAD",
};

const matchOne: WeeklyPlannerMatchActivity = {
  id: "local-match-1",
  source: "LOCAL_UI",
  activityType: "MATCH",
  kickoffTime: "09:00",
  competition: "School Championship",
  competitionCategory: "TOURNAMENT",
  opponent: "School A",
  venue: "Main Stadium",
  squadLabel: "U15",
  squadScope: "SELECTED_PLAYERS",
};

const matchTwo: WeeklyPlannerMatchActivity = {
  ...matchOne,
  id: "local-match-2",
  kickoffTime: "15:00",
  opponent: "School B",
};

test("projects the board into exactly seven Monday-to-Sunday days and preserves saved sessions", () => {
  const state = buildWeeklyPlannerState(board);

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

  const monday = state.days[0];
  const tuesday = state.days[1];
  assert.equal(monday.activities.length, 2);
  assert.equal(tuesday.activities.length, 0);
  assert.equal(tuesday.rest, false);
  assert.equal(summarizeWeeklyPlannerDay(tuesday).label, "Not set");

  const first = monday.activities[0];
  assert.equal(first.source, "SAVED_TRAINING");
  assert.equal(first.activityType, "TRAINING");
  if (first.source !== "SAVED_TRAINING") throw new Error("expected saved training");
  assert.equal(first.session.sessionDate, "2026-09-14");
  assert.equal(first.session.startTime, "08:00");
  assert.equal(first.session.durationMinutes, 60);
  assert.equal(first.session.plannedLoad, "LOW");
  assert.equal(first.session.objective, "Restore movement quality");
  assert.equal(first.session.location, "Training Ground A");
  assert.equal(first.session.blocks.length, 2);
  assert.equal(first.session.blocks[1].drillReference, "drill-passing-rhythm");
});

test("derives Training, Recovery, Match and Mixed Day summaries", () => {
  const trainingDay: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [localTraining],
  };
  const recoveryDay: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [recovery],
  };
  const oneMatchDay: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [matchOne],
  };
  const twoMatchDay: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [matchOne, matchTwo],
  };
  const mixedDay: WeeklyPlannerDay = {
    ...emptyDay(),
    activities: [matchOne, recovery, localTraining],
  };

  assert.equal(summarizeWeeklyPlannerDay(trainingDay).label, "Training Day");
  assert.equal(summarizeWeeklyPlannerDay(recoveryDay).label, "Recovery Day");
  assert.equal(summarizeWeeklyPlannerDay(oneMatchDay).label, "Match Day");
  assert.equal(summarizeWeeklyPlannerDay(twoMatchDay).detail, "2 matches");
  assert.equal(summarizeWeeklyPlannerDay(mixedDay).label, "Mixed Day");
});

test("sorts activities by football clock time while preserving tie order", () => {
  const tiedRecovery: WeeklyPlannerRecoveryActivity = {
    ...recovery,
    id: "local-recovery-2",
    startTime: "10:00",
  };
  const activities: WeeklyPlannerLocalActivity[] = [
    localTraining,
    tiedRecovery,
    recovery,
    matchOne,
  ];

  assert.deepEqual(
    sortWeeklyPlannerActivities(activities).map((activity) => activity.id),
    ["local-match-1", "local-recovery-2", "local-recovery-1", "local-training-1"],
  );
});

test("enforces Rest exclusivity and returns to Not set after Rest is cleared", () => {
  const initial = buildWeeklyPlannerState(board);
  const date = "2026-09-16";
  const withRecovery = addWeeklyPlannerActivity(initial, date, recovery);
  const resting = markWeeklyPlannerDayRest(withRecovery, date);
  const restDay = resting.days.find((day) => day.date === date);

  assert.ok(restDay);
  assert.equal(restDay.rest, true);
  assert.equal(restDay.activities.length, 0);
  assert.equal(summarizeWeeklyPlannerDay(restDay).label, "Rest Day");

  const cleared = clearWeeklyPlannerDayRest(resting, date);
  const clearedDay = cleared.days.find((day) => day.date === date);
  assert.ok(clearedDay);
  assert.equal(clearedDay.rest, false);
  assert.equal(clearedDay.activities.length, 0);
  assert.equal(summarizeWeeklyPlannerDay(clearedDay).label, "Not set");
});

test("adding an activity to a Rest day clears Rest and supports multiple matches", () => {
  const date = "2026-09-20";
  const resting = markWeeklyPlannerDayRest(buildWeeklyPlannerState(board), date);
  const withMatch = addWeeklyPlannerActivity(resting, date, matchOne);
  const withTwoMatches = addWeeklyPlannerActivity(withMatch, date, matchTwo);
  const day = withTwoMatches.days.find((item) => item.date === date);

  assert.ok(day);
  assert.equal(day.rest, false);
  assert.equal(day.activities.length, 2);
  assert.equal(summarizeWeeklyPlannerDay(day).label, "Match Day");
  assert.equal(summarizeWeeklyPlannerDay(day).detail, "2 matches");
});
