import assert from "node:assert/strict";
import test from "node:test";

const CURRENT_ORGANIZATION = {
  organizationType: "PRO_CLUB",
  organizationId: "club-current",
};

const SPRINT_DEFINITION = {
  id: "football:sprint_10m:v1",
  key: "sprint_10m",
  name: "10 m sprint",
  category: "ACCELERATION",
  measurementMethod: "Timed 10 metre sprint",
  unit: "s",
  direction: "LOWER_IS_BETTER",
  status: "ACTIVE",
  version: 1,
  organization: null,
  origin: "BUILT_IN",
  resultCount: 0,
};

const JUMP_DEFINITION = {
  ...SPRINT_DEFINITION,
  id: "football:vertical_jump:v1",
  key: "vertical_jump",
  name: "Vertical jump",
  category: "POWER",
  measurementMethod: "Measured vertical jump height",
  unit: "cm",
  direction: "HIGHER_IS_BETTER",
};

const ACTIVE_PLAYER = {
  playerKey: "player-a",
  displayLabel: "Alex Active",
  status: "ACTIVE",
};

const INACTIVE_PLAYER = {
  playerKey: "player-b",
  displayLabel: "Indy Inactive",
  status: "INACTIVE",
};

const RELEASED_PLAYER = {
  playerKey: "player-c",
  displayLabel: "Rory Released",
  status: "RELEASED",
};

function makeRecord({
  id = "result-a",
  organization = CURRENT_ORGANIZATION,
  playerKey = ACTIVE_PLAYER.playerKey,
  definition = SPRINT_DEFINITION,
  definitionId = definition.id,
  definitionVersion = definition.version,
  value = 12.4,
  observedOn = "2026-09-20",
  dataPatch = {},
  dataOmit = [],
} = {}) {
  const data: Record<string, unknown> = {
    schemaVersion: 1,
    playerKey,
    definitionId,
    definitionVersion,
    value,
    observedOn,
    source: "PRO_CLUB_FITNESS_ENTRY",
    recordedAt: { toMillis: () => 1789908000000 },
    recordedBy: "coach-1",
    ...dataPatch,
  };
  for (const field of dataOmit) delete data[field];
  return { id, organization, data };
}

function makeInput({
  records = [],
  players = [ACTIVE_PLAYER],
  definitions = [SPRINT_DEFINITION],
  organization = CURRENT_ORGANIZATION,
  referenceDate = "2026-09-23",
} = {}) {
  return { organization, referenceDate, players, definitions, records };
}

async function getSelector() {
  let selectionModule;
  try {
    selectionModule = await import("../src/lib/proClubFitnessWeeklyTrainingRead");
  } catch (error) {
    assert.fail(`pure selection module is unavailable: ${String(error)}`);
  }
  assert.equal(
    typeof selectionModule.selectProClubFitnessWeeklyTrainingReadV1,
    "function",
    "selection module must export the V1 pure selector",
  );
  return selectionModule.selectProClubFitnessWeeklyTrainingReadV1;
}

async function select(input) {
  const selector = await getSelector();
  return selector(input);
}

test("selects observations only for the exact current PRO_CLUB tenant", async () => {
  const result = await select(makeInput({
    records: [
      makeRecord({ id: "same-club-academy", organization: { organizationType: "ACADEMY", organizationId: "club-current" } }),
      makeRecord({ id: "other-club", organization: { organizationType: "PRO_CLUB", organizationId: "club-other" } }),
      makeRecord({ id: "current-club" }),
    ],
  }));

  assert.deepEqual(result.observations.map((observation) => observation.resultId), ["current-club"]);
});

test("includes ACTIVE canonical roster players", async () => {
  const result = await select(makeInput({ records: [makeRecord()] }));
  assert.equal(result.observations[0]?.rosterStatus, "ACTIVE");
});

test("includes INACTIVE canonical roster players", async () => {
  const result = await select(makeInput({
    players: [INACTIVE_PLAYER],
    records: [makeRecord({ playerKey: INACTIVE_PLAYER.playerKey })],
  }));
  assert.equal(result.observations[0]?.playerKey, INACTIVE_PLAYER.playerKey);
  assert.equal(result.observations[0]?.rosterStatus, "INACTIVE");
});

test("excludes RELEASED canonical roster players", async () => {
  const result = await select(makeInput({
    players: [RELEASED_PLAYER],
    records: [makeRecord({ playerKey: RELEASED_PLAYER.playerKey })],
  }));
  assert.deepEqual(result.observations, []);
});

test("excludes observations after the explicit referenceDate", async () => {
  const result = await select(makeInput({
    referenceDate: "2026-09-20",
    records: [makeRecord({ observedOn: "2026-09-21" })],
  }));
  assert.deepEqual(result.observations, []);
});

test("selects the latest observedOn per player and exact definition version", async () => {
  const result = await select(makeInput({
    records: [
      makeRecord({ id: "older", value: 10, observedOn: "2026-09-18" }),
      makeRecord({ id: "newer", value: 11, observedOn: "2026-09-22" }),
    ],
  }));

  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.resultId, "newer");
});

test("keeps different definition versions separate", async () => {
  const versionOne = { ...SPRINT_DEFINITION, id: "custom_test", version: 1 };
  const versionTwo = { ...SPRINT_DEFINITION, id: "custom_test", version: 2 };
  const result = await select(makeInput({
    definitions: [versionOne, versionTwo],
    records: [
      makeRecord({ id: "version-one", definition: versionOne, observedOn: "2026-09-22" }),
      makeRecord({ id: "version-two", definition: versionTwo, observedOn: "2026-09-20" }),
    ],
  }));

  assert.deepEqual(
    result.observations.map((observation) => observation.definitionVersion),
    [1, 2],
  );
});

test("resolves same-day duplicate candidates with the stable ascending result-ID tie-break", async () => {
  const result = await select(makeInput({
    records: [
      makeRecord({ id: "result-z", value: 99 }),
      makeRecord({ id: "result-a", value: 10 }),
    ],
  }));

  assert.equal(result.observations[0]?.resultId, "result-a");
});

test("returns the same selection regardless of input array order", async () => {
  const records = [
    makeRecord({ id: "older", observedOn: "2026-09-18" }),
    makeRecord({ id: "tie-z", observedOn: "2026-09-22", value: 20 }),
    makeRecord({ id: "tie-a", observedOn: "2026-09-22", value: 18 }),
    makeRecord({ id: "future", observedOn: "2026-09-24", value: 1 }),
  ];

  assert.deepEqual(
    await select(makeInput({ records })),
    await select(makeInput({ records: [...records].reverse() })),
  );
});

test("omits results with an unknown definition ID or version", async () => {
  const result = await select(makeInput({
    records: [
      makeRecord({ id: "unknown-id", definitionId: "unknown-test:v1" }),
      makeRecord({ id: "unknown-version", definitionVersion: 2 }),
    ],
  }));
  assert.deepEqual(result.observations, []);
});

test("omits malformed persisted results fail-closed", async () => {
  const result = await select(makeInput({
    records: [
      makeRecord({ id: "invalid-date", observedOn: "2026-02-30" }),
      makeRecord({ id: "invalid-value", value: Number.NaN }),
      makeRecord({ id: "invalid-version-contract", dataPatch: { schemaVersion: 2 } }),
      makeRecord({ id: "invalid-source-contract", dataPatch: { source: "OTHER" } }),
      { id: "missing-data", organization: CURRENT_ORGANIZATION, data: null },
    ],
  }));
  assert.deepEqual(result.observations, []);
});

test("keeps multiple test definitions for the same player separate", async () => {
  const result = await select(makeInput({
    definitions: [SPRINT_DEFINITION, JUMP_DEFINITION],
    records: [
      makeRecord({ id: "sprint", definition: SPRINT_DEFINITION, value: 12.4 }),
      makeRecord({ id: "jump", definition: JUMP_DEFINITION, value: 42 }),
    ],
  }));
  assert.deepEqual(
    result.observations.map((observation) => observation.definitionId).sort(),
    [SPRINT_DEFINITION.id, JUMP_DEFINITION.id].sort(),
  );
});

test("keeps multiple eligible players separate", async () => {
  const result = await select(makeInput({
    players: [ACTIVE_PLAYER, INACTIVE_PLAYER],
    records: [
      makeRecord({ id: "player-a-result", playerKey: ACTIVE_PLAYER.playerKey }),
      makeRecord({ id: "player-b-result", playerKey: INACTIVE_PLAYER.playerKey }),
    ],
  }));
  assert.deepEqual(
    result.observations.map((observation) => observation.playerKey).sort(),
    [ACTIVE_PLAYER.playerKey, INACTIVE_PLAYER.playerKey].sort(),
  );
});

test("does not average observations and retains the selected stored value", async () => {
  const result = await select(makeInput({
    records: [
      makeRecord({ id: "older", observedOn: "2026-09-18", value: 10 }),
      makeRecord({ id: "newer", observedOn: "2026-09-22", value: 20 }),
    ],
  }));
  assert.equal(result.observations[0]?.value, 20);
});

test("does not expose a readiness score", async () => {
  const result = await select(makeInput({ records: [makeRecord()] }));
  assert.equal("readiness" in result, false);
  assert.equal("readinessScore" in result, false);
  assert.equal("score" in result, false);
});

test("does not infer medical or injury status", async () => {
  const result = await select(makeInput({ records: [makeRecord()] }));
  const outputKeys = Object.keys(result).join(" ").toLowerCase();
  const observationKeys = Object.keys(result.observations[0] ?? {}).join(" ").toLowerCase();
  assert.doesNotMatch(`${outputKeys} ${observationKeys}`, /medical|injury|health|return.?to.?play/);
});

test("does not auto-create a training prescription", async () => {
  const result = await select(makeInput({ records: [makeRecord()] }));
  assert.equal(result.prescription, null);
});

test("explicitly retains prescription as null", async () => {
  const result = await select(makeInput({ records: [] }));
  assert.equal(result.prescription, null);
});

test("returns NO_DATA for zero valid observations without placeholders", async () => {
  const result = await select(makeInput({ records: [] }));
  assert.equal(result.state, "NO_DATA");
  assert.deepEqual(result.observations, []);
});

test("keeps observedOn available as the factual observation date", async () => {
  const result = await select(makeInput({
    records: [makeRecord({ observedOn: "2026-09-20" })],
  }));
  assert.equal(result.observations[0]?.observedOn, "2026-09-20");
});

test("uses no current clock inside the pure selection policy", async () => {
  const selector = await getSelector();
  const NativeDate = globalThis.Date;
  globalThis.Date = new Proxy(NativeDate, {
    construct(target, args) {
      if (args.length === 0) throw new Error("current clock access is forbidden");
      return Reflect.construct(target, args);
    },
    get(target, property, receiver) {
      if (property === "now") {
        return () => {
          throw new Error("current clock access is forbidden");
        };
      }
      return Reflect.get(target, property, receiver);
    },
  }) as DateConstructor;

  try {
    const result = selector(makeInput({ records: [makeRecord()] }));
    assert.equal(result.observations[0]?.observedOn, "2026-09-20");
  } finally {
    globalThis.Date = NativeDate;
  }
});

test("omits persisted results that are missing recordedAt", async () => {
  const result = await select(makeInput({
    records: [makeRecord({ dataOmit: ["recordedAt"] })],
  }));
  assert.deepEqual(result.observations, []);
});

test("omits persisted results with malformed recordedAt values", async () => {
  const result = await select(makeInput({
    records: [
      makeRecord({ id: "non-callable", dataPatch: { recordedAt: { toMillis: "no" } } }),
      makeRecord({ id: "non-finite", dataPatch: { recordedAt: { toMillis: () => Number.NaN } } }),
      makeRecord({ id: "throws", dataPatch: { recordedAt: { toMillis: () => { throw new Error("bad timestamp"); } } } }),
    ],
  }));
  assert.deepEqual(result.observations, []);
});

test("omits persisted results that are missing recordedBy", async () => {
  const result = await select(makeInput({
    records: [makeRecord({ dataOmit: ["recordedBy"] })],
  }));
  assert.deepEqual(result.observations, []);
});

test("omits persisted results with an invalid recordedBy identifier", async () => {
  const result = await select(makeInput({
    records: [makeRecord({ dataPatch: { recordedBy: "coach/child" } })],
  }));
  assert.deepEqual(result.observations, []);
});

test("omits persisted results with unknown stored fields", async () => {
  const result = await select(makeInput({
    records: [makeRecord({ dataPatch: { unexpectedField: "not part of V1" } })],
  }));
  assert.deepEqual(result.observations, []);
});

test("accepts a valid Timestamp-like recordedAt value", async () => {
  const result = await select(makeInput({
    records: [makeRecord({
      id: "timestamp-like",
      dataPatch: { recordedAt: { toMillis: () => 1789908000000 } },
    })],
  }));
  assert.equal(result.observations[0]?.resultId, "timestamp-like");
});
