import assert from "node:assert/strict";
import test from "node:test";

import {
  PRO_CLUB_ANALYSIS_SECTIONS,
  addProClubAnalysisTopic,
  archiveProClubAnalysisTopic,
  completeProClubMatchAnalysis,
  createDefaultProClubAnalysisTopics,
  createEmptyProClubMatchAnalysis,
  createProClubAnalysisTopic,
  createProClubAnalysisTopicSnapshot,
  reorderProClubAnalysisTopics,
  setProClubAnalysisTopicEnabled,
  updateProClubAnalysisTopic,
  validateProClubAnalysisTopicValue,
  validateProClubMatchAnalysis,
} from "../src/lib/proClubMatchAnalysis";

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
