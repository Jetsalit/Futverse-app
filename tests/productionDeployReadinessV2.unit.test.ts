import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CANONICAL_APP_CHECK_GUARD_COMMAND,
  EXPECTED_READINESS_COMMAND,
  ProductionDeployReadinessError,
  validateProductionDeployReadiness,
} from "../scripts/verifyProductionDeployReadiness.ts";

const firebaseRc = JSON.parse(readFileSync(".firebaserc", "utf8")) as unknown;
const webFirebaseConfig = JSON.parse(
  readFileSync("firebase-applet-config.json", "utf8"),
) as unknown;
const firebaseJson = JSON.parse(readFileSync("firebase.json", "utf8")) as unknown;
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as unknown;
const functionsIndexSource = readFileSync("functions/src/index.ts", "utf8");
const readinessSource = readFileSync(
  "scripts/verifyProductionDeployReadiness.ts",
  "utf8",
);

function validInput() {
  return {
    firebaseRc: structuredClone(firebaseRc),
    webFirebaseConfig: structuredClone(webFirebaseConfig),
    firebaseJson: structuredClone(firebaseJson),
    functionsIndexSource,
    packageJson: structuredClone(packageJson),
  };
}

function expectBlocked(
  mutate: (input: ReturnType<typeof validInput>) => void,
  code: string,
): void {
  const input = validInput();
  mutate(input);
  assert.throws(
    () => validateProductionDeployReadiness(input),
    (error: unknown) =>
      error instanceof ProductionDeployReadinessError && error.code === code,
  );
}

test("production readiness V2 passes on the post-PR72 production source baseline", () => {
  const result = validateProductionDeployReadiness(validInput());
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks, [
    "firebase-project-identity",
    "functions-runtime-nodejs22",
    "canonical-app-check-predeploy-first",
    "pro-club-hosting-rewrites-leading",
    "function-export-regions",
    "function-options-explicit",
    "privileged-http-cors-false",
    "staff-candidate-app-check-enforced",
    "readiness-script-chains-canonical-app-check",
  ]);
});

test("V2 delegates App Check environment validation to the canonical PR72 guard", () => {
  assert.equal(readinessSource.includes("VITE_RECAPTCHA_SITE_KEY"), false);
  assert.equal(readinessSource.includes("VITE_APP_CHECK_DEBUG_TOKEN"), false);
  assert.equal(readinessSource.includes("loadEnv"), false);
  assert.match(EXPECTED_READINESS_COMMAND, /^node scripts\/verifyProductionAppCheck\.mjs && /);
});

test("production readiness rejects Firebase project alias drift", () => {
  expectBlocked((input) => {
    (input.firebaseRc as { projects: { default: string } }).projects.default = "wrong-project";
  }, "PROJECT_ALIAS_MISMATCH");
});

test("production readiness rejects web Firebase project drift", () => {
  expectBlocked((input) => {
    (input.webFirebaseConfig as { projectId: string }).projectId = "wrong-project";
  }, "WEB_CONFIG_PROJECT_MISMATCH");
});

test("production readiness rejects Functions runtime drift", () => {
  expectBlocked((input) => {
    const config = input.firebaseJson as { functions: Array<{ runtime: string }> };
    config.functions[0].runtime = "nodejs20";
  }, "FUNCTIONS_RUNTIME_MISMATCH");
});

test("production readiness requires the canonical App Check guard first in Hosting predeploy", () => {
  expectBlocked((input) => {
    const config = input.firebaseJson as { hosting: { predeploy: string[] } };
    config.hosting.predeploy = ["npm run build", CANONICAL_APP_CHECK_GUARD_COMMAND];
  }, "APP_CHECK_PREDEPLOY_ORDER_INVALID");
});

test("production readiness requires the canonical App Check guard in Functions predeploy", () => {
  expectBlocked((input) => {
    const config = input.firebaseJson as { functions: Array<{ predeploy: string[] }> };
    config.functions[0].predeploy = ['npm --prefix "$RESOURCE_DIR" run build'];
  }, "APP_CHECK_PREDEPLOY_MISSING");
});

test("production readiness rejects protected rewrite shadowing or reordering", () => {
  expectBlocked((input) => {
    const config = input.firebaseJson as { hosting: { rewrites: unknown[] } };
    config.hosting.rewrites.unshift({ source: "/api/**", destination: "/index.html" });
  }, "HOSTING_REWRITE_ORDER_INVALID");
});

test("production readiness rejects protected rewrite target drift", () => {
  expectBlocked((input) => {
    const config = input.firebaseJson as {
      hosting: { rewrites: Array<{ function?: { region?: string } }> };
    };
    config.hosting.rewrites[0].function!.region = "us-central1";
  }, "HOSTING_REWRITE_TARGET_MISMATCH");
});

test("production readiness binds staff candidate App Check enforcement to the onCall options object", () => {
  expectBlocked((input) => {
    input.functionsIndexSource = input.functionsIndexSource.replace(
      "enforceAppCheck: true,",
      "enforceAppCheck: false, // enforceAppCheck: true",
    );
  }, "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED");
});

test("production readiness rejects protected function region drift", () => {
  expectBlocked((input) => {
    input.functionsIndexSource = input.functionsIndexSource.replace(
      'export const provisionProClubV1 = onRequest(\n  {\n    region: "asia-southeast1",',
      'export const provisionProClubV1 = onRequest(\n  {\n    region: "us-central1",',
    );
  }, "FUNCTION_EXPORT_REGION_MISMATCH");
});

test("production readiness rejects spreads in protected function options", () => {
  expectBlocked((input) => {
    input.functionsIndexSource = input.functionsIndexSource.replace(
      'export const resolveProClubStaffCandidateV1 = onCall(\n  {\n    region: "asia-southeast1",',
      'export const resolveProClubStaffCandidateV1 = onCall(\n  {\n    region: "asia-southeast1",\n    ...sharedOptions,',
    );
  }, "FUNCTION_OPTIONS_SPREAD_FORBIDDEN");
});

test("production readiness preserves same-origin cors:false on privileged HTTP endpoints", () => {
  expectBlocked((input) => {
    input.functionsIndexSource = input.functionsIndexSource.replace(
      "cors: false,",
      "cors: true,",
    );
  }, "PRIVILEGED_HTTP_CORS_MISMATCH");
});

test("production readiness command cannot bypass the canonical App Check guard", () => {
  expectBlocked((input) => {
    const pkg = input.packageJson as { scripts: Record<string, string> };
    pkg.scripts["verify:production-deploy-readiness"] =
      "node --import tsx scripts/verifyProductionDeployReadiness.ts";
  }, "READINESS_SCRIPT_CHAIN_MISMATCH");
});
