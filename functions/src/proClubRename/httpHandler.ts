import {
  RENAME_ERROR_CODES,
  ProClubRenameError,
  type ProClubRenameErrorCode,
} from "./core.ts";
import type {
  RenameProClubRequestInput,
  RenameProClubResult,
} from "./service.ts";

export interface RenameServiceLike {
  renameProClub(request: RenameProClubRequestInput): Promise<RenameProClubResult>;
}

export interface SafeRenameHandlerLogger {
  warn?(entry: { errorCode: string }): void;
  error?(entry: { errorName: string }): void;
}

export interface RenameHttpRequestLike {
  method?: string;
  headers?: Record<string, unknown>;
  header?(name: string): string | undefined;
  body?: unknown;
}

export interface RenameHttpResponseLike {
  status(statusCode: number): this;
  setHeader(name: string, value: string): this;
  json(body: unknown): this;
}

const DOMAIN_ERROR_HTTP_STATUS: Record<ProClubRenameErrorCode, number> = {
  [RENAME_ERROR_CODES.INVALID_REQUEST]: 400,
  [RENAME_ERROR_CODES.UNAUTHORIZED]: 401,
  [RENAME_ERROR_CODES.CLUB_NOT_FOUND]: 404,
  [RENAME_ERROR_CODES.INVALID_EXISTING_CLUB]: 409,
  [RENAME_ERROR_CODES.STALE_REQUEST]: 409,
  [RENAME_ERROR_CODES.NO_OP]: 409,
  [RENAME_ERROR_CODES.EFFECTIVE_AT_FUTURE]: 400,
  [RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER]: 409,
  [RENAME_ERROR_CODES.INTEGRITY]: 500,
};

const DOMAIN_ERROR_PUBLIC_MESSAGES: Record<ProClubRenameErrorCode, string> = {
  [RENAME_ERROR_CODES.INVALID_REQUEST]: "Invalid Pro Club rename request",
  [RENAME_ERROR_CODES.UNAUTHORIZED]: "Unauthorized",
  [RENAME_ERROR_CODES.CLUB_NOT_FOUND]: "Pro Club not found",
  [RENAME_ERROR_CODES.INVALID_EXISTING_CLUB]: "Pro Club identity is invalid",
  [RENAME_ERROR_CODES.STALE_REQUEST]: "Pro Club identity changed; refresh and retry",
  [RENAME_ERROR_CODES.NO_OP]: "Pro Club rename must change a display name",
  [RENAME_ERROR_CODES.EFFECTIVE_AT_FUTURE]: "Future Pro Club rename is not supported",
  [RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER]: "Pro Club rename timeline is out of order",
  [RENAME_ERROR_CODES.INTEGRITY]: "Pro Club rename integrity check failed",
};

export async function handleProClubRenameHttpRequest(
  req: RenameHttpRequestLike,
  res: RenameHttpResponseLike,
  dependencies: { service: RenameServiceLike; logger?: SafeRenameHandlerLogger },
): Promise<void> {
  if ((req.method ?? "").toUpperCase() !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      ok: false,
      error: { code: "ERROR_METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
    return;
  }

  let authorizationHeader: unknown;
  if (typeof req.header === "function") {
    authorizationHeader = req.header("authorization") ?? req.header("Authorization");
  }
  authorizationHeader ??=
    req.headers?.authorization ?? req.headers?.Authorization;

  try {
    const result = await dependencies.service.renameProClub({
      authorizationHeader,
      requestBody: req.body,
    });
    res.status(200).json({ ok: true, result });
  } catch (error) {
    if (error instanceof ProClubRenameError) {
      dependencies.logger?.warn?.({ errorCode: error.code });
      res.status(DOMAIN_ERROR_HTTP_STATUS[error.code]).json({
        ok: false,
        error: {
          code: error.code,
          message: DOMAIN_ERROR_PUBLIC_MESSAGES[error.code],
        },
      });
      return;
    }
    dependencies.logger?.error?.({
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    res.status(500).json({
      ok: false,
      error: { code: "ERROR_INTERNAL", message: "Internal server error" },
    });
  }
}
