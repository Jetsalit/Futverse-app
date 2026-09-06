import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  error as logError,
  warn as logWarn,
} from "firebase-functions/logger";
import { initializeAdminServices } from "./lib/firebaseAdmin.ts";
import { createServerAuthTokenVerifier } from "./lib/serverAuthTokenVerifier.ts";
import {
  createProClubProvisioningService,
  type ProClubProvisioningService,
} from "./proClubProvisioning/service.ts";
import {
  handleProClubProvisioningHttpRequest,
  type SafeHandlerLogger,
} from "./proClubProvisioning/httpHandler.ts";

const safeProvisioningLogger: SafeHandlerLogger = {
  warn(entry) {
    logWarn("Pro Club provisioning domain error", entry);
  },
  error(entry) {
    logError("Pro Club provisioning internal error", entry);
  },
};

let cachedService: ProClubProvisioningService | null = null;

function getService(): ProClubProvisioningService {
  if (!cachedService) {
    const adminServices = initializeAdminServices();
    const authTokenVerifier = createServerAuthTokenVerifier(adminServices.auth);
    cachedService = createProClubProvisioningService({
      firestore: adminServices.firestore,
      authTokenVerifier,
    });
  }
  return cachedService;
}

export const provisionProClubV1 = onRequest(
  {
    region: "asia-southeast1",
    cors: false,
    timeoutSeconds: 30,
    memory: "256MiB",
    concurrency: 20,
    maxInstances: 10,
  },
  async (req, res) => {
    const service = getService();
    await handleProClubProvisioningHttpRequest(req, res, {
      service,
      logger: safeProvisioningLogger,
    });
  },
);

import {
  createProClubStaffCandidateResolutionService,
  type ProClubStaffCandidateResolutionService,
} from "./proClubStaffCandidateResolution/service.ts";
import {
  createFirestoreRateLimiter,
} from "./proClubStaffCandidateResolution/rateLimiter.ts";
import {
  executeResolveProClubStaffCandidateCallable,
  type SafeCallableLogger,
} from "./proClubStaffCandidateResolution/callableHandler.ts";
import {
  isCanonicalRequesterAccountActive,
  RequesterAccountStatusReadError,
} from "./proClubStaffCandidateResolution/requesterAccountStatus.ts";

const safeResolutionCallableLogger: SafeCallableLogger = {
  warn(message, meta) {
    logWarn(message, meta);
  },
  error(message, meta) {
    logError(message, meta);
  },
};

let cachedResolutionService: ProClubStaffCandidateResolutionService | null = null;

function getResolutionService(): ProClubStaffCandidateResolutionService {
  if (!cachedResolutionService) {
    const adminServices = initializeAdminServices();
    const rateLimiter = createFirestoreRateLimiter(adminServices.firestore);
    cachedResolutionService = createProClubStaffCandidateResolutionService({
      firestore: adminServices.firestore,
      auth: adminServices.auth,
      rateLimiter,
    });
  }
  return cachedResolutionService;
}

export const resolveProClubStaffCandidateV1 = onCall(
  {
    region: "asia-southeast1",
    enforceAppCheck: true,
    timeoutSeconds: 15,
    memory: "256MiB",
    concurrency: 20,
    maxInstances: 10,
  },
  async (request) => {
    const service = getResolutionService();

    // Preserve the canonical FutVerse account-status boundary before any
    // rate-limit mutation or Firebase Auth candidate lookup. The Admin SDK
    // bypasses Firestore Rules, so this server check mirrors currentUserIsActive().
    if (request.app?.appId?.trim() && request.auth?.uid) {
      try {
        const adminServices = initializeAdminServices();
        const requesterIsActive = await isCanonicalRequesterAccountActive(
          adminServices.firestore,
          request.auth.uid,
        );
        if (!requesterIsActive) {
          throw new HttpsError(
            "permission-denied",
            "Reviewer authority required.",
          );
        }
      } catch (error) {
        if (error instanceof HttpsError) {
          throw error;
        }
        if (error instanceof RequesterAccountStatusReadError) {
          logError("Staff candidate resolution requester account status check failed");
          throw new HttpsError("internal", "An internal error occurred.");
        }
        throw error;
      }
    }

    return await executeResolveProClubStaffCandidateCallable(
      {
        auth: request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
        app: request.app ? { appId: request.app.appId, token: request.app.token, alreadyConsumed: request.app.alreadyConsumed } : undefined,
        data: request.data,
      },
      {
        service,
        enforceAppCheck: true,
        logger: safeResolutionCallableLogger,
      },
    );
  },
);
