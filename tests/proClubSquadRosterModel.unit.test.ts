import test from "node:test";
import assert from "node:assert/strict";

import {
  canBindProClubRosterFutId,
  canTransitionProClubSquadRosterStatus,
  validateProClubSquadRosterFootballInput,
} from "../src/lib/proClubSquadRoster";

const validInput = {
  futId: "FUT-PLAYER-001",
  firstName: "Max",
  lastName: "Coach",
  position: "CM",
  additionalPositions: ["DM", "AM"],
  jerseyNumber: 8,
  squadLabel: "First Team",
  status: "ACTIVE",
} as const;

test("accepts a canonical Pro Club squad roster input", () => {
  const result = validateProClubSquadRosterFootballInput(validInput);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.schemaVersion, 1);
    assert.deepEqual(result.value.additionalPositions, ["DM", "AM"]);
  }
});

test("rejects unknown fields and non-canonical positions", () => {
  const result = validateProClubSquadRosterFootballInput({
    ...validInput,
    position: "MIDFIELDER",
    id: "should-not-be-stored",
  });
  assert.equal(result.ok, false);
});

test("rejects duplicate and primary-overlap additional positions", () => {
  const duplicate = validateProClubSquadRosterFootballInput({
    ...validInput,
    additionalPositions: ["DM", "DM"],
  });
  assert.equal(duplicate.ok, false);

  const primaryOverlap = validateProClubSquadRosterFootballInput({
    ...validInput,
    additionalPositions: ["CM"],
  });
  assert.equal(primaryOverlap.ok, false);
});

test("rejects invalid jersey numbers and padded text", () => {
  assert.equal(
    validateProClubSquadRosterFootballInput({
      ...validInput,
      jerseyNumber: 100,
    }).ok,
    false,
  );

  assert.equal(
    validateProClubSquadRosterFootballInput({
      ...validInput,
      firstName: " Max ",
    }).ok,
    false,
  );
});

test("allows provisional null FUTID but rejects malformed FUTID", () => {
  assert.equal(
    validateProClubSquadRosterFootballInput({
      ...validInput,
      futId: null,
    }).ok,
    true,
  );

  assert.equal(
    validateProClubSquadRosterFootballInput({
      ...validInput,
      futId: "bad-fut-id",
    }).ok,
    false,
  );
});

test("RELEASED is terminal while ACTIVE and INACTIVE can transition", () => {
  assert.equal(canTransitionProClubSquadRosterStatus("ACTIVE", "INACTIVE"), true);
  assert.equal(canTransitionProClubSquadRosterStatus("INACTIVE", "ACTIVE"), true);
  assert.equal(canTransitionProClubSquadRosterStatus("ACTIVE", "RELEASED"), true);
  assert.equal(canTransitionProClubSquadRosterStatus("RELEASED", "ACTIVE"), false);
  assert.equal(canTransitionProClubSquadRosterStatus("RELEASED", "RELEASED"), true);
});

test("FUTID binding allows only exact null-to-registry binding or immutable existing value", () => {
  assert.equal(
    canBindProClubRosterFutId("player-1", null, "FUT-PLAYER-001", "player-1"),
    true,
  );
  assert.equal(
    canBindProClubRosterFutId("player-1", null, "FUT-PLAYER-001", "player-2"),
    false,
  );
  assert.equal(
    canBindProClubRosterFutId(
      "player-1",
      "FUT-PLAYER-001",
      "FUT-PLAYER-001",
      "player-1",
    ),
    true,
  );
  assert.equal(
    canBindProClubRosterFutId(
      "player-1",
      "FUT-PLAYER-001",
      "FUT-PLAYER-001",
      "player-2",
    ),
    false,
  );
  assert.equal(
    canBindProClubRosterFutId(
      "player-1",
      "FUT-PLAYER-001",
      "FUT-PLAYER-002",
      "player-1",
    ),
    false,
  );
});
