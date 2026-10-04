import { HttpsError } from "firebase-functions/v2/https";
import {
  parseSuperAdminAccessControlRequest,
  SuperAdminAccessControlError,
  type SuperAdminAccessControlInput,
} from "./core.ts";

export interface ManageSuperAdminAccessControlCallableContext {
  auth?: { uid: string };
  app?: { appId: string };
  data: unknown;
}

export interface SuperAdminAccessControlCallableService {
  execute(input: SuperAdminAccessControlInput): Promise<unknown>;
}

export interface ManageSuperAdminAccessControlCallableOptions {
  service: SuperAdminAccessControlCallableService;
  allowedAppIds: readonly string[];
}

export async function executeManageSuperAdminAccessControlCallable(
  context: ManageSuperAdminAccessControlCallableContext,
  options: ManageSuperAdminAccessControlCallableOptions,
): Promise<unknown> {
  if (options.allowedAppIds.length === 0) {
    throw new HttpsError("internal", "The trusted app allowlist is unavailable.");
  }
  if (!context.app?.appId || !options.allowedAppIds.includes(context.app.appId)) {
    throw new HttpsError("failed-precondition", "The function must be called from an App Check verified authorized app.");
  }
  if (!context.auth || typeof context.auth.uid !== "string" || context.auth.uid.trim().length === 0) {
    throw new HttpsError("unauthenticated", "Authentication is required to manage organization access.");
  }

  try {
    return await options.service.execute({
      actorUid: context.auth.uid,
      request: parseSuperAdminAccessControlRequest(context.data),
    });
  } catch (error) {
    if (error instanceof SuperAdminAccessControlError) {
      const code = error.code === "INVALID_ARGUMENT" ? "invalid-argument"
        : error.code === "PERMISSION_DENIED" ? "permission-denied"
          : error.code === "NOT_FOUND" ? "not-found"
            : "failed-precondition";
      throw new HttpsError(code, error.message);
    }
    throw new HttpsError("internal", "An internal error occurred.");
  }
}
