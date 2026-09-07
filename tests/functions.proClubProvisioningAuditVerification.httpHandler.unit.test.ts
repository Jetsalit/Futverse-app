import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIT_VERIFICATION_CLASSIFICATIONS,
  AUDIT_VERIFICATION_ERROR_CODES,
  ProClubProvisioningAuditVerificationError,
} from "../functions/src/proClubProvisioningAuditVerification/core.ts";
import {
  handleProClubProvisioningAuditVerificationHttpRequest,
  type AuditVerificationHttpRequestLike,
  type AuditVerificationHttpResponseLike,
  type SafeAuditVerificationLogger,
} from "../functions/src/proClubProvisioningAuditVerification/httpHandler.ts";
import type {
  VerifyProClubProvisioningAuditRequestInput,
  VerifyProClubProvisioningAuditResult,
} from "../functions/src/proClubProvisioningAuditVerification/service.ts";

function responseMock(): AuditVerificationHttpResponseLike & {
  statusCode: number;
  headers: Record<string, string>;
  jsonBody: any;
} {
  return {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

function serviceMock(
  impl?: (
    input: VerifyProClubProvisioningAuditRequestInput,
  ) => Promise<VerifyProClubProvisioningAuditResult>,
) {
  const calls: VerifyProClubProvisioningAuditRequestInput[] = [];
  return {
    calls,
    async verifyAudit(input: VerifyProClubProvisioningAuditRequestInput) {
      calls.push(input);
      if (impl) return impl(input);
      return {
        status: "VERIFIED" as const,
        provisioningId: "prov-1",
        clubId: "club-1",
        ownerUid: "owner-1",
        createdAt: "2026-09-04T00:00:00.000Z",
      };
    },
  };
}

function verificationError(
  classification: Exclude<
    (typeof AUDIT_VERIFICATION_CLASSIFICATIONS)[keyof typeof AUDIT_VERIFICATION_CLASSIFICATIONS],
    "VERIFIED"
  >,
  code: (typeof AUDIT_VERIFICATION_ERROR_CODES)[keyof typeof AUDIT_VERIFICATION_ERROR_CODES],
) {
  return new ProClubProvisioningAuditVerificationError(
    classification,
    code,
    "private detail must not leak",
  );
}

test("Pro Club Provisioning Audit Verification HTTP Adapter", async (t) => {
  await t.test("POST success returns minimal VERIFIED payload", async () => {
    const service = serviceMock();
    const req: AuditVerificationHttpRequestLike = {
      method: "POST",
      headers: { authorization: "Bearer secret-token" },
      body: { provisioningId: "prov-1" },
    };
    const res = responseMock();
    await handleProClubProvisioningAuditVerificationHttpRequest(req, res, { service });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.jsonBody, {
      ok: true,
      result: {
        status: "VERIFIED",
        provisioningId: "prov-1",
        clubId: "club-1",
        ownerUid: "owner-1",
        createdAt: "2026-09-04T00:00:00.000Z",
      },
    });
    assert.equal(service.calls[0].authorizationHeader, "Bearer secret-token");
    assert.strictEqual(service.calls[0].requestBody, req.body);
  });

  await t.test("non-POST is rejected before service", async () => {
    const service = serviceMock();
    const res = responseMock();
    await handleProClubProvisioningAuditVerificationHttpRequest(
      { method: "GET", body: { provisioningId: "prov-1" } },
      res,
      { service },
    );
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, "POST");
    assert.equal(service.calls.length, 0);
  });

  const mappings = [
    [AUDIT_VERIFICATION_CLASSIFICATIONS.INVALID_REQUEST, AUDIT_VERIFICATION_ERROR_CODES.INVALID_REQUEST, 400],
    [AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED, AUDIT_VERIFICATION_ERROR_CODES.UNAUTHORIZED, 401],
    [AUDIT_VERIFICATION_CLASSIFICATIONS.NOT_FOUND, AUDIT_VERIFICATION_ERROR_CODES.NOT_FOUND, 404],
    [AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE, AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE, 409],
    [AUDIT_VERIFICATION_CLASSIFICATIONS.INTERNAL_ERROR, AUDIT_VERIFICATION_ERROR_CODES.INTERNAL_ERROR, 500],
  ] as const;

  for (const [classification, code, expectedStatus] of mappings) {
    await t.test(`${classification} maps to safe HTTP ${expectedStatus}`, async () => {
      const service = serviceMock(async () => {
        throw verificationError(classification, code);
      });
      const warnings: Array<{ classification: string; errorCode: string }> = [];
      const logger: SafeAuditVerificationLogger = {
        warn(entry) {
          warnings.push(entry);
        },
      };
      const res = responseMock();
      await handleProClubProvisioningAuditVerificationHttpRequest(
        {
          method: "POST",
          headers: { authorization: "Bearer must-not-log-this" },
          body: { provisioningId: "prov-1", secret: "must-not-log-this" },
        },
        res,
        { service, logger },
      );
      assert.equal(res.statusCode, expectedStatus);
      assert.equal(res.jsonBody.ok, false);
      assert.equal(res.jsonBody.error.code, code);
      assert.equal(JSON.stringify(res.jsonBody).includes("private detail"), false);
      assert.deepEqual(warnings, [{ classification, errorCode: code }]);
      assert.equal(JSON.stringify(warnings).includes("must-not-log-this"), false);
    });
  }

  await t.test("unknown exception returns generic 500 and logs name only", async () => {
    const service = serviceMock(async () => {
      throw new TypeError("raw internal detail");
    });
    const errors: Array<{ errorName: string }> = [];
    const logger: SafeAuditVerificationLogger = {
      error(entry) {
        errors.push(entry);
      },
    };
    const res = responseMock();
    await handleProClubProvisioningAuditVerificationHttpRequest(
      { method: "POST", body: { provisioningId: "prov-1" } },
      res,
      { service, logger },
    );
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_AUDIT_VERIFICATION_INTERNAL",
        message: "Internal server error",
      },
    });
    assert.deepEqual(errors, [{ errorName: "TypeError" }]);
  });
});
