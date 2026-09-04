import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_CODES,
  ProClubProvisioningError,
} from "../functions/src/proClubProvisioning/core.ts";
import {
  handleProClubProvisioningHttpRequest,
  createProClubProvisioningHttpHandler,
  type HttpRequestLike,
  type HttpResponseLike,
  type SafeHandlerLogger,
} from "../functions/src/proClubProvisioning/httpHandler.ts";
import type {
  ProvisionProClubRequestInput,
  ProvisionProClubResult,
} from "../functions/src/proClubProvisioning/service.ts";

function createMockResponse(): HttpResponseLike & {
  statusCode: number;
  headers: Record<string, string>;
  jsonBody: any;
} {
  return {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
  };
}

function createMockService(
  impl?: (input: ProvisionProClubRequestInput) => Promise<ProvisionProClubResult>,
) {
  const calls: ProvisionProClubRequestInput[] = [];
  const defaultResult: ProvisionProClubResult = {
    status: "COMPLETED",
    provisioningId: "prov-001",
    clubId: "club-alpha",
    ownerUid: "owner-user-001",
    requestingSuperAdminUid: "superadmin-001",
    isReplay: false,
    createdAt: "2026-09-04T00:00:00.000Z",
  };

  return {
    calls,
    provisionProClub: async (input: ProvisionProClubRequestInput) => {
      calls.push(input);
      if (impl) {
        return impl(input);
      }
      return defaultResult;
    },
  };
}

function createMockLogger(): SafeHandlerLogger & {
  warnings: Array<{ errorCode: string }>;
  errors: Array<{ errorName: string }>;
} {
  const warnings: Array<{ errorCode: string }> = [];
  const errors: Array<{ errorName: string }> = [];
  return {
    warnings,
    errors,
    warn(entry) {
      warnings.push(entry);
    },
    error(entry) {
      errors.push(entry);
    },
  };
}

test("Cloud Functions Gen 2 Pro Club Provisioning HTTP Adapter Suite", async (t) => {
  await t.test("1. POST success -> 200", async () => {
    const service = createMockService();
    const req: HttpRequestLike = {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: { clubId: "club-1" },
    };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonBody?.ok, true);
    assert.equal(res.jsonBody?.result?.status, "COMPLETED");
  });

  await t.test("2. Authorization header forwarded exactly", async () => {
    const service = createMockService();
    const req: HttpRequestLike = {
      method: "POST",
      headers: {
        authorization: "Bearer exact-test-token-value-12345",
      },
      body: { clubId: "club-1" },
    };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(service.calls.length, 1);
    assert.equal(
      service.calls[0].authorizationHeader,
      "Bearer exact-test-token-value-12345",
    );
  });

  await t.test("3. body forwarded unchanged", async () => {
    const service = createMockService();
    const untrustedBody = {
      provisioningId: "prov-999",
      clubId: "club-real",
      name: "Real Club",
      level: "T1",
      initialOwnerUid: "owner-999",
      untrustedExtraField: "should-reach-core-unfiltered",
    };
    const req: HttpRequestLike = {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: untrustedBody,
    };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(service.calls.length, 1);
    assert.strictEqual(service.calls[0].requestBody, untrustedBody);
  });

  await t.test(
    "4. requestingSuperAdminUid in body gets no trusted treatment",
    async () => {
      const service = createMockService();
      const req: HttpRequestLike = {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: {
          clubId: "club-alpha",
          requestingSuperAdminUid: "attacker-forged-uid",
        },
      };
      const res = createMockResponse();

      await handleProClubProvisioningHttpRequest(req, res, { service });

      assert.equal(service.calls.length, 1);
      const passedBody = service.calls[0].requestBody as any;
      assert.equal(
        passedBody.requestingSuperAdminUid,
        "attacker-forged-uid",
        "Body is passed untouched to service where core rejects body-supplied requestingSuperAdminUid",
      );
      assert.equal(
        "requestingSuperAdminUid" in service.calls[0],
        false,
        "Handler does not promote body field to trusted service input",
      );
    },
  );

  await t.test("5. GET -> 405", async () => {
    const service = createMockService();
    const req: HttpRequestLike = { method: "GET", headers: {}, body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers["allow"], "POST");
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_METHOD_NOT_ALLOWED",
        message: "Method not allowed",
      },
    });
  });

  await t.test("6. PUT -> 405", async () => {
    const service = createMockService();
    const req: HttpRequestLike = { method: "PUT", headers: {}, body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers["allow"], "POST");
    assert.equal(res.jsonBody?.error?.code, "ERROR_METHOD_NOT_ALLOWED");
  });

  await t.test("7. DELETE -> 405", async () => {
    const service = createMockService();
    const req: HttpRequestLike = { method: "DELETE", headers: {}, body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 405);
    assert.equal(res.headers["allow"], "POST");
    assert.equal(res.jsonBody?.error?.code, "ERROR_METHOD_NOT_ALLOWED");
  });

  await t.test("8. non-POST does not call service", async () => {
    const service = createMockService();
    const req: HttpRequestLike = { method: "PATCH", headers: {}, body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(service.calls.length, 0);
  });

  await t.test("9. INVALID_PROVISIONING_REQUEST -> 400", async () => {
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.INVALID_PROVISIONING_REQUEST,
        "Detailed validation failure in core",
      );
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_INVALID_PROVISIONING_REQUEST",
        message: "Invalid provisioning request",
      },
    });
  });

  await t.test("10. UNAUTHORIZED_REQUESTING_PRINCIPAL -> 401", async () => {
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
        "Token verification failed",
      );
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_UNAUTHORIZED_REQUESTING_PRINCIPAL",
        message: "Unauthorized",
      },
    });
  });

  await t.test("11. INVALID_OWNER -> 422", async () => {
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.INVALID_OWNER,
        "Initial owner account is not active",
      );
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_INVALID_OWNER",
        message: "Invalid initial owner",
      },
    });
  });

  await t.test("12. CLUB_EXISTS -> 409", async () => {
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.CLUB_EXISTS,
        "Club already exists",
      );
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_CLUB_EXISTS",
        message: "Pro Club already exists",
      },
    });
  });

  await t.test("13. PROVISIONING_ID_CONFLICT -> 409", async () => {
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.PROVISIONING_ID_CONFLICT,
        "Provisioning ID conflict",
      );
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_PROVISIONING_ID_CONFLICT",
        message: "Provisioning request conflicts with existing record",
      },
    });
  });

  await t.test("14. PROVISIONING_INTEGRITY -> 500", async () => {
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.PROVISIONING_INTEGRITY,
        "Audit replay integrity violation",
      );
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_PROVISIONING_INTEGRITY",
        message: "Provisioning integrity check failed",
      },
    });
  });

  await t.test("15. unexpected Error -> generic 500", async () => {
    const service = createMockService(async () => {
      throw new Error("Unexpected database connection failure");
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.jsonBody, {
      ok: false,
      error: {
        code: "ERROR_INTERNAL",
        message: "Internal server error",
      },
    });
  });

  await t.test("16. domain raw message not leaked", async () => {
    const sensitiveDomainMessage =
      "Sensitive internal domain message: users/admin-123 failed query at line 99";
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.INVALID_PROVISIONING_REQUEST,
        sensitiveDomainMessage,
      );
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    const serialized = JSON.stringify(res.jsonBody);
    assert.ok(!serialized.includes(sensitiveDomainMessage));
  });

  await t.test("17. unexpected raw message not leaked", async () => {
    const sensitiveErrorMessage =
      "INTERNAL_SECRET_KEY_abc123 failed to connect to firestore host 192.168.1.10";
    const service = createMockService(async () => {
      throw new Error(sensitiveErrorMessage);
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    const serialized = JSON.stringify(res.jsonBody);
    assert.ok(!serialized.includes(sensitiveErrorMessage));
  });

  await t.test("18. stack not returned", async () => {
    const service = createMockService(async () => {
      throw new Error("Crash with stack trace");
    });
    const req: HttpRequestLike = { method: "POST", body: {} };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    const serialized = JSON.stringify(res.jsonBody);
    assert.ok(!serialized.includes("stack"));
    assert.ok(!serialized.includes("at "));
  });

  await t.test("19. Bearer token absent from response", async () => {
    const secretToken = "super-sensitive-jwt-token-1234567890";
    const service = createMockService(async () => {
      throw new ProClubProvisioningError(
        ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
        `Token ${secretToken} was invalid`,
      );
    });
    const req: HttpRequestLike = {
      method: "POST",
      headers: { authorization: `Bearer ${secretToken}` },
      body: {},
    };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    const serialized = JSON.stringify(res.jsonBody);
    assert.ok(!serialized.includes(secretToken));
  });

  await t.test("20. Bearer token absent from captured logs", async () => {
    const secretToken = "super-sensitive-jwt-token-1234567890";
    const logger = createMockLogger();
    const service = createMockService(async () => {
      throw new Error(`Crash with token ${secretToken}`);
    });
    const req: HttpRequestLike = {
      method: "POST",
      headers: { authorization: `Bearer ${secretToken}` },
      body: {},
    };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service, logger });

    const serialized = JSON.stringify({
      warnings: logger.warnings,
      errors: logger.errors,
    });
    assert.ok(!serialized.includes(secretToken));
    assert.equal(logger.errors.length, 1);
    assert.equal(logger.errors[0].errorName, "Error");
  });

  await t.test("21. isReplay=true preserved", async () => {
    const service = createMockService(async () => ({
      status: "COMPLETED",
      provisioningId: "prov-001",
      clubId: "club-alpha",
      ownerUid: "owner-user-001",
      requestingSuperAdminUid: "superadmin-001",
      isReplay: true,
      createdAt: "2026-09-04T00:00:00.000Z",
    }));
    const req: HttpRequestLike = {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: { clubId: "club-alpha" },
    };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonBody?.result?.isReplay, true);
  });

  await t.test("22. isReplay=false preserved", async () => {
    const service = createMockService(async () => ({
      status: "COMPLETED",
      provisioningId: "prov-002",
      clubId: "club-beta",
      ownerUid: "owner-user-002",
      requestingSuperAdminUid: "superadmin-001",
      isReplay: false,
      createdAt: "2026-09-04T00:00:00.000Z",
    }));
    const req: HttpRequestLike = {
      method: "POST",
      headers: { authorization: "Bearer valid-token" },
      body: { clubId: "club-beta" },
    };
    const res = createMockResponse();

    await handleProClubProvisioningHttpRequest(req, res, { service });

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonBody?.result?.isReplay, false);
  });
});
