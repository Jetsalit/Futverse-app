import assert from "node:assert/strict";
import test from "node:test";

import {
  requireVerifiedAppCheckForPrivilegedHttp,
  type MinimalHttpResponse,
} from "../functions/src/lib/privilegedHttpAppCheckGate.ts";
import {
  AppCheckVerificationError,
  type ServerAppCheckTokenVerifier,
} from "../functions/src/lib/serverAppCheckTokenVerifier.ts";

function createResponseCapture() {
  let statusCode = 0;
  let body: unknown;
  const response: MinimalHttpResponse = {
    status(code) {
      statusCode = code;
      return response;
    },
    json(value) {
      body = value;
    },
  };
  return { response, get statusCode() { return statusCode; }, get body() { return body; } };
}

function createLoggerCapture() {
  const warnings: unknown[] = [];
  const errors: unknown[] = [];
  return {
    warnings,
    errors,
    logger: {
      warn(entry: unknown) { warnings.push(entry); },
      error(entry: unknown) { errors.push(entry); },
    },
  };
}

test("privileged HTTP App Check gate allows verified request without writing a response", async () => {
  const capture = createResponseCapture();
  const logs = createLoggerCapture();
  const verifier: ServerAppCheckTokenVerifier = {
    async verifyHeader(value) {
      assert.equal(value, "verified-token");
      return "app-id";
    },
  };

  assert.equal(
    await requireVerifiedAppCheckForPrivilegedHttp(
      "verified-token",
      capture.response,
      verifier,
      logs.logger,
    ),
    true,
  );
  assert.equal(capture.statusCode, 0);
  assert.equal(capture.body, undefined);
  assert.deepEqual(logs.warnings, []);
  assert.deepEqual(logs.errors, []);
});

test("privileged HTTP App Check gate fails closed with generic 401 for invalid App Check", async () => {
  const capture = createResponseCapture();
  const logs = createLoggerCapture();
  const verifier: ServerAppCheckTokenVerifier = {
    async verifyHeader() {
      throw new AppCheckVerificationError("private detail");
    },
  };

  assert.equal(
    await requireVerifiedAppCheckForPrivilegedHttp(
      "bad-token",
      capture.response,
      verifier,
      logs.logger,
    ),
    false,
  );
  assert.equal(capture.statusCode, 401);
  assert.deepEqual(capture.body, {
    ok: false,
    error: {
      code: "ERROR_APP_CHECK_REQUIRED",
      message: "Application verification is required.",
    },
  });
  assert.deepEqual(logs.warnings, [{
    classification: "UNAUTHORIZED_APP_CHECK",
    errorCode: "ERROR_APP_CHECK_REQUIRED",
  }]);
  assert.equal(JSON.stringify(logs.warnings).includes("bad-token"), false);
  assert.equal(JSON.stringify(capture.body).includes("private detail"), false);
});

test("privileged HTTP App Check gate fails closed with generic 500 for unexpected verifier failure", async () => {
  const capture = createResponseCapture();
  const logs = createLoggerCapture();
  const verifier: ServerAppCheckTokenVerifier = {
    async verifyHeader() {
      throw new Error("internal private detail");
    },
  };

  assert.equal(
    await requireVerifiedAppCheckForPrivilegedHttp(
      "token",
      capture.response,
      verifier,
      logs.logger,
    ),
    false,
  );
  assert.equal(capture.statusCode, 500);
  assert.deepEqual(logs.errors, [{
    classification: "INTERNAL_ERROR",
    errorCode: "ERROR_APP_CHECK_INTERNAL",
  }]);
  assert.equal(JSON.stringify(capture.body).includes("internal private detail"), false);
});
