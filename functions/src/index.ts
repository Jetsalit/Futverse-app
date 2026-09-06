import { onCall, onRequest } from "firebase-functions/v2/https";
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
  warn(entry) { logWarn("Pro Club provisioning domain error", entry); },
  error(entry) { logError("Pro Club provisioning internal error", entry); },
};

let cachedService: ProClubProvisioningService | null = null;
function getService(): ProClubProvisioningService {
  if (!cachedService) {
    const adminServices = initializeAdminServices();
    const authTokenVerifier = createServerAuthTokenVerifier(adminServices.auth);
    cachedService = createProClubProvisioningService({ firestore: adminServices.firestore, authTokenVerifier });
  }
  return cachedService;
}

export const provisionProClubV1 = onRequest(
  { region: "asia-southeast1", cors: false, timeoutSeconds: 30, memory: "256MiB", concurrency: 20, maxInstances: 10 },
  async (req, res) => {
    await handleProClubProvisioningHttpRequest(req, res, { service: getService(), logger: safeProvisioningLogger });
  },
);

import {
  createProClubStaffCandidateResolutionService,
  type ProClubStaffCandidateResolutionService,
} from "./proClubStaffCandidateResolution/service.ts";
import { createFirestoreRateLimiter } from "./proClubStaffCandidateResolution/rateLimiter.ts";
import {
  executeResolveProClubStaffCandidateCallable,
  type SafeCallableLogger,
} from "./proClubStaffCandidateResolution/callableHandler.ts";

const safeResolutionCallableLogger: SafeCallableLogger = {
  warn(message, meta) { logWarn(message, meta); },
  error(message, meta) { logError(message, meta); },
};

let cachedResolutionService: ProClubStaffCandidateResolutionService | null = null;
function getResolutionService(): ProClubStaffCandidateResolutionService {
  if (!cachedResolutionService) {
    const adminServices = initializeAdminServices();
    const rateLimiter = createFirestoreRateLimiter(adminServices.firestore);
    cachedResolutionService = createProClubStaffCandidateResolutionService({ firestore: adminServices.firestore, auth: adminServices.auth, rateLimiter });
  }
  return cachedResolutionService;
}

export const resolveProClubStaffCandidateV1 = onCall(
  { region: "asia-southeast1", enforceAppCheck: true, timeoutSeconds: 15, memory: "256MiB", concurrency: 20, maxInstances: 10 },
  async (request) => executeResolveProClubStaffCandidateCallable(
    {
      auth: request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
      app: request.app ? { appId: request.app.appId, token: request.app.token, alreadyConsumed: request.app.alreadyConsumed } : undefined,
      data: request.data,
    },
    { service: getResolutionService(), enforceAppCheck: true, logger: safeResolutionCallableLogger },
  ),
);

import {
  createProClubStaffRosterService,
  type ProClubStaffRosterService,
} from "./proClubStaffRoster/service.ts";
import { createFirestoreProClubStaffRosterDataSource } from "./proClubStaffRoster/firestoreDataSource.ts";
import {
  executeLoadProClubStaffRosterCallableV1,
  type SafeStaffRosterCallableLogger,
} from "./proClubStaffRoster/callableHandler.ts";

const safeStaffRosterCallableLogger: SafeStaffRosterCallableLogger = {
  warn(message, meta) { logWarn(message, meta); },
  error(message, meta) { logError(message, meta); },
};

let cachedStaffRosterService: ProClubStaffRosterService | null = null;
function getStaffRosterService(): ProClubStaffRosterService {
  if (!cachedStaffRosterService) {
    const adminServices = initializeAdminServices();
    cachedStaffRosterService = createProClubStaffRosterService(
      createFirestoreProClubStaffRosterDataSource(adminServices.firestore),
    );
  }
  return cachedStaffRosterService;
}

export const loadProClubStaffRosterV1 = onCall(
  { region: "asia-southeast1", enforceAppCheck: true, timeoutSeconds: 15, memory: "256MiB", concurrency: 20, maxInstances: 10 },
  async (request) => executeLoadProClubStaffRosterCallableV1(
    {
      auth: request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
      app: request.app ? { appId: request.app.appId, token: request.app.token, alreadyConsumed: request.app.alreadyConsumed } : undefined,
      data: request.data,
    },
    { service: getStaffRosterService(), enforceAppCheck: true, logger: safeStaffRosterCallableLogger },
  ),
);

import {
  createRateLimitedProClubStaffManagementServiceV1,
  type ProClubStaffManagementServiceV1,
} from "./proClubStaffManagement/service.ts";
import { createFirestoreProClubStaffManagementSourceV1 } from "./proClubStaffManagement/firestoreDataSource.ts";
import { createFirestoreProClubStaffManagementRateLimiterV1 } from "./proClubStaffManagement/rateLimiter.ts";
import {
  executeManageProClubStaffCallableV1,
  type SafeStaffManagementCallableLoggerV1,
} from "./proClubStaffManagement/callableHandler.ts";

const safeStaffManagementCallableLogger: SafeStaffManagementCallableLoggerV1 = {
  warn(message, meta) { logWarn(message, meta); },
  error(message, meta) { logError(message, meta); },
};

let cachedStaffManagementService: ProClubStaffManagementServiceV1 | null = null;
function getStaffManagementService(): ProClubStaffManagementServiceV1 {
  if (!cachedStaffManagementService) {
    const adminServices = initializeAdminServices();
    const source = createFirestoreProClubStaffManagementSourceV1(adminServices.firestore);
    const rateLimiter = createFirestoreProClubStaffManagementRateLimiterV1(adminServices.firestore);
    cachedStaffManagementService = createRateLimitedProClubStaffManagementServiceV1(source, rateLimiter);
  }
  return cachedStaffManagementService;
}

export const manageProClubStaffV1 = onCall(
  { region: "asia-southeast1", enforceAppCheck: true, timeoutSeconds: 15, memory: "256MiB", concurrency: 10, maxInstances: 5 },
  async (request) => executeManageProClubStaffCallableV1(
    {
      auth: request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
      app: request.app ? { appId: request.app.appId, token: request.app.token, alreadyConsumed: request.app.alreadyConsumed } : undefined,
      data: request.data,
    },
    { service: getStaffManagementService(), enforceAppCheck: true, logger: safeStaffManagementCallableLogger },
  ),
);

import {
  createProClubStaffLifecycleReviewServiceV1,
  type ProClubStaffLifecycleReviewServiceV1,
} from "./proClubStaffLifecycleReview/service.ts";
import { createFirestoreProClubStaffLifecycleReviewSourceV1 } from "./proClubStaffLifecycleReview/firestoreDataSource.ts";
import {
  executeLoadProClubStaffLifecycleReviewCallableV1,
  type SafeStaffLifecycleReviewCallableLoggerV1,
} from "./proClubStaffLifecycleReview/callableHandler.ts";

const safeStaffLifecycleReviewCallableLogger: SafeStaffLifecycleReviewCallableLoggerV1 = {
  warn(message, meta) { logWarn(message, meta); },
  error(message, meta) { logError(message, meta); },
};

let cachedStaffLifecycleReviewService: ProClubStaffLifecycleReviewServiceV1 | null = null;
function getStaffLifecycleReviewService(): ProClubStaffLifecycleReviewServiceV1 {
  if (!cachedStaffLifecycleReviewService) {
    const adminServices = initializeAdminServices();
    cachedStaffLifecycleReviewService = createProClubStaffLifecycleReviewServiceV1(
      createFirestoreProClubStaffLifecycleReviewSourceV1(adminServices.firestore),
    );
  }
  return cachedStaffLifecycleReviewService;
}

export const loadProClubStaffLifecycleReviewV1 = onCall(
  { region: "asia-southeast1", enforceAppCheck: true, timeoutSeconds: 15, memory: "256MiB", concurrency: 10, maxInstances: 5 },
  async (request) => executeLoadProClubStaffLifecycleReviewCallableV1(
    {
      auth: request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
      app: request.app ? { appId: request.app.appId, token: request.app.token, alreadyConsumed: request.app.alreadyConsumed } : undefined,
      data: request.data,
    },
    { service: getStaffLifecycleReviewService(), enforceAppCheck: true, logger: safeStaffLifecycleReviewCallableLogger },
  ),
);

import {
  createProPlayerClaimSubmissionServiceV1,
  type ProPlayerClaimSubmissionServiceV1,
} from "./proPlayerOnboardingClaimSubmission/service.ts";
import { createFirestoreProPlayerClaimSubmissionSourceV1 } from "./proPlayerOnboardingClaimSubmission/firestoreDataSource.ts";
import { createFirestoreProPlayerClaimSubmissionRateLimiterV1 } from "./proPlayerOnboardingClaimSubmission/rateLimiter.ts";
import {
  executeSubmitProPlayerOnboardingClaimCallableV1,
  type SafeProPlayerClaimSubmissionLoggerV1,
} from "./proPlayerOnboardingClaimSubmission/callableHandler.ts";

const safeProPlayerClaimSubmissionLogger: SafeProPlayerClaimSubmissionLoggerV1 = {
  warn(message, meta) { logWarn(message, meta); },
  error(message, meta) { logError(message, meta); },
};

let cachedProPlayerClaimSubmissionService: ProPlayerClaimSubmissionServiceV1 | null = null;
function getProPlayerClaimSubmissionService(): ProPlayerClaimSubmissionServiceV1 {
  if (!cachedProPlayerClaimSubmissionService) {
    const adminServices = initializeAdminServices();
    const source = createFirestoreProPlayerClaimSubmissionSourceV1(adminServices.firestore);
    const rateLimiter = createFirestoreProPlayerClaimSubmissionRateLimiterV1(adminServices.firestore);
    cachedProPlayerClaimSubmissionService = createProPlayerClaimSubmissionServiceV1(source, rateLimiter);
  }
  return cachedProPlayerClaimSubmissionService;
}

export const submitProPlayerOnboardingClaimV1 = onCall(
  { region: "asia-southeast1", enforceAppCheck: true, timeoutSeconds: 15, memory: "256MiB", concurrency: 10, maxInstances: 5 },
  async (request) => executeSubmitProPlayerOnboardingClaimCallableV1(
    {
      auth: request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
      app: request.app ? { appId: request.app.appId, token: request.app.token, alreadyConsumed: request.app.alreadyConsumed } : undefined,
      data: request.data,
    },
    { service: getProPlayerClaimSubmissionService(), enforceAppCheck: true, logger: safeProPlayerClaimSubmissionLogger },
  ),
);
