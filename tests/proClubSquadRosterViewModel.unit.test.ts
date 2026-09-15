import test from "node:test";
import assert from "node:assert/strict";

import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository";
import {
  countProClubSquadRosterByGroup,
  filterProClubSquadRoster,
  resolveProClubSquadPositionGroup,
} from "../src/components/pro-club/operations/proClubSquadRosterViewModel";

function rosterRecord(
  overrides: Partial<ProClubSquadRosterRecord> = {},
): ProClubSquadRosterRecord {
  return {
    schemaVersion: 1,
    playerKey: "player-1",
    futId: "FUT-PLAYER-001",
    firstName: "Max",
    lastName: "Coach",
    position: "CM",
    additionalPositions: ["DM"],
    jerseyNumber: 8,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: "created",
    createdBy: "head-coach",
    updatedAt: "updated",
    updatedBy: "head-coach",
    ...overrides,
  };
}

test("maps every canonical player position into the Pro first-team group model", () => {
  assert.equal(resolveProClubSquadPositionGroup("GK"), "GK");

  for (const position of ["LB", "LWB", "CB", "RB", "RWB"] as const) {
    assert.equal(resolveProClubSquadPositionGroup(position), "DEF");
  }

  for (const position of ["DM", "LM", "CM", "RM", "AM"] as const) {
    assert.equal(resolveProClubSquadPositionGroup(position), "MID");
  }

  for (const position of ["LW", "RW", "CF", "ST"] as const) {
    assert.equal(resolveProClubSquadPositionGroup(position), "FWD");
  }
});

test("search reuses roster identity fields without Academy or global fallback data", () => {
  const records = [
    rosterRecord(),
    rosterRecord({
      playerKey: "player-2",
      futId: null,
      firstName: "Narin",
      lastName: "Goal",
      position: "GK",
      additionalPositions: [],
      jerseyNumber: 1,
      squadLabel: "Reserve Team",
    }),
  ];

  for (const search of ["max", "coach", "FUT-PLAYER-001", "8", "CM", "first team"]) {
    const result = filterProClubSquadRoster(records, {
      search,
      status: "ALL",
      group: "ALL",
    });

    assert.deepEqual(result.map((record) => record.playerKey), ["player-1"]);
  }
});

test("status and position-group filters compose deterministically", () => {
  const records = [
    rosterRecord({ playerKey: "active-mid", jerseyNumber: 8 }),
    rosterRecord({
      playerKey: "inactive-mid",
      firstName: "B",
      position: "DM",
      jerseyNumber: 6,
      status: "INACTIVE",
    }),
    rosterRecord({
      playerKey: "active-def",
      firstName: "C",
      position: "CB",
      jerseyNumber: 4,
    }),
  ];

  const result = filterProClubSquadRoster(records, {
    search: "",
    status: "ACTIVE",
    group: "MID",
  });

  assert.deepEqual(result.map((record) => record.playerKey), ["active-mid"]);
});

test("filtered roster sorts by jersey number then player name", () => {
  const records = [
    rosterRecord({ playerKey: "jersey-10", jerseyNumber: 10, firstName: "Zulu" }),
    rosterRecord({ playerKey: "jersey-2-b", jerseyNumber: 2, firstName: "Beta" }),
    rosterRecord({ playerKey: "jersey-2-a", jerseyNumber: 2, firstName: "Alpha" }),
  ];

  const result = filterProClubSquadRoster(records, {
    search: "",
    status: "ALL",
    group: "ALL",
  });

  assert.deepEqual(
    result.map((record) => record.playerKey),
    ["jersey-2-a", "jersey-2-b", "jersey-10"],
  );
});

test("counts canonical roster records by GK DEF MID and FWD", () => {
  const records = [
    rosterRecord({ playerKey: "gk", position: "GK" }),
    rosterRecord({ playerKey: "def-1", position: "CB" }),
    rosterRecord({ playerKey: "def-2", position: "RB" }),
    rosterRecord({ playerKey: "mid", position: "AM" }),
    rosterRecord({ playerKey: "fwd-1", position: "LW" }),
    rosterRecord({ playerKey: "fwd-2", position: "ST" }),
  ];

  assert.deepEqual(countProClubSquadRosterByGroup(records), {
    GK: 1,
    DEF: 2,
    MID: 1,
    FWD: 2,
  });
});
