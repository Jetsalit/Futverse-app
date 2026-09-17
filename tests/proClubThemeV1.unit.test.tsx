import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProClubTeamDashboard from "../src/components/pro-club/operations/ProClubTeamDashboard";
import {
  PRO_CLUB_THEME_STORAGE_KEY,
  resolveProClubTheme,
} from "../src/components/pro-club/operations/proClubTheme";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

function authority(): ProClubOrganizationAuthority {
  return {
    organizationId: "club-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "Lampang United",
    organizationLevel: "T3",
    organizationStatus: "ACTIVE",
    userId: "head-coach-a",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole: "HEAD_COACH",
  };
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("theme contract defaults to Light and accepts only the two approved values", () => {
  assert.equal(PRO_CLUB_THEME_STORAGE_KEY, "futverse:pro-club-theme");
  assert.equal(resolveProClubTheme(null), "light");
  assert.equal(resolveProClubTheme(""), "light");
  assert.equal(resolveProClubTheme("system"), "light");
  assert.equal(resolveProClubTheme("LIGHT"), "light");
  assert.equal(resolveProClubTheme("light"), "light");
  assert.equal(resolveProClubTheme("NEON"), "neon");
  assert.equal(resolveProClubTheme("neon"), "neon");
});

test("first render is Light and exposes Light and Neon controls in the top bar", () => {
  const markup = renderToStaticMarkup(
    <ProClubTeamDashboard
      authority={authority()}
      onBack={() => undefined}
      onLogout={() => undefined}
    />,
  );
  const text = visibleText(markup);

  assert.match(markup, /data-pro-club-theme="light"/);
  assert.match(markup, /aria-label="Pro Club appearance"/);
  assert.match(text, /Light/);
  assert.match(text, /Neon/);
  assert.match(text, /Sign out/);
});

test("dashboard persists theme preference locally without adding a backend boundary", () => {
  const source = readFileSync(
    "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
    "utf8",
  );

  assert.match(source, /PRO_CLUB_THEME_STORAGE_KEY/);
  assert.match(source, /localStorage\.getItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /data-pro-club-theme/);

  for (const forbidden of [
    /httpsCallable/,
    /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/,
    /from\s+["'][^"']*firebase[^"']*["']/i,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("theme CSS defines scoped Light and Professional Neon tokens", () => {
  const css = readFileSync("src/index.css", "utf8");

  assert.match(css, /\[data-pro-club-theme="light"\]/);
  assert.match(css, /\[data-pro-club-theme="neon"\]/);
  assert.match(css, /--pc-bg:/);
  assert.match(css, /--pc-surface:/);
  assert.match(css, /--pc-border:/);
  assert.match(css, /--pc-text:/);
  assert.match(css, /--pc-accent:/);
  assert.match(css, /--pc-glow:/);
  assert.match(css, /\.pro-club-themed-surface/);
});

test("theme contrast contract keeps Light readable and Neon secondary text legible", () => {
  const css = readFileSync("src/index.css", "utf8");

  assert.match(css, /--pc-success:/);
  assert.match(css, /--pc-warning:/);
  assert.match(css, /\[data-pro-club-theme="light"\][\s\S]*--pc-muted:\s*#475569/);
  assert.match(css, /\[data-pro-club-theme="light"\][\s\S]*--pc-accent:\s*#0e7490/);
  assert.match(css, /\[data-pro-club-theme="light"\][\s\S]*--pc-success:\s*#047857/);
  assert.match(css, /\[data-pro-club-theme="light"\][\s\S]*--pc-warning:\s*#92400e/);
  assert.match(css, /\[data-pro-club-theme="neon"\][\s\S]*--pc-muted:\s*#cbd5e1/);
  assert.match(css, /\[data-pro-club-theme="neon"\][\s\S]*--pc-accent:\s*#67e8f9/);
  assert.match(css, /\[data-pro-club-theme="light"\][\s\S]*text-cyan-/);
  assert.match(css, /\[data-pro-club-theme="light"\][\s\S]*text-emerald-/);
  assert.match(css, /\[data-pro-club-theme="light"\][\s\S]*text-amber-/);
  assert.match(css, /\[data-pro-club-theme="neon"\][\s\S]*text-slate-500/);
});

test("visual polish contract adds module identity, roster position identity and readable training metadata", () => {
  const dashboardSource = readFileSync(
    "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
    "utf8",
  );
  const rosterSource = readFileSync(
    "src/components/pro-club/operations/ProClubSquadRoster.tsx",
    "utf8",
  );
  const activitySource = readFileSync(
    "src/components/pro-club/operations/WeeklyPlannerActivityCard.tsx",
    "utf8",
  );

  assert.match(dashboardSource, /pro-club-overview-card-icon/);
  assert.match(dashboardSource, /pro-club-workspace-status/);
  assert.match(dashboardSource, /tone="squad"/);
  assert.match(dashboardSource, /tone="training"/);
  assert.match(dashboardSource, /tone="attendance"/);
  assert.match(dashboardSource, /tone="matches"/);

  assert.match(rosterSource, /ROSTER_SUMMARY_VISUALS/);
  assert.match(rosterSource, /pro-club-roster-summary-card/);
  assert.match(rosterSource, /Target/);
  assert.match(rosterSource, /Activity/);

  assert.match(activitySource, /Clock/);
  assert.match(activitySource, /MapPin/);
  assert.match(activitySource, /Users/);
  assert.match(activitySource, /LOAD_VISUALS/);
  assert.match(activitySource, /emerald/);
  assert.match(activitySource, /amber/);
  assert.match(activitySource, /rose/);
});
