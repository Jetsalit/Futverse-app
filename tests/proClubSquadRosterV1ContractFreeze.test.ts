import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const contract = readFileSync(
  path.join(repoRoot, "docs/PRO_CLUB_SQUAD_ROSTER_V1_CONTRACT_FREEZE.md"),
  "utf8",
);

test("Pro Club Squad Roster V1 freezes the canonical tenant path", () => {
  assert.match(contract, /proClubs\/\{clubId\}\/players\/\{playerKey\}/);
  assert.match(contract, /MUST NOT be duplicated in the stored payload/);
});

test("contract is Academy-first and reuses shared player foundations", () => {
  assert.match(contract, /adapts the existing Academy player-management foundations/i);
  assert.match(contract, /playerPositionSelection\.ts/);
  assert.match(contract, /Player Identity \/ FUTID validation foundation/);
});

test("contract rejects global proPlayers as tenant source of truth", () => {
  assert.match(contract, /MUST NOT use root `proPlayers`/);
});

test("contract remains Spark-only with direct Firestore rules", () => {
  assert.match(contract, /Firebase Spark only/);
  assert.match(contract, /direct Firestore protected by Firestore Rules/);
  assert.match(contract, /Cloud Functions/);
  assert.match(contract, /Blaze-only infrastructure/);
});

test("contract freezes preservation-first lifecycle without delete", () => {
  assert.match(contract, /ACTIVE \| INACTIVE \| RELEASED/);
  assert.match(contract, /`RELEASED` is terminal/);
  assert.match(contract, /Physical delete is forbidden/);
});

test("contract freezes Head Coach mutation authority", () => {
  assert.match(contract, /Create\/update in V1 is restricted to an active `HEAD_COACH`/);
  assert.match(contract, /Membership \+ staff authority/);
});

test("contract freezes FUTID compatibility without issuing identities", () => {
  assert.match(contract, /futIdRegistry\/\{futId\}/);
  assert.match(contract, /null -> valid FUTID/);
  assert.match(contract, /Replacing one non-null FUTID with another is forbidden/);
  assert.match(contract, /V1 does not issue FUTIDs/);
});

test("contract requires Attendance and Match to reuse the canonical roster", () => {
  assert.match(contract, /Attendance and Match slices MUST reference this canonical Pro Club roster/);
  assert.match(contract, /Attendance references `playerKey`/);
});

test("contract freeze itself remains docs and tests only", () => {
  assert.match(contract, /This freeze slice is docs\/tests only/);
  assert.match(contract, /does not modify:[\s\S]*Academy player paths/);
  assert.match(contract, /does not modify:[\s\S]*Weekly Training production flow/);
});
