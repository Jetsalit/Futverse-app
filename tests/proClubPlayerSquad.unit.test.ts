import assert from "node:assert/strict";
import test from "node:test";

import {
  PRO_CLUB_PLAYER_SHIRT_NUMBER_MAX,
  PRO_CLUB_PLAYER_SHIRT_NUMBER_MIN,
  PRO_CLUB_PLAYER_SQUAD_LABEL_MAX_LENGTH,
  PRO_CLUB_PLAYER_SQUAD_SCHEMA_VERSION,
  PRO_CLUB_PLAYER_SQUAD_STATUSES,
  isAllowedProClubPlayerSquadTransition,
  isCanonicalIsoUtcTimestamp,
  isProClubPlayerSquadStatus,
  isValidInitialProClubPlayerSquadStatus,
  isValidProClubPlayerShirtNumber,
  isValidProClubPlayerSquadContext,
  isValidProClubPlayerSquadLabel,
  validateProClubPlayerSquadRecord,
} from "../src/lib/proClubPlayerSquad";

const context = {
  clubId: "club-a",
  proPlayerId: "pro-player-1",
};

const activeRecord = {
  schemaVersion: 1,
  status: "ACTIVE",
  squadLabel: "First Team",
  shirtNumber: 10,
  joinedAt: "2026-09-11T00:00:00.000Z",
  releasedAt: null,
  createdBy: "admin-1",
  updatedBy: "admin-1",
};

test("1. canonical constants are frozen to V1 contract", () => {
  assert.equal(PRO_CLUB_PLAYER_SQUAD_SCHEMA_VERSION, 1);
  assert.deepEqual(PRO_CLUB_PLAYER_SQUAD_STATUSES, ["ACTIVE", "INACTIVE", "RELEASED"]);
  assert.equal(Object.isFrozen(PRO_CLUB_PLAYER_SQUAD_STATUSES), true);
  assert.equal(PRO_CLUB_PLAYER_SQUAD_LABEL_MAX_LENGTH, 80);
  assert.equal(PRO_CLUB_PLAYER_SHIRT_NUMBER_MIN, 1);
  assert.equal(PRO_CLUB_PLAYER_SHIRT_NUMBER_MAX, 99);
});

test("2. status validator is exact and default-deny", () => {
  for (const status of PRO_CLUB_PLAYER_SQUAD_STATUSES) {
    assert.equal(isProClubPlayerSquadStatus(status), true);
  }
  for (const value of ["active", " ACTIVE", "LEFT", "SUSPENDED", "", null, 1]) {
    assert.equal(isProClubPlayerSquadStatus(value), false);
  }
});

test("3. exact identity context rejects malformed and unknown fields", () => {
  assert.equal(isValidProClubPlayerSquadContext(context), true);
  assert.equal(isValidProClubPlayerSquadContext({ ...context, clubId: "bad/club" }), false);
  assert.equal(isValidProClubPlayerSquadContext({ ...context, proPlayerId: " player" }), false);
  assert.equal(isValidProClubPlayerSquadContext({ ...context, futId: "FUT-1" }), false);
  assert.equal(isValidProClubPlayerSquadContext({ clubId: "club-a" }), false);
});

test("4. squad label is exact trimmed text or null", () => {
  assert.equal(isValidProClubPlayerSquadLabel(null), true);
  assert.equal(isValidProClubPlayerSquadLabel("First Team"), true);
  assert.equal(isValidProClubPlayerSquadLabel(""), false);
  assert.equal(isValidProClubPlayerSquadLabel(" First Team"), false);
  assert.equal(isValidProClubPlayerSquadLabel("x".repeat(80)), true);
  assert.equal(isValidProClubPlayerSquadLabel("x".repeat(81)), false);
});

test("5. shirt number accepts only null or integer 1 through 99", () => {
  for (const valid of [null, 1, 10, 99]) {
    assert.equal(isValidProClubPlayerShirtNumber(valid), true);
  }
  for (const invalid of [0, 100, -1, 1.5, "10", undefined]) {
    assert.equal(isValidProClubPlayerShirtNumber(invalid), false);
  }
});

test("6. canonical UTC timestamp validator rejects normalization and invalid dates", () => {
  assert.equal(isCanonicalIsoUtcTimestamp("2026-09-11T00:00:00.000Z"), true);
  assert.equal(isCanonicalIsoUtcTimestamp("2026-09-11T00:00:00Z"), false);
  assert.equal(isCanonicalIsoUtcTimestamp("2026-09-11T07:00:00+07:00"), false);
  assert.equal(isCanonicalIsoUtcTimestamp("2026-02-30T00:00:00.000Z"), false);
  assert.equal(isCanonicalIsoUtcTimestamp("not-a-date"), false);
});

test("7. lifecycle transition matrix is exact and RELEASED terminal", () => {
  const allowed = new Set([
    "ACTIVE->INACTIVE",
    "ACTIVE->RELEASED",
    "INACTIVE->ACTIVE",
    "INACTIVE->RELEASED",
  ]);

  for (const from of PRO_CLUB_PLAYER_SQUAD_STATUSES) {
    for (const to of PRO_CLUB_PLAYER_SQUAD_STATUSES) {
      assert.equal(
        isAllowedProClubPlayerSquadTransition(from, to),
        allowed.has(`${from}->${to}`),
        `${from}->${to}`,
      );
    }
  }

  assert.equal(isAllowedProClubPlayerSquadTransition("LEFT", "ACTIVE"), false);
});

test("8. initial JOIN status is ACTIVE only", () => {
  assert.equal(isValidInitialProClubPlayerSquadStatus("ACTIVE"), true);
  assert.equal(isValidInitialProClubPlayerSquadStatus("INACTIVE"), false);
  assert.equal(isValidInitialProClubPlayerSquadStatus("RELEASED"), false);
});

test("9. valid ACTIVE record returns a fresh exact payload without identity fields", () => {
  const result = validateProClubPlayerSquadRecord(activeRecord, context);
  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.deepEqual(result.value, activeRecord);
  assert.notEqual(result.value, activeRecord);
  assert.deepEqual(Object.keys(result.value).sort(), [
    "createdBy",
    "joinedAt",
    "releasedAt",
    "schemaVersion",
    "shirtNumber",
    "squadLabel",
    "status",
    "updatedBy",
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "clubId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "proPlayerId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "futId"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.value, "playerKey"), false);
});

test("10. unknown payload fields fail closed rather than being silently dropped", () => {
  const result = validateProClubPlayerSquadRecord(
    { ...activeRecord, name: "Duplicated Profile", futId: "FUT-1" },
    context,
  );
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.ok(result.errors.includes("Player Squad record contains unknown fields."));
});

test("11. non-released records require releasedAt null", () => {
  const result = validateProClubPlayerSquadRecord(
    { ...activeRecord, releasedAt: "2026-09-12T00:00:00.000Z" },
    context,
  );
  assert.equal(result.valid, false);
});

test("12. RELEASED requires canonical release time not earlier than join", () => {
  const valid = validateProClubPlayerSquadRecord(
    {
      ...activeRecord,
      status: "RELEASED",
      releasedAt: "2026-09-12T00:00:00.000Z",
      updatedBy: "admin-2",
    },
    context,
  );
  assert.equal(valid.valid, true);

  const missing = validateProClubPlayerSquadRecord(
    { ...activeRecord, status: "RELEASED", releasedAt: null },
    context,
  );
  assert.equal(missing.valid, false);

  const beforeJoin = validateProClubPlayerSquadRecord(
    {
      ...activeRecord,
      status: "RELEASED",
      releasedAt: "2026-09-10T23:59:59.999Z",
    },
    context,
  );
  assert.equal(beforeJoin.valid, false);
});

test("13. actor attribution fields are validated as identifiers but do not add authority", () => {
  const invalidCreated = validateProClubPlayerSquadRecord(
    { ...activeRecord, createdBy: "bad/uid" },
    context,
  );
  assert.equal(invalidCreated.valid, false);

  const invalidUpdated = validateProClubPlayerSquadRecord(
    { ...activeRecord, updatedBy: " user-1" },
    context,
  );
  assert.equal(invalidUpdated.valid, false);
});

test("14. malformed record and malformed context return explicit validation failure", () => {
  assert.equal(validateProClubPlayerSquadRecord(null, context).valid, false);
  assert.equal(
    validateProClubPlayerSquadRecord(activeRecord, { clubId: "club-a", proPlayerId: "bad/player" }).valid,
    false,
  );
});
