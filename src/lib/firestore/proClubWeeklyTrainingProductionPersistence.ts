import {
  doc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { db } from "../firebase";
import { isValidDocumentIdentifier } from "../proClubModel";
import type { ProClubWeeklyTrainingDraft } from "../proClubWeeklyTraining";
import {
  buildProClubWeeklyTrainingDraftWrite,
  type ProClubWeeklyTrainingDraftPersistenceBundle,
} from "./proClubWeeklyTrainingPersistence";
import {
  getHeadCoachWeeklyTrainingSavedDraftDetail,
  type WeeklyTrainingSavedDraftReadResult,
} from "./proClubWeeklyTrainingSavedDraftReadAdapter";
import type { WeeklyTrainingSavedDraftDetail } from "../proClubWeeklyTrainingSavedDraftReadModel";

export const PRO_CLUB_WEEKLY_TRAINING_MAX_HIERARCHY_DOCUMENTS = 183 as const;
export const PRO_CLUB_WEEKLY_TRAINING_MAX_PRODUCTION_BATCH_DOCUMENTS = 184 as const;

export interface ProClubWeeklyTrainingProductionSaveInput {
  readonly requestId: string;
  readonly clubId: string;
  readonly actorUid: string;
  readonly draft: ProClubWeeklyTrainingDraft;
}

export interface ProClubWeeklyTrainingProductionSaveResult {
  readonly status: "COMPLETED";
  readonly requestId: string;
  readonly clubId: string;
  readonly planId: string;
  readonly documentCount: number;
  readonly createdAt: string;
}

export interface ProClubWeeklyTrainingPreparedProductionWrite {
  readonly requestId: string;
  readonly clubId: string;
  readonly actorUid: string;
  readonly planId: string;
  readonly hierarchyDocumentCount: number;
  readonly batchDocumentCount: number;
  readonly manifestPath: string;
  readonly bundle: ProClubWeeklyTrainingDraftPersistenceBundle;
}

export type ProClubWeeklyTrainingProductionReadDetail = (
  clubId: string,
  actorUid: string,
  planId: string,
) => Promise<WeeklyTrainingSavedDraftReadResult<WeeklyTrainingSavedDraftDetail>>;

export interface ProClubWeeklyTrainingProductionPersistenceOps {
  readonly commitPreparedWrite: (
    prepared: ProClubWeeklyTrainingPreparedProductionWrite,
  ) => Promise<void>;
  readonly readDetail: ProClubWeeklyTrainingProductionReadDetail;
}

export class ProClubWeeklyTrainingProductionPersistenceError extends Error {
  constructor(
    readonly code:
      | "invalid-argument"
      | "failed-precondition"
      | "permission-denied"
      | "unauthenticated"
      | "unavailable",
  ) {
    super(code);
    this.name = "ProClubWeeklyTrainingProductionPersistenceError";
  }
}

function hierarchyDocumentCount(
  bundle: ProClubWeeklyTrainingDraftPersistenceBundle,
): number {
  return (
    1 +
    bundle.sessions.length +
    bundle.sessions.reduce((sum, session) => sum + session.blocks.length, 0)
  );
}

function sameCanonicalBundle(
  left: ProClubWeeklyTrainingDraftPersistenceBundle,
  right: ProClubWeeklyTrainingDraftPersistenceBundle,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function proClubWeeklyTrainingDraftCreateRequestPath(
  clubId: unknown,
  requestId: unknown,
): string | null {
  if (!isValidDocumentIdentifier(clubId)) return null;
  if (!isValidDocumentIdentifier(requestId)) return null;
  return `proClubs/${clubId}/weeklyTrainingDraftCreateRequests/${requestId}`;
}

export function prepareProClubWeeklyTrainingProductionWrite(
  input: ProClubWeeklyTrainingProductionSaveInput,
): ProClubWeeklyTrainingPreparedProductionWrite {
  if (
    !isValidDocumentIdentifier(input.requestId) ||
    !isValidDocumentIdentifier(input.clubId) ||
    !isValidDocumentIdentifier(input.actorUid) ||
    input.draft.clubId !== input.clubId ||
    input.draft.authorUid !== input.actorUid
  ) {
    throw new ProClubWeeklyTrainingProductionPersistenceError("invalid-argument");
  }

  const planId = input.requestId;
  const built = buildProClubWeeklyTrainingDraftWrite({
    clubId: input.clubId,
    planId,
    plan: input.draft,
  });
  if (built.state !== "VALID") {
    throw new ProClubWeeklyTrainingProductionPersistenceError("invalid-argument");
  }

  const manifestPath = proClubWeeklyTrainingDraftCreateRequestPath(
    input.clubId,
    input.requestId,
  );
  if (!manifestPath) {
    throw new ProClubWeeklyTrainingProductionPersistenceError("invalid-argument");
  }

  const hierarchyCount = hierarchyDocumentCount(built.bundle);
  const batchDocumentCount = hierarchyCount + 1;
  if (
    hierarchyCount < 3 ||
    hierarchyCount > PRO_CLUB_WEEKLY_TRAINING_MAX_HIERARCHY_DOCUMENTS ||
    batchDocumentCount > PRO_CLUB_WEEKLY_TRAINING_MAX_PRODUCTION_BATCH_DOCUMENTS
  ) {
    throw new ProClubWeeklyTrainingProductionPersistenceError("invalid-argument");
  }

  return {
    requestId: input.requestId,
    clubId: input.clubId,
    actorUid: input.actorUid,
    planId,
    hierarchyDocumentCount: hierarchyCount,
    batchDocumentCount,
    manifestPath,
    bundle: built.bundle,
  };
}

export async function commitProClubWeeklyTrainingProductionWrite(
  firestore: Firestore,
  prepared: ProClubWeeklyTrainingPreparedProductionWrite,
): Promise<void> {
  const batch = writeBatch(firestore);
  const timestamp = serverTimestamp();
  const audit = {
    createdAt: timestamp,
    createdBy: prepared.actorUid,
    updatedAt: timestamp,
    updatedBy: prepared.actorUid,
  };

  batch.set(doc(firestore, prepared.manifestPath), {
    schemaVersion: 1,
    requestId: prepared.requestId,
    planId: prepared.planId,
    actorUid: prepared.actorUid,
    weekStartDate: prepared.bundle.planPayload.weekStartDate,
    sessionCount: prepared.bundle.planPayload.sessionCount,
    documentCount: prepared.batchDocumentCount,
    createdAt: timestamp,
    createdBy: prepared.actorUid,
  });

  batch.set(doc(firestore, prepared.bundle.planPath), {
    ...prepared.bundle.planPayload,
    ...audit,
  });

  for (const session of prepared.bundle.sessions) {
    batch.set(doc(firestore, session.path), {
      ...session.payload,
      ...audit,
    });
    for (const block of session.blocks) {
      batch.set(doc(firestore, block.path), {
        ...block.payload,
        ...audit,
      });
    }
  }

  await batch.commit();
}

function completionFromDetail(
  prepared: ProClubWeeklyTrainingPreparedProductionWrite,
  detail: WeeklyTrainingSavedDraftDetail,
): ProClubWeeklyTrainingProductionSaveResult {
  const rebuilt = buildProClubWeeklyTrainingDraftWrite({
    clubId: prepared.clubId,
    planId: prepared.planId,
    plan: detail.draft,
  });
  if (
    rebuilt.state !== "VALID" ||
    detail.planId !== prepared.planId ||
    detail.clubId !== prepared.clubId ||
    detail.authorUid !== prepared.actorUid ||
    !sameCanonicalBundle(rebuilt.bundle, prepared.bundle)
  ) {
    throw new ProClubWeeklyTrainingProductionPersistenceError("failed-precondition");
  }

  return {
    status: "COMPLETED",
    requestId: prepared.requestId,
    clubId: prepared.clubId,
    planId: prepared.planId,
    documentCount: prepared.hierarchyDocumentCount,
    createdAt: detail.createdAt,
  };
}

async function reconcilePreparedWrite(
  prepared: ProClubWeeklyTrainingPreparedProductionWrite,
  readDetail: ProClubWeeklyTrainingProductionReadDetail,
): Promise<ProClubWeeklyTrainingProductionSaveResult | null> {
  const result = await readDetail(
    prepared.clubId,
    prepared.actorUid,
    prepared.planId,
  );

  switch (result.state) {
    case "FOUND":
      return completionFromDetail(prepared, result.value);
    case "MISSING":
      return null;
    case "PERMISSION_DENIED":
      throw new ProClubWeeklyTrainingProductionPersistenceError("permission-denied");
    case "INVALID_DATA":
      throw new ProClubWeeklyTrainingProductionPersistenceError("failed-precondition");
    default:
      throw new ProClubWeeklyTrainingProductionPersistenceError("unavailable");
  }
}

function normalizedCommitError(
  error: unknown,
): ProClubWeeklyTrainingProductionPersistenceError {
  if (error instanceof ProClubWeeklyTrainingProductionPersistenceError) {
    return error;
  }
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "unauthenticated" || code === "firestore/unauthenticated") {
    return new ProClubWeeklyTrainingProductionPersistenceError("unauthenticated");
  }
  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return new ProClubWeeklyTrainingProductionPersistenceError("permission-denied");
  }
  if (code === "invalid-argument" || code === "firestore/invalid-argument") {
    return new ProClubWeeklyTrainingProductionPersistenceError("invalid-argument");
  }
  if (code === "failed-precondition" || code === "firestore/failed-precondition") {
    return new ProClubWeeklyTrainingProductionPersistenceError("failed-precondition");
  }
  return new ProClubWeeklyTrainingProductionPersistenceError("unavailable");
}

export const defaultProClubWeeklyTrainingProductionPersistenceOps: ProClubWeeklyTrainingProductionPersistenceOps = {
  commitPreparedWrite: async (prepared) => {
    await commitProClubWeeklyTrainingProductionWrite(db, prepared);
  },
  readDetail: async (clubId, actorUid, planId) =>
    await getHeadCoachWeeklyTrainingSavedDraftDetail(clubId, actorUid, planId),
};

export async function saveProClubWeeklyTrainingFreshDraftToProductionFirestore(
  input: ProClubWeeklyTrainingProductionSaveInput,
  ops: ProClubWeeklyTrainingProductionPersistenceOps =
    defaultProClubWeeklyTrainingProductionPersistenceOps,
): Promise<ProClubWeeklyTrainingProductionSaveResult> {
  const prepared = prepareProClubWeeklyTrainingProductionWrite(input);

  try {
    await ops.commitPreparedWrite(prepared);
  } catch (error) {
    try {
      const reconciled = await reconcilePreparedWrite(prepared, ops.readDetail);
      if (reconciled) return reconciled;
    } catch (reconcileError) {
      throw normalizedCommitError(reconcileError);
    }
    throw normalizedCommitError(error);
  }

  try {
    const reconciled = await reconcilePreparedWrite(prepared, ops.readDetail);
    if (reconciled) return reconciled;
  } catch (error) {
    throw normalizedCommitError(error);
  }

  throw new ProClubWeeklyTrainingProductionPersistenceError("unavailable");
}
