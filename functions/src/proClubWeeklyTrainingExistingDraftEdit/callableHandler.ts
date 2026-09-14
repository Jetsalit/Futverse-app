import { HttpsError } from "firebase-functions/v2/https";
import {
  WeeklyTrainingExistingDraftEditError,
} from "./core.ts";
import type {
  EditWeeklyTrainingExistingDraftResult,
  WeeklyTrainingExistingDraftEditService,
} from "./service.ts";

export const PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_SERVER_ENABLED: boolean = false;

export interface WeeklyTrainingExistingDraftEditCallableContext {
  readonly auth?: { readonly uid: string };
  readonly app?: { readonly appId: string };
  readonly data: unknown;
}

export interface SafeWeeklyTrainingExistingDraftEditCallableLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ExecuteWeeklyTrainingExistingDraftEditCallableOptions {
  readonly service: Pick<WeeklyTrainingExistingDraftEditService, "editExistingDraft">;
  readonly allowedAppIds: readonly string[];
  readonly enforceAppCheck?: boolean;
  readonly executionEnabled?: boolean;
  readonly logger?: SafeWeeklyTrainingExistingDraftEditCallableLogger;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function defaultExecutionEnabled(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_SERVER_ENABLED
  );
}

export async function executeEditProClubWeeklyTrainingExistingDraftCallable(
  context: WeeklyTrainingExistingDraftEditCallableContext,
  options: ExecuteWeeklyTrainingExistingDraftEditCallableOptions,
): Promise<EditWeeklyTrainingExistingDraftResult> {
  const {
    service,
    allowedAppIds,
    enforceAppCheck = true,
    executionEnabled = defaultExecutionEnabled(),
    logger,
  } = options;

  if (!executionEnabled) {
    logger?.warn("Weekly Training Existing-DRAFT edit rejected: server capability disabled");
    throw new HttpsError(
      "failed-precondition",
      "Existing-DRAFT edit server capability is not enabled.",
    );
  }

  const allowlist = new Set(allowedAppIds);
  if (
    allowlist.size === 0 ||
    [...allowlist].some((value) => typeof value !== "string" || value.trim() !== value || value.length === 0)
  ) {
    logger?.error("Weekly Training Existing-DRAFT edit App Check allowlist misconfigured");
    throw new HttpsError("internal", "An internal error occurred.");
  }

  if (
    enforceAppCheck &&
    (!context.app || typeof context.app.appId !== "string" || !allowlist.has(context.app.appId))
  ) {
    logger?.warn("Weekly Training Existing-DRAFT edit rejected: App Check missing or unauthorized", {
      hasApp: Boolean(context.app),
    });
    throw new HttpsError(
      "failed-precondition",
      "The function must be called from an App Check verified authorized app.",
    );
  }

  if (!context.auth || typeof context.auth.uid !== "string" || context.auth.uid.trim().length === 0) {
    logger?.warn("Weekly Training Existing-DRAFT edit rejected: unauthenticated caller");
    throw new HttpsError("unauthenticated", "Authentication required to edit Weekly Training drafts.");
  }

  const envelope = asRecord(context.data);
  if (
    !envelope ||
    Object.keys(envelope).some(
      (key) => key !== "planId" && key !== "expectedPlanUpdatedAt" && key !== "draft",
    ) ||
    !("planId" in envelope) ||
    !("expectedPlanUpdatedAt" in envelope) ||
    !("draft" in envelope)
  ) {
    throw new HttpsError("invalid-argument", "Invalid Existing-DRAFT edit request envelope.");
  }

  try {
    return await service.editExistingDraft({
      actorUid: context.auth.uid,
      planId: envelope.planId,
      expectedPlanUpdatedAt: envelope.expectedPlanUpdatedAt,
      draft: envelope.draft,
    });
  } catch (error) {
    if (error instanceof WeeklyTrainingExistingDraftEditError) {
      switch (error.code) {
        case "INVALID_ARGUMENT":
          throw new HttpsError("invalid-argument", error.message);
        case "PERMISSION_DENIED":
          throw new HttpsError("permission-denied", error.message);
        case "FAILED_PRECONDITION":
          throw new HttpsError("failed-precondition", error.message);
        case "CONFLICT":
          throw new HttpsError("aborted", error.message);
        default:
          logger?.error("Weekly Training Existing-DRAFT edit unexpected domain error");
          throw new HttpsError("internal", "An internal error occurred.");
      }
    }
    logger?.error("Weekly Training Existing-DRAFT edit unexpected internal error");
    throw new HttpsError("internal", "An internal error occurred.");
  }
}
