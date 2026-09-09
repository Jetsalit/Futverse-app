import { getAppCheck } from "firebase-admin/app-check";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  error as logError,
  warn as logWarn,
} from "firebase-functions/logger";
import { initializeAdminServices } from "./lib/firebaseAdmin.ts";
import { createServerAuthTokenVerifier } from "./lib/serverAuthTokenVerifier.ts";
import { createServerAppCheckTokenVerifier, type ServerAppCheckTokenVerifier } from "./lib/serverAppCheckTokenVerifier.ts";
import { requireVerifiedAppCheckForPrivilegedHttp, type SafeAppCheckGateLogger } from "./lib/privilegedHttpAppCheckGate.ts";
import {
  createProClubProvisioningService,
  type ProClubProvisioningService,
} from "./proClubProvisioning/service.ts";
import {
  handleProClubProvisioningHttpRequest,
  type SafeHandlerLogger,
} from "./proClubProvisioning/httpHandler.ts";
import {
  createProClubProvisioningAuditVerificationService,
  type ProClubProvisioningAuditVerificationService,
} from "./proClubProvisioningAuditVerification/service.ts";
import {
  handleProClubProvisioningAuditVerificationHttpRequest,
  type SafeAuditVerificationLogger,
} from "./proClubProvisioningAuditVerification/httpHandler.ts";
import {
  createProClubRenameService,
  type ProClubRenameService,
} from "./proClubRename/service.ts";
import {
  handleProClubRenameHttpRequest,
  type SafeRenameHandlerLogger,
} from "./proClubRename/httpHandler.ts";

const FUTVERSE_PRODUCTION_WEB_APP_ID = "1:504089427500:web:3cc2c8b1283316bdee9b89";

const safeProvisioningLogger: SafeHandlerLogger = {
  warn(entry) {
    logWarn("Pro Club provisioning domain error", entry);
  },
  error(entry) {
    logError("Pro Club provisioning internal error", entry);
  },
};

const safeAuditVerificationLogger: SafeAuditVerificationLogger = {
  warn(entry) {
    logWarn("Pro Club provisioning audit verification domain error", entry);
  },
  error(entry) {
    logError("Pro Club provisioning audit verification internal error", entry);
  },
};

const safeAppCheckGateLogger: SafeAppCheckGateLogger = {
  warn(entry) {
    logWarn("Privileged Pro Club HTTP App Check rejected", entry);
  },
  error(entry) {
    logError("Privileged Pro Club HTTP App Check internal error", entry);
  },
};

const safeRenameLogger: SafeRenameHandlerLogger = {
  warn(entry) {
    logWarn("Pro Club rename domain error", entry);
  },
  error(entry) {
    logError("Pro Club rename internal error", entry);
  },
};

let cachedService: ProClubProvisioningService | null = null;
let cachedAuditVerificationService: ProClubProvisioningAuditVerificationService | null = null;
let cachedAppCheckVerifier: ServerAppCheckTokenVerifier | null = null;
let cachedRenameService: ProClubRenameService | null = null;

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

function getAuditVerificationService(): ProClubProvisioningAuditVerificationService {
  if (!cachedAuditVerificationService) {
    const adminServices = initializeAdminServices();
    const authTokenVerifier = createServerAuthTokenVerifier(adminServices.auth);
    cachedAuditVerificationService = createProClubProvisioningAuditVerificationService({
      firestore: adminServices.firestore,
      authTokenVerifier,
    });
  }
  return cachedAuditVerificationService;
}

function getAppCheckVerifier(): ServerAppCheckTokenVerifier {
  if (!cachedAppCheckVerifier) {
    const adminServices = initializeAdminServices();
    cachedAppCheckVerifier = createServerAppCheckTokenVerifier(
      getAppCheck(adminServices.app),
      [FUTVERSE_PRODUCTION_WEB_APP_ID],
    );
  }
  return cachedAppCheckVerifier;
}

function getRenameService(): ProClubRenameService {
  if (!cachedRenameService) {
    const adminServices = initializeAdminServices();
    const authTokenVerifier = createServerAuthTokenVerifier(adminServices.auth);
    cachedRenameService = createProClubRenameService({
      firestore: adminServices.firestore,
      authTokenVerifier,
    });
  }
  return cachedRenameService;
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
    const appCheckAccepted = await requireVerifiedAppCheckForPrivilegedHttp(
      req.get("X-Firebase-AppCheck"),
      res,
      getAppCheckVerifier(),
      safeAppCheckGateLogger,
    );
    if (!appCheckAccepted) return;

    const service = getService();
    await handleProClubProvisioningHttpRequest(req, res, {
      service,
      logger: safeProvisioningLogger,
    });
  },
);

export const verifyProClubProvisioningAuditV1 = onRequest(
  {
    region: "asia-southeast1",
    cors: false,
    timeoutSeconds: 30,
    memory: "256MiB",
    concurrency: 20,
    maxInstances: 10,
  },
  async (req, res) => {
    const appCheckAccepted = await requireVerifiedAppCheckForPrivilegedHttp(
      req.get("X-Firebase-AppCheck"),
      res,
      getAppCheckVerifier(),
      safeAppCheckGateLogger,
    );
    if (!appCheckAccepted) return;

    const service = getAuditVerificationService();
    await handleProClubProvisioningAuditVerificationHttpRequest(req, res, {
      service,
      logger: safeAuditVerificationLogger,
    });
  },
);

export const renameProClubV1 = onRequest(
  {
    region: "asia-southeast1",
    cors: false,
    timeoutSeconds: 30,
    memory: "256MiB",
    concurrency: 20,
    maxInstances: 10,
  },
  async (req, res) => {
    const appCheckAccepted = await requireVerifiedAppCheckForPrivilegedHttp(
      req.get("X-Firebase-AppCheck"),
      res,
      getAppCheckVerifier(),
      safeAppCheckGateLogger,
    );
    if (!appCheckAccepted) return;

    await handleProClubRenameHttpRequest(req, res, {
      service: getRenameService(),
      logger: safeRenameLogger,
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
import {
  createWeeklyTrainingDraftSaveService,
  type WeeklyTrainingDraftSaveService,
} from "./proClubWeeklyTrainingDraftSave/service.ts";
import {
  executeSaveProClubWeeklyTrainingDraftCallable,
  type SafeWeeklyTrainingDraftSaveCallableLogger,
} from "./proClubWeeklyTrainingDraftSave/callableHandler.ts";

const safeResolutionCallableLogger: SafeCallableLogger = {
  warn(message, meta) {
    logWarn(message, meta);
  },
  error(message, meta) {
    logError(message, meta);
  },
};

const safeWeeklyTrainingDraftSaveCallableLogger: SafeWeeklyTrainingDraftSaveCallableLogger = {
  warn(message, meta) {
    logWarn(message, meta);
  },
  error(message, meta) {
    logError(message, meta);
  },
};

let cachedResolutionService: ProClubStaffCandidateResolutionService | null = null;
let cachedWeeklyTrainingDraftSaveService: WeeklyTrainingDraftSaveService | null = null;

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

function getWeeklyTrainingDraftSaveService(): WeeklyTrainingDraftSaveService {
  if (!cachedWeeklyTrainingDraftSaveService) {
    const adminServices = initializeAdminServices();
    cachedWeeklyTrainingDraftSaveService = createWeeklyTrainingDraftSaveService({
      firestore: adminServices.firestore,
    });
  }
  return cachedWeeklyTrainingDraftSaveService;
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

export const saveProClubWeeklyTrainingDraftV1 = onCall(
  {
    region: "asia-southeast1",
    enforceAppCheck: true,
    timeoutSeconds: 30,
    memory: "256MiB",
    concurrency: 20,
    maxInstances: 10,
  },
  async (request) => {
    return await executeSaveProClubWeeklyTrainingDraftCallable(
      {
        auth: request.auth ? { uid: request.auth.uid } : undefined,
        app: request.app
          ? {
              appId: request.app.appId,
              alreadyConsumed: request.app.alreadyConsumed,
            }
          : undefined,
        data: request.data,
      },
      {
        service: getWeeklyTrainingDraftSaveService(),
        allowedAppIds: [FUTVERSE_PRODUCTION_WEB_APP_ID],
        enforceAppCheck: true,
        logger: safeWeeklyTrainingDraftSaveCallableLogger,
      },
    );
  },
);
