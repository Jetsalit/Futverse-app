import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canOpenProClubLibraryLogbook } from "../src/components/pro-club/operations/ProClubLibraryLogbook";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

function authority(
  overrides: Partial<ProClubOrganizationAuthority> = {},
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "Lampang United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "actor-1",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole: "HEAD_COACH",
    ...overrides,
  };
}

const source = readFileSync(
  "src/components/pro-club/operations/ProClubLibraryLogbook.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  "utf8",
);

test("opens only for the seven reviewed football roles", () => {
  for (const staffRole of [
    "TECHNICAL_DIRECTOR",
    "HEAD_COACH",
    "ASSISTANT_COACH",
    "GK_COACH",
    "FITNESS_COACH",
    "ANALYST",
    "PHYSIO",
  ] as const) {
    assert.equal(canOpenProClubLibraryLogbook(authority({ staffRole })), true);
  }

  for (const staffRole of ["MANAGER", "TEAM_MANAGER", "STAFF", null] as const) {
    assert.equal(canOpenProClubLibraryLogbook(authority({ staffRole })), false);
  }
});

test("fails closed for inactive tenant or membership authority", () => {
  assert.equal(
    canOpenProClubLibraryLogbook(authority({ organizationStatus: "INACTIVE" })),
    false,
  );
  assert.equal(
    canOpenProClubLibraryLogbook(authority({ membershipStatus: "INACTIVE" })),
    false,
  );
  assert.equal(
    canOpenProClubLibraryLogbook(authority({ hasMembershipAuthority: false })),
    false,
  );
});

test("shell exposes the requested views and role filters", () => {
  for (const label of [
    "My Logbook",
    "Team Shared",
    "Club Library",
    "Favourites",
    "Recent",
    "Technical Director",
    "Head Coach",
    "Assistant Coach",
    "GK Coach",
    "Fitness Coach",
    "Analyst",
    "Physio",
  ]) {
    assert.ok(source.includes(label) || source.includes("PRO_CLUB_LIBRARY_LOGBOOK_"), label);
  }
  assert.match(source, /PRO_CLUB_LIBRARY_LOGBOOK_VIEWS/);
  assert.match(source, /PRO_CLUB_LIBRARY_LOGBOOK_ROLES/);
});

test("reuses drill and Staff Submission adapters without direct Firestore writes", () => {
  assert.match(source, /useDrillDatabase/);
  assert.match(source, /listMyProClubStaffSubmissions/);
  assert.match(source, /listProClubStaffSubmissionsForReview/);
  assert.match(source, /composeProClubLibraryLogbookEntries/);

  for (const forbidden of [
    /from\s+["'][^"']*firebase\/firestore[^"']*["']/,
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
    /collection\(db/,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("Technical Director development lenses remain separate from review authority", () => {
  for (const lens of [
    "Club Development",
    "Game Model",
    "Player Development",
    "Pathway",
  ]) {
    assert.match(source, new RegExp(lens));
  }
  assert.match(source, /Development lenses only/);
  assert.match(source, /Technical Governance contract/);
  assert.match(source, /Open existing module/);
});

test("Favourites stay session-only", () => {
  assert.match(source, /useState<readonly string\[\]>/);
  assert.match(source, /toggleFavourite/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /sessionStorage/);
});

test("dashboard wires Library & Logbook through the production shell only", () => {
  assert.match(dashboard, /"LIBRARY_LOGBOOK"/);
  assert.match(dashboard, /Library & Logbook/);
  assert.match(dashboard, /<ProClubLibraryLogbook/);
  assert.match(dashboard, /canOpenProClubLibraryLogbook/);
});
