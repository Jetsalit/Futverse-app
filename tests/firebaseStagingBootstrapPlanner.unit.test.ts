import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cwd = new URL("..", import.meta.url);

const baseEnv = {
  ...process.env,
  FIREBASE_STAGING_PROJECT_ID: "futverse-staging-bootstrap-ci",
  FIREBASE_STAGING_FIRESTORE_LOCATION: "asia-southeast1",
  FIREBASE_STAGING_DISPLAY_NAME: "FutVerse Staging CI",
  FIREBASE_STAGING_WEB_APP_NAME: "FutVerse Staging Web CI",
  VITE_FIREBASE_PROJECT_ID: "futverse-staging-bootstrap-ci",
};

function run(overrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return spawnSync(process.execPath, ["scripts/planFirebaseStagingBootstrap.mjs"], {
    cwd,
    env,
    encoding: "utf8",
  });
}

function output(result: ReturnType<typeof run>) {
  return `${result.stdout}\n${result.stderr}`;
}

test("bootstrap planner emits staging-only external plan without executing mutations", () => {
  const result = run();
  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /FIREBASE_STAGING_BOOTSTRAP_PLAN=PASS/);
  assert.match(result.stdout, /MUTATION_EXECUTED=NO/);
  assert.match(result.stdout, /PRODUCTION_TARGET_ALLOWED=NO/);
  assert.match(result.stdout, /FIREBASE_HOSTING_SETUP=NO/);
  assert.match(result.stdout, /BLAZE_PLAN_REQUIRED_FOR_FUNCTIONS=YES/);
  assert.match(result.stdout, /TARGET_PROJECT_ID=futverse-staging-bootstrap-ci/);
  assert.match(result.stdout, /FIRESTORE_LOCATION=asia-southeast1/);
  assert.match(result.stdout, /--delete-protection ENABLED/);
  assert.match(result.stdout, /NEXT_PHASE=REVIEW_EXTERNAL_SETUP_PLAN_BEFORE_ANY_RESOURCE_CREATION/);
});

test("bootstrap planner rejects production project id", () => {
  const result = run({
    FIREBASE_STAGING_PROJECT_ID: "futverse-d7872",
    VITE_FIREBASE_PROJECT_ID: "futverse-d7872",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STAGING_PROJECT_ID_FORMAT_INVALID|PRODUCTION_PROJECT_COLLISION/);
});

test("bootstrap planner rejects non-staging project prefix", () => {
  const result = run({
    FIREBASE_STAGING_PROJECT_ID: "futverse-test-ci",
    VITE_FIREBASE_PROJECT_ID: "futverse-test-ci",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STAGING_PROJECT_ID_FORMAT_INVALID/);
});

test("bootstrap planner requires explicit Firestore location", () => {
  const result = run({ FIREBASE_STAGING_FIRESTORE_LOCATION: undefined });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MISSING_OR_PLACEHOLDER_FIREBASE_STAGING_FIRESTORE_LOCATION/);
});

test("bootstrap planner rejects web/deploy project mismatch when web project is already supplied", () => {
  const result = run({ VITE_FIREBASE_PROJECT_ID: "futverse-staging-other-ci" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FIREBASE_WEB_PROJECT_MISMATCH/);
});
