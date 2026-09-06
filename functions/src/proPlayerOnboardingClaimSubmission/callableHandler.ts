import { HttpsError } from "firebase-functions/v2/https";
import {
  PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES,
  ProPlayerClaimSubmissionServiceError,
  type ProPlayerClaimSubmissionServiceV1,
} from "./service.js";

export interface ProPlayerClaimSubmissionCallableContextV1 {
  auth?: { uid: string; token?: Record<string, unknown> };
  app?: { appId: string; token?: Record<string, unknown>; alreadyConsumed?: boolean };
  data: unknown;
}

export interface SafeProPlayerClaimSubmissionLoggerV1 {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ExecuteProPlayerClaimSubmissionCallableOptionsV1 {
  service: ProPlayerClaimSubmissionServiceV1;
  enforceAppCheck?: boolean;
  logger?: SafeProPlayerClaimSubmissionLoggerV1;
}

export interface ProPlayerClaimSubmissionCallableResponseV1 {
  ok: true;
  status: "PENDING";
  created: boolean;
  idempotent: boolean;
}

export async function executeSubmitProPlayerOnboardingClaimCallableV1(
  context: ProPlayerClaimSubmissionCallableContextV1,
  options: ExecuteProPlayerClaimSubmissionCallableOptionsV1,
): Promise<ProPlayerClaimSubmissionCallableResponseV1> {
  const { service, enforceAppCheck = true, logger } = options;

  if (enforceAppCheck && (!context.app || typeof context.app.appId !== "string" || context.app.appId.trim().length === 0)) {
    logger?.warn("Pro Player claim submission rejected: App Check missing or invalid", { hasApp: Boolean(context.app) });
    throw new HttpsError("failed-precondition", "The function must be called from an App Check verified app.");
  }

  if (!context.auth || typeof context.auth.uid !== "string" || context.auth.uid.length === 0) {
    logger?.warn("Pro Player claim submission rejected: unauthenticated caller");
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  try {
    const result = await service.submitClaim({ requesterUid: context.auth.uid, requestBody: context.data });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ProPlayerClaimSubmissionServiceError) {
      switch (error.code) {
        case PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_REQUEST:
          throw new HttpsError("invalid-argument", "Pro Player onboarding claim is invalid.");
        case PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.UNAUTHORIZED:
          throw new HttpsError("unauthenticated", "Authentication required.");
        case PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.FORBIDDEN:
          throw new HttpsError("permission-denied", "Active Player account required.");
        case PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.CONFLICT:
          throw new HttpsError("already-exists", "A Pro Player onboarding claim or binding already exists.");
        case PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.RATE_LIMIT_EXCEEDED:
          throw new HttpsError("resource-exhausted", "Too many Pro Player claim submission attempts. Please try again later.");
        case PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INVALID_DATA:
        case PRO_PLAYER_CLAIM_SUBMISSION_ERROR_CODES.INTERNAL_ERROR:
        default:
          logger?.error("Pro Player claim submission domain failure", { code: error.code });
          throw new HttpsError("internal", "Unable to submit Pro Player onboarding claim.");
      }
    }
    logger?.error("Pro Player claim submission unexpected internal error");
    throw new HttpsError("internal", "Unable to submit Pro Player onboarding claim.");
  }
}
