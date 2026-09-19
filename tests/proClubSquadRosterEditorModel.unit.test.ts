import test from "node:test";
import assert from "node:assert/strict";

import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository";
import {
  buildProClubSquadRosterEditorSubmission,
  createProClubSquadRosterEditorDraft,
  generateProvisionalPlayerKey,
  proClubSquadRosterAllowedStatuses,
  proClubSquadRosterEditorDraftFromRecord,
} from "../src/components/pro-club/operations/proClubSquadRosterEditorModel";

function record(
  overrides: Partial<ProClubSquadRosterRecord> = {},
): ProClubSquadRosterRecord {
  return {
    schemaVersion: 1,
    playerKey: "player-1",
    futId: null,
    firstName: "Max",
    lastName: "Coach",
    position: "CM",
    additionalPositions: ["DM"],
    jerseyNumber: 8,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: "created",
    createdBy: "head-coach",
    updatedAt: "updated",
    updatedBy: "head-coach",
    ...overrides,
  };
}

test("generates a stable provisional roster playerKey from a supplied UUID", () => {
  assert.equal(
    generateProvisionalPlayerKey("1234-abcd"),
    "provisional-1234-abcd",
  );

  assert.throws(
    () => generateProvisionalPlayerKey("bad/id"),
    /invalid UUID/i,
  );
});

test("new editor draft starts ACTIVE with no FUTID and three optional positions", () => {
  const draft = createProClubSquadRosterEditorDraft("provisional-1");

  assert.equal(draft.playerKey, "provisional-1");
  assert.equal(draft.futId, "");
  assert.equal(draft.status, "ACTIVE");
  assert.equal(draft.squadLabel, "First Team");
  assert.deepEqual(draft.additionalPositions, ["", "", ""]);
});

test("record-to-editor mapping preserves canonical roster football fields", () => {
  const draft = proClubSquadRosterEditorDraftFromRecord(
    record({
      futId: "FUT-PLAYER-001",
      additionalPositions: ["DM", "AM"],
      status: "INACTIVE",
    }),
  );

  assert.equal(draft.playerKey, "player-1");
  assert.equal(draft.futId, "FUT-PLAYER-001");
  assert.equal(draft.jerseyNumber, "8");
  assert.equal(draft.status, "INACTIVE");
  assert.deepEqual(draft.additionalPositions, ["DM", "AM", ""]);
});

test("create submission normalizes user text and enforces canonical input", () => {
  const draft = {
    ...createProClubSquadRosterEditorDraft("provisional-1"),
    futId: " fut-player-001 ",
    firstName: " Max ",
    lastName: " Coach ",
    position: " cm ",
    additionalPositions: [" dm ", " AM ", ""],
    jerseyNumber: "08",
    squadLabel: " First Team ",
  };

  const result = buildProClubSquadRosterEditorSubmission("CREATE", draft);
  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.playerKey, "provisional-1");
    assert.equal(result.input.futId, "FUT-PLAYER-001");
    assert.equal(result.input.firstName, "Max");
    assert.equal(result.input.position, "CM");
    assert.deepEqual(result.input.additionalPositions, ["DM", "AM"]);
    assert.equal(result.input.jerseyNumber, 8);
  }
});

test("create submission refuses non-ACTIVE and invalid duplicate positions", () => {
  const draft = {
    ...createProClubSquadRosterEditorDraft("provisional-1"),
    firstName: "Max",
    position: "CM",
    additionalPositions: ["CM", "CM", ""],
    jerseyNumber: "8",
    status: "INACTIVE",
  };

  const result = buildProClubSquadRosterEditorSubmission("CREATE", draft);
  assert.equal(result.ok, false);

  if (result.ok === false) {
    assert.match(result.errors.join(" "), /additional positions/i);
    assert.match(result.errors.join(" "), /must start ACTIVE/i);
  }
});

test("existing non-null FUTID and playerKey remain immutable in edit mode", () => {
  const current = record({ futId: "FUT-PLAYER-001" });
  const draft = {
    ...proClubSquadRosterEditorDraftFromRecord(current),
    playerKey: "player-2",
    futId: "FUT-PLAYER-002",
  };

  const result = buildProClubSquadRosterEditorSubmission(
    "EDIT",
    draft,
    current,
  );

  assert.equal(result.ok, false);
  if (result.ok === false) {
    assert.match(result.errors.join(" "), /playerKey is immutable/i);
    assert.match(result.errors.join(" "), /FUTID is immutable/i);
  }
});

test("null FUTID may be prepared for one-time binding and RELEASED remains terminal", () => {
  const current = record({ futId: null, status: "ACTIVE" });
  const draft = {
    ...proClubSquadRosterEditorDraftFromRecord(current),
    futId: "FUT-PLAYER-001",
    status: "RELEASED",
  };

  const result = buildProClubSquadRosterEditorSubmission(
    "EDIT",
    draft,
    current,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(
    proClubSquadRosterAllowedStatuses("EDIT", "RELEASED"),
    ["RELEASED"],
  );
});

test("status options reflect the frozen lifecycle", () => {
  assert.deepEqual(proClubSquadRosterAllowedStatuses("CREATE"), ["ACTIVE"]);
  assert.deepEqual(
    proClubSquadRosterAllowedStatuses("EDIT", "ACTIVE"),
    ["ACTIVE", "INACTIVE"],
  );
  assert.deepEqual(
    proClubSquadRosterAllowedStatuses("EDIT", "INACTIVE"),
    ["ACTIVE", "INACTIVE"],
  );
});

test("blank primary position builds a canonical null position with no additional positions", () => {
  const draft = {
    ...createProClubSquadRosterEditorDraft("provisional-null-position"),
    firstName: "Real",
    lastName: "Player",
    position: "",
    additionalPositions: ["", "", ""],
    jerseyNumber: "3",
  };

  const result = buildProClubSquadRosterEditorSubmission("CREATE", draft);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.input.position, null);
    assert.deepEqual(result.input.additionalPositions, []);
  }
});

test("record-to-editor mapping renders null primary position as blank", () => {
  const draft = proClubSquadRosterEditorDraftFromRecord(
    record({ position: null, additionalPositions: [] }),
  );

  assert.equal(draft.position, "");
  assert.deepEqual(draft.additionalPositions, ["", "", ""]);
});
