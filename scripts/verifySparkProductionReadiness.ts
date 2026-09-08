#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SPARK_EXPECTED_PROJECT_ID = "futverse-d7872";
export const SPARK_CONFIG_PATH = "firebase.spark.json";
export const SPARK_READINESS_COMMAND =
  "node scripts/verifyProductionAppCheck.mjs && node --import tsx --test tests/sparkProductionReadiness.unit.test.ts && node --import tsx scripts/verifySparkProductionReadiness.ts";

const EXPECTED_PREDEPLOY = [
  "node scripts/verifyProductionAppCheck.mjs",
  "npm run build",
] as const;

const EXPECTED_PROTECTED_REWRITES = [
  ["/api/pro-club/provision-v1", "provisionProClubV1"],
  ["/api/pro-club/verify-audit-v1", "verifyProClubProvisioningAuditV1"],
  ["/api/pro-club/rename-v1", "renameProClubV1"],
] as const;

export interface SparkReadinessSources {
  firebasercText: string;
  sparkConfigText: string;
  productionConfigText: string;
  packageJsonText: string;
}

export interface SparkReadinessResult {
  projectId: string;
  checks: readonly string[];
}

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`SPARK_PRODUCTION_READINESS_BLOCKED: ${message}`);
}

function parseObject(label: string, text: string): JsonObject {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(`${label} is not valid JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must contain a JSON object`);
  }
  return value as JsonObject;
}

function objectField(parent: JsonObject, key: string, label: string): JsonObject {
  const value = parent[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label}.${key} must be an object`);
  }
  return value as JsonObject;
}

function arrayField(parent: JsonObject, key: string, label: string): unknown[] {
  const value = parent[key];
  if (!Array.isArray(value)) {
    fail(`${label}.${key} must be an array`);
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function verifySparkProductionReadinessFromSources(
  sources: SparkReadinessSources,
): SparkReadinessResult {
  const checks: string[] = [];

  const firebaserc = parseObject(".firebaserc", sources.firebasercText);
  const projects = objectField(firebaserc, "projects", ".firebaserc");
  if (projects.default !== SPARK_EXPECTED_PROJECT_ID) {
    fail(`Firebase default project must be exactly '${SPARK_EXPECTED_PROJECT_ID}'`);
  }
  checks.push("firebase-project-pinned");

  const sparkConfig = parseObject(SPARK_CONFIG_PATH, sources.sparkConfigText);
  const sparkRootKeys = Object.keys(sparkConfig).sort();
  if (!sameJson(sparkRootKeys, ["hosting"])) {
    fail("Spark config must contain Hosting only; Functions, Firestore and other deploy resources are forbidden");
  }

  const sparkHosting = objectField(sparkConfig, "hosting", SPARK_CONFIG_PATH);
  if (sparkHosting.public !== "dist") {
    fail("Spark Hosting public directory must be exactly 'dist'");
  }

  const predeploy = arrayField(sparkHosting, "predeploy", `${SPARK_CONFIG_PATH}.hosting`);
  if (!sameJson(predeploy, EXPECTED_PREDEPLOY)) {
    fail("Spark Hosting predeploy must run the canonical App Check guard before the production build");
  }
  checks.push("canonical-app-check-before-build");

  const sparkRewrites = arrayField(sparkHosting, "rewrites", `${SPARK_CONFIG_PATH}.hosting`);
  if (sparkRewrites.length !== 1) {
    fail("Spark Hosting must expose only the SPA catch-all rewrite");
  }
  const catchAll = sparkRewrites[0];
  if (!catchAll || typeof catchAll !== "object" || Array.isArray(catchAll)) {
    fail("Spark Hosting catch-all rewrite is invalid");
  }
  const catchAllObject = catchAll as JsonObject;
  if (
    catchAllObject.source !== "**" ||
    catchAllObject.destination !== "/index.html" ||
    Object.prototype.hasOwnProperty.call(catchAllObject, "function") ||
    Object.prototype.hasOwnProperty.call(catchAllObject, "run")
  ) {
    fail("Spark Hosting must not route any request to Cloud Functions or Cloud Run");
  }
  checks.push("hosting-only-no-server-rewrites");

  const productionConfig = parseObject("firebase.json", sources.productionConfigText);
  const productionFunctions = arrayField(productionConfig, "functions", "firebase.json");
  if (productionFunctions.length === 0) {
    fail("The reviewed future server control-plane config in firebase.json must be preserved");
  }
  const firstFunctionsConfig = productionFunctions[0];
  if (
    !firstFunctionsConfig ||
    typeof firstFunctionsConfig !== "object" ||
    Array.isArray(firstFunctionsConfig) ||
    (firstFunctionsConfig as JsonObject).runtime !== "nodejs22"
  ) {
    fail("The preserved Functions runtime in firebase.json must remain nodejs22");
  }

  const productionHosting = objectField(productionConfig, "hosting", "firebase.json");
  const productionRewrites = arrayField(productionHosting, "rewrites", "firebase.json.hosting");
  for (let index = 0; index < EXPECTED_PROTECTED_REWRITES.length; index += 1) {
    const [expectedSource, expectedFunctionId] = EXPECTED_PROTECTED_REWRITES[index];
    const rewrite = productionRewrites[index];
    if (!rewrite || typeof rewrite !== "object" || Array.isArray(rewrite)) {
      fail(`Preserved protected rewrite ${expectedSource} is missing from firebase.json`);
    }
    const rewriteObject = rewrite as JsonObject;
    const functionObject = rewriteObject.function;
    if (!functionObject || typeof functionObject !== "object" || Array.isArray(functionObject)) {
      fail(`Preserved protected rewrite ${expectedSource} lost its Function target`);
    }
    const target = functionObject as JsonObject;
    if (
      rewriteObject.source !== expectedSource ||
      target.functionId !== expectedFunctionId ||
      target.region !== "asia-southeast1"
    ) {
      fail(`Preserved protected rewrite ${expectedSource} drifted`);
    }
  }
  checks.push("future-server-control-plane-preserved");

  const packageJson = parseObject("package.json", sources.packageJsonText);
  const scripts = objectField(packageJson, "scripts", "package.json");
  if (scripts["verify:spark-production-readiness"] !== SPARK_READINESS_COMMAND) {
    fail("package.json must expose the exact reviewed Spark readiness command chain");
  }
  checks.push("operator-readiness-command-pinned");

  return {
    projectId: SPARK_EXPECTED_PROJECT_ID,
    checks,
  };
}

export function verifySparkProductionReadinessFromDisk(
  cwd = process.cwd(),
): SparkReadinessResult {
  return verifySparkProductionReadinessFromSources({
    firebasercText: readFileSync(resolve(cwd, ".firebaserc"), "utf8"),
    sparkConfigText: readFileSync(resolve(cwd, SPARK_CONFIG_PATH), "utf8"),
    productionConfigText: readFileSync(resolve(cwd, "firebase.json"), "utf8"),
    packageJsonText: readFileSync(resolve(cwd, "package.json"), "utf8"),
  });
}

async function main(): Promise<void> {
  try {
    const result = verifySparkProductionReadinessFromDisk();
    console.log("SPARK_PRODUCTION_READINESS=PASS");
    console.log(`PROJECT=${result.projectId}`);
    for (const check of result.checks) {
      console.log(`CHECK=${check}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await main();
}
