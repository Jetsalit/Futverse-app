import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  WeeklyPlannerDay,
  WeeklyPlannerRecoveryActivity,
  WeeklyPlannerMatchActivity,
  WeeklyPlannerLocalTrainingActivity,
} from "../src/components/pro-club/operations/weeklyPlannerUiModel";

async function loadDayCard() {
  try {
    const module = await import(
      "../src/components/pro-club/operations/WeeklyPlannerDayCard"
    );
    return module.default;
  } catch (cause) {
    assert.fail(
      `WeeklyPlannerDayCard must exist and be importable before this contract can pass: ${String(cause)}`,
    );
  }
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const savedTrainingDay: WeeklyPlannerDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  rest: false,
  activities: [
    {
      id: "saved-training:2026-09-14:08:00:0",
      source: "SAVED_TRAINING",
      activityType: "TRAINING",
      squadScope: "ALL_SQUAD",
      session: {
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
  location: "Gym",
  squadScope: "NON_STARTERS",
};

const match: WeeklyPlannerMatchActivity = {
  id: "local-match-1",
  source: "LOCAL_UI",
  activityType: "MATCH",
  kickoffTime: "18:00",
  competition: "School Cup",
  competitionCategory: "CUP",
  opponent: "School A",
  venue: "Main Stadium",
  squadLabel: "U15",
  squadScope: "ALL_SQUAD",
};

const training: WeeklyPlannerLocalTrainingActivity = {
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

function renderDay(
  DayCard: Awaited<ReturnType<typeof loadDayCard>>,
  day: WeeklyPlannerDay,
): string {
  return renderToStaticMarkup(
    <DayCard
      day={day}
      onAddActivity={() => undefined}
      onMarkRest={() => undefined}
      onClearRest={() => undefined}
      onRemoveLocalActivity={() => undefined}
    />,
  );
}

test("renders saved Training detail inside a professional Day Card", async () => {
  const DayCard = await loadDayCard();
  const text = visibleText(renderDay(DayCard, savedTrainingDay));

  for (const expected of [
    "MON",
    "14 SEP 2026",
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
});

test("renders empty, Recovery, Match, Mixed and Rest day summaries", async () => {
  const DayCard = await loadDayCard();
  const base: Omit<WeeklyPlannerDay, "activities" | "rest"> = {
    date: "2026-09-15",
    dayOfWeek: "TUESDAY",
  };

  const cases: Array<[WeeklyPlannerDay, string]> = [
    [{ ...base, rest: false, activities: [] }, "Not set"],
    [{ ...base, rest: false, activities: [recovery] }, "Recovery Day"],
    [{ ...base, rest: false, activities: [match] }, "Match Day"],
    [{ ...base, rest: false, activities: [match, training] }, "Mixed Day"],
    [{ ...base, rest: true, activities: [] }, "Rest Day"],
  ];

  for (const [day, expected] of cases) {
    assert.match(visibleText(renderDay(DayCard, day)), new RegExp(expected));
  }
});

test("saved Training stays read-only while local activities can expose remove controls", async () => {
  const DayCard = await loadDayCard();
  const savedMarkup = renderDay(DayCard, savedTrainingDay);
  assert.doesNotMatch(savedMarkup, /Remove activity/i);

  const localDay: WeeklyPlannerDay = {
    date: "2026-09-15",
    dayOfWeek: "TUESDAY",
    rest: false,
    activities: [recovery, match],
  };
  const localMarkup = renderDay(DayCard, localDay);
  assert.equal((localMarkup.match(/Remove activity/g) ?? []).length, 2);
  assert.match(localMarkup, /Non-starters/);
  assert.match(localMarkup, /Cup Match/);
  assert.match(localMarkup, /School Cup/);
  assert.match(localMarkup, /School A/);
});

test("Day Card and Activity Card remain UI-only with no persistence boundary", () => {
  const sources = [
    readFileSync(
      "src/components/pro-club/operations/WeeklyPlannerActivityCard.tsx",
      "utf8",
    ),
    readFileSync(
      "src/components/pro-club/operations/WeeklyPlannerDayCard.tsx",
      "utf8",
    ),
  ].join("\n");

  for (const forbidden of [
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
  ]) {
    assert.doesNotMatch(sources, forbidden);
  }
});
