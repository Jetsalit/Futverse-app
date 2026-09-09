import { HttpsError } from "firebase-functions/v2/https";
import {
  WeeklyTrainingDraftSaveError,
} from "./core.ts";
import type {
  SaveWeeklyTrainingDraftResult,
  WeeklyTrainingDraftSaveService,
} from "./service.ts";

export interface WeeklyTrainingDraftSaveCallableContext {
  auth?: {
    uid: string;
    token?: Record<string, unknown>;
  };
  app?: {
    appId: string;
    token?: Record<string, unknown>;
    alreadyConsumed?: boolean;
  };
  data: unknown;
}

export interface SafeWeeklyTrainingDraftSaveCallableLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ExecuteWeeklyTrainingDraftSaveCallableOptions {
  service: Pick<WeeklyTrainingDraftSaveService, "saveFreshDraft">;
  enforceAppCheck?: boolean;
  logger?: SafeWeeklyTrainingDraftSaveCallableLogger;
}

export async function executeSaveProClubWeeklyTrainingDraftCallable(
  context: WeeklyTrainingDraftSaveCallableContext,
  options: ExecuteWeeklyTrainingDraftSaveCallableOptions,
): Promise<SaveWeeklyTrainingDraftResult> {
  const { service, enforceAppCheck = true, logger } = options;

  if (enforceAppCheck) {
    if (
      !context.app ||
      typeof context.app.appId !== "string" ||
      context.app.appId.trim().length === 0
    ) {
      logger?.warn("Weekly Training DRAFT save rejected: App Check missing or invalid", {
        hasApp: Boolean(context.app),
      });
      throw new HttpsError(
        "failed-precondition",
        "The function must be called from an App Check verified app.",
      );
    }
  }

  if (
    !context.auth ||
    typeof context.auth.uid !== "string" ||
    context.auth.uid.trim().length === 0
  ) {
    logger?.warn("Weekly Training DRAFT save rejected: unauthenticated caller");
    throw new HttpsError(
      "unauthenticated",
      "Authentication required to save Weekly Training drafts.",
    );
  }

  try {
    return await service.saveFreshDraft({
      actorUid: context.auth.uid,
      draft: context.data,
    });
  } catch (error) {
    if (error instanceof WeeklyTrainingDraftSaveError) {
      switch (error.code) {
        case "INVALID_ARGUMENT":
          throw new HttpsError("invalid-argument", error.message);
        case "PERMISSION_DENIED":
          throw new HttpsError("permission-denied", error.message);
        case "FAILED_PRECONDITION":
          throw new HttpsError("failed-precondition", error.message);
        default:
          logger?.error("Weekly Training DRAFT save unexpected domain error", {
            code: error.code,
          });
          throw new HttpsError("internal", "An internal error occurred.");
      }
    }

    logger?.error("Weekly Training DRAFT save unexpected internal error");
    throw new HttpsError("internal", "An internal error occurred.");
  }
}
