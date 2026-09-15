import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ProClubAttendance, {
  canMutateProClubAttendance,
} from "../src/components/pro-club/operations/ProClubAttendance";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import {
  PRO_CLUB_ATTENDANCE_STATUSES,
  buildProClubAttendanceSessionId,
  isEligibleProClubAttendanceRosterPlayer,
  isStrictProClubAttendanceDate,
  isStrictProClubAttendanceTime,
} from "../src/lib/proClubAttendance";
import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository";

const files = {
  attendanceComponent: "src/components/pro-club/operations/ProClubAttendance.tsx",
  workspace: "src/components/pro-club/operations/ProClubRoleWorkspace.tsx",
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

test("workspace wiring: ProClubRoleWorkspace wires ProClubAttendance exclusively for Head Coach", () => {
  const workspaceSource = readFileSync(files.workspace, "utf8");

  assert.match(
    workspaceSource,
    /import ProClubAttendance from "\.\/ProClubAttendance"/,
  );
  assert.match(
    workspaceSource,
    /<ProClubAttendance authority=\{authority\} \/>/,
  );

  // Verifies it is inside the Head Coach branch and not in Technical Director or fallback
  const headCoachBlock = workspaceSource.slice(
    workspaceSource.indexOf('if (authority.staffRole === "HEAD_COACH")'),
    workspaceSource.indexOf('if (authority.staffRole === "TECHNICAL_DIRECTOR")'),
  );
  assert.match(headCoachBlock, /<ProClubAttendance authority=\{authority\} \/>/);

  const tdBlock = workspaceSource.slice(
    workspaceSource.indexOf('if (authority.staffRole === "TECHNICAL_DIRECTOR")'),
  );
  assert.doesNotMatch(tdBlock, /<ProClubAttendance/);
});

test("authority boundary: canMutateProClubAttendance allows only an active Head Coach", () => {
  assert.equal(canMutateProClubAttendance(authority()), true);

  const denied: readonly ProClubOrganizationAuthority[] = [
    { ...authority(), organizationType: "ACADEMY" } as unknown as ProClubOrganizationAuthority,
    authority({ organizationStatus: "INACTIVE" }),
    authority({ membershipStatus: "INACTIVE" }),
    authority({ hasMembershipAuthority: false }),
    authority({ staffRole: "TECHNICAL_DIRECTOR" }),
    authority({ staffRole: "ASSISTANT_COACH" }),
    authority({ staffRole: "STAFF" }),
    authority({ staffRole: null }),
  ];

  for (const deniedAuth of denied) {
    assert.equal(canMutateProClubAttendance(deniedAuth), false);
  }
});

test("attendance component invariants: uses only reviewed repositories and forbids delete and duplicate data", () => {
  const source = readFileSync(files.attendanceComponent, "utf8");

  // Reuses canonical attendance and roster repositories
  assert.match(source, /listProClubAttendanceSessions/);
  assert.match(source, /createProClubAttendanceSession/);
  assert.match(source, /listProClubAttendanceRecords/);
  assert.match(source, /createProClubAttendanceRecord/);
  assert.match(source, /updateProClubAttendanceRecord/);
  assert.match(source, /listProClubSquadRoster/);
  assert.match(source, /isEligibleProClubAttendanceRosterPlayer/);

  // Strictly enforces the four canonical V1 statuses
  assert.match(source, /PRO_CLUB_ATTENDANCE_STATUSES/);
  for (const status of ["PRESENT", "LATE", "ABSENT", "EXCUSED"]) {
    assert.match(source, new RegExp(`\\b${status}\\b`));
  }

  // Strictly forbids delete operations and raw Firestore mutations
  for (const forbidden of [
    /\bdeleteDoc\b/,
    /\bdeleteProClubAttendanceRecord\b/,
    /\bdeleteProClubAttendanceSession\b/,
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
    /medicalNotes/i,
    /absenceReason/i,
    /freeText/i,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test("static markup presentation: Head Coach sees authorized banner and session controls", () => {
  const markup = renderToStaticMarkup(<ProClubAttendance authority={authority()} />);
  const text = visibleText(markup);

  assert.match(text, /Training Attendance/);
  assert.match(text, /Head Coach Authorized/);
  assert.match(text, /Attendance Session Slot/);
  assert.match(text, /Historical Sessions/);
  assert.match(text, /Open or Create Session Slot/);
});

test("static markup presentation: non-Head Coach sees read-only banner", () => {
  const readOnlyAuth = authority({ staffRole: "ASSISTANT_COACH" });
  const markup = renderToStaticMarkup(<ProClubAttendance authority={readOnlyAuth} />);
  const text = visibleText(markup);

  assert.match(text, /Training Attendance/);
  assert.match(text, /Read-Only Session View/);
  assert.match(text, /restricted to the active Head Coach/i);
});

test("deterministic slot calculation and validation match domain contract", () => {
  assert.equal(isStrictProClubAttendanceDate("2026-09-15"), true);
  assert.equal(isStrictProClubAttendanceDate("2026-02-29"), false);
  assert.equal(isStrictProClubAttendanceTime("09:00"), true);
  assert.equal(isStrictProClubAttendanceTime("25:00"), false);
  assert.equal(
    buildProClubAttendanceSessionId("2026-09-15", "09:00"),
    "training_2026-09-15_09-00",
  );
});

test("roster filtering strictly enforces ACTIVE First Team canonical roster", () => {
  const activeFirstTeam: ProClubSquadRosterRecord = {
    playerKey: "player-1",
    schemaVersion: 1,
    futId: null,
    firstName: "Alex",
    lastName: "Striker",
    position: "ST",
    additionalPositions: [],
    jerseyNumber: 9,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: "now",
    createdBy: "head-coach",
    updatedAt: "now",
    updatedBy: "head-coach",
  };

  const inactiveFirstTeam = { ...activeFirstTeam, playerKey: "player-2", status: "INACTIVE" as const };
  const activeReserve = { ...activeFirstTeam, playerKey: "player-3", squadLabel: "Reserve Team" as const };
  const released = { ...activeFirstTeam, playerKey: "player-4", status: "RELEASED" as const };

  assert.equal(isEligibleProClubAttendanceRosterPlayer(activeFirstTeam.playerKey, activeFirstTeam), true);
  assert.equal(isEligibleProClubAttendanceRosterPlayer(inactiveFirstTeam.playerKey, inactiveFirstTeam), false);
  assert.equal(isEligibleProClubAttendanceRosterPlayer(activeReserve.playerKey, activeReserve), false);
  assert.equal(isEligibleProClubAttendanceRosterPlayer(released.playerKey, released), false);
});
