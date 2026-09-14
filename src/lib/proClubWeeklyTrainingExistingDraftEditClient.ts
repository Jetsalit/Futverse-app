import { httpsCallable } from "firebase/functions";
import { PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_AVAILABLE } from "../config/runtimeCapabilities";
import { functions } from "./firebase";
import { isValidDocumentIdentifier } from "./proClubModel";
import {
  parseProClubWeeklyTrainingDraft,
  type ProClubWeeklyTrainingDraft,
} from "./proClubWeeklyTraining";

export const WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_CALLABLE =
  "editProClubWeeklyTrainingExistingDraftV1" as const;

export interface ProClubWeeklyTrainingExistingDraftEditRequest {
  readonly planId: string;
  readonly expectedPlanUpdatedAt: {
    readonly seconds: number;
    readonly nanoseconds: number;
  };
  readonly draft: ProClubWeeklyTrainingDraft;
}

export interface ProClubWeeklyTrainingExistingDraftEditResult {
  readonly status: "COMPLETED";
  readonly clubId: string;
  readonly planId: string;
  readonly documentCount: number;
  readonly updatedAt: string;
}

export type ProClubWeeklyTrainingExistingDraftEditClientErrorCode =
  | "UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "INVALID_ARGUMENT"
  | "FAILED_PRECONDITION"
  | "CONFLICT"
  | "INVALID_RESPONSE"
  | "NETWORK";

export class ProClubWeeklyTrainingExistingDraftEditClientError extends Error {
  constructor(readonly code: ProClubWeeklyTrainingExistingDraftEditClientErrorCode) {
    super(code);
    this.name = "ProClubWeeklyTrainingExistingDraftEditClientError";
  }
}

export type WeeklyTrainingExistingDraftEditCallableCaller = (
  request: ProClubWeeklyTrainingExistingDraftEditRequest,
) => Promise<{ data: unknown }>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const millis = Date.parse(value);
  return !Number.isNaN(millis) && new Date(millis).toISOString() === value;
}

function exactTimestampToken(value: unknown): value is {
  readonly seconds: number;
  readonly nanoseconds: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw).sort();
  return (
    keys.length === 2 &&
    keys[0] === "nanoseconds" &&
    keys[1] === "seconds" &&
    Number.isSafeInteger(raw.seconds) &&
    Number.isInteger(raw.nanoseconds) &&
    (raw.nanoseconds as number) >= 0 &&
    (raw.nanoseconds as number) <= 999_999_999
  );
}

function expectedDocumentCount(draft: ProClubWeeklyTrainingDraft): number {
  return 1 + draft.sessions.length + draft.sessions.reduce(
    (sum, session) => sum + session.blocks.length,
    0,
  );
}

function normalizeError(error: unknown): ProClubWeeklyTrainingExistingDraftEditClientError {
  if (error instanceof ProClubWeeklyTrainingExistingDraftEditClientError) return error;
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "unauthenticated" || code === "functions/unauthenticated") {
    return new ProClubWeeklyTrainingExistingDraftEditClientError("AUTH_REQUIRED");
  }
  if (code === "permission-denied" || code === "functions/permission-denied") {
    return new ProClubWeeklyTrainingExistingDraftEditClientError("PERMISSION_DENIED");
  }
  if (code === "invalid-argument" || code === "functions/invalid-argument") {
    return new ProClubWeeklyTrainingExistingDraftEditClientError("INVALID_ARGUMENT");
  }
  if (code === "failed-precondition" || code === "functions/failed-precondition") {
    return new ProClubWeeklyTrainingExistingDraftEditClientError("FAILED_PRECONDITION");
  }
  if (code === "aborted" || code === "functions/aborted") {
    return new ProClubWeeklyTrainingExistingDraftEditClientError("CONFLICT");
  }
  return new ProClubWeeklyTrainingExistingDraftEditClientError("NETWORK");
}

export function isAmbiguousWeeklyTrainingExistingDraftEditError(error: unknown): boolean {
  return error instanceof ProClubWeeklyTrainingExistingDraftEditClientError &&
    (error.code === "NETWORK" || error.code === "INVALID_RESPONSE");
}

export const defaultWeeklyTrainingExistingDraftEditCallableCaller:
WeeklyTrainingExistingDraftEditCallableCaller = async (request) => {
  if (!PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_AVAILABLE) {
    throw new ProClubWeeklyTrainingExistingDraftEditClientError("UNAVAILABLE");
  }
  const callable = httpsCallable<ProClubWeeklyTrainingExistingDraftEditRequest, unknown>(
    functions,
    WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_CALLABLE,
  );
  return await callable(request);
};

export async function editProClubWeeklyTrainingExistingDraft(
  input: ProClubWeeklyTrainingExistingDraftEditRequest,
  caller: WeeklyTrainingExistingDraftEditCallableCaller =
    defaultWeeklyTrainingExistingDraftEditCallableCaller,
): Promise<ProClubWeeklyTrainingExistingDraftEditResult> {
  if (
    !isValidDocumentIdentifier(input.planId) ||
    !exactTimestampToken(input.expectedPlanUpdatedAt)
  ) {
    throw new ProClubWeeklyTrainingExistingDraftEditClientError("INVALID_ARGUMENT");
  }
  const parsed = parseProClubWeeklyTrainingDraft(input.draft);
  if (parsed.state !== "VALID") {
    throw new ProClubWeeklyTrainingExistingDraftEditClientError("INVALID_ARGUMENT");
  }

  let result: { data: unknown };
  try {
    result = await caller({
      planId: input.planId,
      expectedPlanUpdatedAt: input.expectedPlanUpdatedAt,
      draft: parsed.value,
    });
  } catch (error) {
    throw normalizeError(error);
  }

  const response = record(result.data);
  if (
    !response ||
    response.status !== "COMPLETED" ||
    response.clubId !== parsed.value.clubId ||
    response.planId !== input.planId ||
    response.documentCount !== expectedDocumentCount(parsed.value) ||
    !canonicalIsoTimestamp(response.updatedAt)
  ) {
    throw new ProClubWeeklyTrainingExistingDraftEditClientError("INVALID_RESPONSE");
  }

  return {
    status: "COMPLETED",
    clubId: response.clubId as string,
    planId: response.planId as string,
    documentCount: response.documentCount as number,
    updatedAt: response.updatedAt,
  };
}

export function weeklyTrainingExistingDraftEditErrorMessage(error: unknown): string {
  const code = error instanceof ProClubWeeklyTrainingExistingDraftEditClientError
    ? error.code
    : "NETWORK";
  switch (code) {
    case "UNAVAILABLE":
      return "Editing saved Weekly Training DRAFTs is not enabled in this web environment.";
    case "AUTH_REQUIRED":
      return "Your sign-in changed. Sign in again before saving this edit.";
    case "PERMISSION_DENIED":
      return "Your current Pro Club role is not authorized to edit this Weekly Training DRAFT.";
    case "INVALID_ARGUMENT":
      return "Check the edited weekly plan before saving.";
    case "FAILED_PRECONDITION":
      return "The club or technical-governance state is not ready for this edit.";
    case "CONFLICT":
      return "This DRAFT changed after you opened it. Reload the latest saved version before editing again.";
    case "INVALID_RESPONSE":
      return "The save result could not be verified. Reload this DRAFT before making another edit.";
    default:
      return "The edit result is uncertain because the connection was interrupted. Reload this DRAFT before retrying.";
  }
}
