import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../src/lib/fitnessTestFoundation";
import {
  PRO_CLUB_FITNESS_RESULT_SOURCE,
  prepareProClubFitnessResultDrafts,
  proClubFitnessResultDocumentIdV1,
  selectProClubFitnessResultHistory,
  selectProClubFitnessResultsForDate,
  validateProClubFitnessResultCreateInput,
} from "../src/lib/proClubFitnessResult";

const validInput = {
  playerKey: "player-key-a",
  definitionId: "football:speed_10m:v1",
  definitionVersion: 1,
  value: 1.82,
  observedOn: "2026-09-24",
};

test("validates a canonical Pro Club Fitness result payload with shared date semantics", () => {
  const result = validateProClubFitnessResultCreateInput(validInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, {
    schemaVersion: 1,
    ...validInput,
    source: PRO_CLUB_FITNESS_RESULT_SOURCE,
  });
});

test("rejects malformed identity, definition, version, value, date, and non-exact input keys", () => {
  const invalidInputs = [
    { ...validInput, playerKey: " player-key-a" },
    { ...validInput, definitionId: " football:speed_10m:v1" },
    { ...validInput, definitionId: "football/speed_10m" },
    { ...validInput, definitionVersion: 0 },
    { ...validInput, definitionVersion: 1.5 },
    { ...validInput, value: Number.NaN },
    { ...validInput, value: Number.POSITIVE_INFINITY },
    { ...validInput, observedOn: "2026-02-29" },
    { ...validInput, recordedBy: "caller-selected" },
  ];

  for (const input of invalidInputs) {
    assert.equal(validateProClubFitnessResultCreateInput(input).ok, false);
  }
});

test("prepares only unsaved observations for ACTIVE and INACTIVE roster players", () => {
  const prepared = prepareProClubFitnessResultDrafts({
    observedOn: "2026-09-24",
    players: [
      { playerKey: "player-active", status: "ACTIVE" },
      { playerKey: "player-inactive", status: "INACTIVE" },
      { playerKey: "player-released", status: "RELEASED" },
    ],
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    drafts: {
      "player-active": { speed_10m: "1.82" },
      "player-inactive": { vertical_jump: "43" },
    },
    saved: {},
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.deepEqual(prepared.entries.map(({ playerKey, definitionKey, input }) => ({
    playerKey,
    definitionKey,
    value: input.value,
  })), [
    { playerKey: "player-active", definitionKey: "speed_10m", value: 1.82 },
    { playerKey: "player-inactive", definitionKey: "vertical_jump", value: 43 },
  ]);
});

test("rejects released-player drafts and values for already saved cells", () => {
  const released = prepareProClubFitnessResultDrafts({
    observedOn: "2026-09-24",
    players: [{ playerKey: "player-released", status: "RELEASED" }],
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    drafts: { "player-released": { speed_10m: "1.82" } },
    saved: {},
  });
  assert.equal(released.ok, false);

  const saved = prepareProClubFitnessResultDrafts({
    observedOn: "2026-09-24",
    players: [{ playerKey: "player-active", status: "ACTIVE" }],
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    drafts: { "player-active": { speed_10m: "1.80" } },
    saved: { "player-active": { speed_10m: 1.82 } },
  });
  assert.equal(saved.ok, false);
});

test("uses the Rules-compatible length-prefixed UTF-8 deterministic identity", async () => {
  const seed = "fitness-result-v1|12:player-key-a|2026-09-24|21:football:speed_10m:v1|1";
  const expected = `fit-v1-${createHash("sha256").update(seed, "utf8").digest("hex")}`;

  assert.equal(await proClubFitnessResultDocumentIdV1(validInput), expected);
  assert.notEqual(
    await proClubFitnessResultDocumentIdV1({ ...validInput, observedOn: "2026-09-25" }),
    expected,
  );
  assert.notEqual(
    await proClubFitnessResultDocumentIdV1({ ...validInput, definitionVersion: 2 }),
    expected,
  );
});

test("selects persisted date results and orders player history by date then stable ID", () => {
  const records = [
    { id: "result-b", data: { schemaVersion: 1, playerKey: "player-key-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.9, observedOn: "2026-09-24", source: PRO_CLUB_FITNESS_RESULT_SOURCE } },
    { id: "result-a", data: { schemaVersion: 1, playerKey: "player-key-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.8, observedOn: "2026-09-24", source: PRO_CLUB_FITNESS_RESULT_SOURCE } },
    { id: "result-old", data: { schemaVersion: 1, playerKey: "player-key-a", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 2.0, observedOn: "2026-09-20", source: PRO_CLUB_FITNESS_RESULT_SOURCE } },
    { id: "wrong-player", data: { schemaVersion: 1, playerKey: "player-key-b", definitionId: "football:speed_10m:v1", definitionVersion: 1, value: 1.7, observedOn: "2026-09-24", source: PRO_CLUB_FITNESS_RESULT_SOURCE } },
  ];

  assert.deepEqual(
    selectProClubFitnessResultsForDate({
      observedOn: "2026-09-24",
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
      records,
    }),
    { "player-key-a": { speed_10m: 1.9 }, "player-key-b": { speed_10m: 1.7 } },
  );

  assert.deepEqual(
    selectProClubFitnessResultHistory({
      playerKey: "player-key-a",
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
      records,
    }).map(({ id, observedOn }) => ({ id, observedOn })),
    [
      { id: "result-a", observedOn: "2026-09-24" },
      { id: "result-b", observedOn: "2026-09-24" },
      { id: "result-old", observedOn: "2026-09-20" },
    ],
  );
});
