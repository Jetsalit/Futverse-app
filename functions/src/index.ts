import { onRequest } from "firebase-functions/v2/https";
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
