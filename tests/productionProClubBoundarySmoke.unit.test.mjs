import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPECTED_APP_CHECK_ERROR_CODE,
  PRODUCTION_SMOKE_ACK,
  PROTECTED_PRO_CLUB_PATHS,
  assertExpectedAppCheckRejection,
  runProductionProClubBoundarySmoke,
  validateProductionOrigin,
  validateSmokeEnvironment,
} from "../scripts/smokeProductionProClubBoundary.mjs";

function appCheckRequiredResponse({
  status = 401,
  contentType = "application/json; charset=utf-8",
  code = EXPECTED_APP_CHECK_ERROR_CODE,
  message = "Application verification is required.",
} = {}) {
  return {
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async json() {
      return {
        ok: false,
        error: { code, message },
      };
    },
  };
}

test("production origin accepts canonical HTTPS origin only", () => {
  assert.equal(
    validateProductionOrigin("https://futverse.example"),
    "https://futverse.example",
  );

  for (const value of [
    "http://futverse.example",
    "https://futverse.example/path",
    "https://futverse.example?x=1",
    "https://user:pass@futverse.example",
    "https://localhost",
    "https://127.0.0.1",
    " https://futverse.example ",
  ]) {
    assert.throws(() => validateProductionOrigin(value), /FUTVERSE_PRODUCTION_ORIGIN/);
  }
});

test("smoke environment requires explicit read-only acknowledgement and rejects credentials", () => {
  assert.deepEqual(
    validateSmokeEnvironment({
      FUTVERSE_PRODUCTION_ORIGIN: "https://futverse.example",
      FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
    }),
    { origin: "https://futverse.example" },
  );

  assert.throws(
    () =>
      validateSmokeEnvironment({
        FUTVERSE_PRODUCTION_ORIGIN: "https://futverse.example",
      }),
    /FUTVERSE_PRODUCTION_SMOKE_ACK/,
  );

  for (const name of [
    "FUTVERSE_PRODUCTION_ID_TOKEN",
    "FUTVERSE_PRODUCTION_APP_CHECK_TOKEN",
  ]) {
    assert.throws(
      () =>
        validateSmokeEnvironment({
          FUTVERSE_PRODUCTION_ORIGIN: "https://futverse.example",
          FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
          [name]: "must-not-be-used",
        }),
      new RegExp(name),
    );
  }
});

test("boundary response must be privacy-safe App Check 401 JSON", async () => {
  const accepted = await assertExpectedAppCheckRejection(
    appCheckRequiredResponse(),
    PROTECTED_PRO_CLUB_PATHS[0],
  );
  assert.equal(accepted.status, 401);
  assert.equal(accepted.errorCode, EXPECTED_APP_CHECK_ERROR_CODE);

  await assert.rejects(
    () =>
      assertExpectedAppCheckRejection(
        appCheckRequiredResponse({ status: 200 }),
        PROTECTED_PRO_CLUB_PATHS[0],
      ),
    /expected HTTP 401/,
  );
  await assert.rejects(
    () =>
      assertExpectedAppCheckRejection(
        appCheckRequiredResponse({ code: "ERROR_UNAUTHORIZED" }),
        PROTECTED_PRO_CLUB_PATHS[0],
      ),
    /did not fail closed at the App Check boundary/,
  );
  await assert.rejects(
    () =>
      assertExpectedAppCheckRejection(
        appCheckRequiredResponse({ contentType: "text/html" }),
        PROTECTED_PRO_CLUB_PATHS[0],
      ),
    /non-JSON/,
  );
});

test("smoke runner calls both protected paths without Authorization or App Check headers", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return appCheckRequiredResponse();
  };

  const results = await runProductionProClubBoundarySmoke({
    origin: "https://futverse.example",
    fetchImpl,
  });

  assert.equal(results.length, PROTECTED_PRO_CLUB_PATHS.length);
  assert.deepEqual(
    calls.map((call) => new URL(call.url).pathname),
    PROTECTED_PRO_CLUB_PATHS,
  );

  for (const call of calls) {
    assert.equal(call.options.method, "POST");
    assert.equal(call.options.body, "{}");
    const headerNames = Object.keys(call.options.headers).map((name) => name.toLowerCase());
    assert.equal(headerNames.includes("authorization"), false);
    assert.equal(headerNames.includes("x-firebase-appcheck"), false);
  }
});
