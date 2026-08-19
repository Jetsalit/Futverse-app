import assert from "node:assert/strict";
import test from "node:test";

import {
  getAcademyPlayerEvaluationsPath,
  partitionAcademyPlayerEvaluations,
  selectEvaluationCriteriaForUi,
  type LegacyEvaluationCriterionRecord,
  type LegacyPlayerEvaluationRecord,
} from "../src/services/playerEvaluationCompatibility";

test("Academy evaluation compatibility preserves legacy records and uses path authority", () => {
  const academyId = "academy-a";

  const records: LegacyPlayerEvaluationRecord[] = [
    {
      id: "eval-1",
      sourceCollectionPath:
        "academies/academy-a/player_evaluations",
      academy_id: "",
      player_id: "player-1",
      coach_id: "coach-1",
      evaluation_date: "2026-07-27",
      scores: { Passing: 2 },
      timestamp: "first",
    },
    {
      id: "eval-2",
      sourceCollectionPath:
        "academies/academy-a/player_evaluations",
      academy_id: "",
      player_id: "player-1",
      coach_id: "coach-1",
      evaluation_date: "2026-07-27",
      scores: { Passing: 2 },
      timestamp: "second",
    },
    {
      id: "eval-orphan",
      sourceCollectionPath:
        "academies/academy-a/player_evaluations",
      academy_id: "",
      player_id: "legacy-missing-player",
      scores: { Passing: 3 },
    },
    {
      id: "eval-superadmin",
      sourceCollectionPath:
        "academies/superadmin_system/player_evaluations",
      player_id: "player-1",
    },
    {
      id: "eval-top-level",
      sourceCollectionPath: "player_evaluations",
      player_id: "player-1",
    },
    {
      id: "eval-other-academy",
      sourceCollectionPath:
        "academies/academy-b/player_evaluations",
      player_id: "player-1",
    },
  ];

  const result = partitionAcademyPlayerEvaluations(
    academyId,
    records,
    ["player-1"],
  );

  assert.equal(
    getAcademyPlayerEvaluationsPath(academyId),
    "academies/academy-a/player_evaluations",
  );

  assert.deepEqual(
    result.all.map((record) => record.id),
    ["eval-1", "eval-2", "eval-orphan"],
  );

  // Logical duplicates remain separate Evaluation records.
  assert.deepEqual(
    result.resolved.map((record) => record.id),
    ["eval-1", "eval-2"],
  );

  assert.deepEqual(
    result.orphans.map((record) => record.id),
    ["eval-orphan"],
  );

  // Blank legacy academy_id does not invalidate a correctly scoped record.
  assert.equal(result.resolved[0].academy_id, "");
});

test("orphan Evaluation is preserved and never auto-remapped", () => {
  const record: LegacyPlayerEvaluationRecord = {
    id: "legacy-orphan",
    sourceCollectionPath:
      "academies/academy-a/player_evaluations",
    academy_id: "",
    player_id: "deleted-player",
  };

  const result = partitionAcademyPlayerEvaluations(
    "academy-a",
    [record],
    ["different-player"],
  );

  assert.equal(result.all.length, 1);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.orphans.length, 1);
  assert.equal(result.orphans[0].player_id, "deleted-player");
});

test("criteria UI precedence is Academy then superadmin then top-level", () => {
  const records: LegacyEvaluationCriterionRecord[] = [
    {
      id: "academy-passing",
      sourceCollectionPath:
        "academies/academy-a/evaluation_criteria",
      criteria_name: "Passing",
      category: "Technical",
    },
    {
      id: "global-passing",
      sourceCollectionPath:
        "academies/superadmin_system/evaluation_criteria",
      criteria_name: " passing ",
      category: " technical ",
    },
    {
      id: "top-passing",
      sourceCollectionPath: "evaluation_criteria",
      criteria_name: "PASSING",
      category: "TECHNICAL",
    },
    {
      id: "global-dribbling",
      sourceCollectionPath:
        "academies/superadmin_system/evaluation_criteria",
      criteria_name: "Dribbling",
      category: "Technical",
    },
    {
      id: "top-dribbling",
      sourceCollectionPath: "evaluation_criteria",
      criteria_name: "dribbling",
      category: "technical",
    },
    {
      id: "top-finishing",
      sourceCollectionPath: "evaluation_criteria",
      criteria_name: "Finishing",
      category: "Technical",
    },
    {
      id: "other-academy-heading",
      sourceCollectionPath:
        "academies/academy-b/evaluation_criteria",
      criteria_name: "Heading",
      category: "Technical",
    },
  ];

  const selected = selectEvaluationCriteriaForUi(
    "academy-a",
    records,
  );

  assert.deepEqual(
    selected.map((record) => record.id),
    [
      "academy-passing",
      "global-dribbling",
      "top-finishing",
    ],
  );
});

test("invalid Academy path input is rejected", () => {
  assert.throws(
    () => getAcademyPlayerEvaluationsPath(""),
    /academyId/,
  );

  assert.throws(
    () => getAcademyPlayerEvaluationsPath("academy/a"),
    /academyId/,
  );
});