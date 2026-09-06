import { spawnSync } from "node:child_process";

const STAGING_BRANCH = "integration/pro-club-v1";
const DEPLOY_SCOPE = "firestore:rules,functions";
const CONFIRMATION = "DEPLOY_STAGING_ONLY";
const execute = process.argv.slice(2).includes("--execute");

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(reason) {
  console.error(`LIVE_STAGING_DEPLOY_GATE=BLOCKED:${reason}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0) {
    if (!options.inherit) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    fail(options.reason || `${command.toUpperCase()}_FAILED`);
  }
  return clean(result.stdout);
}

const branch = run("git", ["branch", "--show-current"], { reason: "GIT_BRANCH_READ_FAILED" });
if (branch !== STAGING_BRANCH) {
  fail(`WRONG_BRANCH:${branch || "DETACHED"}`);
}

const head = run("git", ["rev-parse", "HEAD"], { reason: "GIT_HEAD_READ_FAILED" });
const expectedHead = clean(process.env.EXPECTED_STAGING_HEAD);
if (!expectedHead) {
  fail("EXPECTED_STAGING_HEAD_REQUIRED");
}
if (head !== expectedHead) {
  fail("HEAD_MISMATCH");
}

const status = run("git", ["status", "--porcelain"], { reason: "GIT_STATUS_READ_FAILED" });
if (status) {
  fail("WORKTREE_NOT_CLEAN");
}

const readinessArgs = ["scripts/verifyLiveStagingReadiness.mjs", "--require-app-check"];
const readiness = spawnSync(process.execPath, readinessArgs, {
  cwd: new URL("..", import.meta.url),
  env: process.env,
  encoding: "utf8",
});
if (readiness.status !== 0) {
  if (readiness.stdout) process.stdout.write(readiness.stdout);
  if (readiness.stderr) process.stderr.write(readiness.stderr);
  fail("READINESS_GATE_FAILED");
}

const projectId = clean(process.env.FIREBASE_STAGING_PROJECT_ID);
if (!projectId || !projectId.startsWith("futverse-staging-")) {
  fail("STAGING_PROJECT_ID_INVALID");
}

console.log("LIVE_STAGING_DEPLOY_GATE=PASS");
console.log(`STAGING_BRANCH=${branch}`);
console.log(`STAGING_HEAD=${head}`);
console.log(`STAGING_PROJECT_ID=${projectId}`);
console.log(`DEPLOY_SCOPE=${DEPLOY_SCOPE}`);
console.log("FIREBASE_HOSTING_DEPLOY=NO");
console.log("PRODUCTION_TARGET_ALLOWED=NO");

if (!execute) {
  console.log("LIVE_STAGING_DEPLOY_MODE=PLAN_ONLY");
  console.log(`NEXT_COMMAND=npx --no-install firebase deploy --project ${projectId} --only ${DEPLOY_SCOPE}`);
  process.exit(0);
}

if (clean(process.env.STAGING_DEPLOY_CONFIRM) !== CONFIRMATION) {
  fail("EXPLICIT_CONFIRMATION_REQUIRED");
}

console.log("LIVE_STAGING_DEPLOY_MODE=EXECUTE");
const deployment = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--no-install", "firebase", "deploy", "--project", projectId, "--only", DEPLOY_SCOPE],
  {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: "inherit",
  },
);
if (deployment.status !== 0) {
  fail("FIREBASE_STAGING_DEPLOY_FAILED");
}

console.log("LIVE_STAGING_DEPLOY_RESULT=SUCCESS");
