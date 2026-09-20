import assert from "node:assert/strict";
import test from "node:test";
import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository.ts";
import {
  availableProClubStartingXIPlayers,
  buildProClubStartingXIPlayerViews,
  buildProClubStartingXISlotViews,
  filterProClubStartingXIPlayerViews,
} from "../src/components/pro-club/operations/proClubStartingXIViewModel.ts";

function roster(
  playerKey: string,
  jerseyNumber: number,
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
    jerseyNumber,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: "created",
    createdBy: "coach",
    updatedAt: "updated",
    updatedBy: "coach",
    ...overrides,
  };
}

test("view adapter keeps only ACTIVE canonical Pro Club players and preserves unknown position/FUTID labels", () => {
  const result = buildProClubStartingXIPlayerViews([
    roster("player-2", 8),
    roster("player-1", 3, { firstName: "ธีรพล", lastName: "พรหมนุ่น" }),
    roster("released", 9, { status: "RELEASED" }),
  ]);

  assert.deepEqual(result.map((player) => player.playerKey), ["player-1", "player-2"]);
  assert.equal(result[0].positionLabel, "Position not set");
  assert.equal(result[0].futIdLabel, "Not bound");
});

test("slot adapter maps lineup identities into the selected 11v11 formation without inventing position data", () => {
  const players = buildProClubStartingXIPlayerViews([
    roster("player-1", 3),
    roster("player-2", 5),
  ]);
  const slots = buildProClubStartingXISlotViews(
    "4-3-3",
    ["player-1", "player-2", null, null, null, null, null, null, null, null, null],
    players,
  );

  assert.equal(slots.length, 11);
  assert.equal(slots[0].position, "GK");
  assert.equal(slots[0].player?.playerKey, "player-1");
  assert.equal(slots[0].player?.positionLabel, "Position not set");
  assert.equal(slots[1].player?.playerKey, "player-2");
});

test("search supports name, jersey, canonical position and explicit FUTID state", () => {
  const players = buildProClubStartingXIPlayerViews([
    roster("player-1", 3, { firstName: "A", lastName: "One", position: "CB" }),
    roster("player-2", 8, { firstName: "B", lastName: "Two", futId: "FUT-PLAYER-002" }),
  ]);

  assert.deepEqual(filterProClubStartingXIPlayerViews(players, "3").map((p) => p.playerKey), ["player-1"]);
  assert.deepEqual(filterProClubStartingXIPlayerViews(players, "cb").map((p) => p.playerKey), ["player-1"]);
  assert.deepEqual(filterProClubStartingXIPlayerViews(players, "FUT-PLAYER-002").map((p) => p.playerKey), ["player-2"]);
  assert.deepEqual(filterProClubStartingXIPlayerViews(players, "Not bound").map((p) => p.playerKey), ["player-1"]);
});

test("available-player adapter excludes current starters and substitutes", () => {
  const players = buildProClubStartingXIPlayerViews([
    roster("p1", 1),
    roster("p2", 2),
    roster("p3", 3),
    roster("p4", 4),
  ]);

  const result = availableProClubStartingXIPlayers(
    players,
    ["p1", null, "p2"],
    ["p3"],
  );

  assert.deepEqual(result.map((player) => player.playerKey), ["p4"]);
});
