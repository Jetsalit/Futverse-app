import {
  getDocs,
  query,
  where,
  type CollectionReference,
  type DocumentData,
} from "firebase/firestore";

import {
  mapCanonicalSnapshot,
  type FirestoreSnapshotLike,
} from "../lib/firestore/canonicalDocument";

import {
  getAcademyPlayerEvaluationsPath,
  type LegacyPlayerEvaluationRecord,
} from "./playerEvaluationCompatibility";

export interface PlayerEvaluationReadSnapshotLike {
  readonly docs: readonly FirestoreSnapshotLike[];
}

export type PlayerEvaluationCollectionReader = (
  collectionRef: CollectionReference<DocumentData>,
  playerId: string,
) => Promise<PlayerEvaluationReadSnapshotLike>;

const defaultCollectionReader: PlayerEvaluationCollectionReader = async (
  collectionRef,
  playerId,
) =>
  getDocs(
    query(
      collectionRef,
      where("player_id", "==", playerId),
    ),
  );

function requirePlayerId(
  playerId: string,
): string {
  if (!playerId.trim()) {
    throw new Error(
      "playerId must be a non-empty Player identity.",
    );
  }

  return playerId;
}

/**
 * Maps legacy Evaluation snapshots without trusting stored document identity
 * or a stored sourceCollectionPath.
 *
 * The Firestore snapshot ID and the caller-verified Academy collection path
 * remain authoritative.
 */
export function mapAcademyPlayerEvaluationSnapshots(
  academyId: string,
  sourceCollectionPath: string,
  snapshots: readonly FirestoreSnapshotLike[],
): LegacyPlayerEvaluationRecord[] {
  const expectedPath = getAcademyPlayerEvaluationsPath(academyId);

  if (sourceCollectionPath !== expectedPath) {
    throw new Error(
      `Refusing Evaluation read outside authorized Academy path: expected ${expectedPath}.`,
    );
  }

  return snapshots.map((snapshot) => {
    const canonical = mapCanonicalSnapshot<Record<string, unknown>>(snapshot);

    return {
      ...(canonical as unknown as LegacyPlayerEvaluationRecord),
      id: canonical.id,
      sourceCollectionPath,
    };
  });
}

/**
 * Read-only Academy Evaluation adapter.
 *
 * No top-level or superadmin_system fallback is allowed for player
 * evaluations. Legacy academy_id values are not used as tenant authority.
 */
export async function readAcademyPlayerEvaluations(
  academyId: string,
  collectionRef: CollectionReference<DocumentData>,
  playerId: string,
  readCollection: PlayerEvaluationCollectionReader = defaultCollectionReader,
): Promise<LegacyPlayerEvaluationRecord[]> {
  const expectedPath = getAcademyPlayerEvaluationsPath(academyId);

  if (collectionRef.path !== expectedPath) {
    throw new Error(
      `Refusing Evaluation read outside authorized Academy path: expected ${expectedPath}.`,
    );
  }

  const safePlayerId =
    requirePlayerId(playerId);

  const snapshot = await readCollection(
    collectionRef,
    safePlayerId,
  );

  return mapAcademyPlayerEvaluationSnapshots(
    academyId,
    collectionRef.path,
    snapshot.docs,
  ).filter(
    (evaluation) =>
      evaluation.player_id === safePlayerId,
  );
}
