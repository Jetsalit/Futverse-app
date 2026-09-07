import {
  AUDIT_VERIFICATION_CLASSIFICATIONS,
  ProClubProvisioningAuditVerificationError,
  type AuditVerificationClassification,
} from "./core.ts";
import type {
  ProClubProvisioningAuditVerificationService,
  VerifyProClubProvisioningAuditRequestInput,
  VerifyProClubProvisioningAuditResult,
} from "./service.ts";

export interface AuditVerificationServiceLike {
  verifyAudit(
    request: VerifyProClubProvisioningAuditRequestInput,
  ): Promise<VerifyProClubProvisioningAuditResult>;
}

export interface SafeAuditVerificationLogger {
  warn?(entry: {
    classification: Exclude<AuditVerificationClassification, "VERIFIED">;
    errorCode: string;
  }): void;
  error?(entry: { errorName: string }): void;
}

export interface AuditVerificationHttpHandlerDependencies {
  service: AuditVerificationServiceLike;
  logger?: SafeAuditVerificationLogger;
}

export interface AuditVerificationHttpRequestLike {
  method?: string;
  headers?: Record<string, unknown>;
  header?(name: string): string | undefined;
  body?: unknown;
}

export interface AuditVerificationHttpResponseLike {
  status(statusCode: number): this;
  setHeader(name: string, value: string): this;
  json(body: unknown): this;
}

const DOMAIN_ERROR_HTTP_STATUS: Record<
  Exclude<AuditVerificationClassification, "VERIFIED">,
  number
> = {
  [AUDIT_VERIFICATION_CLASSIFICATIONS.INVALID_REQUEST]: 400,
  [AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED]: 401,
  [AUDIT_VERIFICATION_CLASSIFICATIONS.NOT_FOUND]: 404,
  [AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE]: 409,
  [AUDIT_VERIFICATION_CLASSIFICATIONS.INTERNAL_ERROR]: 500,
};

const DOMAIN_ERROR_PUBLIC_MESSAGES: Record<
  Exclude<AuditVerificationClassification, "VERIFIED">,
  string
> = {
  [AUDIT_VERIFICATION_CLASSIFICATIONS.INVALID_REQUEST]: "Invalid audit verification request",
  [AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED]: "Unauthorized",
  [AUDIT_VERIFICATION_CLASSIFICATIONS.NOT_FOUND]: "Provisioning audit not found",
  [AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE]: "Provisioning audit integrity check failed",
  [AUDIT_VERIFICATION_CLASSIFICATIONS.INTERNAL_ERROR]: "Internal server error",
};

export async function handleProClubProvisioningAuditVerificationHttpRequest(
  req: AuditVerificationHttpRequestLike,
  res: AuditVerificationHttpResponseLike,
  dependencies: AuditVerificationHttpHandlerDependencies,
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

  let authorizationHeader: unknown;
  if (typeof req.header === "function") {
    authorizationHeader = req.header("authorization") ?? req.header("Authorization");
  }
  if (authorizationHeader === undefined && req.headers) {
    authorizationHeader = req.headers.authorization ?? req.headers.Authorization;
  }

  try {
    const result = await dependencies.service.verifyAudit({
      authorizationHeader,
      requestBody: req.body,
    });
    res.status(200).json({ ok: true, result });
  } catch (error) {
    if (error instanceof ProClubProvisioningAuditVerificationError) {
      dependencies.logger?.warn?.({
        classification: error.classification,
        errorCode: error.code,
      });
      res.status(DOMAIN_ERROR_HTTP_STATUS[error.classification]).json({
        ok: false,
        error: {
          code: error.code,
          message: DOMAIN_ERROR_PUBLIC_MESSAGES[error.classification],
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
        code: "ERROR_AUDIT_VERIFICATION_INTERNAL",
        message: "Internal server error",
      },
    });
  }
}

export function createProClubProvisioningAuditVerificationHttpHandler(
  dependencies: {
    service: ProClubProvisioningAuditVerificationService;
    logger?: SafeAuditVerificationLogger;
  },
) {
  return (
    req: AuditVerificationHttpRequestLike,
    res: AuditVerificationHttpResponseLike,
  ) => handleProClubProvisioningAuditVerificationHttpRequest(req, res, dependencies);
}
