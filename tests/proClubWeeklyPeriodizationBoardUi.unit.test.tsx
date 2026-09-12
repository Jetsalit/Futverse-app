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

test("renders the read-only Board header and canonical objectives", () => {
  const text = visibleText(renderBoard());

  assert.match(text, /Weekly Periodization Board/);
  assert.match(text, /READ ONLY/);
  assert.match(text, /First Team/);
  assert.match(text, /2026-09-07/);
  assert.match(text, /Build through pressure/);
  assert.match(text, /Protect the central lane after loss/);
});

test("renders only supplied calendar sessions with canonical loads and fields", () => {
  const text = visibleText(renderBoard());

  for (const expected of [
    "MONDAY",
    "SATURDAY",
    "SUNDAY",
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
    "IN_POSSESSION",
    "TRANSITION_TO_DEFEND",
    "Restore movement quality",
    "Progress through two pressing lines",
    "Counter-press immediately after loss",
  ]) {
    assert.match(text, new RegExp(expected));
  }

  assert.doesNotMatch(text, /TUESDAY|WEDNESDAY|THURSDAY|FRIDAY/);
});

test("renders blocks in input order and optional drill references only when present", () => {
  const markup = renderBoard();
  const text = visibleText(markup);
  const orderedTitles = [
    "Movement preparation",
    "Passing rhythm",
    "Build-up against a front three",
    "Transition game",
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

test("does not expose private metadata Match-Day concepts or mutation controls", () => {
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
  const markup = renderBoard(valueWithPrivateMetadata);
  const text = visibleText(markup);

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
  assert.doesNotMatch(markup, /<(?:button|input|select|textarea)\b/i);
  assert.doesNotMatch(
    text,
    /\b(?:edit|save|delete|archive|submit|approve|publish)\b/i,
  );
});

test("Board source is presentation-only and Saved-DRAFT wiring preserves the read path", () => {
  const boardSource = readFileSync(
    "src/components/pro-club/operations/WeeklyPeriodizationBoard.tsx",
    "utf8",
  );
  const savedDraftSource = readFileSync(
    "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
    "utf8",
  );
  const boardImports = Array.from(
    boardSource.matchAll(/from\s+["']([^"']+)["']/g),
    (match) => match[1],
  );
  const savedDraftFirestoreImports = Array.from(
    savedDraftSource.matchAll(/from\s+["']([^"']+)["']/g),
    (match) => match[1],
  )
    .filter((specifier) => specifier.includes("/firestore/"))
    .sort();

  assert.deepEqual(boardImports, [
    "../../../lib/proClubWeeklyPeriodizationBoard",
  ]);
  assert.doesNotMatch(
    boardSource,
    /firebase|SavedDraftReadAdapter|runtimeCapabilities|WeeklyTrainingSavedDraftDetail|clubId|actorUid|userId/i,
  );

  assert.match(
    savedDraftSource,
    /listHeadCoachWeeklyTrainingSavedDrafts\s*\(/,
  );
  assert.match(
    savedDraftSource,
    /getHeadCoachWeeklyTrainingSavedDraftDetail\s*\(/,
  );
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
