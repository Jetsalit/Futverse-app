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
