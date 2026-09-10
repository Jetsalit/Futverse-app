import {
  Timestamp,
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
} from "firebase/firestore";

import { db } from "../firebase";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSessionCardinality,
  buildWeeklyTrainingSavedDraftSummary,
  type WeeklyTrainingSavedDraftAuditBinding,
  type WeeklyTrainingSavedDraftDetail,
  type WeeklyTrainingSavedDraftDocument,
  type WeeklyTrainingSavedDraftSessionDocument,
  type WeeklyTrainingSavedDraftSummary,
  type WeeklyTrainingSavedDraftTimestampOrder,
} from "../proClubWeeklyTrainingSavedDraftReadModel";

export const WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE = 20 as const;

export interface WeeklyTrainingSavedDraftPageCursor {
  readonly updatedAt: WeeklyTrainingSavedDraftTimestampOrder;
  readonly planId: string;
}

export interface WeeklyTrainingSavedDraftPage {
  readonly items: readonly WeeklyTrainingSavedDraftSummary[];
  readonly nextCursor: WeeklyTrainingSavedDraftPageCursor | null;
}

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
    maxDocuments?: number,
  ) => Promise<readonly WeeklyTrainingSavedDraftDocument[]>;
  readonly listPlanPage: (
    clubId: string,
    actorUid: string,
    cursor: WeeklyTrainingSavedDraftPageCursor | null,
    maxDocuments: number,
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

function validReadLimit(value: number | undefined): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 100);
}

function validTimestampOrder(value: WeeklyTrainingSavedDraftTimestampOrder | null | undefined): boolean {
  return Boolean(
    value &&
      Number.isSafeInteger(value.seconds) &&
      Number.isInteger(value.nanoseconds) &&
      value.nanoseconds >= 0 &&
      value.nanoseconds <= 999_999_999,
  );
}

function validPageCursor(value: WeeklyTrainingSavedDraftPageCursor | null): boolean {
  return value === null || (isValidDocumentIdentifier(value.planId) && validTimestampOrder(value.updatedAt));
}

export const firestoreWeeklyTrainingSavedDraftReadOps: WeeklyTrainingSavedDraftReadOps = {
  async listDocuments(path, filters = [], maxDocuments) {
    if (!validPath(path) || path.length % 2 === 0 || !validReadLimit(maxDocuments)) {
      throw new Error("Saved-DRAFT collection read contract is invalid.");
    }
    const [first, ...rest] = path;
    if (!first) throw new Error("Saved-DRAFT collection path is invalid.");
    const ref = collection(db, first, ...rest);
    const constraints: QueryConstraint[] = filters.map((filter) => where(filter.field, "==", filter.value));
    if (maxDocuments !== undefined) constraints.push(limit(maxDocuments));
    const snapshot = await getDocsFromServer(query(ref, ...constraints));
    return snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
  },

  async listPlanPage(clubId, actorUid, cursor, maxDocuments) {
    if (
      !isValidDocumentIdentifier(clubId) ||
      !isValidDocumentIdentifier(actorUid) ||
      !validPageCursor(cursor) ||
      !validReadLimit(maxDocuments)
    ) {
      throw new Error("Saved-DRAFT history page read contract is invalid.");
    }
    const ref = collection(db, "proClubs", clubId, "weeklyTrainingPlans");
    const constraints: QueryConstraint[] = [
      where("authorUid", "==", actorUid),
      where("status", "==", "DRAFT"),
      orderBy("updatedAt", "desc"),
      orderBy(documentId(), "desc"),
    ];
    if (cursor) {
      constraints.push(
        startAfter(
          new Timestamp(cursor.updatedAt.seconds, cursor.updatedAt.nanoseconds),
          cursor.planId,
        ),
      );
    }
    constraints.push(limit(maxDocuments));
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
  cursor: WeeklyTrainingSavedDraftPageCursor | null = null,
  ops: WeeklyTrainingSavedDraftReadOps = firestoreWeeklyTrainingSavedDraftReadOps,
): Promise<WeeklyTrainingSavedDraftReadResult<WeeklyTrainingSavedDraftPage>> {
  if (!validBinding(clubId, actorUid) || !validPageCursor(cursor)) {
    return invalid("Invalid saved-DRAFT list binding or cursor.");
  }

  let documents: readonly WeeklyTrainingSavedDraftDocument[];
  try {
    documents = await ops.listPlanPage(
      clubId,
      actorUid,
      cursor,
      WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE + 1,
    );
  } catch (error) {
    return failure(error);
  }

  const visible = documents.slice(0, WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE);
  const summaries: WeeklyTrainingSavedDraftSummary[] = [];
  for (const document of visible) {
    const parsed = buildWeeklyTrainingSavedDraftSummary({ clubId, actorUid, document });
    if (parsed.state !== "VALID") {
      return { state: "INVALID_DATA", error: parsed.error };
    }
    summaries.push(parsed.value);
  }

  const last = summaries.at(-1);
  const nextCursor = documents.length > WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE && last
    ? { updatedAt: last.updatedAtOrder, planId: last.planId }
    : null;

  return { state: "FOUND", value: { items: summaries, nextCursor } };
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

  const expectedAudit: WeeklyTrainingSavedDraftAuditBinding = {
    actorUid: planSummary.value.authorUid,
    timestamp: planSummary.value.createdAtOrder,
  };

  let sessionDocuments: readonly WeeklyTrainingSavedDraftDocument[];
  try {
    sessionDocuments = await ops.listDocuments(
      ["proClubs", clubId, "weeklyTrainingPlans", planId, "sessions"],
      undefined,
      planSummary.value.sessionCount + 1,
    );
  } catch (error) {
    return failure(error);
  }

  if (sessionDocuments.length !== planSummary.value.sessionCount) {
    return invalid("Saved-DRAFT session hierarchy cardinality does not match trusted plan metadata.");
  }

  const sessionCardinalities = sessionDocuments.map((sessionDocument) =>
    buildWeeklyTrainingSavedDraftSessionCardinality(sessionDocument, expectedAudit),
  );
  if (sessionCardinalities.some((entry) => entry.state !== "VALID")) {
    return invalid("Saved-DRAFT session metadata failed validation before child reads.");
  }
  const orderedCardinalities = sessionCardinalities
    .map((entry) => {
      if (entry.state !== "VALID") throw new Error("Unreachable saved-DRAFT session state.");
      return entry.value;
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);
  if (orderedCardinalities.some((entry, index) => entry.orderIndex !== index)) {
    return invalid("Saved-DRAFT session ordering is invalid before child reads.");
  }
  const cardinalityBySessionId = new Map(
    orderedCardinalities.map((entry) => [entry.sessionId, entry.blockCount] as const),
  );

  let sessions: readonly WeeklyTrainingSavedDraftSessionDocument[];
  try {
    sessions = await Promise.all(
      sessionDocuments.map(async (sessionDocument) => {
        const expectedBlockCount = cardinalityBySessionId.get(sessionDocument.id);
        if (expectedBlockCount === undefined) throw new Error("Validated session cardinality is missing.");
        return {
          document: sessionDocument,
          blocks: await ops.listDocuments(
            [
              "proClubs",
              clubId,
              "weeklyTrainingPlans",
              planId,
              "sessions",
              sessionDocument.id,
              "blocks",
            ],
            undefined,
            expectedBlockCount + 1,
          ),
        };
      }),
    );
  } catch (error) {
    return failure(error);
  }

  if (sessions.some((entry) => entry.blocks.length !== cardinalityBySessionId.get(entry.document.id))) {
    return invalid("Saved-DRAFT block hierarchy cardinality does not match trusted session metadata.");
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
