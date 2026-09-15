import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import ProClubAttendance, {
  canMutateProClubAttendance,
} from "../src/components/pro-club/operations/ProClubAttendance";
import ProClubRoleWorkspace from "../src/components/pro-club/operations/ProClubRoleWorkspace";
import type { ProClubAttendanceRepositoryOps } from "../src/lib/firestore/proClubAttendanceRepository";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import {
  PRO_CLUB_ATTENDANCE_STATUSES,
  buildProClubAttendanceSessionId,
  isEligibleProClubAttendanceRosterPlayer,
  isStrictProClubAttendanceDate,
  isStrictProClubAttendanceTime,
} from "../src/lib/proClubAttendance";
import type {
  ProClubSquadRosterRecord,
  ProClubSquadRosterRepositoryOps,
} from "../src/lib/firestore/proClubSquadRosterRepository";

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
function setupDom() {
  const dom = new JSDOM(
    "<!doctype html><html><body></body></html>",
    {
      url: "http://localhost/",
      pretendToBeVisual: true,
    },
  );

  const window = dom.window;

  const globalValues: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    MutationObserver: window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };

  const originalGlobals =
    new Map<string, PropertyDescriptor | undefined>();

  for (const [name, value] of Object.entries(globalValues)) {
    originalGlobals.set(
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    );

    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  const container = window.document.createElement("div");
  window.document.body.appendChild(container);

  return {
    dom,
    container,

    cleanup() {
      for (const [name, descriptor] of originalGlobals) {
        if (descriptor) {
          Object.defineProperty(
            globalThis,
            name,
            descriptor,
          );
        } else {
          Reflect.deleteProperty(globalThis, name);
        }
      }
    },
  };
}

test("workspace wiring: ProClubRoleWorkspace wires ProClubAttendance exclusively for Head Coach", () => {
  const workspaceSource = readFileSync(files.workspace, "utf8");

  assert.match(
    workspaceSource,
    /import ProClubAttendance from "\.\/ProClubAttendance"/,
  );
  assert.match(
    workspaceSource,
    /<ProClubAttendance key=\{attendanceAuthorityKey\} authority=\{authority\} \/>/,
  );

  // Verifies it is inside the Head Coach branch and not in Technical Director or fallback
  const headCoachBlock = workspaceSource.slice(
    workspaceSource.indexOf('if (authority.staffRole === "HEAD_COACH")'),
    workspaceSource.indexOf('if (authority.staffRole === "TECHNICAL_DIRECTOR")'),
  );
  assert.match(headCoachBlock, /<ProClubAttendance key=\{attendanceAuthorityKey\} authority=\{authority\} \/>/);

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

test("corrective: existing exact session opens even when absent from list cache", async () => {
  const runtime = setupDom();
  const auth = authority();

  const now = new Date();
  const targetDate =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const targetTime = "09:00";
  const targetId = buildProClubAttendanceSessionId(targetDate, targetTime);

  assert.ok(targetId);

  let createDocumentCalls = 0;

  const attendanceOps: ProClubAttendanceRepositoryOps = {
    getAuthenticatedUid() {
      return auth.userId;
    },

    async resolveAuthority(clubId, uid) {
      assert.equal(clubId, auth.organizationId);
      assert.equal(uid, auth.userId);

      return {
        state: "FOUND",
        value: auth,
      };
    },

    async readDocument(path) {
      const id = path[path.length - 1] ?? "missing";

      if (
        path.length === 4 &&
        path[0] === "proClubs" &&
        path[1] === auth.organizationId &&
        path[2] === "attendanceSessions" &&
        path[3] === targetId
      ) {
        return {
          id: targetId,
          exists: true,
          data: {
            schemaVersion: 1,
            sessionDate: targetDate,
            startTime: targetTime,
            squadLabel: "First Team",
            sessionType: "TRAINING",
            createdAt: "created-at",
            createdBy: auth.userId,
          },
        };
      }

      return {
        id,
        exists: false,
      };
    },

    async listDocuments() {
      // Critical precondition:
      // the history/list cache does NOT contain the target session.
      return {
        documents: [],
      };
    },

    async createDocument() {
      createDocumentCalls += 1;
    },

    async updateDocument() {
      throw new Error("Unexpected Attendance update in corrective Test 1.");
    },

    timestamp() {
      return "timestamp";
    },
  };

  const rosterOps: ProClubSquadRosterRepositoryOps = {
    getAuthenticatedUid() {
      return auth.userId;
    },

    async resolveAuthority(clubId, uid) {
      assert.equal(clubId, auth.organizationId);
      assert.equal(uid, auth.userId);

      return {
        state: "FOUND",
        value: auth,
      };
    },

    async readDocument(path) {
      return {
        id: path[path.length - 1] ?? "missing",
        exists: false,
      };
    },

    async listDocuments() {
      return {
        documents: [],
      };
    },

    async createDocument() {
      throw new Error("Unexpected roster create in corrective Test 1.");
    },

    async updateDocument() {
      throw new Error("Unexpected roster update in corrective Test 1.");
    },

    timestamp() {
      return "timestamp";
    },
  };

  let root: Root | null = null;

  try {
    root = createRoot(runtime.container);

    await act(async () => {
      root!.render(
        <ProClubAttendance
          authority={auth}
          attendanceOps={attendanceOps}
          rosterOps={rosterOps}
        />,
      );
    });

    await act(async () => {
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const openButton = (
      Array.from(
        runtime.container.querySelectorAll("button"),
      ) as HTMLButtonElement[]
    ).find((button) =>
      button.textContent?.includes("Open or Create Session Slot"),
    );

    assert.ok(openButton, "Open or Create Session Slot button must exist");

    await act(async () => {
      openButton.click();
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    const text = visibleText(runtime.container.innerHTML);

    // Existing canonical session must be opened, never created.
    assert.equal(createDocumentCalls, 0);

    // Current implementation is expected to FAIL here:
    // it attempts create after a cache miss and surfaces "already exists".
    assert.doesNotMatch(text, /already exists/i);

    assert.match(text, new RegExp(targetId));
  } finally {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }

    runtime.cleanup();
    runtime.dom.window.close();
  }
});
function findAttendanceElement(node: ReactNode): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAttendanceElement(child);
      if (found) return found;
    }

    return null;
  }

  if (!isValidElement(node)) {
    return null;
  }

  if (node.type === ProClubAttendance) {
    return node;
  }

  const props = node.props as { children?: ReactNode };
  return findAttendanceElement(props.children ?? null);
}

test("corrective: authority switch changes Attendance React identity boundary", () => {
  const clubA = authority({
    organizationId: "club-a",
    userId: "head-coach-a",
  });

  const clubB = authority({
    organizationId: "club-b",
    userId: "head-coach-b",
  });

  const actorB = authority({
    organizationId: "club-a",
    userId: "head-coach-b",
  });

  const inactiveOrganization = authority({
    organizationId: "club-a",
    userId: "head-coach-a",
    organizationStatus: "INACTIVE",
  });

  const inactiveMembership = authority({
    organizationId: "club-a",
    userId: "head-coach-a",
    membershipStatus: "INACTIVE",
  });

  const noMembershipAuthority = authority({
    organizationId: "club-a",
    userId: "head-coach-a",
    hasMembershipAuthority: false,
  });

  const attendanceA = findAttendanceElement(
    ProClubRoleWorkspace({ authority: clubA }),
  );

  const attendanceB = findAttendanceElement(
    ProClubRoleWorkspace({ authority: clubB }),
  );

  const attendanceActorB = findAttendanceElement(
    ProClubRoleWorkspace({ authority: actorB }),
  );

  const attendanceInactiveOrganization = findAttendanceElement(
    ProClubRoleWorkspace({ authority: inactiveOrganization }),
  );

  const attendanceInactiveMembership = findAttendanceElement(
    ProClubRoleWorkspace({ authority: inactiveMembership }),
  );

  const attendanceNoMembershipAuthority = findAttendanceElement(
    ProClubRoleWorkspace({ authority: noMembershipAuthority }),
  );

  assert.ok(attendanceA);
  assert.ok(attendanceB);
  assert.ok(attendanceActorB);
  assert.ok(attendanceInactiveOrganization);
  assert.ok(attendanceInactiveMembership);
  assert.ok(attendanceNoMembershipAuthority);

  assert.notEqual(
    attendanceA.key,
    null,
    "Attendance production element must have an authority-bound React key",
  );

  assert.notEqual(
    attendanceA.key,
    attendanceB.key,
    "organization switch must remount Attendance",
  );

  assert.notEqual(
    attendanceA.key,
    attendanceActorB.key,
    "actor switch must remount Attendance",
  );

  assert.notEqual(
    attendanceA.key,
    attendanceInactiveOrganization.key,
    "organization status change must remount Attendance",
  );

  assert.notEqual(
    attendanceA.key,
    attendanceInactiveMembership.key,
    "membership status change must remount Attendance",
  );

  assert.notEqual(
    attendanceA.key,
    attendanceNoMembershipAuthority.key,
    "membership authority change must remount Attendance",
  );

  const assistant = findAttendanceElement(
    ProClubRoleWorkspace({
      authority: authority({
        organizationId: "club-a",
        userId: "head-coach-a",
        staffRole: "ASSISTANT_COACH",
      }),
    }),
  );

  assert.equal(
    assistant,
    null,
    "leaving HEAD_COACH must unmount Attendance",
  );
});