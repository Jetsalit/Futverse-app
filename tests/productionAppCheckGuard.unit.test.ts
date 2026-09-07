import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const script = path.resolve("scripts/verifyProductionAppCheck.mjs");

function runGuard(
  extraEnv: Record<string, string | undefined>,
  files: Record<string, string> = {},
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "futverse-app-check-"));
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.VITE_RECAPTCHA_SITE_KEY;
  delete env.VITE_APP_CHECK_DEBUG_TOKEN;
  delete env.PROD_RECAPTCHA_SITE_KEY;
  Object.assign(env, extraEnv);

  for (const [filename, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(tempDir, filename), contents, "utf8");
  }

  try {
    return spawnSync(process.execPath, [script], {
      cwd: tempDir,
      env: env as NodeJS.ProcessEnv,
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("production App Check guard blocks when site key is missing", () => {
  const result = runGuard({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PRODUCTION_APP_CHECK_GATE=BLOCKED/);
});

test("production App Check guard blocks common and prefixed placeholder site keys", () => {
  for (const value of [
    "MY_RECAPTCHA_SITE_KEY",
    "YOUR_RECAPTCHA_SITE_KEY",
    "6LYOUR_RECAPTCHA_SITE_KEY",
  ]) {
    const result = runGuard({ VITE_RECAPTCHA_SITE_KEY: value });
    assert.equal(result.status, 1, value);
    assert.match(result.stderr, /BLOCKED/);
  }
});

test("production App Check guard blocks malformed site key values", () => {
  const result = runGuard({ VITE_RECAPTCHA_SITE_KEY: "not-a-real-key" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /site-key shape/i);
});

test("production App Check guard blocks unresolved Vite dotenv interpolation", () => {
  const result = runGuard(
    {},
    { ".env.production": "VITE_RECAPTCHA_SITE_KEY=${PROD_RECAPTCHA_SITE_KEY}\n" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED/);
});

test("production App Check guard blocks site keys with surrounding whitespace", () => {
  const result = runGuard({
    VITE_RECAPTCHA_SITE_KEY: " 6Lc_real-looking-public-site-key ",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /already be trimmed/i);
});

test("production App Check guard blocks debug token in production", () => {
  const result = runGuard({
    VITE_RECAPTCHA_SITE_KEY: "6Lc_real-looking-public-site-key",
    VITE_APP_CHECK_DEBUG_TOKEN: "debug-token-must-not-ship",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DEBUG_TOKEN/);
});

test("production App Check guard passes with production-shaped site key and no debug token", () => {
  const result = runGuard({
    VITE_RECAPTCHA_SITE_KEY: "6Lc_real-looking-public-site-key",
    VITE_APP_CHECK_DEBUG_TOKEN: "",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /PRODUCTION_APP_CHECK_GATE=PASS/);
});
