import assert from "node:assert/strict";
import test from "node:test";

import {
  FOOTBALL_FITNESS_TEST_CATALOGUE,
  archiveFitnessTestDefinition,
  buildFitnessTrainingConnection,
  createFitnessTestDefinition,
  deleteFitnessTestDefinition,
  editFitnessTestDefinition,
  fitnessDefinitionBelongsToOrganization,
  type FitnessOrganizationRef,
} from "../src/lib/fitnessTestFoundation.ts";

const academy: FitnessOrganizationRef = {
  organizationType: "ACADEMY",
  organizationId: "academy-a",
};

test("shared football catalogue covers the existing Academy metrics without invented thresholds", () => {
  const keys = FOOTBALL_FITNESS_TEST_CATALOGUE.map(({ key }) => key);
  assert.deepEqual(keys, [
    "yoyo_level",
    "speed_10m",
    "speed_30m",
    "vertical_jump",
    "agility_505",
  ]);
  assert.equal(
    FOOTBALL_FITNESS_TEST_CATALOGUE.some((definition) => "normativeThreshold" in definition),
    false,
  );
});

test("organization-scoped definitions can be created, metadata-edited, and archived", () => {
  const created = createFitnessTestDefinition(academy, {
    key: "academy-a-repeat-sprint",
    name: "Repeated sprint ability",
    category: "SPEED",
    measurementMethod: "Best total time across the configured repeated-sprint protocol",
    unit: "s",
    direction: "LOWER_IS_BETTER",
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.definition.status, "DRAFT");
  assert.equal(fitnessDefinitionBelongsToOrganization(created.definition, academy), true);
  assert.equal(
    fitnessDefinitionBelongsToOrganization(created.definition, {
      organizationType: "ACADEMY",
      organizationId: "academy-b",
    }),
    false,
  );

  const edited = editFitnessTestDefinition(academy, created.definition, {
    name: "Repeated sprint test",
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.kind, "UPDATED");
  assert.equal(edited.definition.name, "Repeated sprint test");
  assert.equal(edited.definition.version, 1);

  const archived = archiveFitnessTestDefinition(academy, edited.definition);
  assert.equal(archived.ok, true);
  if (archived.ok) assert.equal(archived.definition.status, "ARCHIVED");
});

test("measurement semantic changes version definitions that already have history", () => {
  const created = createFitnessTestDefinition(academy, {
    key: "academy-a-10m-sprint",
    name: "10 m sprint",
    category: "ACCELERATION",
    measurementMethod: "Best configured 10 metre sprint time",
    unit: "s",
    direction: "LOWER_IS_BETTER",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const current = {
    ...created.definition,
    status: "ACTIVE" as const,
    resultCount: 4,
  };
  const edited = editFitnessTestDefinition(academy, current, {
    unit: "ms",
    measurementMethod: "Electronic timing gates measured in milliseconds",
  });

  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.kind, "VERSIONED");
  assert.equal(edited.previous.status, "ARCHIVED");
  assert.equal(edited.previous.unit, "s");
  assert.equal(edited.definition.version, 2);
  assert.equal(edited.definition.unit, "ms");
  assert.equal(edited.definition.supersedesDefinitionId, current.id);
});

test("delete is draft-only and refuses definitions with results", () => {
  const created = createFitnessTestDefinition(academy, {
    key: "academy-a-cod",
    name: "Change of direction drill",
    category: "AGILITY",
    measurementMethod: "Configured course completion time",
    unit: "s",
    direction: "LOWER_IS_BETTER",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(deleteFitnessTestDefinition(academy, created.definition), {
    ok: true,
    deletedDefinitionId: created.definition.id,
  });
  assert.equal(
    deleteFitnessTestDefinition(academy, { ...created.definition, status: "ACTIVE" }).ok,
    false,
  );
  assert.equal(
    deleteFitnessTestDefinition(academy, { ...created.definition, resultCount: 1 }).ok,
    false,
  );
});

test("mutation helpers reject shared built-ins and definitions owned by another organization", () => {
  const otherAcademy: FitnessOrganizationRef = {
    organizationType: "ACADEMY",
    organizationId: "academy-b",
  };
  const created = createFitnessTestDefinition(otherAcademy, {
    key: "academy-b-repeat-sprint",
    name: "Repeated sprint ability",
    category: "SPEED",
    measurementMethod: "Configured repeated-sprint protocol total time",
    unit: "s",
    direction: "LOWER_IS_BETTER",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  assert.deepEqual(
    editFitnessTestDefinition(academy, created.definition, { name: "Foreign edit" }),
    { ok: false, reason: "NOT_OWNED" },
  );
  assert.deepEqual(archiveFitnessTestDefinition(academy, created.definition), {
    ok: false,
    reason: "NOT_OWNED",
  });
  assert.deepEqual(deleteFitnessTestDefinition(academy, created.definition), {
    ok: false,
    reason: "NOT_OWNED",
  });

  const builtIn = FOOTBALL_FITNESS_TEST_CATALOGUE[0];
  assert.deepEqual(
    editFitnessTestDefinition(academy, builtIn, { name: "Organization override" }),
    { ok: false, reason: "NOT_OWNED" },
  );
  assert.deepEqual(archiveFitnessTestDefinition(academy, builtIn), {
    ok: false,
    reason: "NOT_OWNED",
  });
  assert.deepEqual(deleteFitnessTestDefinition(academy, builtIn), {
    ok: false,
    reason: "NOT_OWNED",
  });
});

test("training connection is an explicit no-data boundary and snapshots result semantics", () => {
  const empty = buildFitnessTrainingConnection({
    organization: academy,
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    results: [],
  });
  assert.deepEqual(empty, {
    state: "NO_DATA",
    organization: academy,
    observations: [],
    prescription: null,
  });

  const definition = FOOTBALL_FITNESS_TEST_CATALOGUE[1];
  const available = buildFitnessTrainingConnection({
    organization: academy,
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    results: [{
      id: "result-1",
      organization: academy,
      playerId: "player-a",
      definitionId: definition.id,
      definitionVersion: definition.version,
      value: 1.82,
      recordedAt: "2026-09-22T10:00:00+07:00",
    }],
  });

  assert.equal(available.state, "AVAILABLE");
  assert.equal(available.observations[0]?.unit, "s");
  assert.equal(available.observations[0]?.measurementMethod, definition.measurementMethod);
  assert.equal(available.prescription, null);

  const isolated = buildFitnessTrainingConnection({
    organization: academy,
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
    results: [{
      id: "result-from-another-tenant",
      organization: { organizationType: "ACADEMY", organizationId: "academy-b" },
      playerId: "player-b",
      definitionId: definition.id,
      definitionVersion: definition.version,
      value: 1.71,
      recordedAt: "2026-09-22T10:00:00+07:00",
    }],
  });
  assert.equal(isolated.state, "NO_DATA");
});
