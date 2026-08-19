import assert from "node:assert/strict";
import test from "node:test";
import {
  Timestamp,
} from "firebase/firestore";

import {
  comparePlayerEvaluationsNewestFirst,
  evaluationDateLabel,
  playerEvaluationDateMillis,
} from "../src/services/playerEvaluationDate";
import type {
  LegacyPlayerEvaluationRecord,
} from "../src/services/playerEvaluationCompatibility";

function record(
  id: string,
  overrides:
    Partial<LegacyPlayerEvaluationRecord> = {},
): LegacyPlayerEvaluationRecord {
  return {
    id,
    sourceCollectionPath:
      "academies/academy-a/player_evaluations",
    player_id: "player-1",
    ...overrides,
  };
}

test(
  "evaluation_date remains preferred over timestamp",
  () => {
    const evaluation = record("eval-date", {
      evaluation_date: "2026-07-27",
      timestamp: Timestamp.fromDate(
        new Date(
          "2026-08-19T10:00:00.000Z",
        ),
      ),
    });

    assert.equal(
      evaluationDateLabel(evaluation),
      "2026-07-27",
    );

    assert.equal(
      playerEvaluationDateMillis(evaluation),
      Date.parse("2026-07-27"),
    );
  },
);

test(
  "normal Firestore Timestamp is displayed correctly",
  () => {
    const evaluation = record(
      "eval-firestore-timestamp",
      {
        timestamp: Timestamp.fromDate(
          new Date(
            "2026-08-19T14:49:32.236Z",
          ),
        ),
      },
    );

    assert.equal(
      evaluationDateLabel(evaluation),
      "2026-08-19",
    );

    assert.equal(
      playerEvaluationDateMillis(evaluation),
      Date.parse(
        "2026-08-19T14:49:32.236Z",
      ),
    );
  },
);

test(
  "toDate Timestamp-like fallback is supported",
  () => {
    const evaluation = record(
      "eval-to-date",
      {
        timestamp: {
          toDate: () =>
            new Date(
              "2026-08-18T12:00:00.000Z",
            ),
        },
      },
    );

    assert.equal(
      evaluationDateLabel(evaluation),
      "2026-08-18",
    );
  },
);

test(
  "legacy string display semantics remain unchanged",
  () => {
    const offsetTimestamp = record(
      "eval-offset-string",
      {
        timestamp:
          "2026-08-19T23:30:00-05:00",
      },
    );

    assert.equal(
      evaluationDateLabel(offsetTimestamp),
      "2026-08-19",
    );

    assert.equal(
      playerEvaluationDateMillis(
        offsetTimestamp,
      ),
      Date.parse(
        "2026-08-19T23:30:00-05:00",
      ),
    );

    const invalidEvaluationDate = record(
      "eval-invalid-date",
      {
        evaluation_date: "not-a-date",
        timestamp: new Date(
          "2026-08-20T01:00:00.000Z",
        ),
      },
    );

    // Legacy evaluation_date still has field
    // precedence and is displayed as before.
    assert.equal(
      evaluationDateLabel(
        invalidEvaluationDate,
      ),
      "not-a-date",
    );

    // Do not silently replace an existing
    // legacy evaluation_date with timestamp.
    assert.equal(
      playerEvaluationDateMillis(
        invalidEvaluationDate,
      ),
      null,
    );
  },
);

test(
  "mixed legacy and Firestore dates sort newest first",
  () => {
    const evaluations = [
      record("legacy-string", {
        timestamp:
          "2026-08-18T10:00:00.000Z",
      }),
      record("firestore", {
        timestamp: Timestamp.fromDate(
          new Date(
            "2026-08-20T10:00:00.000Z",
          ),
        ),
      }),
      record("date-instance", {
        timestamp: new Date(
          "2026-08-19T10:00:00.000Z",
        ),
      }),
      record("invalid", {
        timestamp: {
          unexpected: true,
        },
      }),
    ];

    evaluations.sort(
      comparePlayerEvaluationsNewestFirst,
    );

    assert.deepEqual(
      evaluations.map(
        (evaluation) => evaluation.id,
      ),
      [
        "firestore",
        "date-instance",
        "legacy-string",
        "invalid",
      ],
    );

    assert.equal(
      evaluationDateLabel(evaluations[3]),
      "Date unavailable",
    );
  },
);
