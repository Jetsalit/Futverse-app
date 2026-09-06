import { HttpsError } from "firebase-functions/v2/https";
import {
  ProClubStaffRosterError,
  STAFF_ROSTER_ERROR_CODES,
  type ProClubStaffRosterResponseV1,
} from "./core.ts";
import type { ProClubStaffRosterService } from "./service.ts";

export interface StaffRosterCallableContext {
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

export interface SafeStaffRosterCallableLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ExecuteStaffRosterCallableOptions {
  service: ProClubStaffRosterService;
  enforceAppCheck?: boolean;
  logger?: SafeStaffRosterCallableLogger;
}

export async function executeLoadProClubStaffRosterCallableV1(
  context: StaffRosterCallableContext,
  options: ExecuteStaffRosterCallableOptions,
): Promise<ProClubStaffRosterResponseV1> {
  const { service, enforceAppCheck = true, logger } = options;

  if (enforceAppCheck) {
    if (
      !context.app ||
      typeof context.app.appId !== "string" ||
      context.app.appId.trim().length === 0
    ) {
      logger?.warn("Staff roster rejected: App Check missing or invalid", {
        hasApp: Boolean(context.app),
      });
      throw new HttpsError(
        "failed-precondition",
        "The function must be called from an App Check verified app.",
      );
    }
  }

  if (!context.auth || typeof context.auth.uid !== "string" || context.auth.uid.length === 0) {
    logger?.warn("Staff roster rejected: unauthenticated caller");
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  try {
    return await service.loadRoster({
      requesterUid: context.auth.uid,
      requestBody: context.data,
    });
  } catch (error) {
    if (error instanceof ProClubStaffRosterError) {
      switch (error.code) {
        case STAFF_ROSTER_ERROR_CODES.INVALID_REQUEST:
          throw new HttpsError("invalid-argument", error.message);
        case STAFF_ROSTER_ERROR_CODES.UNAUTHORIZED:
          throw new HttpsError("unauthenticated", "Authentication required.");
        case STAFF_ROSTER_ERROR_CODES.FORBIDDEN:
          throw new HttpsError("permission-denied", "Reviewer authority required.");
        case STAFF_ROSTER_ERROR_CODES.TOO_MANY_RESULTS:
          throw new HttpsError("resource-exhausted", "Roster exceeds the supported result limit.");
        case STAFF_ROSTER_ERROR_CODES.INVALID_DATA:
          logger?.error("Staff roster canonical data validation failed", {
            code: error.code,
          });
          throw new HttpsError("internal", "Unable to load the staff roster.");
        default:
          logger?.error("Staff roster unexpected domain error", { code: error.code });
          throw new HttpsError("internal", "Unable to load the staff roster.");
      }
    }

    logger?.error("Staff roster unexpected internal error");
    throw new HttpsError("internal", "Unable to load the staff roster.");
  }
}
