import { httpsCallable } from "firebase/functions";
import { FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE } from "../config/runtimeCapabilities";
import { functions } from "./firebase";
import { isValidDocumentIdentifier } from "./proClubModel";
import {
  parseProClubWeeklyTrainingDraft,
  type ProClubWeeklyTrainingDraft,
} from "./proClubWeeklyTraining";

export const WEEKLY_TRAINING_DRAFT_SAVE_CALLABLE =
  "saveProClubWeeklyTrainingDraftV1" as const;

export type ProClubWeeklyTrainingFreshDraftInput = Omit<
  ProClubWeeklyTrainingDraft,
  "clubId" | "authorUid" | "technicalDirectorNote"
>;

export interface ProClubWeeklyTrainingDraftSaveRequest {
  requestId: string;
  draft: ProClubWeeklyTrainingDraft;
}

export interface ProClubWeeklyTrainingDraftSaveResult {
  status: "COMPLETED";
  requestId: string;
  clubId: string;
  planId: string;
  documentCount: number;
  createdAt: string;
}

export type ProClubWeeklyTrainingDraftSaveClientErrorCode =
  | "UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "INVALID_ARGUMENT"
  | "FAILED_PRECONDITION"
  | "INVALID_RESPONSE"
  | "NETWORK";

export class ProClubWeeklyTrainingDraftSaveClientError extends Error {
  constructor(readonly code: ProClubWeeklyTrainingDraftSaveClientErrorCode) {
    super(code);
    this.name = "ProClubWeeklyTrainingDraftSaveClientError";
  }
}

export type WeeklyTrainingDraftSaveCallableCaller = (
  request: ProClubWeeklyTrainingDraftSaveRequest,
) => Promise<{ data: unknown }>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isCanonicalWeeklyTrainingDraftSaveRequestId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  );
}

export function createWeeklyTrainingDraftSaveRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new ProClubWeeklyTrainingDraftSaveClientError("UNAVAILABLE");
  }
  const requestId = globalThis.crypto.randomUUID();
  if (!isCanonicalWeeklyTrainingDraftSaveRequestId(requestId)) {
    throw new ProClubWeeklyTrainingDraftSaveClientError("UNAVAILABLE");
  }
  return requestId;
}

function expectedDocumentCount(draft: ProClubWeeklyTrainingDraft): number {
  return (
    1 +
    draft.sessions.length +
    draft.sessions.reduce((sum, session) => sum + session.blocks.length, 0)
  );
}

function isCanonicalServerTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function containsClosedTechnicalDirectorNote(value: unknown): boolean {
  const record = asRecord(value);
  if (!record || !("technicalDirectorNote" in record)) return false;
  const note = record.technicalDirectorNote;
  return typeof note !== "string" || note.trim().length > 0;
}

function normalizeCallableError(error: unknown): ProClubWeeklyTrainingDraftSaveClientError {
  if (error instanceof ProClubWeeklyTrainingDraftSaveClientError) return error;

  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (code === "unauthenticated" || code === "functions/unauthenticated") {
    return new ProClubWeeklyTrainingDraftSaveClientError("AUTH_REQUIRED");
  }
  if (code === "permission-denied" || code === "functions/permission-denied") {
    return new ProClubWeeklyTrainingDraftSaveClientError("PERMISSION_DENIED");
  }
  if (code === "invalid-argument" || code === "functions/invalid-argument") {
    return new ProClubWeeklyTrainingDraftSaveClientError("INVALID_ARGUMENT");
  }
  if (code === "failed-precondition" || code === "functions/failed-precondition") {
    return new ProClubWeeklyTrainingDraftSaveClientError("FAILED_PRECONDITION");
  }
  return new ProClubWeeklyTrainingDraftSaveClientError("NETWORK");
}

export function isAmbiguousWeeklyTrainingDraftSaveError(error: unknown): boolean {
  return (
    error instanceof ProClubWeeklyTrainingDraftSaveClientError &&
    (error.code === "NETWORK" || error.code === "INVALID_RESPONSE")
  );
}

export const defaultWeeklyTrainingDraftSaveCallableCaller: WeeklyTrainingDraftSaveCallableCaller =
  async (request) => {
    if (!FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE) {
      throw new ProClubWeeklyTrainingDraftSaveClientError("UNAVAILABLE");
    }

    const callable = httpsCallable<ProClubWeeklyTrainingDraftSaveRequest, unknown>(
      functions,
      WEEKLY_TRAINING_DRAFT_SAVE_CALLABLE,
    );
    return await callable(request);
  };

export async function saveProClubWeeklyTrainingFreshDraft(
  input: {
    requestId: string;
    clubId: string;
    actorUid: string;
    draft: ProClubWeeklyTrainingFreshDraftInput;
  },
  caller: WeeklyTrainingDraftSaveCallableCaller =
    defaultWeeklyTrainingDraftSaveCallableCaller,
): Promise<ProClubWeeklyTrainingDraftSaveResult> {
  if (
    !isCanonicalWeeklyTrainingDraftSaveRequestId(input.requestId) ||
    !isValidDocumentIdentifier(input.clubId) ||
    !isValidDocumentIdentifier(input.actorUid) ||
    containsClosedTechnicalDirectorNote(input.draft)
  ) {
    throw new ProClubWeeklyTrainingDraftSaveClientError("INVALID_ARGUMENT");
  }

  const boundDraft: ProClubWeeklyTrainingDraft = {
    ...input.draft,
    clubId: input.clubId,
    authorUid: input.actorUid,
  };

  const parsed = parseProClubWeeklyTrainingDraft(boundDraft);
  if (parsed.state !== "VALID") {
    throw new ProClubWeeklyTrainingDraftSaveClientError("INVALID_ARGUMENT");
  }

  let result: { data: unknown };
  try {
    result = await caller({ requestId: input.requestId, draft: parsed.value });
  } catch (error) {
    throw normalizeCallableError(error);
  }

  const response = asRecord(result?.data);
  const expectedCount = expectedDocumentCount(parsed.value);
  if (
    !response ||
    response.status !== "COMPLETED" ||
    response.requestId !== input.requestId ||
    response.clubId !== input.clubId ||
    !isValidDocumentIdentifier(response.planId) ||
    typeof response.documentCount !== "number" ||
    !Number.isInteger(response.documentCount) ||
    response.documentCount !== expectedCount ||
    !isCanonicalServerTimestamp(response.createdAt)
  ) {
    throw new ProClubWeeklyTrainingDraftSaveClientError("INVALID_RESPONSE");
  }

  return {
    status: "COMPLETED",
    requestId: response.requestId,
    clubId: response.clubId,
    planId: response.planId,
    documentCount: response.documentCount,
    createdAt: response.createdAt,
  };
}

export function weeklyTrainingDraftSaveClientErrorMessage(
  error: unknown,
): string {
  const code =
    error instanceof ProClubWeeklyTrainingDraftSaveClientError
      ? error.code
      : "NETWORK";

  switch (code) {
    case "UNAVAILABLE":
      return "Weekly Training draft saving is not enabled in this web environment.";
    case "AUTH_REQUIRED":
      return "Your sign-in changed. Sign in again before saving the draft.";
    case "PERMISSION_DENIED":
      return "Your current Pro Club role is not authorized to create this draft.";
    case "INVALID_ARGUMENT":
      return "Check the weekly plan, sessions and training blocks before saving.";
    case "FAILED_PRECONDITION":
      return "The club, technical-governance state, or save request identity is not ready for this save.";
    case "INVALID_RESPONSE":
      return "The server result could not be verified. Keep this draft unchanged and retry the same save to reconcile it safely.";
    default:
      return "The save result is uncertain because the connection was interrupted. Keep this draft unchanged and retry the same save safely.";
  }
}
