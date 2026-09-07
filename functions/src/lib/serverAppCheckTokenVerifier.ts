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

export function createServerAppCheckTokenVerifier(
  appCheck: MinimalAdminAppCheck,
): ServerAppCheckTokenVerifier {
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
      } catch {
        throw new AppCheckVerificationError("App Check token verification failed");
      }

      if (!decoded || typeof decoded.appId !== "string" || decoded.appId.trim().length === 0) {
        throw new AppCheckVerificationError("Verified App Check token has no valid app identifier");
      }

      return decoded.appId;
    },
  };
}
