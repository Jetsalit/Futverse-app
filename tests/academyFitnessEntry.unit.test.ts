import assert from "node:assert/strict";
import test from "node:test";

import * as resultModel from "../src/lib/academyFitnessResult.ts";
import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../src/lib/fitnessTestFoundation.ts";

const prepare = (resultModel as typeof resultModel & {
  prepareAcademyFitnessResultDrafts?: (input: unknown) => unknown;
}).prepareAcademyFitnessResultDrafts;
const selectSaved = (resultModel as typeof resultModel & {
  selectAcademyFitnessResultsForDate?: (input: unknown) => unknown;
}).selectAcademyFitnessResultsForDate;
const selectHistory = (resultModel as typeof resultModel & {
  selectAcademyFitnessHistory?: (input: unknown) => unknown;
}).selectAcademyFitnessHistory;

test("prepares only entered built-in observations with their definition versions", () => {
  const result = prepare?.({
    observedOn: "2026-09-24",
    playerIds: ["player-a", "player-b"],
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    drafts: {
      "player-a": { speed_10m: "1.82", vertical_jump: "" },
      "player-b": { speed_10m: "0", agility_505: "2.45" },
    },
    saved: {},
  });

  assert.deepEqual(result, {
    ok: true,
    entries: [
      {
        playerId: "player-a",
        definitionKey: "speed_10m",
        input: {
          playerId: "player-a",
          definitionId: "football:speed_10m:v1",
          definitionVersion: 1,
          value: 1.82,
          observedOn: "2026-09-24",
        },
      },
      {
        playerId: "player-b",
        definitionKey: "speed_10m",
        input: {
          playerId: "player-b",
          definitionId: "football:speed_10m:v1",
          definitionVersion: 1,
          value: 0,
          observedOn: "2026-09-24",
        },
      },
      {
        playerId: "player-b",
        definitionKey: "agility_505",
        input: {
          playerId: "player-b",
          definitionId: "football:agility_505:v1",
          definitionVersion: 1,
          value: 2.45,
          observedOn: "2026-09-24",
        },
      },
    ],
  });
});

test("rejects invalid numeric entries and an occupied player-test cell before writing", () => {
  const result = prepare?.({
    observedOn: "2026-09-24",
    playerIds: ["player-a"],
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    drafts: { "player-a": { speed_10m: "1e309", vertical_jump: "45" } },
    saved: { "player-a": { vertical_jump: 43 } },
  });

  assert.equal((result as { ok?: boolean } | undefined)?.ok, false);
  assert.match(JSON.stringify(result), /speed_10m/);
  assert.match(JSON.stringify(result), /vertical_jump/);
});

test("ignores no entered values and rejects a stale player or definition", () => {
  assert.deepEqual(prepare?.({
    observedOn: "2026-09-24",
    playerIds: ["player-a"],
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    drafts: { "player-a": { speed_10m: "" } },
    saved: {},
  }), { ok: true, entries: [] });

  const stale = prepare?.({
    observedOn: "2026-09-24",
    playerIds: ["player-a"],
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    drafts: { "player-b": { speed_10m: "1.8" }, "player-a": { missing_test: "2" } },
    saved: {},
  });
  assert.equal((stale as { ok?: boolean } | undefined)?.ok, false);
});

test("shows the latest valid stored observation for the selected date and definition version", () => {
  const result = selectSaved?.({
    observedOn: "2026-09-24",
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    records: [
      { id: "old", data: { schemaVersion: 1, playerId: "player-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.9, observedOn: "2026-09-24", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T08:00:00Z") } },
      { id: "new", data: { schemaVersion: 1, playerId: "player-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.82, observedOn: "2026-09-24", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T09:00:00Z") } },
      { id: "other-date", data: { schemaVersion: 1, playerId: "player-a", definitionId: "football:vertical_jump:v1", definitionVersion: 1, value: 45, observedOn: "2026-09-23", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T09:00:00Z") } },
      { id: "wrong-version", data: { schemaVersion: 1, playerId: "player-b", definitionId: "football:speed_10m:v1", definitionVersion: 2, value: 1.7, observedOn: "2026-09-24", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T09:00:00Z") } },
    ],
  });
  assert.deepEqual(result, { "player-a": { speed_10m: 1.82 } });
});

test("returns immutable persisted observations as the selected player's dated history", () => {
  const result = selectHistory?.({
    playerId: "player-a",
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    records: [
      { id: "speed-old", data: { schemaVersion: 1, playerId: "player-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.9, observedOn: "2026-09-20", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-20T08:00:00Z") } },
      { id: "jump", data: { schemaVersion: 1, playerId: "player-a", definitionId: "football:vertical_jump:v1", definitionVersion: 1, value: 43, observedOn: "2026-09-24", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T08:00:00Z") } },
      { id: "speed-new", data: { schemaVersion: 1, playerId: "player-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.82, observedOn: "2026-09-24", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T09:00:00Z") } },
      { id: "other-player", data: { schemaVersion: 1, playerId: "player-b", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.7, observedOn: "2026-09-24", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T10:00:00Z") } },
      { id: "invalid-date", data: { schemaVersion: 1, playerId: "player-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.6, observedOn: "2026-02-29", source: "ACADEMY_BULK_ENTRY", recordedAt: new Date("2026-09-24T11:00:00Z") } },
    ],
  });

  assert.deepEqual(result, [
    { id: "speed-new", playerId: "player-a", observedOn: "2026-09-24", definitionKey: "speed_10m", definitionName: "10 m sprint", value: 1.82, unit: "s" },
    { id: "jump", playerId: "player-a", observedOn: "2026-09-24", definitionKey: "vertical_jump", definitionName: "Vertical jump", value: 43, unit: "cm" },
    { id: "speed-old", playerId: "player-a", observedOn: "2026-09-20", definitionKey: "speed_10m", definitionName: "10 m sprint", value: 1.9, unit: "s" },
  ]);
});
