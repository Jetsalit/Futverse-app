import {
  ERROR_CODES,
  isValidDocumentIdentifier,
  ProClubProvisioningError,
} from "../proClubProvisioning/core.ts";

export interface MinimalAdminAuth {
  verifyIdToken(
    idToken: string,
    checkRevoked?: boolean,
  ): Promise<{ uid: string; [key: string]: unknown }>;
}

export interface ServerAuthTokenVerifier {
  verifyAuthorizationHeader(authHeader: unknown): Promise<string>;
}

export function createServerAuthTokenVerifier(
  auth: MinimalAdminAuth,
): ServerAuthTokenVerifier {
  return {
    async verifyAuthorizationHeader(authHeader: unknown): Promise<string> {
      if (typeof authHeader !== "string" || authHeader.trim().length === 0) {
        throw new ProClubProvisioningError(
          ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
          "Missing or empty authorization header",
        );
      }

      const match = authHeader.match(/^Bearer\s+(\S+)$/i);
      if (!match || !match[1] || match[1].trim().length === 0) {
        throw new ProClubProvisioningError(
          ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
          "Invalid authorization header format; expected Bearer <token>",
        );
      }

      const token = match[1].trim();

      let decoded: { uid: string; [key: string]: unknown };
      try {
        decoded = await auth.verifyIdToken(token, true);
      } catch (error) {
        throw new ProClubProvisioningError(
          ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
          `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (
        !decoded ||
        typeof decoded.uid !== "string" ||
        !isValidDocumentIdentifier(decoded.uid)
      ) {
        throw new ProClubProvisioningError(
          ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
          "Decoded token does not contain a valid user identifier",
        );
      }

      return decoded.uid;
    },
  };
}
