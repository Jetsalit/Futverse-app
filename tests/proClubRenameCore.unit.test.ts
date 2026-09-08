import assert from "node:assert/strict";
import test from "node:test";
import {
  RENAME_ERROR_CODES,
  ProClubRenameError,
  assertEffectiveAtFollowsPriorTransition,
  assertEffectiveAtNotBeforeClubCreation,
  assertEffectiveAtNotFuture,
  assertFreshRenameRequest,
  buildNameHistoryRecord,
  validateAndNormalizeProClubRenameRequest,
  validateStoredProClubForRename,
} from "../functions/src/proClubRename/core.ts";
import { validateProClubNameHistoryRecord } from "../src/lib/proClubModel.ts";

const EFFECTIVE_AT = "2026-09-07T00:00:00.000Z";
const CHANGED_AT = "2026-09-07T01:02:03.000Z";

function request(overrides: Record<string, unknown> = {}) {
  return {
    clubId: "club-alpha",
    newName: "Alpha United",
    shortNameChange: { action: "UNCHANGED" },
    reason: "REBRAND",
    reasonNote: null,
    effectiveAt: EFFECTIVE_AT,
    expectedCurrentName: "Alpha FC",
    expectedCurrentShortName: "AFC",
    expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const club = {
  name: "Alpha FC",
  shortName: "AFC",
  level: "T1" as const,
  status: "ACTIVE" as const,
  country: "TH",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function priorHistory(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    clubId: "club-alpha",
    previousName: "Alpha Athletic",
    previousShortName: "AA",
    newName: "Alpha FC",
    newShortName: "AFC",
    reason: "REBRAND",
    reasonNote: null,
    effectiveAt: "2026-09-06T00:00:00.000Z",
    changedAt: "2026-09-06T01:00:00.000Z",
    changedBy: "superadmin-1",
    ...overrides,
  };
}

function expectInvalid(payload: unknown) {
  assert.throws(
    () => validateAndNormalizeProClubRenameRequest(payload),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.INVALID_REQUEST,
  );
}

test("accepts TAKEOVER, REBRAND, and LEGAL_NAME_CHANGE", () => {
  for (const reason of ["TAKEOVER", "REBRAND", "LEGAL_NAME_CHANGE"]) {
    const normalized = validateAndNormalizeProClubRenameRequest(request({ reason }));
    assert.equal(normalized.reason, reason);
    assert.equal(normalized.reasonNote, null);
  }
});

test("OTHER requires a bounded canonical reasonNote", () => {
  const normalized = validateAndNormalizeProClubRenameRequest(request({
    reason: "OTHER",
    reasonNote: "Merger-approved display identity update",
  }));
  assert.equal(normalized.reasonNote, "Merger-approved display identity update");
  for (const reasonNote of [null, "", "   ", " padded ", "x".repeat(501)]) {
    expectInvalid(request({ reason: "OTHER", reasonNote }));
  }
});

test("rejects blank, padded, or whitespace-only names", () => {
  for (const newName of ["", " ", " New Name ", "\tName"]) {
    expectInvalid(request({ newName }));
  }
});

test("rejects invalid reasons and club identifiers", () => {
  expectInvalid(request({ reason: "SALE" }));
  expectInvalid(request({ clubId: "other/club" }));
  for (const field of ["changedBy", "changedAt"]) {
    expectInvalid({ ...request(), [field]: "spoofed" });
  }
});

test("shortName UNCHANGED, SET, and REMOVE are unambiguous", () => {
  const unchanged = validateAndNormalizeProClubRenameRequest(request());
  const set = validateAndNormalizeProClubRenameRequest(request({
    shortNameChange: { action: "SET", value: "AU" },
  }));
  const remove = validateAndNormalizeProClubRenameRequest(request({
    shortNameChange: { action: "REMOVE" },
  }));
  assert.deepEqual(unchanged.shortNameChange, { action: "UNCHANGED" });
  assert.deepEqual(set.shortNameChange, { action: "SET", value: "AU" });
  assert.deepEqual(remove.shortNameChange, { action: "REMOVE" });
  expectInvalid(request({ shortNameChange: { action: "SET" } }));
  expectInvalid(request({ shortNameChange: { action: "REMOVE", value: "X" } }));
});

test("rejects no-op rename", () => {
  const normalized = validateAndNormalizeProClubRenameRequest(request({
    newName: "Alpha FC",
  }));
  assert.throws(
    () => assertFreshRenameRequest(normalized, club),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.NO_OP,
  );
});

test("rejects stale name, shortName, or updatedAt expectations", () => {
  for (const overrides of [
    { expectedCurrentName: "Old Name" },
    { expectedCurrentShortName: null },
    { expectedUpdatedAt: "2026-08-01T00:00:00.000Z" },
  ]) {
    const normalized = validateAndNormalizeProClubRenameRequest(request(overrides));
    assert.throws(
      () => assertFreshRenameRequest(normalized, club),
      (error) => error instanceof ProClubRenameError &&
        error.code === RENAME_ERROR_CODES.STALE_REQUEST,
    );
  }
});

test("rejects a future effectiveAt under fail-closed V1 semantics", () => {
  const normalized = validateAndNormalizeProClubRenameRequest(request({
    effectiveAt: "2026-09-07T01:02:03.001Z",
  }));
  assert.throws(
    () => assertEffectiveAtNotFuture(normalized, CHANGED_AT),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.EFFECTIVE_AT_FUTURE,
  );
  assert.doesNotThrow(() => assertEffectiveAtNotFuture(
    validateAndNormalizeProClubRenameRequest(request({ effectiveAt: CHANGED_AT })),
    CHANGED_AT,
  ));
});

test("enforces canonical club creation as the first-transition lower bound", () => {
  const beforeCreation = validateAndNormalizeProClubRenameRequest(request({
    effectiveAt: "2025-12-31T23:59:59.999Z",
  }));
  assert.throws(
    () => assertEffectiveAtNotBeforeClubCreation(beforeCreation, club),
    (error) => error instanceof ProClubRenameError &&
      error.code === RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER,
  );
  for (const effectiveAt of [club.createdAt, "2026-01-01T00:00:00.001Z"]) {
    assert.doesNotThrow(() => assertEffectiveAtNotBeforeClubCreation(
      validateAndNormalizeProClubRenameRequest(request({ effectiveAt })),
      club,
    ));
  }
  const legacy = { name: "Legacy FC", level: "T3", status: "ACTIVE" } as const;
  assert.doesNotThrow(() => assertEffectiveAtNotBeforeClubCreation(
    beforeCreation,
    legacy,
  ));
});

test("requires a strictly later effectiveAt than the prior transition", () => {
  for (const effectiveAt of [
    "2026-09-05T23:59:59.999Z",
    "2026-09-06T00:00:00.000Z",
  ]) {
    const normalized = validateAndNormalizeProClubRenameRequest(request({ effectiveAt }));
    assert.throws(
      () => assertEffectiveAtFollowsPriorTransition(normalized, club, priorHistory()),
      (error) => error instanceof ProClubRenameError &&
        error.code === RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER,
    );
  }
  assert.doesNotThrow(() => assertEffectiveAtFollowsPriorTransition(
    validateAndNormalizeProClubRenameRequest(request()),
    club,
    priorHistory(),
  ));
});

test("fails closed on malformed or discontinuous prior history", () => {
  const normalized = validateAndNormalizeProClubRenameRequest(request());
  for (const prior of [
    priorHistory({ changedBy: undefined }),
    priorHistory({ clubId: "club-beta" }),
    priorHistory({ newName: "Different Root Name" }),
    priorHistory({ newShortName: "DIFFERENT" }),
  ]) {
    assert.throws(
      () => assertEffectiveAtFollowsPriorTransition(normalized, club, prior),
      (error) => error instanceof ProClubRenameError &&
        error.code === RENAME_ERROR_CODES.INTEGRITY,
    );
  }
});

test("legacy club without timestamps remains valid and renamable", () => {
  const legacy = { name: "Legacy FC", level: "T3", status: "ACTIVE" } as const;
  assert.equal(validateStoredProClubForRename(legacy), true);
  const normalized = validateAndNormalizeProClubRenameRequest(request({
    newName: "Legacy United",
    expectedCurrentName: "Legacy FC",
    expectedCurrentShortName: null,
    expectedUpdatedAt: null,
  }));
  assert.doesNotThrow(() => assertFreshRenameRequest(normalized, legacy));
  assert.doesNotThrow(() => assertEffectiveAtNotBeforeClubCreation(normalized, legacy));
});

test("history records exact identity transition and trusted audit fields", () => {
  for (const [action, expectedShortName] of [
    [{ action: "UNCHANGED" }, "AFC"],
    [{ action: "SET", value: "AU" }, "AU"],
    [{ action: "REMOVE" }, null],
  ] as const) {
    const normalized = validateAndNormalizeProClubRenameRequest(request({
      shortNameChange: action,
    }));
    const history = buildNameHistoryRecord(
      normalized,
      club,
      "superadmin-1",
      CHANGED_AT,
    );
    assert.equal(history.clubId, "club-alpha");
    assert.equal(history.previousName, "Alpha FC");
    assert.equal(history.previousShortName, "AFC");
    assert.equal(history.newName, "Alpha United");
    assert.equal(history.newShortName, expectedShortName);
    assert.equal(history.changedBy, "superadmin-1");
    assert.equal(history.changedAt, CHANGED_AT);
    assert.equal(validateProClubNameHistoryRecord(history, {
      clubId: "club-alpha",
      documentClubId: "club-alpha",
      changeId: "change-1",
      documentId: "change-1",
    }), true);
  }
});

test("history validator rejects clubId mismatch and mutable-shape extras", () => {
  const normalized = validateAndNormalizeProClubRenameRequest(request());
  const history = buildNameHistoryRecord(normalized, club, "superadmin-1", CHANGED_AT);
  const context = {
    clubId: "club-alpha",
    documentClubId: "club-alpha",
    changeId: "change-1",
    documentId: "change-1",
  };
  assert.equal(validateProClubNameHistoryRecord(
    { ...history, clubId: "club-beta" }, context,
  ), false);
  assert.equal(validateProClubNameHistoryRecord(
    { ...history, overwrittenAt: CHANGED_AT }, context,
  ), false);
});
