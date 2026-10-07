import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ProClubTeamDashboard, {
  resolveProClubActiveTab,
} from "../src/components/pro-club/operations/ProClubTeamDashboard";
import { canUseWeeklyTrainingDraftSave } from "../src/components/pro-club/operations/WeeklyTrainingDraftComposer";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import * as drillDataModel from "../src/lib/drillDataModel";

function authority(
  overrides: Partial<ProClubOrganizationAuthority> = {},
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "Lampang United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "gk-coach-1",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole: "GK_COACH",
    ...overrides,
  };
}

const gkWorkspaceUrl = new URL(
  "../src/components/pro-club/operations/ProClubGKTrainingWorkspace.tsx",
  import.meta.url,
);
const gkWorkspaceSource = existsSync(gkWorkspaceUrl)
  ? readFileSync(gkWorkspaceUrl, "utf8")
  : "";
const dashboardSource = readFileSync(
  new URL("../src/components/pro-club/operations/ProClubTeamDashboard.tsx", import.meta.url),
  "utf8",
);
const tacticBoardSource = readFileSync(
  new URL("../src/components/TacticBoard.tsx", import.meta.url),
  "utf8",
);
const trainingPickerSource = readFileSync(
  new URL("../src/components/pro-club/operations/ProClubTrainingDrillReferencePicker.tsx", import.meta.url),
  "utf8",
);
const weeklyTrainingComposerSource = readFileSync(
  new URL("../src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

async function loadGkTrainingAccess() {
  try {
    return await import(new URL("../src/lib/proClubGKTrainingAccess.ts", import.meta.url).href);
  } catch {
    return null;
  }
}

test("GK Training requires active canonical Pro Club membership and the GK_COACH staff role", async () => {
  const access = await loadGkTrainingAccess();
  assert.ok(access, "the canonical GK Training access policy must exist");
  assert.equal(access.canOpenProClubGKTraining(authority()), true);

  for (const staffRole of [
    "TECHNICAL_DIRECTOR",
    "MANAGER",
    "HEAD_COACH",
    "ASSISTANT_COACH",
    "FITNESS_COACH",
    "ANALYST",
    "PHYSIO",
    "TEAM_MANAGER",
    "STAFF",
    null,
  ] as const) {
    assert.equal(
      access.canOpenProClubGKTraining(authority({ staffRole })),
      false,
      String(staffRole),
    );
  }

  assert.equal(
    access.canOpenProClubGKTraining(authority({ organizationStatus: "INACTIVE" })),
    false,
  );
  assert.equal(
    access.canOpenProClubGKTraining(authority({ membershipStatus: "INACTIVE" })),
    false,
  );
  assert.equal(
    access.canOpenProClubGKTraining(authority({ hasMembershipAuthority: false })),
    false,
  );
  assert.equal(
    access.canOpenProClubGKTraining(
      authority({ membershipAuthorizationRole: "OWNER", staffRole: null }),
    ),
    false,
    "membership ownership alone is not football staff authority",
  );
  assert.equal(
    access.canOpenProClubGKTraining(
      { ...authority(), organizationType: "ACADEMY" } as unknown as ProClubOrganizationAuthority,
    ),
    false,
  );
});

test("GK Training workspace lists owned drills and reuses the shared board and drill hook", () => {
  assert.match(gkWorkspaceSource, /import TacticBoard from "\.\.\/\.\.\/TacticBoard"/);
  assert.match(gkWorkspaceSource, /useDrillDatabase\(\)/);
  assert.match(gkWorkspaceSource, /myDrills/);
  assert.match(gkWorkspaceSource, /<TacticBoard/);
  assert.match(gkWorkspaceSource, /defaultCategory="GK Training"/);
  assert.match(gkWorkspaceSource, /presentation="pro-club"/);
  assert.match(gkWorkspaceSource, /proClubAuthoringAuthority=\{authority\}/);
  assert.match(gkWorkspaceSource, /My GK Drills/);
  assert.match(gkWorkspaceSource, /Create GK Drill/);
  assert.match(gkWorkspaceSource, /Open saved drill/);
  assert.doesNotMatch(gkWorkspaceSource, /firebase\/firestore|\b(?:addDoc|setDoc|updateDoc|writeBatch)\b/);
});

test("GK dashboard entry is role-gated, refresh-safe, and links to existing work surfaces", () => {
  assert.match(dashboardSource, /"GK_TRAINING"/);
  assert.match(dashboardSource, /canOpenProClubGKTraining\(authority\)/);
  assert.match(dashboardSource, /tab === "GK_TRAINING"/);
  assert.match(dashboardSource, /activeTab === "GK_TRAINING" && gkTrainingAvailable/);
  assert.match(dashboardSource, /onOpenSubmissions=\{\(\) => selectActiveTab\("SUBMISSIONS"\)\}/);
  assert.match(dashboardSource, /onOpenLibraryLogbook=\{\(\) => selectActiveTab\("LIBRARY_LOGBOOK"\)\}/);
  assert.match(gkWorkspaceSource, /Send Work/);
  assert.match(gkWorkspaceSource, /Open Library &amp; Logbook/);
});

test("dashboard renders GK Training only for an active GK Coach authority", () => {
  const render = (staffRole: ProClubOrganizationAuthority["staffRole"]) =>
    renderToStaticMarkup(
      createElement(ProClubTeamDashboard, {
        authority: authority({ staffRole }),
        onBack: () => undefined,
        onLogout: () => undefined,
      }),
    );

  assert.match(render("GK_COACH"), /GK Training/);
  assert.doesNotMatch(render("HEAD_COACH"), /GK Training/);
  assert.doesNotMatch(render("TECHNICAL_DIRECTOR"), /GK Training/);
});

test("GK Training survives active-tab refresh restoration without changing the fallback", () => {
  assert.equal(resolveProClubActiveTab("GK_TRAINING"), "GK_TRAINING");
  assert.equal(resolveProClubActiveTab("UNKNOWN_TAB"), "OVERVIEW");
});

test("new GK drills default to GK Training while an existing drill keeps its saved category", () => {
  const resolveCategory = (drillDataModel as unknown as Record<string, unknown>)
    .resolveDrillEditorCategory;
  assert.equal(typeof resolveCategory, "function");
  assert.equal(
    (resolveCategory as (defaultCategory: string, existingCategory?: string | null) => string)(
      "GK Training",
    ),
    "GK Training",
  );
  assert.equal(
    (resolveCategory as (defaultCategory: string, existingCategory?: string | null) => string)(
      "GK Training",
      "Tactical",
    ),
    "Tactical",
  );
  assert.match(tacticBoardSource, /defaultCategory\?: string/);
  assert.match(tacticBoardSource, /resolveDrillEditorCategory\(defaultCategory, editingDrill\.category\)/);
});

test("Weekly Training fresh DRAFT saving remains HEAD_COACH-only", () => {
  assert.equal(canUseWeeklyTrainingDraftSave(authority({ staffRole: "HEAD_COACH" })), true);
  assert.equal(canUseWeeklyTrainingDraftSave(authority({ staffRole: "GK_COACH" })), false);
  assert.match(
    readFileSync(
      new URL("../src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx", import.meta.url),
      "utf8",
    ),
    /authority\.staffRole === "HEAD_COACH"/,
  );
});

test("GK workspace does not create a second drill or staff-submission persistence path", () => {
  assert.match(gkWorkspaceSource, /useDrillDatabase\(\)/);
  assert.doesNotMatch(gkWorkspaceSource, /createProClubStaffSubmissionDraft|submitProClubStaffSubmission/);
  assert.doesNotMatch(gkWorkspaceSource, /from ["'][^"']*proClubStaffSubmissionsRepository/);
  assert.match(readFileSync(new URL("../src/hooks/useDrillDatabase.ts", import.meta.url), "utf8"), /collection\(db, 'drills'\)/);
});

test("GK workspace and shared board follow Light and Neon tokens only inside Pro Club", () => {
  assert.match(gkWorkspaceSource, /pro-club-heading/);
  assert.match(gkWorkspaceSource, /pro-club-muted/);
  assert.match(gkWorkspaceSource, /pro-club-accent/);
  assert.match(cssSource, /\[data-pro-club-theme="light"\]\s+\.pro-club-gk-training-workspace/);
  assert.match(cssSource, /\[data-pro-club-theme="neon"\]\s+\.pro-club-gk-training-workspace/);
  assert.match(cssSource, /\[data-pro-club-theme="light"\]\s+\.pro-club-tactic-board/);
  assert.match(cssSource, /\[data-pro-club-theme="neon"\]\s+\.pro-club-tactic-board/);
  assert.match(tacticBoardSource, /presentation === "pro-club" \? "pro-club-tactic-board"/);
  assert.match(tacticBoardSource, /aria-pressed=\{drillMode === "digital"\}/);
  assert.match(cssSource, /\.pro-club-tactic-board \[class~="text-blue-600"\]/);
  assert.match(cssSource, /\.pro-club-tactic-board \[aria-pressed="true"\]/);
  assert.match(cssSource, /\[aria-pressed="true"\]\s*\{\s*color: #fff !important;/);
  assert.match(cssSource, /\[aria-pressed="true"\]\s*\{\s*color: #020617 !important;/);
  assert.match(
    cssSource,
    /\.pro-club-gk-search::placeholder[\s\S]*?color: var\(--pc-muted\) !important;/,
  );
  assert.doesNotMatch(appSource, /<TacticBoard[\s\S]{0,120}presentation="pro-club"/);
  assert.match(trainingPickerSource, /presentation="pro-club"/);
  assert.match(trainingPickerSource, /proClubAuthoringAuthority=\{authority\}/);
  assert.match(
    weeklyTrainingComposerSource,
    /<ProClubTrainingDrillReferencePicker\s+authority=\{authority\}/,
  );
});

test("application theme, pitch theme, and team colors remain separate persisted values", () => {
  assert.match(dashboardSource, /PRO_CLUB_THEME_STORAGE_KEY/);
  assert.match(dashboardSource, /localStorage\.setItem\(PRO_CLUB_THEME_STORAGE_KEY/);
  assert.doesNotMatch(tacticBoardSource, /PRO_CLUB_THEME_STORAGE_KEY|futverse:pro-club-theme/);
  assert.match(tacticBoardSource, /finalCanvasData = \{ elements, lines, fieldType, teamColors, pitchTheme \}/);
  assert.match(
    readFileSync(new URL("../src/lib/drillDataModel.ts", import.meta.url), "utf8"),
    /pitchTheme\?: PitchThemeId/,
  );
});
