import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_MODEL_PHASES,
  GAME_MODEL_PHASE_LABELS,
  GAME_MODEL_PHASE_TEXT_LIMIT,
  cloneGameModelTextSnapshot,
  createEmptyGameModelTextSnapshot,
  validateGameModelTextSnapshot,
} from "../src/lib/gameModel.ts";

test("Game Model V1 freezes exactly four canonical phases", () => {
  assert.deepEqual(GAME_MODEL_PHASES, [
    "IN_POSSESSION",
    "OUT_OF_POSSESSION",
    "TRANSITION_TO_ATTACK",
    "TRANSITION_TO_DEFEND",
  ]);
  assert.equal(GAME_MODEL_PHASE_LABELS.IN_POSSESSION, "In Possession");
  assert.equal(GAME_MODEL_PHASE_LABELS.OUT_OF_POSSESSION, "Out of Possession");
  assert.equal(GAME_MODEL_PHASE_LABELS.TRANSITION_TO_ATTACK, "Attacking Transition");
  assert.equal(GAME_MODEL_PHASE_LABELS.TRANSITION_TO_DEFEND, "Defensive Transition");
});

test("Game Model text is free-form and can be edited or cleared independently", () => {
  const draft = createEmptyGameModelTextSnapshot();
  assert.equal(validateGameModelTextSnapshot(draft).ok, true);

  const edited = {
    ...draft,
    IN_POSSESSION: "Build through the #6\nWingers hold width",
    TRANSITION_TO_DEFEND: "Counter-press for five seconds",
  };
  assert.equal(validateGameModelTextSnapshot(edited).ok, true);

  const cleared = {
    ...edited,
    TRANSITION_TO_DEFEND: "",
  };
  assert.equal(validateGameModelTextSnapshot(cleared).ok, true);
});

test("Game Model validation rejects missing or extra phases and oversized text", () => {
  const missing = {
    IN_POSSESSION: "",
    OUT_OF_POSSESSION: "",
    TRANSITION_TO_ATTACK: "",
  };
  assert.equal(validateGameModelTextSnapshot(missing).ok, false);

  const extra = {
    ...createEmptyGameModelTextSnapshot(),
    SET_PIECES: "",
  };
  assert.equal(validateGameModelTextSnapshot(extra).ok, false);

  const oversized = {
    ...createEmptyGameModelTextSnapshot(),
    IN_POSSESSION: "x".repeat(GAME_MODEL_PHASE_TEXT_LIMIT + 1),
  };
  assert.equal(validateGameModelTextSnapshot(oversized).ok, false);
});

test("snapshot cloning prevents later master edits from mutating a saved Match snapshot", () => {
  const master = {
    ...createEmptyGameModelTextSnapshot(),
    IN_POSSESSION: "Original Match principle",
  };
  const snapshot = cloneGameModelTextSnapshot(master);
  const editedMaster = {
    ...master,
    IN_POSSESSION: "Updated future principle",
  };

  assert.equal(snapshot.IN_POSSESSION, "Original Match principle");
  assert.equal(editedMaster.IN_POSSESSION, "Updated future principle");
});
