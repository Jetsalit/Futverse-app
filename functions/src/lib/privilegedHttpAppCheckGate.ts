import {
  AppCheckVerificationError,
  type ServerAppCheckTokenVerifier,
} from "./serverAppCheckTokenVerifier.ts";

export interface MinimalHttpResponse {
  status(code: number): MinimalHttpResponse;
  json(body: unknown): void;
}

export interface SafeAppCheckGateLogger {
  warn(entry: { classification: "UNAUTHORIZED_APP_CHECK"; errorCode: "ERROR_APP_CHECK_REQUIRED" }): void;
  error(entry: { classification: "INTERNAL_ERROR"; errorCode: "ERROR_APP_CHECK_INTERNAL" }): void;
}

export async function requireVerifiedAppCheckForPrivilegedHttp(
  appCheckHeader: unknown,
  res: MinimalHttpResponse,
  verifier: ServerAppCheckTokenVerifier,
  logger: SafeAppCheckGateLogger,
): Promise<boolean> {
  try {
    await verifier.verifyHeader(appCheckHeader);
    return true;
  } catch (error) {
    if (error instanceof AppCheckVerificationError) {
      logger.warn({
        classification: "UNAUTHORIZED_APP_CHECK",
        errorCode: "ERROR_APP_CHECK_REQUIRED",
      });
      res.status(401).json({
        ok: false,
        error: {
          code: "ERROR_APP_CHECK_REQUIRED",
          message: "Application verification is required.",
        },
      });
      return false;
    }

    logger.error({
      classification: "INTERNAL_ERROR",
      errorCode: "ERROR_APP_CHECK_INTERNAL",
    });
    res.status(500).json({
      ok: false,
      error: {
        code: "ERROR_APP_CHECK_INTERNAL",
        message: "An internal error occurred.",
      },
    });
    return false;
  }
}
