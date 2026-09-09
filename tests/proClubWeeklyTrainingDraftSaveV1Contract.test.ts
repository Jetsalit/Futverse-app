import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read(
  "docs/PRO_CLUB_WEEKLY_TRAINING_DRAFT_SAVE_V1_CONTRACT_FREEZE.md",
);
const normalized = contract.replace(/\s+/g, " ");

test("Weekly Training DRAFT Save V1 freezes fresh-plan atomic create only", () => {
  assert.match(normalized, /fresh-plan atomic create only/i);
  assert.match(normalized, /one client Firestore atomic commit/i);
  assert.match(normalized, /MUST NOT use a sequential production algorithm/i);
  assert.match(normalized, /plan first, then session, then block/i);
});

test("Weekly Training DRAFT Save V1 requires real-root atomic rules proof before adapter wiring", () => {
  assert.match(
    normalized,
    /real-root Firestore Emulator regression for same-commit plan\/session\/block create/i,
  );
  assert.match(normalized, /getAfter/i);
  assert.match(normalized, /existsAfter/i);
  assert.match(normalized, /rather than weakening tenant, account, role, authority, identity, date, audit, or schema checks/i);
});

test("Weekly Training DRAFT Save V1 preserves canonical normalized paths and builder authority", () => {
  assert.match(normalized, /proClubs\/\{clubId\}\/weeklyTrainingPlans\/\{planId\}/);
  assert.match(normalized, /buildProClubWeeklyTrainingDraftWrite/);
  assert.match(normalized, /MUST NOT rebuild domain validation independently/i);
  assert.match(normalized, /MUST NOT.*use Academy paths/i);
});

test("Weekly Training DRAFT Save V1 keeps existing hierarchy mutation out of scope", () => {
  assert.match(normalized, /MUST NOT silently overwrite or reconcile an existing persisted plan hierarchy/i);
  assert.match(normalized, /persisted DRAFT editing\/reconciliation/i);
  assert.match(normalized, /session or block removal/i);
  assert.match(normalized, /plan delete/i);
});

test("Weekly Training DRAFT Save V1 keeps lifecycle and TD co-author writes closed", () => {
  assert.match(normalized, /submit\/review\/revision\/approve\/publish transitions/i);
  assert.match(normalized, /Technical Director co-author writes/i);
  assert.match(normalized, /technicalDirectorNote.*while TD co-author persistence remains closed/i);
});

test("Weekly Training DRAFT Save V1 locks production safety boundary", () => {
  assert.match(normalized, /PRODUCTION_DEPLOYED=NO/);
  assert.match(normalized, /PRODUCTION_HTTP_CALLED=NO/);
  assert.match(normalized, /PRODUCTION_DATA_WRITTEN=NO/);
  assert.match(normalized, /FORCE_PUSH=NO/);
});
