import assert from "node:assert/strict";
import test from "node:test";
import {
  PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION,
  canAuthorProClubMatchStartingXI,
  canMutateShootoutAtMatchStatus,
  canMutateStartingXIAtMatchStatus,
  proClubMatchDocumentPath,
  proClubMatchRosterDocumentPath,
  proClubMatchShootoutDocumentPath,
  proClubMatchStartingXIAuditCollectionPath,
  proClubMatchStartingXIDocumentPath,
  validateProClubMatchRosterSnapshot,
  validateProClubPersistedShootoutPlan,
  validateProClubPersistedStartingXIPlan,
} from "../src/lib/proClubMatchStartingXI.ts";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter.ts";
import {
  createEmptyProClubStartingXIDraft,
  createProClubCustomFormationSlotsFromFixed,
} from "../src/lib/proClubStartingXI11v11.ts";

function authority(
  staffRole: ProClubOrganizationAuthority["staffRole"],
): ProClubOrganizationAuthority {
  return {
    organizationId: "tnsu-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "TNSU Lampang",
    organizationLevel: "T3",
    organizationStatus: "ACTIVE",
    userId: "actor-1",
    membershipAuthorizationRole: "OWNER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

test("freezes canonical Pro Club Match / roster / Starting XI / shootout / audit paths", () => {
  assert.deepEqual(
    proClubMatchDocumentPath("tnsu-lampang", "match-1"),
    ["proClubs", "tnsu-lampang", "matches", "match-1"],
  );
  assert.deepEqual(
    proClubMatchRosterDocumentPath("tnsu-lampang", "match-1", "player-1"),
    ["proClubs", "tnsu-lampang", "matches", "match-1", "roster", "player-1"],
  );
  assert.deepEqual(
    proClubMatchStartingXIDocumentPath("tnsu-lampang", "match-1"),
    ["proClubs", "tnsu-lampang", "matches", "match-1", "startingXI", "current"],
  );
  assert.deepEqual(
    proClubMatchShootoutDocumentPath("tnsu-lampang", "match-1"),
    ["proClubs", "tnsu-lampang", "matches", "match-1", "shootout", "current"],
  );
  assert.deepEqual(
    proClubMatchStartingXIAuditCollectionPath("tnsu-lampang", "match-1"),
    ["proClubs", "tnsu-lampang", "matches", "match-1", "startingXIAudit"],
  );
});

test("Head Coach and Technical Director are target authors while OWNER alone is not football authority", () => {
  assert.equal(canAuthorProClubMatchStartingXI(authority("HEAD_COACH")), true);
  assert.equal(canAuthorProClubMatchStartingXI(authority("TECHNICAL_DIRECTOR")), true);
  assert.equal(canAuthorProClubMatchStartingXI(authority(null)), false);
  assert.equal(canAuthorProClubMatchStartingXI(authority("TEAM_MANAGER")), false);
});

test("Starting XI locks at kickoff while shootout order may still be changed during an in-progress match", () => {
  assert.equal(canMutateStartingXIAtMatchStatus("DRAFT"), true);
  assert.equal(canMutateStartingXIAtMatchStatus("SCHEDULED"), true);
  assert.equal(canMutateStartingXIAtMatchStatus("IN_PROGRESS"), false);
  assert.equal(canMutateStartingXIAtMatchStatus("COMPLETED"), false);
  assert.equal(canMutateStartingXIAtMatchStatus("CANCELLED"), false);

  assert.equal(canMutateShootoutAtMatchStatus("DRAFT"), true);
  assert.equal(canMutateShootoutAtMatchStatus("SCHEDULED"), true);
  assert.equal(canMutateShootoutAtMatchStatus("IN_PROGRESS"), true);
  assert.equal(canMutateShootoutAtMatchStatus("COMPLETED"), false);
  assert.equal(canMutateShootoutAtMatchStatus("CANCELLED"), false);
});

test("Pro Club roster snapshots preserve null FUTID and null position", () => {
  const result = validateProClubMatchRosterSnapshot({
    schemaVersion: PRO_CLUB_MATCH_STARTING_XI_SCHEMA_VERSION,
    playerKey: "player-1",
    futId: null,
    firstName: "Real",
    lastName: "Player",
    jerseyNumber: 3,
    position: null,
    additionalPositions: [],
  });

  assert.equal(result.ok, true);
});

test("Starting XI persistence must reference only the authoritative Match roster", () => {
  const draft = createEmptyProClubStartingXIDraft("4-3-3");
  const valid = validateProClubPersistedStartingXIPlan(
    {
      schemaVersion: 1,
      formation: "4-3-3",
      slotPlayerKeys: [
        "p1", "p2", "p3", "p4", "p5", "p6",
        "p7", "p8", "p9", "p10", "p11",
      ],
      substitutePlayerKeys: ["p12", "p13"],
      positionRoleAssignments: draft.positionRoleAssignments,
      setPieceAssignments: {
        ...draft.setPieceAssignments,
        PENALTY: "p9",
      },
      coachNotes: "",
    },
    Array.from({ length: 13 }, (_, index) => `p${index + 1}`),
  );
  assert.equal(valid.ok, true);

  const invalid = validateProClubPersistedStartingXIPlan(
    {
      schemaVersion: 1,
      formation: "4-3-3",
      slotPlayerKeys: [
        "p1", "outside", null, null, null, null,
        null, null, null, null, null,
      ],
      substitutePlayerKeys: [],
      positionRoleAssignments: draft.positionRoleAssignments,
      setPieceAssignments: draft.setPieceAssignments,
      coachNotes: "",
    },
    ["p1"],
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /outside the authoritative Match roster/);
});

test("shootout order is a separate match-scoped plan and fails closed outside selected Match squad", () => {
  const valid = validateProClubPersistedShootoutPlan(
    {
      schemaVersion: 1,
      primaryTakers: ["p1", "p2", "p3", "p4", "p5"],
      backupTakers: ["p6", "p7"],
    },
    ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
  );
  assert.equal(valid.ok, true);

  const invalid = validateProClubPersistedShootoutPlan(
    {
      schemaVersion: 1,
      primaryTakers: ["p1", "p1"],
      backupTakers: ["outside"],
    },
    ["p1"],
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /duplicate players/);
  assert.match(invalid.errors.join(" "), /authoritative Match squad/);
});

test("persisted CUSTOM Starting XI requires a valid eleven-slot layout snapshot", () => {
  const draft = createEmptyProClubStartingXIDraft("4-3-3");
  const roster = Array.from({ length: 13 }, (_, index) => `p${index + 1}`);
  const base = {
    schemaVersion: 1 as const,
    formation: "CUSTOM" as const,
    customFormationSlots: createProClubCustomFormationSlotsFromFixed("4-3-3"),
    slotPlayerKeys: roster.slice(0, 11),
    substitutePlayerKeys: roster.slice(11),
    positionRoleAssignments: draft.positionRoleAssignments,
    setPieceAssignments: draft.setPieceAssignments,
    coachNotes: "",
  };

  assert.equal(validateProClubPersistedStartingXIPlan(base, roster).ok, true);
  assert.equal(
    validateProClubPersistedStartingXIPlan(
      { ...base, customFormationSlots: null },
      roster,
    ).ok,
    false,
  );
});
