import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

const baseEnv = {
  ...process.env,
  VITE_FUTVERSE_ENV: "staging",
  FIREBASE_STAGING_PROJECT_ID: "futverse-staging-live-ci",
  VITE_FIREBASE_PROJECT_ID: "futverse-staging-live-ci",
  VITE_FIREBASE_APP_ID: "staging-live-app-id",
  VITE_FIREBASE_API_KEY: "staging-live-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "futverse-staging-live-ci.firebaseapp.com",
  VITE_FIREBASE_STORAGE_BUCKET: "futverse-staging-live-ci.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
  VITE_RECAPTCHA_SITE_KEY: "staging-live-recaptcha",
};

function run(overrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, ["scripts/verifyLiveStagingReadiness.mjs", "--require-app-check"], {
    cwd,
    env,
    encoding: "utf8",
  });
}

function output(result: ReturnType<typeof run>) {
  return `${result.stdout}\n${result.stderr}`;
}

test("live readiness accepts explicit deploy project while .firebaserc remains sentinel", () => {
  const result = run();
  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /LIVE_STAGING_READINESS_GATE=PASS:APP_CHECK/);
  assert.match(result.stdout, /FIREBASE_CLI_PROJECT_SOURCE=ENV/);
  assert.match(result.stdout, /PRODUCTION_COLLISION=NO/);
});

test("live readiness rejects missing deploy project when repository remains sentinel", () => {
  const result = run({ FIREBASE_STAGING_PROJECT_ID: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FIREBASE_CLI_STAGING_PROJECT_NOT_CONFIGURED/);
});

test("live readiness rejects deploy project outside staging prefix", () => {
  const result = run({ FIREBASE_STAGING_PROJECT_ID: "futverse-d7872" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FIREBASE_CLI_STAGING_PROJECT_PREFIX_INVALID/);
});

test("live readiness rejects deploy/web staging project mismatch", () => {
  const result = run({ FIREBASE_STAGING_PROJECT_ID: "futverse-staging-other-ci" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FIREBASE_CLI_AND_WEB_PROJECT_MISMATCH/);
});

test("live readiness requires App Check in the live gate", () => {
  const result = run({ VITE_RECAPTCHA_SITE_KEY: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MISSING_OR_PLACEHOLDER_VITE_RECAPTCHA_SITE_KEY/);
});
