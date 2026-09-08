import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  PRODUCTION_SMOKE_TARGET_CONFIG_PATH,
  PROTECTED_PRO_CLUB_PATHS,
  assertApprovedProductionOrigin,
  loadApprovedProductionSmokeTargets,
  validateSmokeEnvironment,
} from "./smokeProductionProClubBoundary.mjs";

export const SPARK_HOSTING_MODE = "SPARK_HOSTING_ONLY";
export const SPARK_HOSTING_BOUNDARY = "SPARK_HOSTING_SPA_FALLBACK";
export const SPARK_HOSTING_CONFIG_PATH = "firebase.spark.json";

const MAX_SPA_SHELL_BYTES = 64 * 1024;

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

export function assertSparkHostingOnlyConfig(rawConfig) {
  const config = asObject(rawConfig);
  if (!config || JSON.stringify(Object.keys(config).sort()) !== '["hosting"]') {
    throw new Error("firebase.spark.json must contain Hosting only.");
  }

  const hosting = asObject(config.hosting);
  if (!hosting || hosting.public !== "dist") {
    throw new Error("Spark Hosting must publish the reviewed dist directory.");
  }
  if (!Array.isArray(hosting.rewrites) || hosting.rewrites.length !== 1) {
    throw new Error("Spark Hosting must expose exactly one SPA catch-all rewrite.");
  }

  const rewrite = asObject(hosting.rewrites[0]);
  if (
    !rewrite ||
    rewrite.source !== "**" ||
    rewrite.destination !== "/index.html" ||
    JSON.stringify(Object.keys(rewrite).sort()) !== '["destination","source"]'
  ) {
    throw new Error(
      "Spark Hosting must route only the reviewed SPA catch-all and no server backend.",
    );
  }

  return { mode: SPARK_HOSTING_MODE };
}

export function loadSparkHostingOnlyConfig(
  configPath = path.resolve(process.cwd(), SPARK_HOSTING_CONFIG_PATH),
) {
  let rawConfig;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new Error("firebase.spark.json could not be read as JSON.");
  }
  return assertSparkHostingOnlyConfig(rawConfig);
}

export function validateSparkSmokeEnvironment(env, allowedOrigins) {
  return validateSmokeEnvironment(env, allowedOrigins);
}

function responseHeader(response, name) {
  const value = response.headers?.get?.(name);
  return typeof value === "string" ? value : "";
}

function hasRecognizableFutVerseSpaShell(body) {
  const moduleScript =
    /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']\/assets\/[^"']+\.js["'])[^>]*><\/script>/i;
  return (
    /^\s*<!doctype html>/i.test(body) &&
    /<title>\s*FutVerse\s*<\/title>/i.test(body) &&
    /<div\s+id=["']root["']\s*>\s*<\/div>/i.test(body) &&
    moduleScript.test(body)
  );
}

export async function assertExpectedSparkHostingFallback(
  response,
  requestPath,
  requestUrl,
) {
  const location = responseHeader(response, "location");
  if (
    response.redirected === true ||
    (response.status >= 300 && response.status < 400) ||
    location.length > 0
  ) {
    throw new Error(`${requestPath} attempted a redirect.`);
  }
  if (typeof response.url === "string" && response.url && response.url !== requestUrl) {
    throw new Error(`${requestPath} resolved to an unexpected response URL.`);
  }
  if (response.status !== 200) {
    throw new Error(
      `${requestPath} expected the reviewed Hosting fallback HTTP 200 but received ${response.status}.`,
    );
  }

  const contentType = responseHeader(response, "content-type").toLowerCase();
  if (!contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new Error(`${requestPath} did not return the reviewed HTML Hosting fallback.`);
  }

  let body;
  try {
    body = await response.text();
  } catch {
    throw new Error(`${requestPath} response body could not be read.`);
  }
  if (typeof body !== "string" || body.length === 0 || body.length > MAX_SPA_SHELL_BYTES) {
    throw new Error(`${requestPath} returned an invalid Hosting fallback body size.`);
  }

  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    throw new Error(`${requestPath} returned an unexpected JSON business response.`);
  }
  if (
    /["']ok["']\s*:|ERROR_APP_CHECK_REQUIRED|["'](?:clubId|auditId|changeId)["']\s*:/i.test(
      body,
    )
  ) {
    throw new Error(`${requestPath} contained evidence of a business handler response.`);
  }
  if (!hasRecognizableFutVerseSpaShell(body)) {
    throw new Error(`${requestPath} did not match the reviewed FutVerse SPA shell.`);
  }

  return {
    path: requestPath,
    status: response.status,
    boundary: SPARK_HOSTING_BOUNDARY,
  };
}

export async function runProductionSparkHostingBoundarySmoke({
  origin,
  allowedOrigins,
  fetchImpl = globalThis.fetch,
} = {}) {
  const canonicalOrigin = assertApprovedProductionOrigin(origin, allowedOrigins);
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const results = [];
  for (const requestPath of PROTECTED_PRO_CLUB_PATHS) {
    const requestUrl = `${canonicalOrigin}${requestPath}`;
    const response = await fetchImpl(requestUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    results.push(
      await assertExpectedSparkHostingFallback(response, requestPath, requestUrl),
    );
  }
  return results;
}

async function runCli() {
  try {
    loadSparkHostingOnlyConfig();
    const targets = loadApprovedProductionSmokeTargets(
      path.resolve(process.cwd(), PRODUCTION_SMOKE_TARGET_CONFIG_PATH),
    );
    const { origin } = validateSparkSmokeEnvironment(
      process.env,
      targets.allowedOrigins,
    );
    const results = await runProductionSparkHostingBoundarySmoke({
      origin,
      allowedOrigins: targets.allowedOrigins,
    });

    console.log("PRODUCTION_SPARK_HOSTING_BOUNDARY_SMOKE=PASS");
    console.log(`MODE=${SPARK_HOSTING_MODE}`);
    console.log(`PROJECT_ID=${targets.projectId}`);
    console.log(`ORIGIN=${origin}`);
    for (const result of results) {
      console.log(
        `PATH=${result.path} STATUS=${result.status} BOUNDARY=${result.boundary}`,
      );
    }
  } catch (error) {
    console.error("PRODUCTION_SPARK_HOSTING_BOUNDARY_SMOKE=BLOCKED");
    console.error(error instanceof Error ? error.message : "Spark boundary smoke failed.");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  await runCli();
}
