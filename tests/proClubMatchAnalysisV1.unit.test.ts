import assert from "node:assert/strict";
import test from "node:test";

import {
  PRO_CLUB_ANALYSIS_FIXED_FORMATIONS,
  PRO_CLUB_ANALYSIS_FIXED_SLOTS,
  PRO_CLUB_ANALYSIS_SECTIONS,
  addProClubAnalysisTopic,
  archiveProClubAnalysisTopic,
  completeProClubMatchAnalysis,
  createDefaultProClubAnalysisTopics,
  createEmptyProClubMatchAnalysis,
  createProClubAnalysisFormationSlots,
  createProClubAnalysisTopic,
  createProClubAnalysisTopicSnapshot,
  reorderProClubAnalysisTopics,
  setProClubAnalysisTopicEnabled,
  updateProClubAnalysisTopic,
  validateProClubAnalysisTopicValue,
  validateProClubMatchAnalysis,
  getProClubAnalysisPointerCoordinates,
  moveProClubAnalysisCustomFormationSlot,
} from "../src/lib/proClubMatchAnalysis";
import {
  PRO_CLUB_STARTING_XI_FIXED_FORMATIONS,
  PRO_CLUB_STARTING_XI_FIXED_SLOTS,
} from "../src/lib/proClubStartingXI11v11";
import { isPlayerPositionCode } from "../src/lib/playerPositionSelection";

function emptyAnalysis() {
  return createEmptyProClubMatchAnalysis({
    matchId: "formation-test-match",
    clubName: "FutVerse FC",
    clubLogoUrl: null,
    competitionName: "League",
    opponentName: "Test Opponent",
    kickoffAt: null,
    topicSnapshot: createProClubAnalysisTopicSnapshot(
      createDefaultProClubAnalysisTopics(),
    ),
  });
}

test("Analysis V1 exposes exactly the seven required sections in order", () => {
  assert.deepEqual(
    PRO_CLUB_ANALYSIS_SECTIONS.map(({ id }) => id),
    [
      "FORMATION_LINEUP",
      "IN_POSSESSION_ATT",
      "OUT_DEF",
      "KEY_MAN",
      "ANALYSIS",
      "SET_PIECES",
      "ATTACKING_PATTERNS",
    ],
  );
  assert.deepEqual(
    PRO_CLUB_ANALYSIS_SECTIONS.map(({ label }) => label),
    [
      "Formation / Lineup",
      "In Possession ATT",
      "Out DEF",
      "Key Man",
      "Analysis",
      "Set Pieces",
      "การเข้าทำ",
    ],
  );
});

test("Analysis formation catalog adds three formations without changing Starting XI", () => {
  assert.deepEqual(PRO_CLUB_ANALYSIS_FIXED_FORMATIONS, [
    "4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "4-1-4-1", "5-3-2", "3-4-3",
  ]);
  assert.deepEqual(PRO_CLUB_STARTING_XI_FIXED_FORMATIONS, [
    "4-3-3", "4-2-3-1", "4-4-2", "3-5-2",
  ]);
  assert.deepEqual(Object.keys(PRO_CLUB_STARTING_XI_FIXED_SLOTS), [
    "4-3-3", "4-2-3-1", "4-4-2", "3-5-2",
  ]);

  const empty = emptyAnalysis();
  for (const formation of ["4-1-4-1", "5-3-2", "3-4-3"] as const) {
    const template = createProClubAnalysisFormationSlots(formation);
    assert.equal(template.length, 11, `${formation} must have 11 slots`);
    assert.ok(template.every((slot) => isPlayerPositionCode(slot.position)));
    assert.ok(template.every((slot) =>
      Number.isInteger(slot.x) && slot.x >= 6 && slot.x <= 94 &&
      Number.isInteger(slot.y) && slot.y >= 6 && slot.y <= 94,
    ));
    assert.notEqual(
      template[0],
      PRO_CLUB_ANALYSIS_FIXED_SLOTS[formation][0],
      "Analysis slot templates are returned as copies",
    );

    const analysis = {
      ...empty,
      sections: {
        ...empty.sections,
        FORMATION_LINEUP: {
          ...empty.sections.FORMATION_LINEUP,
          formation,
          customFormationSlots: null,
          slots: template.map((slot) => ({
            ...slot,
            playerName: "",
            jerseyNumber: null,
            notes: "",
          })),
        },
      },
    };
    assert.equal(validateProClubMatchAnalysis(analysis).ok, true, formation);
  }
});

test("custom pitch movement clamps normalized coordinates and keeps lineup data", () => {
  const template = createProClubAnalysisFormationSlots("4-3-3");
  const moved = moveProClubAnalysisCustomFormationSlot(template, 4, -20, 120);
  assert.deepEqual(
    { x: moved[4]?.x, y: moved[4]?.y },
    { x: 6, y: 94 },
  );
  assert.deepEqual(
    { x: moved[3]?.x, y: moved[3]?.y },
    { x: template[3]?.x, y: template[3]?.y },
  );
  assert.deepEqual(
    getProClubAnalysisPointerCoordinates(
      { left: 10, top: 20, width: 100, height: 200 },
      60,
      120,
    ),
    { x: 50, y: 50 },
  );
});

test("Game Model topics can be added, edited, reordered, disabled, and archived", () => {
  const defaults = createDefaultProClubAnalysisTopics();
  const custom = createProClubAnalysisTopic({
    id: "transition-da",
    name: "Transition D-A",
    section: "IN_POSSESSION_ATT",
    inputType: "CHECKBOX",
    displayOrder: defaults.length,
  });

  const withCustom = addProClubAnalysisTopic(defaults, custom);
  const edited = updateProClubAnalysisTopic(withCustom, "transition-da", {
    name: "Defence to attack",
    helperText: "What happens immediately after regaining possession?",
  });
  assert.equal(
    edited.find(({ id }) => id === "transition-da")?.name,
    "Defence to attack",
  );

  const originalOrder = defaults.map(({ id }) => id);
  const reordered = reorderProClubAnalysisTopics(edited, [
    "transition-da",
    ...originalOrder,
  ]);
  assert.equal(reordered[0]?.id, "transition-da");
  assert.equal(reordered[0]?.displayOrder, 0);

  const disabled = setProClubAnalysisTopicEnabled(
    reordered,
    "transition-da",
    false,
  );
  assert.equal(
    disabled.find(({ id }) => id === "transition-da")?.enabled,
    false,
  );

  const archived = archiveProClubAnalysisTopic(disabled, "transition-da");
  const archivedTopic = archived.find(({ id }) => id === "transition-da");
  assert.equal(archivedTopic?.archived, true);
  assert.equal(archivedTopic?.enabled, false);
  assert.throws(
    () => setProClubAnalysisTopicEnabled(archived, "transition-da", true),
    /archived/i,
  );
});

test("Game Model topic values enforce checkbox, 1–5 rating, single choice, and notes inputs", () => {
  const checkbox = createProClubAnalysisTopic({
    id: "pressing",
    name: "Pressing",
    section: "OUT_DEF",
    inputType: "CHECKBOX",
    displayOrder: 0,
  });
  const rating = createProClubAnalysisTopic({
    id: "tempo",
    name: "Tempo",
    section: "IN_POSSESSION_ATT",
    inputType: "RATING",
    displayOrder: 1,
  });
  const choice = createProClubAnalysisTopic({
    id: "build-up",
    name: "Build Up",
    section: "IN_POSSESSION_ATT",
    inputType: "SINGLE_CHOICE",
    choices: ["Short", "Mixed", "Direct"],
    displayOrder: 2,
  });
  const notes = createProClubAnalysisTopic({
    id: "final-third",
    name: "Final Third",
    section: "IN_POSSESSION_ATT",
    inputType: "NOTES",
    displayOrder: 3,
  });

  assert.equal(validateProClubAnalysisTopicValue(checkbox, true), true);
  assert.equal(validateProClubAnalysisTopicValue(checkbox, "yes"), false);
  assert.equal(validateProClubAnalysisTopicValue(rating, 1), true);
  assert.equal(validateProClubAnalysisTopicValue(rating, 5), true);
  assert.equal(validateProClubAnalysisTopicValue(rating, 0), false);
  assert.equal(validateProClubAnalysisTopicValue(rating, 6), false);
  assert.equal(validateProClubAnalysisTopicValue(rating, 3.5), false);
  assert.equal(validateProClubAnalysisTopicValue(choice, "Direct"), true);
  assert.equal(validateProClubAnalysisTopicValue(choice, "Long"), false);
  assert.equal(validateProClubAnalysisTopicValue(notes, "Runs behind"), true);
  assert.equal(validateProClubAnalysisTopicValue(notes, 42), false);
});

test("Analysis snapshots preserve topic labels and inputs after the template changes", () => {
  const template = createDefaultProClubAnalysisTopics();
  const snapshot = createProClubAnalysisTopicSnapshot(template);
  const oldBuildUp = snapshot.find(({ id }) => id === "build-up");
  assert.ok(oldBuildUp);

  const revisedTemplate = updateProClubAnalysisTopic(template, "build-up", {
    name: "Short Build Up",
    inputType: "NOTES",
  });
  assert.equal(revisedTemplate.find(({ id }) => id === "build-up")?.name, "Short Build Up");
  assert.equal(oldBuildUp.name, "Build Up");
  assert.equal(oldBuildUp.inputType, "SINGLE_CHOICE");
});

test("each match gets an independent draft with all seven data sections and can be completed", () => {
  const topics = createProClubAnalysisTopicSnapshot(
    createDefaultProClubAnalysisTopics(),
  );
  const first = createEmptyProClubMatchAnalysis({
    matchId: "match-one",
    clubName: "FutVerse FC",
    clubLogoUrl: null,
    competitionName: "League",
    opponentName: "Opposition A",
    kickoffAt: null,
    topicSnapshot: topics,
  });
  const second = createEmptyProClubMatchAnalysis({
    matchId: "match-two",
    clubName: "FutVerse FC",
    clubLogoUrl: null,
    competitionName: "Cup",
    opponentName: "Opposition B",
    kickoffAt: "2026-09-27T12:00:00.000Z",
    topicSnapshot: topics,
  });

  assert.equal(first.status, "DRAFT");
  assert.equal(second.status, "DRAFT");
  assert.notEqual(first.matchId, second.matchId);
  assert.deepEqual(Object.keys(first.sections), [
    "FORMATION_LINEUP",
    "IN_POSSESSION_ATT",
    "OUT_DEF",
    "KEY_MAN",
    "ANALYSIS",
    "SET_PIECES",
    "ATTACKING_PATTERNS",
  ]);
  assert.equal(validateProClubMatchAnalysis(first).ok, true);

  const completed = completeProClubMatchAnalysis(first);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(first.status, "DRAFT");
  assert.equal(validateProClubMatchAnalysis(completed).ok, true);
});
