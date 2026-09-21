import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProClubTeamDashboard, {
  PRO_CLUB_ACTIVE_TAB_SESSION_KEY_PREFIX,
  PRO_CLUB_TEAM_DASHBOARD_TABS,
  resolveProClubActiveTab,
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
    "SUBMISSIONS",
    "GAME_MODEL",
    "MATCHES",
  ]);
});

test("active tab refresh persistence accepts only live production tabs", () => {
  assert.equal(
    PRO_CLUB_ACTIVE_TAB_SESSION_KEY_PREFIX,
    "futverse:pro-club-active-tab",
  );
  assert.equal(resolveProClubActiveTab("OVERVIEW"), "OVERVIEW");
  assert.equal(resolveProClubActiveTab("SQUAD"), "SQUAD");
  assert.equal(resolveProClubActiveTab("TRAINING"), "TRAINING");
  assert.equal(resolveProClubActiveTab("ATTENDANCE"), "ATTENDANCE");
  assert.equal(resolveProClubActiveTab("SUBMISSIONS"), "SUBMISSIONS");
  assert.equal(resolveProClubActiveTab("GAME_MODEL"), "GAME_MODEL");
  assert.equal(resolveProClubActiveTab("MATCHES"), "MATCHES");
  assert.equal(resolveProClubActiveTab("UNKNOWN"), "OVERVIEW");
  assert.equal(resolveProClubActiveTab(null), "OVERVIEW");
});

test("dashboard persists the active production tab in sessionStorage only", () => {
  const source = readFileSync(files.dashboard, "utf8");

  assert.match(source, /sessionStorage\.getItem/);
  assert.match(source, /sessionStorage\.setItem/);
  assert.match(source, /authority\.organizationId/);
  assert.match(source, /authority\.userId/);
  assert.match(source, /persistActiveTab\("ATTENDANCE"\)/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*active-tab/i);
});

test("renders the production app shell with authoritative club identity and controls", () => {
  const markup = renderToStaticMarkup(
    <ProClubTeamDashboard
      authority={authority()}
      onBack={() => {}}
      onLogout={() => {}}
    />,
  );
  const text = visibleText(markup);

  assert.match(markup, /aria-label="Pro Club application shell"/);
  assert.match(text, /Lampang United/);
  assert.match(text, /Head coach/i);
  assert.match(text, /ACTIVE/);
  assert.match(text, /Back to FutVerse/);
  assert.match(text, /Sign out/);
  assert.match(text, /Overview/);
  assert.match(text, /Squad/);
  assert.match(text, /Training/);
  assert.match(text, /Attendance/);
  assert.match(text, /ส่งงาน/);
  assert.match(text, /Game Model/);
  assert.match(text, /Matches/);
  assert.doesNotMatch(text, /Coming soon/i);

  for (const forbidden of [
    /DEV PREVIEW/i,
    /Fitness/i,
    /Analysis/i,
    /Availability/i,
    /Reports/i,
    /Staff administration/i,
    /Club administration/i,
  ]) {
    assert.doesNotMatch(text, forbidden);
  }
});

test("app shell uses a left desktop sidebar, sticky top bar, and unconstrained main content", () => {
  const source = readFileSync(files.dashboard, "utf8");

  assert.match(source, /aria-label="Pro Club application shell"/);
  assert.match(source, /lg:grid-cols-\[248px_minmax\(0,1fr\)\]/);
  assert.match(source, /<aside[\s\S]*lg:h-screen[\s\S]*<nav\s+aria-label="Pro Club team sections"/);
  assert.match(source, /<header[\s\S]*sticky top-0[\s\S]*Back to FutVerse[\s\S]*Sign out/);
  assert.match(source, /<main className="min-w-0[^"]*"/);
  assert.doesNotMatch(source, /<main className="[^"]*max-w-/);
});

test("production dashboard reuses reviewed Squad Training and Attendance surfaces", () => {
  const source = readFileSync(files.dashboard, "utf8");

  assert.match(source, /import ProClubSquadRoster from "\.\/ProClubSquadRoster"/);
  assert.match(
    source,
    /import ProClubHeadCoachWeeklyProductionWorkspace from "\.\/ProClubHeadCoachWeeklyProductionWorkspace"/,
  );
  assert.match(source, /import ProClubAttendance from "\.\/ProClubAttendance"/);
  assert.match(source, /import ProClubStaffSubmissions/);
  assert.match(source, /import ProClubMatchStartingXIWorkspace from "\.\/ProClubMatchStartingXIWorkspace"/);
  assert.equal((source.match(/<ProClubSquadRoster\b/g) ?? []).length, 1);
  assert.equal(
    (source.match(/<ProClubHeadCoachWeeklyProductionWorkspace\b/g) ?? []).length,
    1,
  );
  assert.equal((source.match(/<ProClubAttendance\b/g) ?? []).length, 1);
  assert.equal((source.match(/<ProClubStaffSubmissions\b/g) ?? []).length, 1);
  assert.equal((source.match(/<ProClubGameModel\b/g) ?? []).length, 1);
  assert.equal((source.match(/<ProClubMatchStartingXIWorkspace\b/g) ?? []).length, 1);
});

test("overview cards connect directly to the live production tabs", () => {
  const source = readFileSync(files.dashboard, "utf8");

  assert.match(source, /title="Squad"[\s\S]*onOpen=\{\(\) => selectActiveTab\("SQUAD"\)\}/);
  assert.match(source, /title="Training"[\s\S]*onOpen=\{\(\) => selectActiveTab\("TRAINING"\)\}/);
  assert.match(source, /title="Attendance"[\s\S]*onOpen=\{\(\) => selectActiveTab\("ATTENDANCE"\)\}/);
  assert.match(source, /title="Matches"[\s\S]*onOpen=\{\(\) => selectActiveTab\("MATCHES"\)\}/);

  const overviewCardSource = source.slice(source.indexOf("function OverviewCard"));
  assert.match(overviewCardSource, /if \(onOpen\)/);
  assert.match(overviewCardSource, /onClick=\{onOpen\}/);
  assert.match(overviewCardSource, /aria-label=/);
});
test("portal mounts only the production team dashboard for authorized workspaces", () => {
  const portal = readFileSync(files.portal, "utf8");

  assert.match(
    portal,
    /import ProClubTeamDashboard from "\.\/operations\/ProClubTeamDashboard"/,
  );
  assert.doesNotMatch(portal, /PRO_CLUB_OPERATIONS_PREVIEW_AVAILABLE/);
  assert.doesNotMatch(portal, /ProClubOperationsDashboard/);
  assert.match(
    portal,
    /<ProClubTeamDashboard[\s\S]*authority=\{authority\}[\s\S]*onBack=\{onBack\}[\s\S]*onLogout=\{onLogout\}/,
  );
  assert.equal((portal.match(/<ProClubTeamDashboard\b/g) ?? []).length, 1);
});

test("authorized workspace removes the duplicate Pro Club Workspace card and keeps review content inside the shell", () => {
  const portal = readFileSync(files.portal, "utf8");

  assert.doesNotMatch(portal, />Pro Club workspace</i);
  assert.doesNotMatch(portal, /<StatusBadge\b/);
  assert.match(portal, /overviewSupplement=\{/);
  assert.match(portal, /<PendingStaffRequests\b/);
  assert.match(portal, /authorized\s*\?\s*\(\s*<ClubWorkspace\b/);
  assert.match(portal, /Opening your club/i);
});

test("team navigation is horizontally usable on small screens and becomes a left sidebar on desktop", () => {
  const source = readFileSync(files.dashboard, "utf8");

  assert.match(
    source,
    /aria-label="Pro Club team sections"[^>]*className="[^"]*flex[^"]*overflow-x-auto[^"]*lg:flex-col[^"]*"/,
  );
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
