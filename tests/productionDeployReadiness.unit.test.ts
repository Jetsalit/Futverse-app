import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ProductionDeployReadinessError,
  resolveViteProductionEnvironment,
  validateProductionDeployReadiness,
} from "../scripts/verifyProductionDeployReadiness.ts";

const firebaseRc = JSON.parse(readFileSync(".firebaserc", "utf8")) as unknown;
const webFirebaseConfig = JSON.parse(
  readFileSync("firebase-applet-config.json", "utf8"),
) as unknown;
const firebaseJson = JSON.parse(readFileSync("firebase.json", "utf8")) as unknown;
const functionsIndexSource = readFileSync("functions/src/index.ts", "utf8");
const SYNTHETIC_VALID_SITE_KEY = "AbCdEfGhIjKlMnOpQrStUvWxYz_1234567890abcd";

function validInput() {
  const env: Record<string, string | undefined> = {
    VITE_RECAPTCHA_SITE_KEY: SYNTHETIC_VALID_SITE_KEY,
  };

  return {
    env,
    firebaseRc,
    webFirebaseConfig,
    firebaseJson,
    functionsIndexSource,
  };
}

function expectBlocked(
  mutate: (input: ReturnType<typeof validInput>) => void,
  expectedCode: ProductionDeployReadinessError["code"],
) {
  const input = validInput();
  mutate(input);
  assert.throws(
    () => validateProductionDeployReadiness(input),
    (error: unknown) =>
      error instanceof ProductionDeployReadinessError &&
      error.code === expectedCode,
  );
}

test("production readiness passes with complete synthetic environment and repository config", () => {
  const result = validateProductionDeployReadiness(validInput());
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks, [
    "app-check-site-key-present",
    "app-check-debug-token-absent",
    "firebase-project-identity",
    "functions-runtime-nodejs22",
    "pro-club-hosting-rewrites",
    "function-export-regions",
    "staff-candidate-app-check-enforced",
  ]);
});

test("production readiness resolves debug token from Vite production env files", () => {
  const dir = mkdtempSync(join(tmpdir(), "futverse-readiness-"));
  try {
    writeFileSync(
      join(dir, ".env.production"),
      `VITE_RECAPTCHA_SITE_KEY=${SYNTHETIC_VALID_SITE_KEY}\nVITE_APP_CHECK_DEBUG_TOKEN=must-be-detected\n`,
      "utf8",
    );
    const env = resolveViteProductionEnvironment(dir, {});
    assert.equal(env.VITE_RECAPTCHA_SITE_KEY, SYNTHETIC_VALID_SITE_KEY);
    assert.equal(env.VITE_APP_CHECK_DEBUG_TOKEN, "must-be-detected");
    assert.throws(
      () => validateProductionDeployReadiness({ ...validInput(), env }),
      (error: unknown) =>
        error instanceof ProductionDeployReadinessError &&
        error.code === "APP_CHECK_DEBUG_TOKEN_FORBIDDEN",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("process environment overrides Vite production env files", () => {
  const dir = mkdtempSync(join(tmpdir(), "futverse-readiness-"));
  try {
    writeFileSync(
      join(dir, ".env.production"),
      "VITE_RECAPTCHA_SITE_KEY=placeholder-from-file\n",
      "utf8",
    );
    const env = resolveViteProductionEnvironment(dir, {
      VITE_RECAPTCHA_SITE_KEY: SYNTHETIC_VALID_SITE_KEY,
    });
    assert.equal(env.VITE_RECAPTCHA_SITE_KEY, SYNTHETIC_VALID_SITE_KEY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("production readiness fails closed when App Check site key is missing", () => {
  expectBlocked(
    (input) => {
      delete input.env.VITE_RECAPTCHA_SITE_KEY;
    },
    "APP_CHECK_SITE_KEY_MISSING",
  );
});

test("production readiness rejects common App Check placeholders", () => {
  for (const placeholder of [
    "TODO",
    "dummy",
    "REPLACE_ME",
    "unit-test-site-key-only",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaPLACEHOLDER",
  ]) {
    expectBlocked(
      (input) => {
        input.env.VITE_RECAPTCHA_SITE_KEY = placeholder;
      },
      "APP_CHECK_SITE_KEY_PLACEHOLDER",
    );
  }
});

test("production readiness forbids App Check debug token in production", () => {
  expectBlocked(
    (input) => {
      input.env.VITE_APP_CHECK_DEBUG_TOKEN = "debug-token-must-not-ship";
    },
    "APP_CHECK_DEBUG_TOKEN_FORBIDDEN",
  );
});

test("production readiness fails on Firebase project alias drift", () => {
  expectBlocked(
    (input) => {
      input.firebaseRc = {
        projects: { default: "unexpected-project" },
      };
    },
    "PROJECT_ALIAS_MISMATCH",
  );
});

test("production readiness fails on web Firebase project drift", () => {
  expectBlocked(
    (input) => {
      input.webFirebaseConfig = {
        projectId: "unexpected-project",
      };
    },
    "WEB_CONFIG_PROJECT_MISMATCH",
  );
});

test("production readiness fails when Pro Club function rewrites move after SPA catch-all", () => {
  expectBlocked(
    (input) => {
      const cloned = structuredClone(input.firebaseJson) as {
        hosting: { rewrites: unknown[] };
      };
      const rewrites = cloned.hosting.rewrites;
      const catchAllIndex = rewrites.findIndex(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          !Array.isArray(entry) &&
          (entry as { source?: unknown }).source === "**",
      );
      const [catchAll] = rewrites.splice(catchAllIndex, 1);
      rewrites.unshift(catchAll);
      input.firebaseJson = cloned;
    },
    "HOSTING_REWRITE_ORDER_INVALID",
  );
});

test("production readiness binds App Check enforcement to the callable options object", () => {
  expectBlocked(
    (input) => {
      input.functionsIndexSource = input.functionsIndexSource.replace(
        "enforceAppCheck: true,",
        "enforceAppCheck: false, // enforceAppCheck: true",
      );
    },
    "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED",
  );
});

test("production readiness fails when provisioning function region drifts from Hosting rewrite", () => {
  expectBlocked(
    (input) => {
      input.functionsIndexSource = input.functionsIndexSource.replace(
        'export const provisionProClubV1 = onRequest(\n  {\n    region: "asia-southeast1",',
        'export const provisionProClubV1 = onRequest(\n  {\n    region: "us-central1",',
      );
    },
    "FUNCTION_EXPORT_REGION_MISMATCH",
  );
});

test("production readiness fails when audit verification function region drifts from Hosting rewrite", () => {
  expectBlocked(
    (input) => {
      input.functionsIndexSource = input.functionsIndexSource.replace(
        'export const verifyProClubProvisioningAuditV1 = onRequest(\n  {\n    region: "asia-southeast1",',
        'export const verifyProClubProvisioningAuditV1 = onRequest(\n  {\n    region: "europe-west1",',
      );
    },
    "FUNCTION_EXPORT_REGION_MISMATCH",
  );
});
