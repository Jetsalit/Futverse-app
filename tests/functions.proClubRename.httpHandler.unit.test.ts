import assert from "node:assert/strict";
import test from "node:test";
import {
  handleProClubRenameHttpRequest,
  type RenameHttpResponseLike,
  type RenameServiceLike,
} from "../functions/src/proClubRename/httpHandler.ts";
import {
  RENAME_ERROR_CODES,
  ProClubRenameError,
} from "../functions/src/proClubRename/core.ts";

function responseCapture() {
  let statusCode = 0;
  let body: any;
  const headers: Record<string, string> = {};
  const response: RenameHttpResponseLike = {
    status(code) { statusCode = code; return response; },
    setHeader(name, value) { headers[name.toLowerCase()] = value; return response; },
    json(value) { body = value; return response; },
  };
  return { response, headers, get statusCode() { return statusCode; }, get body() { return body; } };
}

const completed = {
  status: "COMPLETED" as const,
  clubId: "club-alpha",
  changeId: "change-1",
  name: "Alpha United",
  shortName: "AU",
  changedAt: "2026-09-07T01:02:03.000Z",
  changedBy: "superadmin-active",
};

test("POST forwards only auth header/body and returns completed result", async () => {
  const calls: unknown[] = [];
  const service: RenameServiceLike = {
    async renameProClub(input) { calls.push(input); return completed; },
  };
  const capture = responseCapture();
  await handleProClubRenameHttpRequest({
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: { clubId: "club-alpha" },
  }, capture.response, { service });
  assert.equal(capture.statusCode, 200);
  assert.deepEqual(capture.body, { ok: true, result: completed });
  assert.deepEqual(calls, [{
    authorizationHeader: "Bearer token",
    requestBody: { clubId: "club-alpha" },
  }]);
});

test("non-POST is rejected before service execution", async () => {
  let called = false;
  const capture = responseCapture();
  await handleProClubRenameHttpRequest({ method: "PATCH" }, capture.response, {
    service: { async renameProClub() { called = true; return completed; } },
  });
  assert.equal(called, false);
  assert.equal(capture.statusCode, 405);
  assert.equal(capture.headers.allow, "POST");
});

test("domain errors map to privacy-safe public responses", async () => {
  for (const [code, expectedStatus] of [
    [RENAME_ERROR_CODES.INVALID_REQUEST, 400],
    [RENAME_ERROR_CODES.UNAUTHORIZED, 401],
    [RENAME_ERROR_CODES.CLUB_NOT_FOUND, 404],
    [RENAME_ERROR_CODES.INVALID_EXISTING_CLUB, 409],
    [RENAME_ERROR_CODES.STALE_REQUEST, 409],
    [RENAME_ERROR_CODES.NO_OP, 409],
    [RENAME_ERROR_CODES.EFFECTIVE_AT_FUTURE, 400],
    [RENAME_ERROR_CODES.EFFECTIVE_AT_OUT_OF_ORDER, 409],
    [RENAME_ERROR_CODES.INTEGRITY, 500],
  ] as const) {
    const capture = responseCapture();
    const secret = "sensitive-internal-detail";
    await handleProClubRenameHttpRequest({ method: "POST" }, capture.response, {
      service: {
        async renameProClub() { throw new ProClubRenameError(code, secret); },
      },
    });
    assert.equal(capture.statusCode, expectedStatus);
    assert.equal(capture.body.error.code, code);
    assert.equal(JSON.stringify(capture.body).includes(secret), false);
  }
});

test("unexpected failures return generic 500 without secret or stack", async () => {
  const capture = responseCapture();
  await handleProClubRenameHttpRequest({ method: "POST" }, capture.response, {
    service: { async renameProClub() { throw new Error("private database path"); } },
  });
  assert.equal(capture.statusCode, 500);
  assert.deepEqual(capture.body, {
    ok: false,
    error: { code: "ERROR_INTERNAL", message: "Internal server error" },
  });
});
