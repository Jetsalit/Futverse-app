import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import WeeklyPeriodizationBoard from "../src/components/pro-club/operations/WeeklyPeriodizationBoard";
import type { ProClubWeeklyPeriodizationBoard } from "../src/lib/proClubWeeklyPeriodizationBoard";

const board: ProClubWeeklyPeriodizationBoard = {
  weekStartDate: "2026-09-07",
  squadLabel: "First Team",
  mainObjective: "Build through pressure",
  secondaryObjective: "Protect the central lane after loss",
  sessions: [
    {
      dayOfWeek: "MONDAY",
      sessionDate: "2026-09-07",
      startTime: "09:00",
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
          coachingPoints: ["Control the range", "Keep rhythm relaxed"],
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
      dayOfWeek: "SATURDAY",
      sessionDate: "2026-09-12",
      startTime: "16:00",
      location: "Training Ground B",
      durationMinutes: 90,
      phaseOfPlay: "IN_POSSESSION",
      objective: "Progress through two pressing lines",
      plannedLoad: "MODERATE",
      blocks: [
        {
          blockType: "TACTICAL",
          title: "Build-up against a front three",
          durationMinutes: 90,
          coachingPoints: ["Create the third-player option"],
        },
      ],
    },
    {
      dayOfWeek: "SUNDAY",
      sessionDate: "2026-09-13",
      startTime: "15:30",
      location: "Stadium",
      durationMinutes: 75,
      phaseOfPlay: "TRANSITION_TO_DEFEND",
      objective: "Counter-press immediately after loss",
      plannedLoad: "HIGH",
      blocks: [
        {
          blockType: "GAME",
          title: "Transition game",
          durationMinutes: 75,
          coachingPoints: ["Close the nearest forward lane"],
        },
      ],
    },
  ],
};

function renderBoard(value: ProClubWeeklyPeriodizationBoard = board): string {
  return renderToStaticMarkup(<WeeklyPeriodizationBoard board={value} />);
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("renders the approved weekly planner header and canonical objectives", () => {
  const text = visibleText(renderBoard());

  assert.match(text, /Weekly Training Plan/);
  assert.match(text, /7-day microcycle/);
  assert.match(text, /UI PREVIEW/);
  assert.match(text, /First Team/);
  assert.match(text, /Build through pressure/);
  assert.match(text, /Protect the central lane after loss/);
  assert.match(text, /Persistence not enabled/);
});

test("renders exactly seven Monday-to-Sunday day cards while preserving saved session detail", () => {
  const markup = renderBoard();
  const text = visibleText(markup);

  assert.equal((markup.match(/data-weekly-planner-day=/g) ?? []).length, 7);
  for (const expected of [
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT",
    "SUN",
    "LOW",
    "MODERATE",
    "HIGH",
    "09:00",
    "16:00",
    "15:30",
    "Training Ground A",
    "Training Ground B",
    "Stadium",
    "60 min",
    "90 min",
    "75 min",
    "GENERAL",
    "IN POSSESSION",
    "TRANSITION TO DEFEND",
    "Restore movement quality",
    "Progress through two pressing lines",
    "Counter-press immediately after loss",
    "Not set",
  ]) {
    assert.match(text, new RegExp(expected));
  }

  assert.match(markup, /aria-label="Weekly planner days"/);
  assert.equal((markup.match(/role="meter"/g) ?? []).length, 3);
  for (const canonicalDate of [
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
  ]) {
    assert.match(markup, new RegExp(`datetime="${canonicalDate}"`));
  }
});

test("renders saved blocks in input order with optional drill references and coaching points", () => {
  const text = visibleText(renderBoard());
  const orderedTitles = [
    "1. Movement preparation",
    "2. Passing rhythm",
    "1. Build-up against a front three",
    "1. Transition game",
  ];

  orderedTitles.reduce((previousIndex, title) => {
    const currentIndex = text.indexOf(title);
    assert.ok(currentIndex > previousIndex, `${title} is out of input order`);
    return currentIndex;
  }, -1);

  assert.match(text, /WARM_UP/);
  assert.match(text, /TECHNICAL/);
  assert.match(text, /TACTICAL/);
  assert.match(text, /GAME/);
  assert.match(text, /Drill reference: drill-passing-rhythm/);
  assert.equal((text.match(/Drill reference:/g) ?? []).length, 1);
  assert.match(text, /Control the range/);
  assert.match(text, /Keep rhythm relaxed/);
  assert.match(text, /Receive on the back foot/);
  assert.match(text, /Create the third-player option/);
  assert.match(text, /Close the nearest forward lane/);
});

test("does not expose private saved-plan metadata and keeps saved Training immutable in planner preview", () => {
  const valueWithPrivateMetadata = {
    ...board,
    clubId: "PRIVATE_CLUB_ID",
    authorUid: "PRIVATE_AUTHOR_UID",
    headCoachNote: "PRIVATE_HEAD_COACH_NOTE",
    technicalDirectorNote: "PRIVATE_TECHNICAL_DIRECTOR_NOTE",
    matchDate: "PRIVATE_MATCH_DATE",
    matchDay: "PRIVATE_MATCH_DAY",
    mdLabel: "PRIVATE_MD_LABEL",
  };
  const text = visibleText(renderBoard(valueWithPrivateMetadata));

  for (const privateValue of [
    "PRIVATE_CLUB_ID",
    "PRIVATE_AUTHOR_UID",
    "PRIVATE_HEAD_COACH_NOTE",
    "PRIVATE_TECHNICAL_DIRECTOR_NOTE",
    "PRIVATE_MATCH_DATE",
    "PRIVATE_MATCH_DAY",
    "PRIVATE_MD_LABEL",
  ]) {
    assert.doesNotMatch(text, new RegExp(privateValue));
  }

  assert.doesNotMatch(text, /\bMD(?:-4|-3|-2|-1|\+1)?\b/);
  assert.doesNotMatch(text, /Remove activity/);
  assert.match(text, /\+ Add Activity/);
  assert.match(text, /Save Plan/);
});

test("compatibility wrapper remains presentation-only and Saved-DRAFT wiring preserves the read path", () => {
  const wrapperSource = readFileSync(
    "src/components/pro-club/operations/WeeklyPeriodizationBoard.tsx",
    "utf8",
  );
  const plannerSource = readFileSync(
    "src/components/pro-club/operations/WeeklyPlannerBoard.tsx",
    "utf8",
  );
  const savedDraftSource = readFileSync(
    "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
    "utf8",
  );
  const wrapperImports = Array.from(
    wrapperSource.matchAll(/from\s+["']([^"']+)["']/g),
    (match) => match[1],
  ).sort();
  const savedDraftFirestoreImports = Array.from(
    savedDraftSource.matchAll(/from\s+["']([^"']+)["']/g),
    (match) => match[1],
  )
    .filter((specifier) => specifier.includes("/firestore/"))
    .sort();

  assert.deepEqual(wrapperImports, [
    "../../../lib/proClubWeeklyPeriodizationBoard",
    "./WeeklyPlannerBoard",
  ]);
  for (const source of [wrapperSource, plannerSource]) {
    assert.doesNotMatch(
      source,
      /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction|httpsCallable)\s*\(/,
    );
    assert.doesNotMatch(source, /\/firestore\//);
  }

  assert.match(savedDraftSource, /listHeadCoachWeeklyTrainingSavedDrafts\s*\(/);
  assert.match(savedDraftSource, /getHeadCoachWeeklyTrainingSavedDraftDetail\s*\(/);
  assert.match(
    savedDraftSource,
    /deriveProClubWeeklyPeriodizationBoard\s*\(\s*detail\.draft\s*\)/,
  );
  assert.match(
    savedDraftSource,
    /<WeeklyPeriodizationBoard\s+board=\{board\}\s*\/>/,
  );
  assert.deepEqual(savedDraftFirestoreImports, [
    "../../../lib/firestore/proClubOrganizationAdapter",
    "../../../lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter",
  ]);
  assert.doesNotMatch(
    savedDraftSource,
    /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction|httpsCallable)\s*\(/,
  );
});
