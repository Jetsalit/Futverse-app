import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);
const currentHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).stdout.trim();

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
  EXPECTED_STAGING_HEAD: currentHead,
};

function run(args: string[] = [], overrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, ["scripts/verifyLiveStagingDeployGuard.mjs", ...args], {
    cwd,
    env,
    encoding: "utf8",
  });
}

function output(result: ReturnType<typeof run>) {
  return `${result.stdout}\n${result.stderr}`;
}

test("plan-only gate emits exact staging-only Firebase scope and never plans hosting", () => {
  const result = run();
  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /LIVE_STAGING_DEPLOY_GATE=PASS/);
  assert.match(result.stdout, /LIVE_STAGING_DEPLOY_MODE=PLAN_ONLY/);
  assert.match(result.stdout, /DEPLOY_SCOPE=firestore:rules,functions/);
  assert.match(result.stdout, /FIREBASE_HOSTING_DEPLOY=NO/);
  assert.match(result.stdout, /PRODUCTION_TARGET_ALLOWED=NO/);
  const nextCommand = result.stdout.split("\n").find((line) => line.startsWith("NEXT_COMMAND=")) ?? "";
  assert.equal(
    nextCommand,
    "NEXT_COMMAND=npx --no-install firebase deploy --project futverse-staging-live-ci --only firestore:rules,functions",
  );
  assert.doesNotMatch(nextCommand, /hosting|--prod/);
});

test("deploy guard rejects missing expected HEAD", () => {
  const result = run([], { EXPECTED_STAGING_HEAD: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPECTED_STAGING_HEAD_REQUIRED/);
});

test("deploy guard rejects mismatched HEAD", () => {
  const result = run([], { EXPECTED_STAGING_HEAD: "0000000000000000000000000000000000000000" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HEAD_MISMATCH/);
});

test("deploy guard rejects web/deploy project mismatch through readiness gate", () => {
  const result = run([], { VITE_FIREBASE_PROJECT_ID: "futverse-staging-other-ci" });
  assert.notEqual(result.status, 0);
  assert.match(output(result), /FIREBASE_CLI_AND_WEB_PROJECT_MISMATCH/);
  assert.match(result.stderr, /READINESS_GATE_FAILED/);
});

test("execute mode remains blocked without explicit confirmation", () => {
  const result = run(["--execute"], { STAGING_DEPLOY_CONFIRM: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPLICIT_CONFIRMATION_REQUIRED/);
  assert.doesNotMatch(result.stdout, /LIVE_STAGING_DEPLOY_RESULT=SUCCESS/);
});
