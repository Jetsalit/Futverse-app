import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProClubTeamDashboard, {
  PRO_CLUB_TEAM_DASHBOARD_TABS,
} from "../src/components/pro-club/operations/ProClubTeamDashboard";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

const files = {
  dashboard: "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  portal: "src/components/pro-club/ProClubPortal.tsx",
};

function authority(
  overrides: Partial<ProClubOrganizationAuthority> = {},
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "Lampang United",
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

test("freezes the minimal production team navigation", () => {
  assert.deepEqual(PRO_CLUB_TEAM_DASHBOARD_TABS, [
    "OVERVIEW",
    "SQUAD",
    "TRAINING",
    "ATTENDANCE",
    "MATCHES",
  ]);
});

test("renders authoritative club identity and production menu", () => {
  const markup = renderToStaticMarkup(
    <ProClubTeamDashboard authority={authority()} />,
  );
  const text = visibleText(markup);

  assert.match(text, /Lampang United/);
  assert.match(text, /Overview/);
  assert.match(text, /Squad/);
  assert.match(text, /Training/);
  assert.match(text, /Attendance/);
  assert.match(text, /Matches/);
  assert.match(text, /Coming soon/i);

  for (const forbidden of [
    /DEV PREVIEW/i,
    /Fitness/i,
    /Analysis/i,
    /Availability/i,
    /Reports/i,
    /Staff/i,
    /Club administration/i,
  ]) {
    assert.doesNotMatch(text, forbidden);
  }
});

test("production dashboard reuses reviewed Squad Training and Attendance surfaces", () => {
  const source = readFileSync(files.dashboard, "utf8");

  assert.match(source, /import ProClubSquadRoster from "\.\/ProClubSquadRoster"/);
  assert.match(
    source,
    /import ProClubHeadCoachWeeklyProductionWorkspace from "\.\/ProClubHeadCoachWeeklyProductionWorkspace"/,
  );
  assert.match(source, /import ProClubAttendance from "\.\/ProClubAttendance"/);
  assert.equal((source.match(/<ProClubSquadRoster\b/g) ?? []).length, 1);
  assert.equal(
    (source.match(/<ProClubHeadCoachWeeklyProductionWorkspace\b/g) ?? []).length,
    1,
  );
  assert.equal((source.match(/<ProClubAttendance\b/g) ?? []).length, 1);
});

test("portal mounts the production team dashboard without opening the full preview dashboard", () => {
  const portal = readFileSync(files.portal, "utf8");

  assert.match(
    portal,
    /import ProClubTeamDashboard from "\.\/operations\/ProClubTeamDashboard"/,
  );
  assert.match(
    portal,
    /PRO_CLUB_OPERATIONS_PREVIEW_AVAILABLE \? \(\s*<ProClubOperationsDashboard authority=\{authority\} \/>\s*\) : \(\s*<ProClubTeamDashboard authority=\{authority\} \/>\s*\)/s,
  );
  assert.equal((portal.match(/<ProClubTeamDashboard\b/g) ?? []).length, 1);
});

test("team dashboard adds presentation state only and no new persistence boundary", () => {
  const source = readFileSync(files.dashboard, "utf8");

  for (const forbidden of [
    /from\s+["'][^"']*firebase[^"']*["']/i,
    /import\s+(?!type\s)[^;]+from\s+["'][^"']*firestore[^"']*["']/is,
    /httpsCallable/,
    /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/,
    /process\.env/,
    /VITE_/,
    /tnsu-lampang/i,
    /Talumball/i,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});
