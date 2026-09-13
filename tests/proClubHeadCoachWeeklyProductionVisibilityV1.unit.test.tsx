import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProClubHeadCoachWeeklyProductionWorkspace, {
  canRenderHeadCoachWeeklyProductionWorkspace,
} from "../src/components/pro-club/operations/ProClubHeadCoachWeeklyProductionWorkspace";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

const files = {
  portal: "src/components/pro-club/ProClubPortal.tsx",
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

test("renders only the existing Weekly surface for an eligible Head Coach", () => {
  const markup = renderToStaticMarkup(
    <ProClubHeadCoachWeeklyProductionWorkspace authority={authority()} />,
  );
  const text = visibleText(markup);

  assert.match(text, /Head Coach/);
  assert.match(text, /Weekly Training/);
  assert.match(text, /Fresh DRAFT/);
  assert.match(text, /Weekly Training history/);

  for (const forbidden of [
    /Today.s Session/i,
    /Department Updates/i,
    /Match Preparation/i,
  ]) {
    assert.doesNotMatch(text, forbidden);
  }
});

test("renders nothing when the production authority boundary fails", () => {
  for (const deniedAuthority of [
    authority({ organizationStatus: "INACTIVE" }),
    authority({ membershipStatus: "REVOKED" }),
    authority({ hasMembershipAuthority: false }),
    authority({ staffRole: "TECHNICAL_DIRECTOR" }),
  ]) {
    assert.equal(
      renderToStaticMarkup(
        <ProClubHeadCoachWeeklyProductionWorkspace
          authority={deniedAuthority}
        />,
      ),
      "",
    );
  }
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
    /<WeeklyPeriodizationBoard board=\{board\} \/>/,
  );
  assert.doesNotMatch(
    source,
    /(?:export\s+)?const\s+(?:PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE|WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE)\s*=/,
  );
});

test("keeps the full Operations dashboard preview-only", () => {
  const portal = readFileSync(files.portal, "utf8");

  assert.match(
    portal,
    /PRO_CLUB_OPERATIONS_PREVIEW_AVAILABLE \? \(\s*<ProClubOperationsDashboard authority=\{authority\} \/>\s*\) : \(\s*<ProClubHeadCoachWeeklyProductionWorkspace authority=\{authority\} \/>\s*\)/s,
  );
  assert.equal(
    (portal.match(/<ProClubOperationsDashboard\b/g) ?? []).length,
    1,
  );
  assert.equal(
    (portal.match(/<ProClubHeadCoachWeeklyProductionWorkspace\b/g) ?? [])
      .length,
    1,
  );
});

test("production presentation adds no IO environment switch or forbidden module", () => {
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
    /\bFitness\b/i,
    /\bAnalysis\b/i,
    /\bAvailability\b/i,
    /\bReports\b/i,
    /\bStaff\b/i,
    /Club administration/i,
    /Competition Calendar/i,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});
