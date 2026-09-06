import { HttpsError } from "firebase-functions/v2/https";
import {
  ProClubStaffManagementServiceError,
  STAFF_MANAGEMENT_ERROR_CODES,
  type ProClubStaffManagementServiceV1,
} from "./service.js";

export interface StaffManagementCallableContextV1 {
  auth?: { uid: string; token?: Record<string, unknown> };
  app?: { appId: string; token?: Record<string, unknown>; alreadyConsumed?: boolean };
  data: unknown;
}

export interface SafeStaffManagementCallableLoggerV1 {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ExecuteStaffManagementCallableOptionsV1 {
  service: ProClubStaffManagementServiceV1;
  enforceAppCheck?: boolean;
  logger?: SafeStaffManagementCallableLoggerV1;
}

export interface ProClubStaffManagementCallableResponseV1 {
  ok: true;
  action: "CHANGE_ROLE" | "DEACTIVATE" | "REACTIVATE" | "MARK_LEFT";
  staffRole: string;
  membershipStatus: string;
  staffStatus: string;
}

export async function executeManageProClubStaffCallableV1(
  context: StaffManagementCallableContextV1,
  options: ExecuteStaffManagementCallableOptionsV1,
): Promise<ProClubStaffManagementCallableResponseV1> {
  const { service, enforceAppCheck = true, logger } = options;

  if (enforceAppCheck) {
    if (!context.app || typeof context.app.appId !== "string" || context.app.appId.trim().length === 0) {
      logger?.warn("Staff management rejected: App Check missing or invalid", { hasApp: Boolean(context.app) });
      throw new HttpsError("failed-precondition", "The function must be called from an App Check verified app.");
    }
  }

  if (!context.auth || typeof context.auth.uid !== "string" || context.auth.uid.length === 0) {
    logger?.warn("Staff management rejected: unauthenticated caller");
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  try {
    const plan = await service.manageStaff({ requesterUid: context.auth.uid, requestBody: context.data });
    return {
      ok: true,
      action: plan.history.action,
      staffRole: plan.staff.staffRole,
      membershipStatus: plan.membership.status,
      staffStatus: plan.staff.status,
    };
  } catch (error) {
    if (error instanceof ProClubStaffManagementServiceError) {
      switch (error.code) {
        case STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST:
          throw new HttpsError("invalid-argument", "Staff management request is invalid.");
        case STAFF_MANAGEMENT_ERROR_CODES.UNAUTHORIZED:
          throw new HttpsError("unauthenticated", "Authentication required.");
        case STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN:
          throw new HttpsError("permission-denied", "Staff management authority required.");
        case STAFF_MANAGEMENT_ERROR_CODES.NOT_FOUND:
          throw new HttpsError("not-found", "Staff target is unavailable.");
        case STAFF_MANAGEMENT_ERROR_CODES.CONFLICT:
          throw new HttpsError("aborted", "Staff state changed. Reload and try again.");
        case STAFF_MANAGEMENT_ERROR_CODES.RATE_LIMIT_EXCEEDED:
          throw new HttpsError("resource-exhausted", "Too many staff management attempts. Please try again later.");
        case STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA:
        case STAFF_MANAGEMENT_ERROR_CODES.INTERNAL_ERROR:
        default:
          logger?.error("Staff management domain failure", { code: error.code });
          throw new HttpsError("internal", "Unable to manage staff.");
      }
    }

    logger?.error("Staff management unexpected internal error");
    throw new HttpsError("internal", "Unable to manage staff.");
  }
}
