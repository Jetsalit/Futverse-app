import {
  ERROR_CODES,
  ProClubProvisioningError,
  type ProClubProvisioningErrorCode,
} from "./core.ts";
import type {
  ProvisionProClubRequestInput,
  ProvisionProClubResult,
} from "./service.ts";

export interface ProvisioningServiceLike {
  provisionProClub(
    request: ProvisionProClubRequestInput,
  ): Promise<ProvisionProClubResult>;
}

export interface SafeHandlerLogger {
  warn?(entry: { errorCode: string }): void;
  error?(entry: { errorName: string }): void;
}

export interface HttpHandlerDependencies {
  service: ProvisioningServiceLike;
  logger?: SafeHandlerLogger;
}

export interface HttpRequestLike {
  method?: string;
  headers?: Record<string, unknown>;
  header?(name: string): string | undefined;
  body?: unknown;
}

export interface HttpResponseLike {
  status(statusCode: number): this;
  setHeader(name: string, value: string): this;
  json(body: unknown): this;
}

const DOMAIN_ERROR_HTTP_STATUS: Record<ProClubProvisioningErrorCode, number> = {
  [ERROR_CODES.INVALID_PROVISIONING_REQUEST]: 400,
  [ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL]: 401,
  [ERROR_CODES.INVALID_OWNER]: 422,
  [ERROR_CODES.CLUB_EXISTS]: 409,
  [ERROR_CODES.PROVISIONING_ID_CONFLICT]: 409,
  [ERROR_CODES.PROVISIONING_INTEGRITY]: 500,
};

const DOMAIN_ERROR_PUBLIC_MESSAGES: Record<
  ProClubProvisioningErrorCode,
  string
> = {
  [ERROR_CODES.INVALID_PROVISIONING_REQUEST]: "Invalid provisioning request",
  [ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL]: "Unauthorized",
  [ERROR_CODES.INVALID_OWNER]: "Invalid initial owner",
  [ERROR_CODES.CLUB_EXISTS]: "Pro Club already exists",
  [ERROR_CODES.PROVISIONING_ID_CONFLICT]:
    "Provisioning request conflicts with existing record",
  [ERROR_CODES.PROVISIONING_INTEGRITY]: "Provisioning integrity check failed",
};

export async function handleProClubProvisioningHttpRequest(
  req: HttpRequestLike,
  res: HttpResponseLike,
  dependencies: HttpHandlerDependencies,
): Promise<void> {
  const method = (req.method ?? "").toUpperCase();

  if (method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      ok: false,
      error: {
        code: "ERROR_METHOD_NOT_ALLOWED",
        message: "Method not allowed",
      },
    });
    return;
  }

  let authHeader: unknown;
  if (typeof req.header === "function") {
    authHeader = req.header("authorization") ?? req.header("Authorization");
  }
  if (authHeader === undefined && req.headers) {
    authHeader = req.headers["authorization"] ?? req.headers["Authorization"];
  }

  const requestBody = req.body;

  try {
    const result = await dependencies.service.provisionProClub({
      authorizationHeader: authHeader,
      requestBody,
    });

    res.status(200).json({
      ok: true,
      result,
    });
  } catch (error) {
    if (error instanceof ProClubProvisioningError) {
      dependencies.logger?.warn?.({
        errorCode: error.code,
      });

      const httpStatus = DOMAIN_ERROR_HTTP_STATUS[error.code] ?? 400;
      const publicMessage =
        DOMAIN_ERROR_PUBLIC_MESSAGES[error.code] ?? "Provisioning error";

      res.status(httpStatus).json({
        ok: false,
        error: {
          code: error.code,
          message: publicMessage,
        },
      });
      return;
    }

    dependencies.logger?.error?.({
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    res.status(500).json({
      ok: false,
      error: {
        code: "ERROR_INTERNAL",
        message: "Internal server error",
      },
    });
  }
}

export function createProClubProvisioningHttpHandler(
  dependencies: HttpHandlerDependencies,
) {
  return (req: HttpRequestLike, res: HttpResponseLike) =>
    handleProClubProvisioningHttpRequest(req, res, dependencies);
}
