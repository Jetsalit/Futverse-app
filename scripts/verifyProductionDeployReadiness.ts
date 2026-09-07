import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const EXPECTED_PRODUCTION_PROJECT_ID = "futverse-d7872";
export const EXPECTED_FUNCTION_REGION = "asia-southeast1";

export const EXPECTED_PRO_CLUB_HOSTING_REWRITES = [
  {
    source: "/api/pro-club/provision-v1",
    functionId: "provisionProClubV1",
  },
  {
    source: "/api/pro-club/verify-audit-v1",
    functionId: "verifyProClubProvisioningAuditV1",
  },
] as const;

export type ProductionDeployReadinessErrorCode =
  | "APP_CHECK_SITE_KEY_MISSING"
  | "APP_CHECK_SITE_KEY_PLACEHOLDER"
  | "APP_CHECK_DEBUG_TOKEN_FORBIDDEN"
  | "PROJECT_ALIAS_MISMATCH"
  | "WEB_CONFIG_PROJECT_MISMATCH"
  | "FUNCTIONS_RUNTIME_MISMATCH"
  | "HOSTING_REWRITE_MISSING"
  | "HOSTING_REWRITE_TARGET_MISMATCH"
  | "HOSTING_REWRITE_ORDER_INVALID"
  | "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED"
  | "INVALID_REPOSITORY_CONFIG";

export class ProductionDeployReadinessError extends Error {
  constructor(
    public readonly code: ProductionDeployReadinessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProductionDeployReadinessError";
  }
}

export interface ProductionDeployReadinessInput {
  readonly env: Record<string, string | undefined>;
  readonly firebaseRc: unknown;
  readonly webFirebaseConfig: unknown;
  readonly firebaseJson: unknown;
  readonly functionsIndexSource: string;
}

export interface ProductionDeployReadinessResult {
  readonly ok: true;
  readonly checks: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function fail(
  code: ProductionDeployReadinessErrorCode,
  message: string,
): never {
  throw new ProductionDeployReadinessError(code, message);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    fail("INVALID_REPOSITORY_CONFIG", `${label} must be a JSON object.`);
  }
  return record;
}

function assertAppCheckEnvironment(env: Record<string, string | undefined>): void {
  const siteKey = env.VITE_RECAPTCHA_SITE_KEY?.trim();
  if (!siteKey) {
    fail(
      "APP_CHECK_SITE_KEY_MISSING",
      "VITE_RECAPTCHA_SITE_KEY must be configured for a production deployment.",
    );
  }

  const upper = siteKey.toUpperCase();
  const placeholderMarkers = [
    "MY_RECAPTCHA",
    "YOUR_RECAPTCHA",
    "CHANGE_ME",
    "PLACEHOLDER",
    "EXAMPLE_SITE_KEY",
  ];
  if (
    siteKey.startsWith("<") ||
    siteKey.endsWith(">") ||
    placeholderMarkers.some((marker) => upper.includes(marker))
  ) {
    fail(
      "APP_CHECK_SITE_KEY_PLACEHOLDER",
      "VITE_RECAPTCHA_SITE_KEY is still a placeholder and cannot be used for production deployment.",
    );
  }

  if (env.VITE_APP_CHECK_DEBUG_TOKEN?.trim()) {
    fail(
      "APP_CHECK_DEBUG_TOKEN_FORBIDDEN",
      "VITE_APP_CHECK_DEBUG_TOKEN must be absent from the production deployment environment.",
    );
  }
}

function assertProjectIdentity(firebaseRc: unknown, webFirebaseConfig: unknown): void {
  const rc = requireRecord(firebaseRc, ".firebaserc");
  const projects = requireRecord(rc.projects, ".firebaserc.projects");
  if (projects.default !== EXPECTED_PRODUCTION_PROJECT_ID) {
    fail(
      "PROJECT_ALIAS_MISMATCH",
      `Firebase default project must be ${EXPECTED_PRODUCTION_PROJECT_ID}.`,
    );
  }

  const webConfig = requireRecord(webFirebaseConfig, "firebase-applet-config.json");
  if (webConfig.projectId !== EXPECTED_PRODUCTION_PROJECT_ID) {
    fail(
      "WEB_CONFIG_PROJECT_MISMATCH",
      `Firebase web config projectId must be ${EXPECTED_PRODUCTION_PROJECT_ID}.`,
    );
  }
}

function assertFunctionsRuntime(firebaseJson: unknown): void {
  const config = requireRecord(firebaseJson, "firebase.json");
  if (!Array.isArray(config.functions)) {
    fail("INVALID_REPOSITORY_CONFIG", "firebase.json.functions must be an array.");
  }

  const defaultCodebase = config.functions
    .map(asRecord)
    .find((entry) => entry?.codebase === "default" && entry?.source === "functions");

  if (!defaultCodebase || defaultCodebase.runtime !== "nodejs22") {
    fail(
      "FUNCTIONS_RUNTIME_MISMATCH",
      "Firebase default Functions codebase must use source=functions and runtime=nodejs22.",
    );
  }
}

function assertHostingRewrites(firebaseJson: unknown): void {
  const config = requireRecord(firebaseJson, "firebase.json");
  const hosting = requireRecord(config.hosting, "firebase.json.hosting");
  if (!Array.isArray(hosting.rewrites)) {
    fail("INVALID_REPOSITORY_CONFIG", "firebase.json hosting rewrites must be an array.");
  }

  const rewrites = hosting.rewrites.map(asRecord);
  const spaIndex = rewrites.findIndex((rewrite) => rewrite?.source === "**");
  if (spaIndex < 0) {
    fail(
      "HOSTING_REWRITE_ORDER_INVALID",
      "Firebase Hosting SPA catch-all rewrite is missing.",
    );
  }

  for (const expected of EXPECTED_PRO_CLUB_HOSTING_REWRITES) {
    const index = rewrites.findIndex((rewrite) => rewrite?.source === expected.source);
    if (index < 0) {
      fail(
        "HOSTING_REWRITE_MISSING",
        `Required Hosting rewrite is missing: ${expected.source}.`,
      );
    }
    if (index >= spaIndex) {
      fail(
        "HOSTING_REWRITE_ORDER_INVALID",
        `Hosting rewrite ${expected.source} must precede the SPA catch-all.`,
      );
    }

    const functionTarget = requireRecord(
      rewrites[index]?.function,
      `Hosting rewrite function target for ${expected.source}`,
    );
    if (
      functionTarget.functionId !== expected.functionId ||
      functionTarget.region !== EXPECTED_FUNCTION_REGION
    ) {
      fail(
        "HOSTING_REWRITE_TARGET_MISMATCH",
        `Hosting rewrite ${expected.source} points to an unexpected function or region.`,
      );
    }
  }
}

function assertStaffCandidateAppCheckEnforced(functionsIndexSource: string): void {
  const marker = "export const resolveProClubStaffCandidateV1 = onCall(";
  const start = functionsIndexSource.indexOf(marker);
  if (start < 0) {
    fail(
      "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED",
      "resolveProClubStaffCandidateV1 export was not found.",
    );
  }

  const handlerStart = functionsIndexSource.indexOf("async (request)", start);
  const optionsBlock = functionsIndexSource.slice(
    start,
    handlerStart >= 0 ? handlerStart : start + 800,
  );

  if (!/enforceAppCheck\s*:\s*true/.test(optionsBlock)) {
    fail(
      "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED",
      "resolveProClubStaffCandidateV1 must keep enforceAppCheck: true.",
    );
  }
}

export function validateProductionDeployReadiness(
  input: ProductionDeployReadinessInput,
): ProductionDeployReadinessResult {
  assertAppCheckEnvironment(input.env);
  assertProjectIdentity(input.firebaseRc, input.webFirebaseConfig);
  assertFunctionsRuntime(input.firebaseJson);
  assertHostingRewrites(input.firebaseJson);
  assertStaffCandidateAppCheckEnforced(input.functionsIndexSource);

  return {
    ok: true,
    checks: [
      "app-check-site-key-present",
      "app-check-debug-token-absent",
      "firebase-project-identity",
      "functions-runtime-nodejs22",
      "pro-club-hosting-rewrites",
      "staff-candidate-app-check-enforced",
    ],
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function runCli(): void {
  const repoRoot = resolve(process.cwd());

  try {
    const result = validateProductionDeployReadiness({
      env: process.env,
      firebaseRc: readJson(resolve(repoRoot, ".firebaserc")),
      webFirebaseConfig: readJson(resolve(repoRoot, "firebase-applet-config.json")),
      firebaseJson: readJson(resolve(repoRoot, "firebase.json")),
      functionsIndexSource: readFileSync(
        resolve(repoRoot, "functions/src/index.ts"),
        "utf8",
      ),
    });

    console.log("PRODUCTION_DEPLOY_READINESS=PASS");
    for (const check of result.checks) {
      console.log(`CHECK=${check}`);
    }
  } catch (error) {
    const readinessError =
      error instanceof ProductionDeployReadinessError ? error : null;
    console.error("PRODUCTION_DEPLOY_READINESS=BLOCKED");
    console.error(
      `CODE=${readinessError?.code ?? "INVALID_REPOSITORY_CONFIG"}`,
    );
    console.error(
      readinessError?.message ?? "Production readiness validation failed.",
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("verifyProductionDeployReadiness.ts")) {
  runCli();
}
