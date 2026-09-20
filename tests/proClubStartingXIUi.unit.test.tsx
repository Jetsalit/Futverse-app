import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ProClubStartingXI11v11 from "../src/components/pro-club/operations/ProClubStartingXI11v11.tsx";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter.ts";
import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository.ts";

const authority: ProClubOrganizationAuthority = {
  organizationId: "tnsu-lampang",
  organizationType: "PRO_CLUB",
  organizationName: "TNSU Lampang",
  organizationLevel: "T3",
  organizationStatus: "ACTIVE",
  userId: "td-1",
  membershipAuthorizationRole: "OWNER",
  membershipStatus: "ACTIVE",
  hasMembershipAuthority: true,
  staffRole: "TECHNICAL_DIRECTOR",
};

function roster(playerKey: string, jerseyNumber: number): ProClubSquadRosterRecord {
  return {
    playerKey,
    schemaVersion: 1,
    futId: null,
    firstName: "Player",
    lastName: playerKey,
    position: null,
    additionalPositions: [],
    jerseyNumber,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: "created",
    createdBy: "coach",
    updatedAt: "updated",
    updatedBy: "coach",
  };
}

function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\\s+/g, " ")
    .trim();
}

test("renders approved Pro Club 11v11 command-center sections without Academy 7v7 or leadership group", () => {
  const markup = renderToStaticMarkup(
    <ProClubStartingXI11v11
      authority={authority}
      roster={[roster("p1", 1), roster("p2", 2), roster("p3", 3)]}
    />,
  );
  const visible = text(markup);

  for (const expected of [
    "Pro Club 11v11",
    "Starting XI Command Center",
    "Position Role Assignments",
    "Roles",
    "Game Model",
    "Set Pieces",
    "Shootout",
    "Player Communication & Sync",
    "Matchday Control",
    "UI Adapter Preview",
    "Persistence disabled",
  ]) {
    assert.equal(visible.toLowerCase().includes(expected.toLowerCase()), true, expected);
  }

  assert.doesNotMatch(visible, /Academy 7v7/i);
  assert.doesNotMatch(visible, /Leadership Group/i);
  assert.doesNotMatch(visible, /Leadership & Captain/i);
});

test("renders exactly 11 pitch slots and only approved fixed formations", () => {
  const markup = renderToStaticMarkup(
    <ProClubStartingXI11v11 authority={authority} roster={[]} />,
  );

  assert.equal((markup.match(/data-starting-xi-slot=/g) ?? []).length, 11);
  for (const formation of ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2"]) {
    assert.match(markup, new RegExp(">" + formation + "<"));
  }
  assert.doesNotMatch(markup, />2-3-1</);
  assert.doesNotMatch(markup, />7v7</);
});

test("UI adapter is presentation/local-state only and has no direct Firestore write dependency", () => {
  const source = readFileSync(
    "src/components/pro-club/operations/ProClubStartingXI11v11.tsx",
    "utf8",
  );
  const dashboard = readFileSync(
    "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
    "utf8",
  );

  for (const forbidden of [
    /firebase\/firestore/,
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
    /httpsCallable/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }

  assert.doesNotMatch(
    dashboard,
    /ProClubStartingXI11v11/,
    "UI adapter must not be wired into production dashboard in this slice",
  );
});
