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
  const calls: string[] = [];

  const reader: PlayerEvaluationCollectionReader = async (ref) => {
    calls.push(ref.path);

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
    reader,
  );

  assert.deepEqual(calls, [path]);
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
    reader,
  );

  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => record.id),
    ["eval-1", "eval-2"],
  );
});