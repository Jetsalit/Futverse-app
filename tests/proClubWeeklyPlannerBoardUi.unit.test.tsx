import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import WeeklyPlannerActivityCard from "../src/components/pro-club/operations/WeeklyPlannerActivityCard";
import WeeklyPlannerBoard from "../src/components/pro-club/operations/WeeklyPlannerBoard";
import WeeklyPlannerDayCard from "../src/components/pro-club/operations/WeeklyPlannerDayCard";
import {
  buildWeeklyPlannerState,
  type WeeklyPlannerDay,
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
  ],
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

const match: WeeklyPlannerMatchActivity = {
  id: "local-match-1",
  source: "LOCAL_UI",
  activityType: "MATCH",
  kickoffTime: "18:00",
  competition: "Muang Thai Insurance Cup",
  competitionCategory: "CUP",
  opponent: "Lampang Academy",
  venue: "Main Stadium",
  squadLabel: "First Team",
  squadScope: "SELECTED_PLAYERS",
};

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function renderDay(day: WeeklyPlannerDay): string {
  return renderToStaticMarkup(
    <WeeklyPlannerDayCard
      day={day}
      onAddActivity={() => undefined}
      onMarkRest={() => undefined}
      onClearRest={() => undefined}
      onRemoveLocalActivity={() => undefined}
    />,
  );
}

test("renders saved Training details with blocks, load, focus and drill reference", () => {
  const monday = buildWeeklyPlannerState(board).days[0];
  const markup = renderDay(monday);
  const text = visibleText(markup);

  for (const expected of [
    "MON",
    "Training Day",
    "08:00",
    "60 min",
    "LOW",
    "Restore movement quality",
    "Training Ground A",
    "Movement preparation",
    "Passing rhythm",
    "Drill reference: drill-passing-rhythm",
    "All squad",
  ]) {
    assert.match(text, new RegExp(expected));
  }

  assert.match(markup, /<time[^>]+datetime="2026-09-14"/i);
  assert.match(markup, /14 ก\.ย\. 2569/);
  assert.match(text, /08:00 น\./);
  assert.match(markup, /data-weekly-planner-day="2026-09-14"/);
});

test("renders Not set, Recovery, Match, Mixed and Rest day summaries", () => {
  const base: WeeklyPlannerDay = {
    date: "2026-09-15",
    dayOfWeek: "TUESDAY",
    rest: false,
    activities: [],
  };

  const scenarios: Array<[WeeklyPlannerDay, RegExp]> = [
    [base, /Not set/],
    [{ ...base, activities: [recovery] }, /Recovery Day/],
    [{ ...base, activities: [match] }, /Match Day/],
    [{ ...base, activities: [match, recovery] }, /Mixed Day/],
    [{ ...base, rest: true, activities: [] }, /Rest Day/],
  ];

  for (const [day, expected] of scenarios) {
    assert.match(visibleText(renderDay(day)), expected);
  }
});

test("renders Recovery and Match metadata including squad scope", () => {
  const recoveryText = visibleText(
    renderToStaticMarkup(<WeeklyPlannerActivityCard activity={recovery} />),
  );
  assert.match(recoveryText, /Recovery/);
  assert.match(recoveryText, /10:00 น\./);
  assert.match(recoveryText, /45 min/);
  assert.match(recoveryText, /Recovery &amp; mobility/);
  assert.match(recoveryText, /Recovery Room/);
  assert.match(recoveryText, /All squad/);

  const matchText = visibleText(
    renderToStaticMarkup(<WeeklyPlannerActivityCard activity={match} />),
  );
  assert.match(matchText, /Cup Match/);
  assert.match(matchText, /18:00 น\./);
  assert.match(matchText, /Muang Thai Insurance Cup/);
  assert.match(matchText, /Lampang Academy/);
  assert.match(matchText, /Main Stadium/);
  assert.match(matchText, /First Team/);
  assert.match(matchText, /Selected players/);
});

test("saved Training is read-only while local activities can expose remove controls", () => {
  const mondayText = visibleText(renderDay(buildWeeklyPlannerState(board).days[0]));
  assert.doesNotMatch(mondayText, /Remove activity/i);

  const localDay: WeeklyPlannerDay = {
    date: "2026-09-15",
    dayOfWeek: "TUESDAY",
    rest: false,
    activities: [recovery],
  };
  assert.match(visibleText(renderDay(localDay)), /Remove activity/i);
});

test("renders a full seven-day planner with UI-preview and local-only save messaging", () => {
  const markup = renderToStaticMarkup(<WeeklyPlannerBoard board={board} />);
  const text = visibleText(markup);

  assert.equal((markup.match(/data-weekly-planner-day=/g) ?? []).length, 7);
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  weekdays.reduce((previousIndex, label) => {
    const currentIndex = text.indexOf(label);
    assert.ok(currentIndex > previousIndex, `${label} is out of weekly order`);
    return currentIndex;
  }, -1);

  for (const expected of [
    "Weekly Training Plan",
    "UI PREVIEW",
    "7-day microcycle",
    "Save Plan",
    "Persistence not enabled",
    "Training Day",
    "Not set",
  ]) {
    assert.match(text, new RegExp(expected));
  }
});

test("supports multiple saved Training sessions on one date in the full board", () => {
  const twoSessionBoard: ProClubWeeklyPeriodizationBoard = {
    ...board,
    sessions: [
      ...board.sessions,
      {
        ...board.sessions[0],
        startTime: "17:00",
        objective: "Evening tactical session",
        durationMinutes: 75,
      },
    ],
  };
  const text = visibleText(renderToStaticMarkup(<WeeklyPlannerBoard board={twoSessionBoard} />));

  assert.match(text, /2 sessions/);
  assert.match(text, /08:00/);
  assert.match(text, /17:00/);
  assert.match(text, /Evening tactical session/);
});

test("planner presentation sources do not cross the persistence boundary", () => {
  const sources = [
    "src/components/pro-club/operations/WeeklyPlannerActivityCard.tsx",
    "src/components/pro-club/operations/WeeklyPlannerDayCard.tsx",
    "src/components/pro-club/operations/WeeklyPlannerBoard.tsx",
  ].map((path) => readFileSync(path, "utf8"));

  const forbidden = [
    /firebase/i,
    /\/firestore\//i,
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
    /\bhttpsCallable\b/,
    /saveProClubWeeklyTrainingFreshDraftForCurrentRuntime/,
    /VITE_/,
    /process\.env/,
  ];

  for (const source of sources) {
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern);
  }
});
