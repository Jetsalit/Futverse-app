import { getToken } from "firebase/app-check";
import { appCheck, auth } from "./firebase";

export type ProClubLevel = "T1" | "T2" | "T3";

export interface ProvisionProClubControlPlaneRequest {
  provisioningId: string;
  clubId: string;
  name: string;
  shortName?: string;
  level: ProClubLevel;
  country?: string;
  logoUrl?: string;
  initialOwnerUid: string;
}

export interface ProvisionProClubControlPlaneResult {
  status: "COMPLETED";
  provisioningId: string;
  clubId: string;
  ownerUid: string;
  requestingSuperAdminUid: string;
  isReplay: boolean;
  createdAt: string;
}

export interface VerifyProvisioningAuditResult {
  status: "VERIFIED";
  provisioningId: string;
  clubId: string;
  ownerUid: string;
  createdAt: string;
}

export class ProClubControlPlaneApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = "ProClubControlPlaneApiError";
  }
}

function requireCanonicalId(value: string, fieldName: string): string {
  if (!value || value.trim() !== value || value.includes("/")) {
    throw new ProClubControlPlaneApiError(
      "ERROR_INVALID_CLIENT_INPUT",
      `${fieldName} must be non-empty, already trimmed, and contain no slash.`,
      0,
    );
  }
  return value;
}

function optionalCanonicalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeProvisioningControlPlaneRequest(
  request: ProvisionProClubControlPlaneRequest,
): ProvisionProClubControlPlaneRequest {
  const name = request.name.trim();
  if (!name) {
    throw new ProClubControlPlaneApiError(
      "ERROR_INVALID_CLIENT_INPUT",
      "Club name is required.",
      0,
    );
  }

  if (!(["T1", "T2", "T3"] as const).includes(request.level)) {
    throw new ProClubControlPlaneApiError(
      "ERROR_INVALID_CLIENT_INPUT",
      "Club level must be T1, T2, or T3.",
      0,
    );
  }

  return {
    provisioningId: requireCanonicalId(request.provisioningId, "provisioningId"),
    clubId: requireCanonicalId(request.clubId, "clubId"),
    name,
    shortName: optionalCanonicalString(request.shortName),
    level: request.level,
    country: optionalCanonicalString(request.country),
    logoUrl: optionalCanonicalString(request.logoUrl),
    initialOwnerUid: requireCanonicalId(request.initialOwnerUid, "initialOwnerUid"),
  };
}

export function buildProvisioningControlPlanePath(
  operation: "provision" | "verify-audit",
): string {
  return operation === "provision"
    ? "/api/pro-club/provision-v1"
    : "/api/pro-club/verify-audit-v1";
}

export function buildTrustedControlPlaneHeaders(
  idToken: string,
  appCheckToken: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${idToken}`,
    "X-Firebase-AppCheck": appCheckToken,
    "Content-Type": "application/json",
  };
}

async function postTrustedControlPlane<T>(path: string, body: unknown): Promise<T> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new ProClubControlPlaneApiError(
      "ERROR_UNAUTHENTICATED_CLIENT_SESSION",
      "An authenticated Firebase session is required.",
      401,
    );
  }

  if (!appCheck) {
    throw new ProClubControlPlaneApiError(
      "ERROR_APP_CHECK_NOT_CONFIGURED",
      "Application verification is not configured for this build.",
      0,
    );
  }

  let appCheckToken: string;
  try {
    appCheckToken = (await getToken(appCheck, false)).token;
  } catch {
    throw new ProClubControlPlaneApiError(
      "ERROR_APP_CHECK_TOKEN_UNAVAILABLE",
      "Application verification could not be completed.",
      0,
    );
  }

  const idToken = await firebaseUser.getIdToken();
  const response = await fetch(path, {
    method: "POST",
    headers: buildTrustedControlPlaneHeaders(idToken, appCheckToken),
    body: JSON.stringify(body),
    credentials: "same-origin",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;

  if (!response.ok || record?.ok !== true) {
    const errorRecord =
      record?.error &&
      typeof record.error === "object" &&
      !Array.isArray(record.error)
        ? record.error as Record<string, unknown>
        : null;

    const code =
      typeof errorRecord?.code === "string"
        ? errorRecord.code
        : "ERROR_CONTROL_PLANE_REQUEST_FAILED";

    const message =
      typeof errorRecord?.message === "string"
        ? errorRecord.message
        : "Control-plane request failed.";

    throw new ProClubControlPlaneApiError(code, message, response.status);
  }

  return record.result as T;
}

export async function provisionProClubFromControlPlane(
  request: ProvisionProClubControlPlaneRequest,
): Promise<ProvisionProClubControlPlaneResult> {
  return postTrustedControlPlane<ProvisionProClubControlPlaneResult>(
    buildProvisioningControlPlanePath("provision"),
    normalizeProvisioningControlPlaneRequest(request),
  );
}

export async function verifyProClubProvisioningAuditFromControlPlane(
  provisioningId: string,
): Promise<VerifyProvisioningAuditResult> {
  return postTrustedControlPlane<VerifyProvisioningAuditResult>(
    buildProvisioningControlPlanePath("verify-audit"),
    { provisioningId: requireCanonicalId(provisioningId, "provisioningId") },
  );
}
