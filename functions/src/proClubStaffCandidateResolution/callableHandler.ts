import { HttpsError } from "firebase-functions/v2/https";
import {
  ProClubStaffCandidateResolutionError,
  RESOLUTION_ERROR_CODES,
  type ResolvedStaffCandidate,
} from "./core.ts";
import type { ProClubStaffCandidateResolutionService } from "./service.ts";

export interface SafeCallableLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface CallableContextData {
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

export interface ExecuteCallableOptions {
  service: ProClubStaffCandidateResolutionService;
  enforceAppCheck?: boolean;
  logger?: SafeCallableLogger;
}

export async function executeResolveProClubStaffCandidateCallable(
  context: CallableContextData,
  options: ExecuteCallableOptions,
): Promise<ResolvedStaffCandidate> {
  const { service, enforceAppCheck = true, logger } = options;

  // 1. App Check verification
  if (enforceAppCheck) {
    if (
      !context.app ||
      !context.app.appId ||
      typeof context.app.appId !== "string" ||
      context.app.appId.trim().length === 0
    ) {
      logger?.warn("Staff candidate resolution rejected: App Check missing or invalid", {
        hasApp: Boolean(context.app),
      });
      throw new HttpsError(
        "failed-precondition",
        "The function must be called from an App Check verified app.",
      );
    }
  }

  // 2. Authentication verification
  if (!context.auth || !context.auth.uid || typeof context.auth.uid !== "string") {
    logger?.warn("Staff candidate resolution rejected: Unauthenticated caller");
    throw new HttpsError(
      "unauthenticated",
      "Authentication required to verify staff candidates.",
    );
  }

  const requesterUid = context.auth.uid;

  // 3. Resolve candidate through domain service
  try {
    const candidate = await service.resolveCandidate({
      requesterUid,
      requestBody: context.data,
    });
    return candidate;
  } catch (error) {
    if (error instanceof ProClubStaffCandidateResolutionError) {
      switch (error.code) {
        case RESOLUTION_ERROR_CODES.INVALID_REQUEST:
          throw new HttpsError("invalid-argument", error.message);
        case RESOLUTION_ERROR_CODES.UNAUTHORIZED:
          throw new HttpsError("unauthenticated", error.message);
        case RESOLUTION_ERROR_CODES.FORBIDDEN:
          throw new HttpsError("permission-denied", "Reviewer authority required.");
        case RESOLUTION_ERROR_CODES.RATE_LIMIT_EXCEEDED:
          throw new HttpsError("resource-exhausted", error.message);
        case RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND:
          throw new HttpsError("not-found", error.message);
        default:
          logger?.error("Staff candidate resolution unexpected domain error", {
            code: error.code,
          });
          throw new HttpsError("internal", "An internal error occurred.");
      }
    }

    logger?.error("Staff candidate resolution unexpected internal error");
    throw new HttpsError("internal", "An internal error occurred.");
  }
}
