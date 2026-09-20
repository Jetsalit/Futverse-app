import assert from "node:assert/strict";
import test from "node:test";
import {
  PRO_CLUB_GAME_MODEL_PHASES,
  PRO_CLUB_STARTING_XI_FIXED_SLOTS,
  PRO_CLUB_STARTING_XI_UI_SECTIONS,
  canAuthorProClubStartingXI,
  createEmptyProClubStartingXIDraft,
  deriveProClubStartingXIEligiblePlayers,
  validateProClubStartingXIDraft,
} from "../src/lib/proClubStartingXI11v11.ts";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter.ts";
import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository.ts";

function authority(
  staffRole: ProClubOrganizationAuthority["staffRole"],
): ProClubOrganizationAuthority {
  return {
    organizationId: "tnsu-lampang",
    organizationType: "PRO_CLUB",
    organizationName: "TNSU Lampang",
    organizationLevel: "T3",
    organizationStatus: "ACTIVE",
    userId: "coach-1",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

function rosterPlayer(
  playerKey: string,
  overrides: Partial<ProClubSquadRosterRecord> = {},
): ProClubSquadRosterRecord {
  return {
    playerKey,
    schemaVersion: 1,
    futId: null,
    firstName: "Player",
    lastName: playerKey,
    position: null,
    additionalPositions: [],
    jerseyNumber: 1,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: "created",
    createdBy: "coach-1",
    updatedAt: "updated",
    updatedBy: "coach-1",
    ...overrides,
  };
}

test("all fixed Pro Club formations are 11v11 and use canonical position codes", () => {
  for (const [formation, slots] of Object.entries(PRO_CLUB_STARTING_XI_FIXED_SLOTS)) {
    assert.equal(slots.length, 11, formation);
    assert.deepEqual(
      slots.map((slot) => slot.slotIndex),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
  }

  assert.equal(Object.keys(PRO_CLUB_STARTING_XI_FIXED_SLOTS).includes("7v7"), false);
  assert.equal(Object.keys(PRO_CLUB_STARTING_XI_FIXED_SLOTS).includes("2-3-1"), false);
});

test("target UI foundation contains role assignment and shootout order but no leadership panel", () => {
  assert.equal(PRO_CLUB_STARTING_XI_UI_SECTIONS.includes("POSITION_ROLE_ASSIGNMENTS"), true);
  assert.equal(PRO_CLUB_STARTING_XI_UI_SECTIONS.includes("PENALTY_SHOOTOUT_ORDER"), true);
  assert.equal(
    (PRO_CLUB_STARTING_XI_UI_SECTIONS as readonly string[]).includes("LEADERSHIP_GROUP"),
    false,
  );

  assert.deepEqual(PRO_CLUB_GAME_MODEL_PHASES, [
    "IN_POSSESSION",
    "OUT_OF_POSSESSION",
    "TRANSITION_TO_ATTACK",
    "TRANSITION_TO_DEFEND",
  ]);
});

test("only active Head Coach and Technical Director receive target authoring entitlement", () => {
  assert.equal(canAuthorProClubStartingXI(authority("HEAD_COACH")), true);
  assert.equal(canAuthorProClubStartingXI(authority("TECHNICAL_DIRECTOR")), true);
  assert.equal(canAuthorProClubStartingXI(authority("ASSISTANT_COACH")), false);

  assert.equal(
    canAuthorProClubStartingXI({
      ...authority("TECHNICAL_DIRECTOR"),
      membershipStatus: "INACTIVE",
    }),
    false,
  );
});

test("eligible-player derivation reuses active canonical Pro Club roster and preserves unknown positions/FUTID", () => {
  const players = deriveProClubStartingXIEligiblePlayers([
    rosterPlayer("player-1", {
      firstName: "A",
      jerseyNumber: 3,
      futId: null,
      position: null,
    }),
    rosterPlayer("player-2", {
      status: "RELEASED",
      jerseyNumber: 4,
    }),
  ]);

  assert.equal(players.length, 1);
  assert.equal(players[0].playerKey, "player-1");
  assert.equal(players[0].futId, null);
  assert.equal(players[0].position, null);
  assert.equal(players[0].jerseyNumber, 3);
});

test("draft permits incomplete local selection but publish validation requires exactly 11 unique starters", () => {
  const draft = createEmptyProClubStartingXIDraft("4-3-3");
  assert.equal(validateProClubStartingXIDraft(draft).ok, true);

  const incompletePublish = validateProClubStartingXIDraft(
    draft,
    { requireCompleteStartingXI: true },
  );
  assert.equal(incompletePublish.ok, false);
  assert.match(incompletePublish.errors.join(" "), /exactly 11 selected players/);

  const complete = {
    ...draft,
    slotPlayerKeys: Array.from(
      { length: 11 },
      (_, index) => `player-${index + 1}`,
    ),
  };
  assert.equal(
    validateProClubStartingXIDraft(
      complete,
      { requireCompleteStartingXI: true },
    ).ok,
    true,
  );
});

test("same player cannot be duplicated across starting slots or bench", () => {
  const draft = createEmptyProClubStartingXIDraft();
  const duplicatedStarter = {
    ...draft,
    slotPlayerKeys: [
      "player-1",
      "player-1",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
  };
  assert.equal(validateProClubStartingXIDraft(duplicatedStarter).ok, false);

  const starterAndBench = {
    ...draft,
    slotPlayerKeys: [
      "player-1",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    substitutePlayerKeys: ["player-1"],
  };
  assert.match(
    validateProClubStartingXIDraft(starterAndBench).errors.join(" "),
    /both Starting XI and substitute/,
  );
});

test("role assignments align to eleven slots and remain bounded text", () => {
  const draft = createEmptyProClubStartingXIDraft();
  const valid = {
    ...draft,
    positionRoleAssignments: draft.positionRoleAssignments.map(
      (_, index) => index === 0 ? "Build-up start, organize back line" : null,
    ),
  };
  assert.equal(validateProClubStartingXIDraft(valid).ok, true);

  const invalid = {
    ...draft,
    positionRoleAssignments: Array.from({ length: 10 }, () => null),
  };
  assert.match(
    validateProClubStartingXIDraft(invalid).errors.join(" "),
    /align to 11 lineup slots/,
  );
});

test("set pieces and penalty shootout order can reference only unique selected match-squad players", () => {
  const draft = createEmptyProClubStartingXIDraft();
  const selected = {
    ...draft,
    slotPlayerKeys: [
      "player-1",
      "player-2",
      "player-3",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    substitutePlayerKeys: ["player-12", "player-13"],
    setPieceAssignments: {
      ...draft.setPieceAssignments,
      PENALTY: "player-1",
      CORNER_LEFT: "player-12",
    },
    penaltyShootoutOrder: {
      primaryTakers: ["player-1", "player-2", "player-3"],
      backupTakers: ["player-12", "player-13"],
    },
  };

  assert.equal(validateProClubStartingXIDraft(selected).ok, true);

  const invalid = {
    ...selected,
    penaltyShootoutOrder: {
      primaryTakers: ["player-1", "player-1"],
      backupTakers: ["not-selected"],
    },
  };
  const result = validateProClubStartingXIDraft(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /duplicate players/);
  assert.match(result.errors.join(" "), /selected match squad/);
});
