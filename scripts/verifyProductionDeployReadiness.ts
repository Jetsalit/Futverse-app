import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

export const EXPECTED_PRODUCTION_PROJECT_ID = "futverse-d7872";
export const EXPECTED_FUNCTION_REGION = "asia-southeast1";
export const CANONICAL_APP_CHECK_GUARD_COMMAND =
  "node scripts/verifyProductionAppCheck.mjs";
export const CANONICAL_APP_CHECK_CONTRACT_COMMAND =
  "node --import tsx --test tests/proClubControlPlaneAppCheckHardening.contract.test.ts";
export const EXPECTED_READINESS_COMMAND =
  `${CANONICAL_APP_CHECK_GUARD_COMMAND} && ${CANONICAL_APP_CHECK_CONTRACT_COMMAND} && node --import tsx scripts/verifyProductionDeployReadiness.ts`;

export const EXPECTED_PRO_CLUB_HOSTING_REWRITES = [
  {
    source: "/api/pro-club/provision-v1",
    functionId: "provisionProClubV1",
  },
  {
    source: "/api/pro-club/verify-audit-v1",
    functionId: "verifyProClubProvisioningAuditV1",
  },
  {
    source: "/api/pro-club/rename-v1",
    functionId: "renameProClubV1",
  },
] as const;

const EXPECTED_FUNCTION_EXPORTS = [
  { exportName: "provisionProClubV1", callName: "onRequest", requireCorsFalse: true },
  { exportName: "verifyProClubProvisioningAuditV1", callName: "onRequest", requireCorsFalse: true },
  { exportName: "renameProClubV1", callName: "onRequest", requireCorsFalse: true },
  { exportName: "resolveProClubStaffCandidateV1", callName: "onCall", requireCorsFalse: false },
] as const;

const EXPECTED_HOSTING_PREDEPLOY = [
  CANONICAL_APP_CHECK_GUARD_COMMAND,
  "npm run build",
] as const;
const EXPECTED_FUNCTIONS_PREDEPLOY = [
  CANONICAL_APP_CHECK_GUARD_COMMAND,
  'npm --prefix "$RESOURCE_DIR" run build',
] as const;

export type ProductionDeployReadinessErrorCode =
  | "PROJECT_ALIAS_MISMATCH"
  | "WEB_CONFIG_PROJECT_MISMATCH"
  | "FUNCTIONS_RUNTIME_MISMATCH"
  | "APP_CHECK_PREDEPLOY_MISMATCH"
  | "HOSTING_REWRITE_MISSING"
  | "HOSTING_REWRITE_TARGET_MISMATCH"
  | "HOSTING_REWRITE_ORDER_INVALID"
  | "FUNCTION_EXPORT_REGION_MISMATCH"
  | "FUNCTION_OPTIONS_SPREAD_FORBIDDEN"
  | "PRIVILEGED_HTTP_CORS_MISMATCH"
  | "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED"
  | "READINESS_SCRIPT_CHAIN_MISMATCH"
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
  readonly firebaseRc: unknown;
  readonly webFirebaseConfig: unknown;
  readonly firebaseJson: unknown;
  readonly functionsIndexSource: string;
  readonly packageJson: unknown;
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

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    fail("INVALID_REPOSITORY_CONFIG", `${label} must be an array of strings.`);
  }
  return value as string[];
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

function getDefaultFunctionsCodebase(firebaseJson: unknown): Record<string, unknown> {
  const config = requireRecord(firebaseJson, "firebase.json");
  if (!Array.isArray(config.functions)) {
    fail("INVALID_REPOSITORY_CONFIG", "firebase.json.functions must be an array.");
  }

  const codebase = config.functions
    .map(asRecord)
    .find((entry) => entry?.codebase === "default" && entry?.source === "functions");
  if (!codebase) {
    fail(
      "FUNCTIONS_RUNTIME_MISMATCH",
      "Firebase default Functions codebase source=functions is required.",
    );
  }
  return codebase;
}

function assertFunctionsRuntime(firebaseJson: unknown): void {
  const codebase = getDefaultFunctionsCodebase(firebaseJson);
  if (codebase.runtime !== "nodejs22") {
    fail(
      "FUNCTIONS_RUNTIME_MISMATCH",
      "Firebase default Functions codebase must use runtime=nodejs22.",
    );
  }
}

function assertExactCommandArray(
  actual: string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((command, index) => command !== expected[index])
  ) {
    fail(
      "APP_CHECK_PREDEPLOY_MISMATCH",
      `${label} must preserve the exact canonical App Check guard-before-build sequence.`,
    );
  }
}

function assertCanonicalAppCheckPredeployWiring(firebaseJson: unknown): void {
  const config = requireRecord(firebaseJson, "firebase.json");
  const hosting = requireRecord(config.hosting, "firebase.json.hosting");
  assertExactCommandArray(
    requireStringArray(hosting.predeploy, "firebase.json.hosting.predeploy"),
    EXPECTED_HOSTING_PREDEPLOY,
    "Firebase Hosting predeploy",
  );

  const codebase = getDefaultFunctionsCodebase(firebaseJson);
  assertExactCommandArray(
    requireStringArray(codebase.predeploy, "firebase.json.functions[].predeploy"),
    EXPECTED_FUNCTIONS_PREDEPLOY,
    "Firebase Functions predeploy",
  );
}

function assertHostingRewrites(firebaseJson: unknown): void {
  const config = requireRecord(firebaseJson, "firebase.json");
  const hosting = requireRecord(config.hosting, "firebase.json.hosting");
  if (!Array.isArray(hosting.rewrites)) {
    fail("INVALID_REPOSITORY_CONFIG", "firebase.json.hosting.rewrites must be an array.");
  }

  const rewrites = hosting.rewrites.map(asRecord);
  const spaIndex = rewrites.findIndex((rewrite) => rewrite?.source === "**");
  if (spaIndex < 0) {
    fail(
      "HOSTING_REWRITE_ORDER_INVALID",
      "Firebase Hosting SPA catch-all rewrite is missing.",
    );
  }

  for (const [expectedIndex, expected] of EXPECTED_PRO_CLUB_HOSTING_REWRITES.entries()) {
    const rewrite = rewrites[expectedIndex];
    if (!rewrite || rewrite.source !== expected.source) {
      const existsElsewhere = rewrites.some(
        (candidate) => candidate?.source === expected.source,
      );
      fail(
        existsElsewhere ? "HOSTING_REWRITE_ORDER_INVALID" : "HOSTING_REWRITE_MISSING",
        `Protected Hosting rewrite ${expected.source} must remain at position ${expectedIndex + 1}.`,
      );
    }
    if (expectedIndex >= spaIndex) {
      fail(
        "HOSTING_REWRITE_ORDER_INVALID",
        `Hosting rewrite ${expected.source} must precede the SPA catch-all.`,
      );
    }

    const functionTarget = requireRecord(
      rewrite.function,
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

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function findFunctionOptionsObject(
  functionsIndexSource: string,
  exportName: string,
  callName: string,
): ts.ObjectLiteralExpression {
  const sourceFile = ts.createSourceFile(
    "functions/src/index.ts",
    functionsIndexSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName) continue;
      if (!declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      const call = declaration.initializer;
      if (!ts.isIdentifier(call.expression) || call.expression.text !== callName) continue;
      const firstArgument = call.arguments[0];
      if (firstArgument && ts.isObjectLiteralExpression(firstArgument)) {
        return firstArgument;
      }
    }
  }

  fail(
    "INVALID_REPOSITORY_CONFIG",
    `${exportName} must remain a direct ${callName} call with an object-literal options argument.`,
  );
}

function getObjectPropertyInitializer(
  options: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.Expression | null {
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    if (propertyNameText(property.name) === propertyName) {
      return property.initializer;
    }
  }
  return null;
}

function assertFunctionExportSecurity(functionsIndexSource: string): void {
  for (const expected of EXPECTED_FUNCTION_EXPORTS) {
    const options = findFunctionOptionsObject(
      functionsIndexSource,
      expected.exportName,
      expected.callName,
    );

    if (options.properties.some((property) => ts.isSpreadAssignment(property))) {
      fail(
        "FUNCTION_OPTIONS_SPREAD_FORBIDDEN",
        `${expected.exportName} protected deployment options must remain explicit.`,
      );
    }

    const region = getObjectPropertyInitializer(options, "region");
    if (!region || !ts.isStringLiteral(region) || region.text !== EXPECTED_FUNCTION_REGION) {
      fail(
        "FUNCTION_EXPORT_REGION_MISMATCH",
        `${expected.exportName} must be deployed in ${EXPECTED_FUNCTION_REGION}.`,
      );
    }

    if (expected.requireCorsFalse) {
      const cors = getObjectPropertyInitializer(options, "cors");
      if (!cors || cors.kind !== ts.SyntaxKind.FalseKeyword) {
        fail(
          "PRIVILEGED_HTTP_CORS_MISMATCH",
          `${expected.exportName} must preserve cors: false for the same-origin control plane.`,
        );
      }
    }

    if (expected.exportName === "resolveProClubStaffCandidateV1") {
      const enforceAppCheck = getObjectPropertyInitializer(options, "enforceAppCheck");
      if (!enforceAppCheck || enforceAppCheck.kind !== ts.SyntaxKind.TrueKeyword) {
        fail(
          "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED",
          "resolveProClubStaffCandidateV1 must keep enforceAppCheck: true.",
        );
      }
    }
  }
}

function assertReadinessScriptChain(packageJson: unknown): void {
  const packageRecord = requireRecord(packageJson, "package.json");
  const scripts = requireRecord(packageRecord.scripts, "package.json.scripts");
  if (scripts["verify:production-deploy-readiness"] !== EXPECTED_READINESS_COMMAND) {
    fail(
      "READINESS_SCRIPT_CHAIN_MISMATCH",
      "verify:production-deploy-readiness must run the canonical App Check environment guard and source-boundary contract before the structural readiness gate.",
    );
  }
}

export function validateProductionDeployReadiness(
  input: ProductionDeployReadinessInput,
): ProductionDeployReadinessResult {
  assertProjectIdentity(input.firebaseRc, input.webFirebaseConfig);
  assertFunctionsRuntime(input.firebaseJson);
  assertCanonicalAppCheckPredeployWiring(input.firebaseJson);
  assertHostingRewrites(input.firebaseJson);
  assertFunctionExportSecurity(input.functionsIndexSource);
  assertReadinessScriptChain(input.packageJson);

  return {
    ok: true,
    checks: [
      "firebase-project-identity",
      "functions-runtime-nodejs22",
      "canonical-app-check-predeploy-exact",
      "pro-club-hosting-rewrites-leading",
      "function-export-regions",
      "function-options-explicit",
      "privileged-http-cors-false",
      "staff-candidate-app-check-enforced",
      "readiness-script-chains-app-check-environment-and-source-contracts",
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
      firebaseRc: readJson(resolve(repoRoot, ".firebaserc")),
      webFirebaseConfig: readJson(resolve(repoRoot, "firebase-applet-config.json")),
      firebaseJson: readJson(resolve(repoRoot, "firebase.json")),
      functionsIndexSource: readFileSync(
        resolve(repoRoot, "functions/src/index.ts"),
        "utf8",
      ),
      packageJson: readJson(resolve(repoRoot, "package.json")),
    });

    console.log("PRODUCTION_DEPLOY_READINESS=PASS");
    for (const check of result.checks) {
      console.log(`CHECK=${check}`);
    }
  } catch (error) {
    const readinessError =
      error instanceof ProductionDeployReadinessError ? error : null;
    console.error("PRODUCTION_DEPLOY_READINESS=BLOCKED");
    console.error(`CODE=${readinessError?.code ?? "INVALID_REPOSITORY_CONFIG"}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("verifyProductionDeployReadiness.ts")) {
  runCli();
}
