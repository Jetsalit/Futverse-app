import {
  ERROR_CODES,
  isValidDocumentIdentifier,
  ProClubProvisioningError,
} from "../../functions/src/proClubProvisioning/core.ts";
import type { ServerAuthTokenVerifier } from "../../functions/src/lib/serverAuthTokenVerifier.ts";

export const LOCAL_OPERATOR_ENV_KEY = "FUTVERSE_LOCAL_OPERATOR_UID";
export const EXPECTED_PROJECT_ID = "futverse-d7872";

export interface LocalTrustedOperatorVerifierOptions {
  env?: Record<string, string | undefined>;
}

/**
 * Resolves the trusted local operator identity strictly from the process environment.
 * Fails closed immediately if missing, empty, whitespace-only, or malformed.
 * Does NOT silently normalize or trim unsafe values.
 */
export function resolveTrustedLocalOperatorUid(
  env: Record<string, string | undefined> = process.env,
): string {
  const rawUid = env[LOCAL_OPERATOR_ENV_KEY];

  if (rawUid === undefined || rawUid === null) {
    throw new ProClubProvisioningError(
      ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      `Missing trusted local operator configuration: ${LOCAL_OPERATOR_ENV_KEY} environment variable is not set`,
    );
  }

  if (typeof rawUid !== "string" || rawUid.length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      `Empty trusted local operator configuration: ${LOCAL_OPERATOR_ENV_KEY} is empty`,
    );
  }

  if (rawUid.trim().length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      `Whitespace-only trusted local operator configuration: ${LOCAL_OPERATOR_ENV_KEY} cannot be whitespace only`,
    );
  }

  if (/\s/.test(rawUid)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      `Malformed trusted local operator configuration: ${LOCAL_OPERATOR_ENV_KEY} cannot contain whitespace`,
    );
  }

  if (!isValidDocumentIdentifier(rawUid)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      `Malformed trusted local operator configuration: ${LOCAL_OPERATOR_ENV_KEY} is not a valid document identifier`,
    );
  }

  return rawUid;
}

/**
 * Creates an implementation of ServerAuthTokenVerifier for local trusted operator execution.
 * Ignores any authorization header or caller-supplied identity, binding the requester UID
 * strictly to the local environment variable FUTVERSE_LOCAL_OPERATOR_UID.
 */
export function createLocalTrustedOperatorVerifier(
  options: LocalTrustedOperatorVerifierOptions = {},
): ServerAuthTokenVerifier {
  return {
    async verifyAuthorizationHeader(_authHeader: unknown): Promise<string> {
      return resolveTrustedLocalOperatorUid(options.env ?? process.env);
    },
  };
}

/**
 * Asserts that the initialized Firebase Admin application and Firestore instance match
 * the pinned expected project ID ('futverse-d7872'). Fails immediately before any
 * database or provisioning operations if unresolved or mismatched.
 */
export function assertPinnedProject(
  app: { options?: { projectId?: unknown } } | null | undefined,
  firestore?: unknown,
  expectedProjectId: string = EXPECTED_PROJECT_ID,
): void {
  if (
    !expectedProjectId ||
    typeof expectedProjectId !== "string" ||
    expectedProjectId.trim().length === 0
  ) {
    throw new Error(
      "Project Pinning Configuration Error: expectedProjectId must be a non-empty string",
    );
  }

  const appProjectId = app?.options?.projectId;
  if (
    !appProjectId ||
    typeof appProjectId !== "string" ||
    appProjectId.trim().length === 0
  ) {
    throw new Error(
      `Project Pinning Violation: Unable to resolve Firebase Admin app project ID. Expected '${expectedProjectId}'. Execution aborted before any database operations.`,
    );
  }

  if (appProjectId !== expectedProjectId) {
    throw new Error(
      `Project Pinning Violation: Target project '${appProjectId}' does not match pinned expected project '${expectedProjectId}'. Execution aborted before any database operations.`,
    );
  }

  const firestoreProjectId = (
    firestore as { projectId?: unknown } | null | undefined
  )?.projectId;
  if (firestoreProjectId !== undefined && firestoreProjectId !== null) {
    if (
      typeof firestoreProjectId !== "string" ||
      firestoreProjectId.trim().length === 0
    ) {
      throw new Error(
        `Project Pinning Violation: Unable to resolve Firestore instance project ID. Expected '${expectedProjectId}'. Execution aborted before any database operations.`,
      );
    }
    if (firestoreProjectId !== expectedProjectId) {
      throw new Error(
        `Project Pinning Violation: Firestore instance project '${firestoreProjectId}' does not match pinned expected project '${expectedProjectId}'. Execution aborted before any database operations.`,
      );
    }
  }
}
