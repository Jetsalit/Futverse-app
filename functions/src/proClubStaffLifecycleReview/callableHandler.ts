import { HttpsError } from "firebase-functions/v2/https";
import {
  ProClubStaffLifecycleReviewError,
  STAFF_LIFECYCLE_REVIEW_ERROR_CODES,
  type ProClubStaffLifecycleReviewResponseV1,
  type ProClubStaffLifecycleReviewServiceV1,
} from "./service.js";

export interface StaffLifecycleReviewCallableContextV1 {
  auth?: { uid: string; token?: Record<string, unknown> };
  app?: { appId: string; token?: Record<string, unknown>; alreadyConsumed?: boolean };
  data: unknown;
}

export interface SafeStaffLifecycleReviewCallableLoggerV1 {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export async function executeLoadProClubStaffLifecycleReviewCallableV1(
  context: StaffLifecycleReviewCallableContextV1,
  options: {
    service: ProClubStaffLifecycleReviewServiceV1;
    enforceAppCheck?: boolean;
    logger?: SafeStaffLifecycleReviewCallableLoggerV1;
  },
): Promise<ProClubStaffLifecycleReviewResponseV1> {
  const { service, enforceAppCheck = true, logger } = options;

  if (enforceAppCheck && (!context.app || typeof context.app.appId !== "string" || context.app.appId.trim().length === 0)) {
    logger?.warn("Staff lifecycle review rejected: App Check missing or invalid", { hasApp: Boolean(context.app) });
    throw new HttpsError("failed-precondition", "The function must be called from an App Check verified app.");
  }
  if (!context.auth || typeof context.auth.uid !== "string" || context.auth.uid.length === 0) {
    logger?.warn("Staff lifecycle review rejected: unauthenticated caller");
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  try {
    return await service.loadReview({ requesterUid: context.auth.uid, requestBody: context.data });
  } catch (error) {
    if (error instanceof ProClubStaffLifecycleReviewError) {
      switch (error.code) {
        case STAFF_LIFECYCLE_REVIEW_ERROR_CODES.INVALID_REQUEST:
          throw new HttpsError("invalid-argument", "Invalid lifecycle review request.");
        case STAFF_LIFECYCLE_REVIEW_ERROR_CODES.UNAUTHORIZED:
          throw new HttpsError("unauthenticated", "Authentication required.");
        case STAFF_LIFECYCLE_REVIEW_ERROR_CODES.FORBIDDEN:
          throw new HttpsError("permission-denied", "Reviewer authority required.");
        case STAFF_LIFECYCLE_REVIEW_ERROR_CODES.TOO_MANY_RESULTS:
          throw new HttpsError("resource-exhausted", "Lifecycle review exceeds the supported result limit.");
        case STAFF_LIFECYCLE_REVIEW_ERROR_CODES.INVALID_DATA:
          logger?.error("Staff lifecycle canonical data validation failed", { code: error.code });
          throw new HttpsError("internal", "Unable to load staff lifecycle review.");
        default:
          logger?.error("Staff lifecycle unexpected domain error", { code: error.code });
          throw new HttpsError("internal", "Unable to load staff lifecycle review.");
      }
    }
    logger?.error("Staff lifecycle unexpected internal error");
    throw new HttpsError("internal", "Unable to load staff lifecycle review.");
  }
}
