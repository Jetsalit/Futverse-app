import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProClubHeadCoachWeeklyProductionWorkspace, {
  canRenderHeadCoachWeeklyProductionWorkspace,
  type ProClubWeeklyFitnessContext,
} from "../src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import type { ProClubFitnessWeeklyTrainingReadV1Selection } from "../src/lib/proClubFitnessWeeklyTrainingRead";

const files = {
  portal: "src/components/pro-club/ProClubPortal.tsx",
  teamDashboard:
    "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  productionWorkspace:
    "src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace.tsx",
  draftComposer:
    "src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx",
  savedDrafts:
    "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
};

function authority(
  overrides: Partial<ProClubOrganizationAuthority> = {},
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-a",
    organizationType: "PRO_CLUB",
    organizationName: "Test United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "head-coach-a",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole: "HEAD_COACH",
    ...overrides,
  };
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function fitnessSelection(
  state: ProClubFitnessWeeklyTrainingReadV1Selection["state"],
  observations: ProClubFitnessWeeklyTrainingReadV1Selection["observations"] = [],
): ProClubFitnessWeeklyTrainingReadV1Selection {
  return {
    state,
    organization: { organizationType: "PRO_CLUB", organizationId: "club-a" },
    observations,
    prescription: null,
  };
}

const availableFitnessContext: ProClubWeeklyFitnessContext = {
  state: "READY",
  referenceDate: "2026-09-25",
  selection: fitnessSelection("AVAILABLE", [{
    resultId: "result-a",
    playerKey: "player-a",
    playerDisplayLabel: "Alex Active",
    rosterStatus: "ACTIVE",
    definitionId: "football:speed_10m:v1",
    definitionVersion: 1,
    testName: "10 m sprint",
    category: "ACCELERATION",
    measurementMethod: "Timed 10 metre sprint",
    value: 1.82,
    unit: "s",
    direction: "LOWER_IS_BETTER",
    observedOn: "2026-09-22",
  }]),
};

test("allows only an active authorized Pro Club Head Coach", () => {
  assert.equal(
    canRenderHeadCoachWeeklyProductionWorkspace(authority()),
    true,
  );

  const denied: readonly ProClubOrganizationAuthority[] = [
    {
      ...authority(),
      organizationType: "ACADEMY",
    } as unknown as ProClubOrganizationAuthority,
    authority({ organizationStatus: "INACTIVE" }),
    authority({ membershipStatus: "INACTIVE" }),
    authority({ hasMembershipAuthority: false }),
    authority({ staffRole: "TECHNICAL_DIRECTOR" }),
    authority({ staffRole: "ASSISTANT_COACH" }),
    authority({ staffRole: "STAFF" }),
    authority({ staffRole: null }),
  ];

  for (const deniedAuthority of denied) {
    assert.equal(
      canRenderHeadCoachWeeklyProductionWorkspace(deniedAuthority),
      false,
    );
  }
});

test("renders the Weekly surface and distinct persisted NO_DATA state for an eligible Head Coach", () => {
  const markup = renderToStaticMarkup(
    <ProClubHeadCoachWeeklyProductionWorkspace
      authority={authority()}
      fitnessContext={{
        state: "READY",
        referenceDate: "2026-09-25",
        selection: fitnessSelection("NO_DATA"),
      }}
    />,
  );
  const text = visibleText(markup);

  assert.match(text, /Head Coach/);
  assert.match(text, /Weekly Training/);
  assert.match(text, /Fresh DRAFT/);
  assert.match(text, /Weekly Training history/);
  assert.match(text, /Fitness observations as of 25 กันยายน 2569/);
  assert.match(text, /No eligible persisted Fitness observations were available as of 25 กันยายน 2569\./);
  assert.match(text, /Fitness observations are context only\. The Head Coach remains responsible for training decisions\./);

  for (const forbidden of [
    /Today.s Session/i,
    /Department Updates/i,
    /Match Preparation/i,
  ]) {
    assert.doesNotMatch(text, forbidden);
  }
});

test("renders concise authority guidance when the production authority boundary fails", () => {
  for (const deniedAuthority of [
    authority({ organizationStatus: "INACTIVE" }),
    authority({ membershipStatus: "REVOKED" }),
    authority({ hasMembershipAuthority: false }),
    authority({ staffRole: "TECHNICAL_DIRECTOR" }),
  ]) {
    const text = visibleText(renderToStaticMarkup(
        <ProClubHeadCoachWeeklyProductionWorkspace
          authority={deniedAuthority}
          fitnessContext={{ state: "LOADING" }}
        />,
    ));
    assert.match(text, /active Pro Club Head Coach authority is required/i);
    assert.doesNotMatch(text, /Fresh DRAFT|Fitness observations as of/);
  }
});

test("renders factual persisted observations grouped by player", () => {
  const text = visibleText(renderToStaticMarkup(
    <ProClubHeadCoachWeeklyProductionWorkspace
      authority={authority()}
      fitnessContext={availableFitnessContext}
    />,
  ));

  assert.match(text, /Fitness observations as of 25 กันยายน 2569/);
  assert.match(text, /Alex Active/);
  assert.match(text, /10 m sprint/);
  assert.match(text, /1\.82 s/);
  assert.match(text, /22 ก\.ย\. 2569/);
  assert.match(text, /Fitness observations are context only\. The Head Coach remains responsible for training decisions\./);
  assert.equal(availableFitnessContext.selection.prescription, null);
});

test("keeps LOADING and READ_ERROR distinct from persisted NO_DATA", () => {
  const loading = visibleText(renderToStaticMarkup(
    <ProClubHeadCoachWeeklyProductionWorkspace
      authority={authority()}
      fitnessContext={{ state: "LOADING" }}
    />,
  ));
  assert.match(loading, /Loading Fitness observations/);
  assert.doesNotMatch(loading, /No eligible persisted Fitness observations/);

  const error = visibleText(renderToStaticMarkup(
    <ProClubHeadCoachWeeklyProductionWorkspace
      authority={authority()}
      fitnessContext={{ state: "READ_ERROR" }}
    />,
  ));
  assert.match(error, /Fitness context could not be loaded\./);
  assert.doesNotMatch(error, /No eligible persisted Fitness observations/);
});

test("reuses the existing Weekly components and source-controlled capabilities", () => {
  const source = readFileSync(files.productionWorkspace, "utf8");
  const draftComposerSource = readFileSync(files.draftComposer, "utf8");
  const savedDraftSource = readFileSync(files.savedDrafts, "utf8");

  assert.match(
    source,
    /import WeeklyTrainingDraftComposer from "\.\/WeeklyTrainingDraftComposer"/,
  );
  assert.match(
    source,
    /import WeeklyTrainingSavedDrafts from "\.\/WeeklyTrainingSavedDrafts"/,
  );
  assert.match(
    source,
    /WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE \? \(/,
  );
  assert.match(
    source,
    /WEEKLY_TRAINING_SAVED_DRAFT_READ_UNAVAILABLE_MESSAGE/,
  );
  assert.match(
    draftComposerSource,
    /PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE/,
  );
  assert.match(
    savedDraftSource,
    /import WeeklyPeriodizationBoard from "\.\/WeeklyPeriodizationBoard"/,
  );
  assert.match(
    savedDraftSource,
    /<WeeklyPeriodizationBoard[\s\S]*board=\{board\}[\s\S]*onTakeAttendance=\{onTakeAttendance\}/,
  );
  assert.doesNotMatch(
    source,
    /(?:export\s+)?const\s+(?:PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE|WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE)\s*=/,
  );
});

test("routes production through the team dashboard while preserving the existing Weekly surface", () => {
  const portal = readFileSync(files.portal, "utf8");
  const teamDashboard = readFileSync(files.teamDashboard, "utf8");

  assert.doesNotMatch(portal, /PRO_CLUB_OPERATIONS_PREVIEW_AVAILABLE/);
  assert.doesNotMatch(portal, /ProClubOperationsDashboard/);
  assert.match(
    portal,
    /import ProClubTeamDashboard from "\.\/operations\/ProClubTeamDashboard"/,
  );
  assert.equal(
    (portal.match(/<ProClubTeamDashboard\b/g) ?? []).length,
    1,
  );
  assert.match(
    teamDashboard,
    /import ProClubSquadRoster from "\.\/ProClubSquadRoster"/,
  );
  assert.match(
    teamDashboard,
    /import ProClubFitnessTrainingWorkspace from "\.\/ProClubFitnessTrainingWorkspace"/,
  );
  assert.equal(
    (teamDashboard.match(/<ProClubSquadRoster\b/g) ?? []).length,
    1,
  );
  assert.equal((teamDashboard.match(/<ProClubFitnessTrainingWorkspace\b/g) ?? []).length, 1);
  assert.doesNotMatch(teamDashboard, /<ProClubFitnessResults\b|<FitnessTestCatalogue\b|<ProClubHeadCoachWeeklyProductionWorkspace\b/);
});

test("production presentation keeps IO closed and exposes the typed fitness boundary", () => {
  const source = readFileSync(files.productionWorkspace, "utf8");

  for (const forbidden of [
    /from\s+["'][^"']*firebase[^"']*["']/i,
    /import\s+(?!type\s)[^;]+from\s+["'][^"']*firestore[^"']*["']/is,
    /httpsCallable/,
    /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/,
    /process\.env/,
    /VITE_/,
    /tnsu-lampang/i,
    /Lampang/i,
    /Talumball/i,
    /Today.s Session/i,
    /Department Updates/i,
    /Match Preparation/i,
    /\bSquad\b/i,
    /\bMatches\b/i,
    /\bAnalysis\b/i,
    /\bAvailability\b/i,
    /\bReports\b/i,
    /\bStaff Management\b/i,
    /Club administration/i,
    /Competition Calendar/i,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }

  assert.match(source, /ProClubFitnessWeeklyTrainingReadV1Selection/);
  assert.match(source, /Fitness observations are context only/);
  assert.match(source, /Fitness context could not be loaded\./);
  assert.match(source, /prescription !== null/);
  assert.doesNotMatch(source, /No recorded fitness results are connected/);
  assert.doesNotMatch(source, /readiness|injury|medical status|recommended load/i);
});
