import {
  deleteApp,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export interface AdminInitOptions {
  projectId?: string;
  requireEmulator?: boolean;
  appName?: string;
}

export interface FirebaseAdminServices {
  app: App;
  auth: Auth;
  firestore: Firestore;
}

export function assertEmulatorEnvironmentSafe(projectId?: string): void {
  const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
  if (!hostPort) {
    throw new Error(
      "Safety Gate Violation: FIRESTORE_EMULATOR_HOST environment variable is not defined",
    );
  }

  const [host] = hostPort.split(":");
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      `Safety Gate Violation: FIRESTORE_EMULATOR_HOST must be 127.0.0.1 or localhost (got '${host}')`,
    );
  }

  if (!projectId || !projectId.startsWith("demo-")) {
    throw new Error(
      `Safety Gate Violation: Project ID must start with 'demo-' for emulator testing (got '${projectId}')`,
    );
  }
}

export function initializeAdminServices(
  options: AdminInitOptions = {},
): FirebaseAdminServices {
  const appName = options.appName ?? "[DEFAULT]";

  if (options.requireEmulator) {
    assertEmulatorEnvironmentSafe(options.projectId);
  }

  const existing = getApps().find((a) => a.name === appName);
  const app =
    existing ??
    initializeApp(
      options.projectId ? { projectId: options.projectId } : {},
      appName === "[DEFAULT]" ? undefined : appName,
    );

  const firestore = getFirestore(app);
  const auth = getAuth(app);

  return {
    app,
    auth,
    firestore,
  };
}

export function getAdminApp(appName = "[DEFAULT]"): App {
  return getApp(appName === "[DEFAULT]" ? undefined : appName);
}

export function getAdminFirestore(app?: App): Firestore {
  return getFirestore(app ?? getAdminApp());
}

export function getAdminAuth(app?: App): Auth {
  return getAuth(app ?? getAdminApp());
}

export async function cleanupAdminApp(appName = "[DEFAULT]"): Promise<void> {
  const existing = getApps().find((a) => a.name === appName);
  if (existing) {
    await deleteApp(existing);
  }
}
