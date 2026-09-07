import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function parseEnvText(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadProductionEnvironment(rootDir = process.cwd(), shellEnv = process.env) {
  const merged = {};
  for (const filename of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const filePath = path.join(rootDir, filename);
    if (fs.existsSync(filePath)) {
      Object.assign(merged, parseEnvText(fs.readFileSync(filePath, "utf8")));
    }
  }
  return { ...merged, ...shellEnv };
}

export function validateProductionAppCheckEnvironment(env) {
  const siteKey = typeof env.VITE_RECAPTCHA_SITE_KEY === "string"
    ? env.VITE_RECAPTCHA_SITE_KEY.trim()
    : "";
  const debugToken = typeof env.VITE_APP_CHECK_DEBUG_TOKEN === "string"
    ? env.VITE_APP_CHECK_DEBUG_TOKEN.trim()
    : "";

  if (!siteKey) {
    return { ok: false, reason: "VITE_RECAPTCHA_SITE_KEY is required for production deployment." };
  }

  if (/^(MY_|CHANGE_ME|PLACEHOLDER|TEST_KEY|DEMO_KEY)/i.test(siteKey)) {
    return { ok: false, reason: "VITE_RECAPTCHA_SITE_KEY still contains a placeholder value." };
  }

  if (debugToken) {
    return { ok: false, reason: "VITE_APP_CHECK_DEBUG_TOKEN must not be set for production deployment." };
  }

  return { ok: true };
}

function runCli() {
  const result = validateProductionAppCheckEnvironment(loadProductionEnvironment());
  if (!result.ok) {
    console.error(`PRODUCTION_APP_CHECK_GATE=BLOCKED: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log("PRODUCTION_APP_CHECK_GATE=PASS");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  runCli();
}
