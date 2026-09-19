import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const addendum = readFileSync(
  "docs/PRO_CLUB_SQUAD_ROSTER_POSITION_OPTIONAL_V1_ADDENDUM.md",
  "utf8",
);

test("optional position addendum preserves null as an unconfirmed state without fake codes", () => {
  assert.match(addendum, /position.*may be either/i);
  assert.match(addendum, /null.*not a canonical football position/i);
  assert.match(addendum, /UNKNOWN/);
  assert.match(addendum, /UNSPECIFIED/);
  assert.match(addendum, /additionalPositions.*empty array/i);
});

test("optional position addendum preserves Spark, FUTID, lifecycle and downstream boundaries", () => {
  assert.match(addendum, /No migration is required/i);
  assert.match(addendum, /FUTID issuance or binding authority/i);
  assert.match(addendum, /ACTIVE \/ INACTIVE \/ RELEASED/);
  assert.match(addendum, /Attendance or Match persistence contracts/i);
  assert.match(addendum, /direct Firestore protected by Firestore Rules/i);
  assert.match(addendum, /No Cloud Functions, Cloud Run, or Blaze-only infrastructure/i);
});
