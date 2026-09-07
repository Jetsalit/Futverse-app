import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const PRODUCTION_SMOKE_ACK = "READ_ONLY_NO_CREDENTIALS";
export const PROTECTED_PRO_CLUB_PATHS = [
  "/api/pro-club/provision-v1",
  "/api/pro-club/verify-audit-v1",
];
export const EXPECTED_APP_CHECK_ERROR_CODE = "ERROR_APP_CHECK_REQUIRED";

const FORBIDDEN_CREDENTIAL_ENV_VARS = [
  "FUTVERSE_PRODUCTION_ID_TOKEN",
  "FUTVERSE_PRODUCTION_APP_CHECK_TOKEN",
];

function hasNonEmptyValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateProductionOrigin(rawOrigin) {
  if (!hasNonEmptyValue(rawOrigin)) {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN is required.");
  }
  if (rawOrigin !== rawOrigin.trim()) {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN must not contain surrounding whitespace.");
  }

  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN must be a valid absolute URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN must not contain URL credentials.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN must be an origin only, with no path/query/hash.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN must not use a non-standard HTTPS port.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    throw new Error("FUTVERSE_PRODUCTION_ORIGIN must not target a local host.");
  }

  return parsed.origin;
}

export function validateSmokeEnvironment(env = process.env) {
  if (env.FUTVERSE_PRODUCTION_SMOKE_ACK !== PRODUCTION_SMOKE_ACK) {
    throw new Error(
      `FUTVERSE_PRODUCTION_SMOKE_ACK must equal ${PRODUCTION_SMOKE_ACK}.`,
    );
  }

  for (const name of FORBIDDEN_CREDENTIAL_ENV_VARS) {
    if (hasNonEmptyValue(env[name])) {
      throw new Error(`${name} must be unset for the credential-free boundary smoke test.`);
    }
  }

  return {
    origin: validateProductionOrigin(env.FUTVERSE_PRODUCTION_ORIGIN),
  };
}

export async function assertExpectedAppCheckRejection(response, requestPath) {
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${requestPath} returned a non-JSON response.`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`${requestPath} returned invalid JSON.`);
  }

  if (response.status !== 401) {
    throw new Error(`${requestPath} expected HTTP 401 but received ${response.status}.`);
  }
  if (!body || typeof body !== "object" || body.ok !== false) {
    throw new Error(`${requestPath} returned an unexpected response shape.`);
  }

  const error = body.error;
  if (!error || typeof error !== "object" || error.code !== EXPECTED_APP_CHECK_ERROR_CODE) {
    throw new Error(`${requestPath} did not fail closed at the App Check boundary.`);
  }

  if (error.message !== "Application verification is required.") {
    throw new Error(`${requestPath} returned an unexpected App Check public message.`);
  }

  return {
    path: requestPath,
    status: response.status,
    errorCode: error.code,
  };
}

export async function runProductionProClubBoundarySmoke({
  origin,
  fetchImpl = globalThis.fetch,
} = {}) {
  const canonicalOrigin = validateProductionOrigin(origin);
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const results = [];
  for (const requestPath of PROTECTED_PRO_CLUB_PATHS) {
    const response = await fetchImpl(`${canonicalOrigin}${requestPath}`, {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
    results.push(await assertExpectedAppCheckRejection(response, requestPath));
  }
  return results;
}

async function runCli() {
  try {
    const { origin } = validateSmokeEnvironment(process.env);
    const results = await runProductionProClubBoundarySmoke({ origin });
    console.log("PRODUCTION_PRO_CLUB_BOUNDARY_SMOKE=PASS");
    for (const result of results) {
      console.log(
        `PATH=${result.path} STATUS=${result.status} ERROR_CODE=${result.errorCode}`,
      );
    }
  } catch (error) {
    console.error("PRODUCTION_PRO_CLUB_BOUNDARY_SMOKE=BLOCKED");
    console.error(error instanceof Error ? error.message : "Boundary smoke test failed.");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  await runCli();
}
