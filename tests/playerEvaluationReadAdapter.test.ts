import assert from "node:assert/strict";
import test from "node:test";

import type {
  CollectionReference,
  DocumentData,
} from "firebase/firestore";

import type { FirestoreSnapshotLike } from "../src/lib/firestore/canonicalDocument";

import {
  readAcademyPlayerEvaluations,
  type PlayerEvaluationCollectionReader,
} from "../src/services/playerEvaluationReadAdapter";

function collectionRef(path: string): CollectionReference<DocumentData> {
  return { path } as unknown as CollectionReference<DocumentData>;
}

function snapshot(
  id: string,
  data: Record<string, unknown>,
): FirestoreSnapshotLike {
  return {
    id,
    data: () => data,
  };
}

test("Academy Evaluation reader uses canonical snapshot ID and verified Academy path", async () => {
  const path = "academies/academy-a/player_evaluations";
  const calls: Array<{
    path: string;
    playerId: string;
  }> = [];

  const reader: PlayerEvaluationCollectionReader = async (
    ref,
    playerId,
  ) => {
    calls.push({
      path: ref.path,
      playerId,
    });

    return {
      docs: [
        snapshot("eval-real-id", {
          id: "spoofed-id",
          sourceCollectionPath: "player_evaluations",
          academy_id: "",
          player_id: "player-1",
          scores: {
            Passing: 2,
          },
        }),
      ],
    };
  };

  const records = await readAcademyPlayerEvaluations(
    "academy-a",
    collectionRef(path),
    "player-1",
    reader,
  );

  assert.deepEqual(calls, [
    {
      path,
      playerId: "player-1",
    },
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "eval-real-id");
  assert.equal(records[0].sourceCollectionPath, path);
  assert.equal(records[0].academy_id, "");
  assert.equal(records[0].player_id, "player-1");
});

test("Academy Evaluation reader refuses top-level Evaluation path before reading", async () => {
  let readCalled = false;

  const reader: PlayerEvaluationCollectionReader = async () => {
    readCalled = true;
    return { docs: [] };
  };

  await assert.rejects(
    () =>
      readAcademyPlayerEvaluations(
        "academy-a",
        collectionRef("player_evaluations"),
        "player-1",
        reader,
      ),
    /outside authorized Academy path/,
  );

  assert.equal(readCalled, false);
});

test("Academy Evaluation reader refuses another Academy path before reading", async () => {
  let readCalled = false;

  const reader: PlayerEvaluationCollectionReader = async () => {
    readCalled = true;
    return { docs: [] };
  };

  await assert.rejects(
    () =>
      readAcademyPlayerEvaluations(
        "academy-a",
        collectionRef(
          "academies/academy-b/player_evaluations",
        ),
        "player-1",
        reader,
      ),
    /outside authorized Academy path/,
  );

  assert.equal(readCalled, false);
});

test("Academy Evaluation reader preserves separate legacy records without deduplication", async () => {
  const path = "academies/academy-a/player_evaluations";

  const reader: PlayerEvaluationCollectionReader = async () => ({
    docs: [
      snapshot("eval-1", {
        academy_id: "",
        player_id: "player-1",
        evaluation_date: "2026-07-27",
        scores: { Passing: 2 },
      }),
      snapshot("eval-2", {
        academy_id: "",
        player_id: "player-1",
        evaluation_date: "2026-07-27",
        scores: { Passing: 2 },
      }),
    ],
  });

  const records = await readAcademyPlayerEvaluations(
    "academy-a",
    collectionRef(path),
    "player-1",
    reader,
  );

  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => record.id),
    ["eval-1", "eval-2"],
  );
});

test("Academy Evaluation reader rejects an empty Player identity before reading", async () => {
  let readCalled = false;

  const reader: PlayerEvaluationCollectionReader =
    async () => {
      readCalled = true;
      return { docs: [] };
    };

  await assert.rejects(
    () =>
      readAcademyPlayerEvaluations(
        "academy-a",
        collectionRef(
          "academies/academy-a/player_evaluations",
        ),
        "   ",
        reader,
      ),
    /playerId/,
  );

  assert.equal(readCalled, false);
});

test("Academy Evaluation reader keeps only the requested Player even if an injected reader returns another Player", async () => {
  const path =
    "academies/academy-a/player_evaluations";

  const reader: PlayerEvaluationCollectionReader =
    async (_ref, playerId) => {
      assert.equal(playerId, "player-1");

      return {
        docs: [
          snapshot("eval-player-1", {
            academy_id: "",
            player_id: "player-1",
            scores: { Passing: 2 },
          }),
          snapshot("eval-player-2", {
            academy_id: "",
            player_id: "player-2",
            scores: { Passing: 4 },
          }),
        ],
      };
    };

  const records =
    await readAcademyPlayerEvaluations(
      "academy-a",
      collectionRef(path),
      "player-1",
      reader,
    );

  assert.deepEqual(
    records.map((record) => record.id),
    ["eval-player-1"],
  );
});
