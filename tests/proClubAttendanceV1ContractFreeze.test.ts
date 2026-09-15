import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const contract = readFileSync(
  path.join(repoRoot, "docs/PRO_CLUB_ATTENDANCE_V1_CONTRACT_FREEZE.md"),
  "utf8",
);

test("Attendance V1 freezes canonical session and player-record paths", () => {
  assert.match(contract, /proClubs\/\{clubId\}\/attendanceSessions\/\{attendanceSessionId\}/);
  assert.match(contract, /attendanceSessions\/\{attendanceSessionId\}\/records\/\{playerKey\}/);
  assert.match(contract, /MUST NOT be duplicated in stored payload fields/);
});

test("Attendance V1 reuses the canonical Pro Club roster without duplicating player profiles", () => {
  assert.match(contract, /proClubs\/\{clubId\}\/players\/\{playerKey\}/);
  assert.match(contract, /status == ACTIVE/);
  assert.match(contract, /squadLabel == "First Team"/);
  assert.match(contract, /MUST NOT duplicate:[\s\S]*FUTID/);
  assert.match(contract, /MUST NOT fall back to Academy players, root `proPlayers`/);
});

test("Attendance V1 freezes stable deterministic training-session identity", () => {
  assert.match(contract, /training_\{YYYY-MM-DD\}_\{HH-mm\}/);
  assert.match(contract, /at most one V1 First Team training-attendance session for the same exact date\/time slot/);
  assert.match(contract, /MUST NOT use a Weekly Training array index/);
});

test("Attendance V1 freezes the minimal status model", () => {
  assert.match(contract, /PRESENT \| LATE \| ABSENT \| EXCUSED/);
  assert.match(contract, /stores no medical diagnosis, injury detail, or free-text reason/);
});

test("Attendance V1 freezes Head Coach mutation authority and staff read-only behavior", () => {
  assert.match(contract, /restricted to an active `HEAD_COACH`/);
  assert.match(contract, /Other active Pro Club staff are read-only in V1/);
  assert.match(contract, /Membership \+ staff authority/);
});

test("Attendance V1 is preservation-first and forbids delete", () => {
  assert.match(contract, /Physical delete of either sessions or records is forbidden/);
  assert.match(contract, /createdAt == request\.time/);
  assert.match(contract, /updatedAt == request\.time/);
  assert.match(contract, /Unknown fields fail closed/);
});

test("Attendance V1 remains Spark-only and does not mutate neighboring modules", () => {
  assert.match(contract, /direct Firestore protected by Firestore Rules/);
  assert.match(contract, /Cloud Functions/);
  assert.match(contract, /Blaze-only infrastructure/);
  assert.match(contract, /does not modify:[\s\S]*Weekly Training production flow/);
  assert.match(contract, /does not modify:[\s\S]*Match Foundation/);
  assert.match(contract, /does not modify:[\s\S]*production data/);
});

test("Attendance contract freeze itself remains docs and tests only", () => {
  assert.match(contract, /This freeze slice is docs\/tests only/);
  assert.match(contract, /Runtime, Rules, UI, deployment, and production writes require later reviewed slices/);
});
