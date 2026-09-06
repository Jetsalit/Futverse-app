import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const productionConfig = JSON.parse(
  readFileSync(new URL("../firebase-applet-config.json", import.meta.url), "utf8"),
) as Record<string, string>;

const stagingEnv = {
  VITE_FUTVERSE_ENV: "staging",
  VITE_FIREBASE_PROJECT_ID: "futverse-staging-vercel-ci",
  VITE_FIREBASE_APP_ID: "staging-vercel-app-id",
  VITE_FIREBASE_API_KEY: "staging-vercel-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "futverse-staging-vercel-ci.firebaseapp.com",
  VITE_FIREBASE_STORAGE_BUCKET: "futverse-staging-vercel-ci.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
  VITE_RECAPTCHA_SITE_KEY: "staging-recaptcha-site-key",
};

function runGate(overrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...stagingEnv,
  };

  delete env.VERCEL_ENV;
  delete env.VERCEL_GIT_COMMIT_REF;

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  return spawnSync(process.execPath, ["scripts/verifyStagingIsolation.mjs"], {
    cwd: new URL("..", import.meta.url),
    env,
    encoding: "utf8",
  });
}

function combinedOutput(result: ReturnType<typeof runGate>) {
  return `${result.stdout}\n${result.stderr}`;
}

test("explicit non-Vercel staging remains allowed", () => {
  const result = runGate();
  assert.equal(result.status, 0, combinedOutput(result));
  assert.match(result.stdout, /STAGING_ISOLATION_PREBUILD_GATE=PASS/);
  assert.match(result.stdout, /STAGING_ISOLATION_CONTEXT=EXPLICIT_STAGING/);
});

test("non-Vercel execution still requires explicit staging runtime", () => {
  const result = runGate({ VITE_FUTVERSE_ENV: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BLOCKED:RUNTIME_ENV_MUST_BE_STAGING/);
});

test("exact Vercel preview branch may infer staging without VITE_FUTVERSE_ENV", () => {
  const result = runGate({
    VITE_FUTVERSE_ENV: undefined,
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "integration/pro-club-v1",
  });
  assert.equal(result.status, 0, combinedOutput(result));
  assert.match(result.stdout, /STAGING_ISOLATION_CONTEXT=VERCEL_PREVIEW/);
});

test("Vercel preview on any other branch fails closed", () => {
  const result = runGate({
    VITE_FUTVERSE_ENV: undefined,
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "main",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BLOCKED:VERCEL_PREVIEW_BRANCH_MISMATCH/);
});

test("Vercel production target is blocked even with staging variables", () => {
  const result = runGate({
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "integration/pro-club-v1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BLOCKED:VERCEL_PRODUCTION_TARGET_BLOCKED/);
});

test("real Vercel staging preview requires App Check site key", () => {
  const result = runGate({
    VITE_FUTVERSE_ENV: undefined,
    VITE_RECAPTCHA_SITE_KEY: undefined,
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "integration/pro-club-v1",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BLOCKED:MISSING_VITE_RECAPTCHA_SITE_KEY/);
});

test("production Firebase collisions remain blocked", () => {
  const result = runGate({
    VITE_FIREBASE_PROJECT_ID: productionConfig.projectId,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /BLOCKED:PRODUCTION_COLLISION_VITE_FIREBASE_PROJECT_ID/);
});
