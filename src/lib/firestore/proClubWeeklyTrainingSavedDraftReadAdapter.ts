import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
} from "firebase/firestore";

import { db } from "../firebase";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSummary,
  sortWeeklyTrainingSavedDraftSummaries,
  type WeeklyTrainingSavedDraftDetail,
  type WeeklyTrainingSavedDraftDocument,
  type WeeklyTrainingSavedDraftSessionDocument,
  type WeeklyTrainingSavedDraftSummary,
} from "../proClubWeeklyTrainingSavedDraftReadModel";

export type WeeklyTrainingSavedDraftReadResult<T> =
  | { readonly state: "FOUND"; readonly value: T }
  | { readonly state: "MISSING" }
  | { readonly state: "PERMISSION_DENIED"; readonly error: Error }
  | { readonly state: "INVALID_DATA"; readonly error: Error }
  | { readonly state: "ERROR"; readonly error: Error };

export interface WeeklyTrainingSavedDraftReadOps {
  readonly listDocuments: (
    path: readonly string[],
    filters?: readonly { field: string; value: string }[],
  ) => Promise<readonly WeeklyTrainingSavedDraftDocument[]>;
  readonly readDocument: (
    path: readonly string[],
  ) => Promise<WeeklyTrainingSavedDraftDocument | null>;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function failure<T>(error: unknown): WeeklyTrainingSavedDraftReadResult<T> {
  const normalized = toError(error);
  const code = errorCode(error);
  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return { state: "PERMISSION_DENIED", error: normalized };
  }
  return { state: "ERROR", error: normalized };
}

function invalid<T>(message: string): WeeklyTrainingSavedDraftReadResult<T> {
  return { state: "INVALID_DATA", error: new Error(message) };
}

function validPath(path: readonly string[]): boolean {
  return path.length > 0 && path.every(isValidDocumentIdentifier);
}

export const firestoreWeeklyTrainingSavedDraftReadOps: WeeklyTrainingSavedDraftReadOps = {
  async listDocuments(path, filters = []) {
    if (!validPath(path) || path.length % 2 === 0) {
      throw new Error("Saved-DRAFT collection path is invalid.");
    }
    const [first, ...rest] = path;
    if (!first) throw new Error("Saved-DRAFT collection path is invalid.");
    const ref = collection(db, first, ...rest);
    const constraints = filters.map((filter) => where(filter.field, "==", filter.value));
    const snapshot = await getDocsFromServer(query(ref, ...constraints));
    return snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
  },

  async readDocument(path) {
    if (!validPath(path) || path.length % 2 !== 0) {
      throw new Error("Saved-DRAFT document path is invalid.");
    }
    const [first, ...rest] = path;
    if (!first) throw new Error("Saved-DRAFT document path is invalid.");
    const snapshot = await getDocFromServer(doc(db, first, ...rest));
    return snapshot.exists() ? { id: snapshot.id, data: snapshot.data() } : null;
  },
};

function validBinding(clubId: unknown, actorUid: unknown): clubId is string {
  return isValidDocumentIdentifier(clubId) && isValidDocumentIdentifier(actorUid);
}

export async function listHeadCoachWeeklyTrainingSavedDrafts(
  clubId: string,
  actorUid: string,
  ops: WeeklyTrainingSavedDraftReadOps = firestoreWeeklyTrainingSavedDraftReadOps,
): Promise<WeeklyTrainingSavedDraftReadResult<readonly WeeklyTrainingSavedDraftSummary[]>> {
  if (!validBinding(clubId, actorUid)) {
    return invalid("Invalid saved-DRAFT list binding.");
  }

  let documents: readonly WeeklyTrainingSavedDraftDocument[];
  try {
    documents = await ops.listDocuments(
      ["proClubs", clubId, "weeklyTrainingPlans"],
      [
        { field: "authorUid", value: actorUid },
        { field: "status", value: "DRAFT" },
      ],
    );
  } catch (error) {
    return failure(error);
  }

  const summaries: WeeklyTrainingSavedDraftSummary[] = [];
  for (const document of documents) {
    const parsed = buildWeeklyTrainingSavedDraftSummary({ clubId, actorUid, document });
    if (parsed.state !== "VALID") {
      return { state: "INVALID_DATA", error: parsed.error };
    }
    summaries.push(parsed.value);
  }

  return { state: "FOUND", value: sortWeeklyTrainingSavedDraftSummaries(summaries) };
}

export async function getHeadCoachWeeklyTrainingSavedDraftDetail(
  clubId: string,
  actorUid: string,
  planId: string,
  ops: WeeklyTrainingSavedDraftReadOps = firestoreWeeklyTrainingSavedDraftReadOps,
): Promise<WeeklyTrainingSavedDraftReadResult<WeeklyTrainingSavedDraftDetail>> {
  if (!validBinding(clubId, actorUid) || !isValidDocumentIdentifier(planId)) {
    return invalid("Invalid saved-DRAFT detail binding.");
  }

  let planDocument: WeeklyTrainingSavedDraftDocument | null;
  try {
    planDocument = await ops.readDocument([
      "proClubs",
      clubId,
      "weeklyTrainingPlans",
      planId,
    ]);
  } catch (error) {
    return failure(error);
  }
  if (!planDocument) return { state: "MISSING" };

  const planSummary = buildWeeklyTrainingSavedDraftSummary({
    clubId,
    actorUid,
    document: planDocument,
  });
  if (planSummary.state !== "VALID") {
    const raw = planDocument.data as { authorUid?: unknown; status?: unknown } | null;
    if (raw && (raw.authorUid !== actorUid || raw.status !== "DRAFT")) {
      return { state: "MISSING" };
    }
    return { state: "INVALID_DATA", error: planSummary.error };
  }

  let sessionDocuments: readonly WeeklyTrainingSavedDraftDocument[];
  try {
    sessionDocuments = await ops.listDocuments([
      "proClubs",
      clubId,
      "weeklyTrainingPlans",
      planId,
      "sessions",
    ]);
  } catch (error) {
    return failure(error);
  }

  let sessions: readonly WeeklyTrainingSavedDraftSessionDocument[];
  try {
    sessions = await Promise.all(
      sessionDocuments.map(async (sessionDocument) => ({
        document: sessionDocument,
        blocks: await ops.listDocuments([
          "proClubs",
          clubId,
          "weeklyTrainingPlans",
          planId,
          "sessions",
          sessionDocument.id,
          "blocks",
        ]),
      })),
    );
  } catch (error) {
    return failure(error);
  }

  const detail = buildWeeklyTrainingSavedDraftDetail({
    clubId,
    actorUid,
    planDocument,
    sessions,
  });
  if (detail.state !== "VALID") {
    return { state: "INVALID_DATA", error: detail.error };
  }
  return { state: "FOUND", value: detail.value };
}
