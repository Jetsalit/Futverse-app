import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRODUCTION_SMOKE_ACK,
  PRODUCTION_SMOKE_TARGET_CONFIG_PATH,
  PROTECTED_PRO_CLUB_PATHS,
  REQUIRED_DEFAULT_PRODUCTION_ORIGINS,
  validateApprovedProductionSmokeTargets,
} from "../scripts/smokeProductionProClubBoundary.mjs";
import {
  SPARK_HOSTING_BOUNDARY,
  SPARK_HOSTING_MODE,
  assertExpectedSparkHostingFallback,
  assertSparkHostingOnlyConfig,
  runProductionSparkHostingBoundarySmoke,
  validateSparkSmokeEnvironment,
} from "../scripts/smokeProductionSparkHostingBoundary.mjs";

const targets = validateApprovedProductionSmokeTargets(
  JSON.parse(readFileSync(PRODUCTION_SMOKE_TARGET_CONFIG_PATH, "utf8")),
);
const approvedOrigin = REQUIRED_DEFAULT_PRODUCTION_ORIGINS[0];

const FUTVERSE_SPA_SHELL = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>FutVerse</title></head>
  <body>
    <div id="root"></div>
    <script type="module" crossorigin src="/assets/index-reviewed.js"></script>
  </body>
</html>`;

function responseFor(requestUrl, {
  status = 200,
  contentType = "text/html; charset=utf-8",
  body = FUTVERSE_SPA_SHELL,
  location = "",
  redirected = false,
  responseUrl = requestUrl,
} = {}) {
  return {
    status,
    redirected,
    url: responseUrl,
    headers: {
      get(name) {
        if (name.toLowerCase() === "content-type") return contentType;
        if (name.toLowerCase() === "location") return location;
        return null;
      },
    },
    async text() {
      return body;
    },
  };
}

test("reviewed configs separate Spark Hosting from the future server control plane", () => {
  const sparkConfig = JSON.parse(readFileSync("firebase.spark.json", "utf8"));
  assert.deepEqual(assertSparkHostingOnlyConfig(sparkConfig), {
    mode: SPARK_HOSTING_MODE,
  });

  const serverConfig = JSON.parse(readFileSync("firebase.json", "utf8"));
  assert.deepEqual(
    serverConfig.hosting.rewrites.slice(0, 3).map((rewrite) => [
      rewrite.source,
      rewrite.function?.functionId,
      rewrite.function?.region,
    ]),
    [
      ["/api/pro-club/provision-v1", "provisionProClubV1", "asia-southeast1"],
      [
        "/api/pro-club/verify-audit-v1",
        "verifyProClubProvisioningAuditV1",
        "asia-southeast1",
      ],
      ["/api/pro-club/rename-v1", "renameProClubV1", "asia-southeast1"],
    ],
  );

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    packageJson.scripts["smoke:production-spark-hosting-boundary"],
    "node scripts/smokeProductionSparkHostingBoundary.mjs",
  );
  assert.equal(
    packageJson.scripts["test:production-spark-hosting-boundary-smoke"],
    "node --test tests/productionSparkHostingBoundarySmoke.unit.test.mjs",
  );
});

test("Spark config rejects protected rewrites and any server deploy resource", () => {
  assert.throws(
    () =>
      assertSparkHostingOnlyConfig({
        hosting: {
          public: "dist",
          rewrites: [
            {
              source: PROTECTED_PRO_CLUB_PATHS[0],
              function: { functionId: "provisionProClubV1" },
            },
            { source: "**", destination: "/index.html" },
          ],
        },
      }),
    /exactly one SPA catch-all rewrite/,
  );
  assert.throws(
    () =>
      assertSparkHostingOnlyConfig({
        hosting: {
          public: "dist",
          rewrites: [{ source: "**", destination: "/index.html" }],
        },
        functions: [{ source: "functions" }],
      }),
    /Hosting only/,
  );
});

test("Spark smoke environment accepts only an approved origin without credentials", () => {
  assert.deepEqual(
    validateSparkSmokeEnvironment(
      {
        FUTVERSE_PRODUCTION_ORIGIN: approvedOrigin,
        FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
      },
      targets.allowedOrigins,
    ),
    { origin: approvedOrigin },
  );

  assert.throws(
    () =>
      validateSparkSmokeEnvironment(
        {
          FUTVERSE_PRODUCTION_ORIGIN: "https://unreviewed.example",
          FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
        },
        targets.allowedOrigins,
      ),
    /reviewed production smoke target allowlist/,
  );

  for (const credentialName of [
    "FUTVERSE_PRODUCTION_ID_TOKEN",
    "FUTVERSE_PRODUCTION_APP_CHECK_TOKEN",
  ]) {
    assert.throws(
      () =>
        validateSparkSmokeEnvironment(
          {
            FUTVERSE_PRODUCTION_ORIGIN: approvedOrigin,
            FUTVERSE_PRODUCTION_SMOKE_ACK: PRODUCTION_SMOKE_ACK,
            [credentialName]: "forbidden",
          },
          targets.allowedOrigins,
        ),
      new RegExp(credentialName),
    );
  }
});

test("matching FutVerse SPA Hosting fallback is accepted", async () => {
  const requestPath = PROTECTED_PRO_CLUB_PATHS[0];
  const requestUrl = `${approvedOrigin}${requestPath}`;
  assert.deepEqual(
    await assertExpectedSparkHostingFallback(
      responseFor(requestUrl),
      requestPath,
      requestUrl,
    ),
    {
      path: requestPath,
      status: 200,
      boundary: SPARK_HOSTING_BOUNDARY,
    },
  );
});

test("JSON success and JSON business-handler responses fail closed", async () => {
  const requestPath = PROTECTED_PRO_CLUB_PATHS[0];
  const requestUrl = `${approvedOrigin}${requestPath}`;

  for (const body of [
    JSON.stringify({ ok: true, clubId: "unexpected" }),
    JSON.stringify({ ok: false, error: { code: "ERROR_APP_CHECK_REQUIRED" } }),
  ]) {
    await assert.rejects(
      () =>
        assertExpectedSparkHostingFallback(
          responseFor(requestUrl, {
            contentType: "application/json; charset=utf-8",
            body,
          }),
          requestPath,
          requestUrl,
        ),
      /reviewed HTML Hosting fallback/,
    );
  }

  await assert.rejects(
    () =>
      assertExpectedSparkHostingFallback(
        responseFor(requestUrl, {
          contentType: "text/html",
          body: JSON.stringify({ ok: true, clubId: "unexpected" }),
        }),
        requestPath,
        requestUrl,
    ),
    /unexpected JSON business response/,
  );
  await assert.rejects(
    () =>
      assertExpectedSparkHostingFallback(
        responseFor(requestUrl, {
          body: `${FUTVERSE_SPA_SHELL}<script type="application/json">{"ok":true,"clubId":"unexpected"}</script>`,
        }),
        requestPath,
        requestUrl,
      ),
    /evidence of a business handler response/,
  );
});

test("redirects and unexpected final URLs fail without following them", async () => {
  const requestPath = PROTECTED_PRO_CLUB_PATHS[0];
  const requestUrl = `${approvedOrigin}${requestPath}`;

  await assert.rejects(
    () =>
      assertExpectedSparkHostingFallback(
        responseFor(requestUrl, {
          status: 302,
          location: "https://external.example/",
        }),
        requestPath,
        requestUrl,
      ),
    /redirect/,
  );
  await assert.rejects(
    () =>
      assertExpectedSparkHostingFallback(
        responseFor(requestUrl, {
          redirected: true,
          responseUrl: "https://external.example/",
        }),
        requestPath,
        requestUrl,
      ),
    /redirect/,
  );
  await assert.rejects(
    () =>
      assertExpectedSparkHostingFallback(
        responseFor(requestUrl, {
          responseUrl: `${approvedOrigin}/unexpected`,
        }),
        requestPath,
        requestUrl,
      ),
    /unexpected response URL/,
  );
});

test("unexpected status or content type fails the Spark contract", async () => {
  const requestPath = PROTECTED_PRO_CLUB_PATHS[0];
  const requestUrl = `${approvedOrigin}${requestPath}`;

  await assert.rejects(
    () =>
      assertExpectedSparkHostingFallback(
        responseFor(requestUrl, { status: 404 }),
        requestPath,
        requestUrl,
      ),
    /expected the reviewed Hosting fallback HTTP 200/,
  );
  await assert.rejects(
    () =>
      assertExpectedSparkHostingFallback(
        responseFor(requestUrl, { contentType: "text/plain" }),
        requestPath,
        requestUrl,
      ),
    /reviewed HTML Hosting fallback/,
  );
});

test("arbitrary or malformed HTML does not satisfy the FutVerse SPA shell", async () => {
  const requestPath = PROTECTED_PRO_CLUB_PATHS[0];
  const requestUrl = `${approvedOrigin}${requestPath}`;

  for (const body of [
    "<html><body>generic hosting page</body></html>",
    '<!doctype html><title>FutVerse</title><div id="root"></div>',
    '<!doctype html><title>Wrong App</title><div id="root"></div><script type="module" src="/assets/index.js"></script>',
  ]) {
    await assert.rejects(
      () =>
        assertExpectedSparkHostingFallback(
          responseFor(requestUrl, { body }),
          requestPath,
          requestUrl,
        ),
      /reviewed FutVerse SPA shell/,
    );
  }
});

test("Spark runner probes all three protected paths with empty JSON and no credentials", async () => {
  const calls = [];
  const results = await runProductionSparkHostingBoundarySmoke({
    origin: approvedOrigin,
    allowedOrigins: targets.allowedOrigins,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responseFor(url);
    },
  });

  assert.deepEqual(
    calls.map(({ url }) => new URL(url).pathname),
    PROTECTED_PRO_CLUB_PATHS,
  );
  assert.equal(results.length, 3);
  for (const { options } of calls) {
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "manual");
    assert.equal(options.body, "{}");
    assert.equal(options.headers["Content-Type"], "application/json");
    const headerNames = Object.keys(options.headers).map((name) => name.toLowerCase());
    assert.equal(headerNames.includes("authorization"), false);
    assert.equal(headerNames.includes("x-firebase-appcheck"), false);
  }
});

test("unapproved origin is rejected before any Spark production fetch", async () => {
  let fetchCalled = false;
  await assert.rejects(
    () =>
      runProductionSparkHostingBoundarySmoke({
        origin: "https://unreviewed.example",
        allowedOrigins: targets.allowedOrigins,
        fetchImpl: async () => {
          fetchCalled = true;
          throw new Error("must not be called");
        },
      }),
    /reviewed production smoke target allowlist/,
  );
  assert.equal(fetchCalled, false);
});
