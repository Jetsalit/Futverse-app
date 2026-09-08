import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EXPECTED_APP_CHECK_ERROR_CODE,
  EXPECTED_PRODUCTION_PROJECT_ID,
  PRODUCTION_SMOKE_ACK,
  PRODUCTION_SMOKE_TARGET_CONFIG_PATH,
  PROTECTED_PRO_CLUB_PATHS,
  REQUIRED_DEFAULT_PRODUCTION_ORIGINS,
  assertApprovedProductionOrigin,
  assertExpectedAppCheckRejection,
  runProductionProClubBoundarySmoke,
  validateApprovedProductionSmokeTargets,
  validateProductionOrigin,
  validateSmokeEnvironment,
} from "../scripts/smokeProductionProClubBoundary.mjs";

const targetConfig = JSON.parse(
  readFileSync(PRODUCTION_SMOKE_TARGET_CONFIG_PATH, "utf8"),
);
const targets = validateApprovedProductionSmokeTargets(targetConfig);
const approvedOrigins = targets.allowedOrigins;

function appCheckRequiredResponse({
  status = 401,
  contentType = "application/json; charset=utf-8",
  code = EXPECTED_APP_CHECK_ERROR_CODE,
  message = "Application verification is required.",
  location = "",
  redirected = false,
} = {}) {
  return {
    status,
    redirected,
    headers: {
      get(name) {
        if (name.toLowerCase() === "content-type") return contentType;
        if (name.toLowerCase() === "location") return location;
        return null;
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

test("reviewed production smoke target config is bound to FutVerse production project", () => {
  assert.equal(targets.projectId, EXPECTED_PRODUCTION_PROJECT_ID);
  assert.deepEqual(approvedOrigins, REQUIRED_DEFAULT_PRODUCTION_ORIGINS);
});

test("target config rejects project drift, removed defaults, duplicates, and invalid origins", () => {
  assert.throws(
    () =>
      validateApprovedProductionSmokeTargets({
        projectId: "wrong-project",
        allowedOrigins: REQUIRED_DEFAULT_PRODUCTION_ORIGINS,
      }),
    /projectId/,
  );
  assert.throws(
    () =>
      validateApprovedProductionSmokeTargets({
        projectId: EXPECTED_PRODUCTION_PROJECT_ID,
        allowedOrigins: [REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0]],
      }),
    /retain required origin/,
  );
  assert.throws(
    () =>
      validateApprovedProductionSmokeTargets({
        projectId: EXPECTED_PRODUCTION_PROJECT_ID,
        allowedOrigins: [
          ...REQUIRED_DEFAULT_PRODUCTION_ORIGINS,
          REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0],
        ],
      }),
    /duplicates/,
  );
  assert.throws(
    () =>
      validateApprovedProductionSmokeTargets({
        projectId: EXPECTED_PRODUCTION_PROJECT_ID,
        allowedOrigins: [
          ...REQUIRED_DEFAULT_PRODUCTION_ORIGINS,
          "http://not-production.example",
        ],
      }),
    /HTTPS/,
  );
});

test("production origin accepts canonical HTTPS origin shape and rejects unsafe forms", () => {
  assert.equal(
    validateProductionOrigin("https://futverse-d7872.web.app"),
    "https://futverse-d7872.web.app",
  );

  for (const value of [
    "http://futverse-d7872.web.app",
    "https://futverse-d7872.web.app/path",
    "https://futverse-d7872.web.app?x=1",
    "https://user:pass@futverse-d7872.web.app",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    " https://futverse-d7872.web.app ",
  ]) {
    assert.throws(() => validateProductionOrigin(value), /FUTVERSE_PRODUCTION_ORIGIN/);
  }
});

test("production origin must be in reviewed target allowlist", () => {
  assert.equal(
    assertApprovedProductionOrigin(
      REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0],
      approvedOrigins,
    ),
    REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0],
  );
  assert.throws(
    () =>
      assertApprovedProductionOrigin(
        "https://attacker-or-wrong-environment.example",
        approvedOrigins,
      ),
    /reviewed production smoke target allowlist/,
  );
});

test("smoke environment requires acknowledgement, reviewed origin, and no credentials", () => {
  assert.deepEqual(
    validateSmokeEnvironment(
      {
        FUTVERSE_PRODUCTION_ORIGIN: REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0],
        FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
      },
      approvedOrigins,
    ),
    { origin: REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0] },
  );

  assert.throws(
    () =>
      validateSmokeEnvironment(
        {
          FUTVERSE_PRODUCTION_ORIGIN: REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0],
        },
        approvedOrigins,
      ),
    /FUTVERSE_PRODUCTION_SMOKE_ACK/,
  );
  assert.throws(
    () =>
      validateSmokeEnvironment(
        {
          FUTVERSE_PRODUCTION_ORIGIN: "https://wrong-target.example",
          FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
        },
        approvedOrigins,
      ),
    /reviewed production smoke target allowlist/,
  );

  for (const name of [
    "FUTVERSE_PRODUCTION_ID_TOKEN",
    "FUTVERSE_PRODUCTION_APP_CHECK_TOKEN",
  ]) {
    assert.throws(
      () =>
        validateSmokeEnvironment(
          {
            FUTVERSE_PRODUCTION_ORIGIN: REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0],
            FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
            [name]: "must-not-be-used",
          },
          approvedOrigins,
        ),
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
  await assert.rejects(
    () =>
      assertExpectedAppCheckRejection(
        appCheckRequiredResponse({
          status: 302,
          location: "https://external.example/",
        }),
        PROTECTED_PRO_CLUB_PATHS[0],
      ),
    /redirect/,
  );
  await assert.rejects(
    () =>
      assertExpectedAppCheckRejection(
        appCheckRequiredResponse({ redirected: true }),
        PROTECTED_PRO_CLUB_PATHS[0],
      ),
    /redirect/,
  );
});

test("smoke runner calls all protected paths, including rename, only on an approved production origin", async () => {
  assert.deepEqual(PROTECTED_PRO_CLUB_PATHS, [
    "/api/pro-club/provision-v1",
    "/api/pro-club/verify-audit-v1",
    "/api/pro-club/rename-v1",
  ]);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return appCheckRequiredResponse();
  };

  const results = await runProductionProClubBoundarySmoke({
    origin: REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0],
    allowedOrigins: approvedOrigins,
    fetchImpl,
  });

  assert.equal(results.length, PROTECTED_PRO_CLUB_PATHS.length);
  assert.deepEqual(
    calls.map((call) => new URL(call.url).origin),
    PROTECTED_PRO_CLUB_PATHS.map(() => REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0]),
  );
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

test("smoke runner blocks an unapproved origin before fetch", async () => {
  let fetchCalled = false;
  await assert.rejects(
    () =>
      runProductionProClubBoundarySmoke({
        origin: "https://wrong-target.example",
        allowedOrigins: approvedOrigins,
        fetchImpl: async () => {
          fetchCalled = true;
          return appCheckRequiredResponse();
        },
      }),
    /reviewed production smoke target allowlist/,
  );
  assert.equal(fetchCalled, false);
});
