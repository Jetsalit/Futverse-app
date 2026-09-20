import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const contract = readFileSync(
  "docs/PRO_CLUB_MATCH_STARTING_XI_PERSISTENCE_V1_CONTRACT_FREEZE.md",
  "utf8",
);

test("persistence contract binds Starting XI to exact Pro Club Match paths", () => {
  for (const path of [
    "proClubs/{clubId}/matches/{matchId}",
    "proClubs/{clubId}/matches/{matchId}/roster/{playerKey}",
    "proClubs/{clubId}/matches/{matchId}/startingXI/current",
    "proClubs/{clubId}/matches/{matchId}/shootout/current",
    "proClubs/{clubId}/matches/{matchId}/startingXIAudit/{eventId}",
  ]) {
    assert.equal(contract.includes(path), true, path);
  }

  assert.match(contract, /No standalone\/global Starting XI document/);
});

test("contract separates Starting XI lifecycle from shootout lifecycle", () => {
  assert.match(contract, /Starting XI is a pre-match selection artifact/);
  assert.match(contract, /Penalty shootout order is operationally separate/);
  assert.match(contract, /Starting XI immutable:[\s\S]*IN_PROGRESS[\s\S]*COMPLETED[\s\S]*CANCELLED/);
  assert.match(contract, /Shootout order mutable:[\s\S]*IN_PROGRESS/);
});

test("contract preserves real roster identity and fail-closed production boundaries", () => {
  assert.match(contract, /FUTID or `null`/);
  assert.match(contract, /primary position or `null`/);
  assert.match(contract, /No missing FUTID or position may be fabricated/);
  assert.match(contract, /stale client must never silently overwrite/i);
  assert.match(contract, /must not modify:[\s\S]*`firestore\.rules`/);
  assert.match(contract, /No deploy and no Blaze dependency/);
});
