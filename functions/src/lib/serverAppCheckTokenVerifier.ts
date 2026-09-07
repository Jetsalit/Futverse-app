export interface MinimalAdminAppCheck {
  verifyToken(appCheckToken: string): Promise<{ appId: string }>;
}

export interface ServerAppCheckTokenVerifier {
  verifyHeader(appCheckHeader: unknown): Promise<string>;
}

export class AppCheckVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppCheckVerificationError";
  }
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as { message?: unknown }).message;
  return typeof value === "string" ? value : "";
}

export function isKnownInvalidAppCheckTokenError(error: unknown): boolean {
  const code = getErrorCode(error).toLowerCase();
  const message = getErrorMessage(error);

  if (
    code.endsWith("app-check-token-expired") ||
    code.endsWith("app_check_token_expired")
  ) {
    return true;
  }

  if (!code.endsWith("invalid-argument") && !code.endsWith("invalid_argument")) {
    return false;
  }

  return (
    /^App check token must be a non-null string\./i.test(message) ||
    /^Decoding App Check token failed\./i.test(message) ||
    /^The provided App Check token has /i.test(message)
  );
}

export function createServerAppCheckTokenVerifier(
  appCheck: MinimalAdminAppCheck,
  expectedAppIds: readonly string[],
): ServerAppCheckTokenVerifier {
  const allowedAppIds = new Set(expectedAppIds);
  if (allowedAppIds.size === 0 || [...allowedAppIds].some((value) => !value || value.trim() !== value)) {
    throw new Error("Server App Check verifier requires canonical expected app IDs");
  }

  return {
    async verifyHeader(appCheckHeader: unknown): Promise<string> {
      if (
        typeof appCheckHeader !== "string" ||
        appCheckHeader.trim().length === 0 ||
        appCheckHeader.trim() !== appCheckHeader
      ) {
        throw new AppCheckVerificationError("Missing or invalid App Check header");
      }

      let decoded: { appId: string };
      try {
        decoded = await appCheck.verifyToken(appCheckHeader);
      } catch (error) {
        if (isKnownInvalidAppCheckTokenError(error)) {
          throw new AppCheckVerificationError("App Check token verification failed");
        }
        throw error;
      }

      if (!decoded || typeof decoded.appId !== "string" || decoded.appId.trim().length === 0) {
        throw new AppCheckVerificationError("Verified App Check token has no valid app identifier");
      }

      if (!allowedAppIds.has(decoded.appId)) {
        throw new AppCheckVerificationError("Verified App Check token belongs to an unauthorized app");
      }

      return decoded.appId;
    },
  };
}
