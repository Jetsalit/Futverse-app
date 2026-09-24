import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  writeBatch,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

import {
  ACADEMY_FITNESS_RESULTS_COLLECTION,
  isStrictAcademyFitnessObservedOn,
  selectAcademyFitnessHistory,
  selectAcademyFitnessResultsForDate,
  validateAcademyFitnessResultCreateInput,
  type AcademyFitnessResultDraftEntry,
  type AcademyFitnessResultHistoryEntry,
} from "../academyFitnessResult";
import type { FitnessTestDefinition } from "../fitnessTestFoundation";
import { isExactPlayerKey } from "../playerIdentityFoundation";

// Each write checks the player and actor in Rules. Small batches stay within
// Firestore's Rules document-access budget even for different players.
const RESULTS_PER_BATCH = 8;

function exactDocumentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim() === value && !value.includes("/");
}

export async function createAcademyFitnessResultEntries(input: {
  firestore: Firestore;
  academyId: string;
  actorUid: string;
  entries: readonly AcademyFitnessResultDraftEntry[];
  onCommitted?: (entries: readonly AcademyFitnessResultDraftEntry[]) => void;
}): Promise<void> {
  if (!exactDocumentId(input.academyId) || !exactDocumentId(input.actorUid)) {
    throw new Error("Invalid Fitness result Academy or actor identity.");
  }
  if (input.entries.length === 0) return;

  // Validate the entire request before starting the first batch. Rules remain
  // the authority for membership, player existence and recordedBy.
  const validated = input.entries.map((entry) => {
    const result = validateAcademyFitnessResultCreateInput(entry.input);
    if (!result.ok || entry.playerId !== entry.input.playerId) {
      throw new Error("Invalid Fitness result entry.");
    }
    return result.value;
  });
  const results = collection(
    input.firestore,
    "academies",
    input.academyId,
    ACADEMY_FITNESS_RESULTS_COLLECTION,
  );

  for (let start = 0; start < validated.length; start += RESULTS_PER_BATCH) {
    const batch = writeBatch(input.firestore);
    const chunk = validated.slice(start, start + RESULTS_PER_BATCH);
    for (const result of chunk) {
      batch.set(doc(results), {
        ...result,
        recordedAt: serverTimestamp(),
        recordedBy: input.actorUid,
      });
    }
    await batch.commit();
    input.onCommitted?.(input.entries.slice(start, start + chunk.length));
  }
}

export function watchAcademyFitnessResultsForDate(input: {
  firestore: Firestore;
  academyId: string;
  observedOn: string;
  definitions: readonly FitnessTestDefinition[];
  onResults: (results: Record<string, Record<string, number>>) => void;
  onError: (error: Error) => void;
}): Unsubscribe {
  if (!exactDocumentId(input.academyId) || !isStrictAcademyFitnessObservedOn(input.observedOn)) {
    throw new Error("Invalid Academy Fitness result read scope.");
  }
  const resultsQuery = query(
    collection(input.firestore, "academies", input.academyId, ACADEMY_FITNESS_RESULTS_COLLECTION),
    where("observedOn", "==", input.observedOn),
  );
  return onSnapshot(
    resultsQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      input.onResults(selectAcademyFitnessResultsForDate({
        observedOn: input.observedOn,
        definitions: input.definitions,
        records: snapshot.docs.map((document) => ({ id: document.id, data: document.data() })),
      }));
    },
    input.onError,
  );
}

export function watchAcademyFitnessResultHistory(input: {
  firestore: Firestore;
  academyId: string;
  playerId: string;
  definitions: readonly FitnessTestDefinition[];
  onResults: (results: AcademyFitnessResultHistoryEntry[]) => void;
  onError: (error: Error) => void;
}): Unsubscribe {
  if (!exactDocumentId(input.academyId) || !isExactPlayerKey(input.playerId)) {
    throw new Error("Invalid Academy Fitness result history scope.");
  }
  const historyQuery = query(
    collection(input.firestore, "academies", input.academyId, ACADEMY_FITNESS_RESULTS_COLLECTION),
    where("playerId", "==", input.playerId),
  );
  return onSnapshot(
    historyQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      input.onResults(selectAcademyFitnessHistory({
        playerId: input.playerId,
        definitions: input.definitions,
        records: snapshot.docs.map((document) => ({ id: document.id, data: document.data() })),
      }));
    },
    input.onError,
  );
}
