import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ACADEMY_FITNESS_RESULTS_COLLECTION,
  ACADEMY_FITNESS_RESULT_SCHEMA_VERSION,
  ACADEMY_FITNESS_RESULT_SOURCE,
  isExactFitnessDefinitionId,
  isFiniteFitnessResultValue,
  isStrictAcademyFitnessObservedOn,
  isValidFitnessDefinitionVersion,
  validateAcademyFitnessResultCreateInput,
} from "../src/lib/academyFitnessResult.ts";

const validInput = {
  playerId: "player-a",
  definitionId: "football:speed_10m:v1",
  definitionVersion: 1,
  value: 1.82,
  observedOn: "2026-09-24",
};

test("Academy Fitness result V1 uses the dedicated canonical collection contract", () => {
  assert.equal(
    ACADEMY_FITNESS_RESULTS_COLLECTION,
    "fitnessResults",
  );
  assert.equal(
    ACADEMY_FITNESS_RESULT_SCHEMA_VERSION,
    1,
  );
  assert.equal(
    ACADEMY_FITNESS_RESULT_SOURCE,
    "ACADEMY_BULK_ENTRY",
  );
});

test("validates one exact immutable Fitness observation payload", () => {
  const result =
    validateAcademyFitnessResultCreateInput(
      validInput,
    );

  assert.deepEqual(result, {
    ok: true,
    value: {
      schemaVersion: 1,
      playerId: "player-a",
      definitionId: "football:speed_10m:v1",
      definitionVersion: 1,
      value: 1.82,
      observedOn: "2026-09-24",
      source: "ACADEMY_BULK_ENTRY",
    },
  });
});

test("rejects unknown or missing client fields", () => {
  assert.equal(
    validateAcademyFitnessResultCreateInput({
      ...validInput,
      recordedBy: "coach-a",
    }).ok,
    false,
  );

  const {
    value: _removed,
    ...missingValue
  } = validInput;

  assert.equal(
    validateAcademyFitnessResultCreateInput(
      missingValue,
    ).ok,
    false,
  );
});

test("rejects malformed player and definition identifiers", () => {
  for (const playerId of [
    "",
    " player-a",
    "player-a ",
    "players/player-a",
  ]) {
    assert.equal(
      validateAcademyFitnessResultCreateInput({
        ...validInput,
        playerId,
      }).ok,
      false,
    );
  }

  for (const definitionId of [
    "",
    " football:speed_10m:v1",
    "football/speed_10m/v1",
  ]) {
    assert.equal(
      isExactFitnessDefinitionId(
        definitionId,
      ),
      false,
    );
  }
});

test("requires a positive integer definition version", () => {
  for (const value of [
    0,
    -1,
    1.5,
    Number.NaN,
    "1",
  ]) {
    assert.equal(
      isValidFitnessDefinitionVersion(
        value,
      ),
      false,
    );
  }

  assert.equal(
    isValidFitnessDefinitionVersion(1),
    true,
  );
});

test("accepts finite numeric observations without inventing test thresholds", () => {
  assert.equal(
    isFiniteFitnessResultValue(0),
    true,
  );
  assert.equal(
    isFiniteFitnessResultValue(-1),
    true,
  );
  assert.equal(
    isFiniteFitnessResultValue(12.34),
    true,
  );

  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    "12.34",
  ]) {
    assert.equal(
      isFiniteFitnessResultValue(value),
      false,
    );
  }
});

test("requires a real canonical observed-on calendar date", () => {
  assert.equal(
    isStrictAcademyFitnessObservedOn(
      "2026-09-24",
    ),
    true,
  );
  assert.equal(
    isStrictAcademyFitnessObservedOn(
      "2024-02-29",
    ),
    true,
  );

  for (const value of [
    "2026-02-29",
    "2026-09-31",
    "24-09-2026",
    "2026-9-24",
    "",
  ]) {
    assert.equal(
      isStrictAcademyFitnessObservedOn(
        value,
      ),
      false,
    );
  }
});

test("domain foundation contains no Firebase persistence or client-side authority promotion", () => {
  const repoRoot =
    path.resolve(
      path.dirname(
        fileURLToPath(import.meta.url),
      ),
      "..",
    );

  const source =
    readFileSync(
      path.join(
        repoRoot,
        "src/lib/academyFitnessResult.ts",
      ),
      "utf8",
    );

  assert.doesNotMatch(
    source,
    /firebase|firestore|setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction/,
  );

  assert.doesNotMatch(
    source,
    /membershipRole\s*=|FITNESS_COACH.*TenantRole/,
  );
});