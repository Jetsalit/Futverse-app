import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ProductionDeployReadinessError,
  validateProductionDeployReadiness,
} from "../scripts/verifyProductionDeployReadiness.ts";

const firebaseRc = JSON.parse(readFileSync(".firebaserc", "utf8")) as unknown;
const webFirebaseConfig = JSON.parse(
  readFileSync("firebase-applet-config.json", "utf8"),
) as unknown;
const firebaseJson = JSON.parse(readFileSync("firebase.json", "utf8")) as unknown;
const functionsIndexSource = readFileSync("functions/src/index.ts", "utf8");

function validInput() {
  return {
    env: {
      VITE_RECAPTCHA_SITE_KEY: "unit-test-site-key-only",
    },
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
    "staff-candidate-app-check-enforced",
  ]);
});

test("production readiness fails closed when App Check site key is missing", () => {
  expectBlocked(
    (input) => {
      delete input.env.VITE_RECAPTCHA_SITE_KEY;
    },
    "APP_CHECK_SITE_KEY_MISSING",
  );
});

test("production readiness rejects placeholder App Check site key", () => {
  expectBlocked(
    (input) => {
      input.env.VITE_RECAPTCHA_SITE_KEY = "CHANGE_ME_RECAPTCHA_SITE_KEY";
    },
    "APP_CHECK_SITE_KEY_PLACEHOLDER",
  );
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

test("production readiness fails when staff candidate callable no longer enforces App Check", () => {
  expectBlocked(
    (input) => {
      input.functionsIndexSource = input.functionsIndexSource.replace(
        "enforceAppCheck: true",
        "enforceAppCheck: false",
      );
    },
    "STAFF_CANDIDATE_APP_CHECK_NOT_ENFORCED",
  );
});
