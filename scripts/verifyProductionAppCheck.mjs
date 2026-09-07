import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";

export function loadProductionEnvironment(rootDir = process.cwd(), shellEnv = process.env) {
  const viteExpanded = loadEnv("production", rootDir, "");
  return { ...viteExpanded, ...shellEnv };
}

function containsUnresolvedExpansion(value) {
  return /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*/.test(value);
}

function looksLikePlaceholder(value) {
  return /(MY_RECAPTCHA|YOUR_RECAPTCHA|CHANGE[_-]?ME|PLACEHOLDER|EXAMPLE|TEST[_-]?KEY|DEMO[_-]?KEY|DUMMY|FAKE[_-]?KEY)/i.test(value);
}

function hasProductionRecaptchaSiteKeyShape(value) {
  return /^6L[A-Za-z0-9_-]{20,}$/.test(value);
}

export function validateProductionAppCheckEnvironment(env) {
  const rawSiteKey = typeof env.VITE_RECAPTCHA_SITE_KEY === "string"
    ? env.VITE_RECAPTCHA_SITE_KEY
    : "";
  const siteKey = rawSiteKey.trim();
  const debugToken = typeof env.VITE_APP_CHECK_DEBUG_TOKEN === "string"
    ? env.VITE_APP_CHECK_DEBUG_TOKEN.trim()
    : "";

  if (!siteKey) {
    return { ok: false, reason: "VITE_RECAPTCHA_SITE_KEY is required for production deployment." };
  }

  if (rawSiteKey !== siteKey) {
    return { ok: false, reason: "VITE_RECAPTCHA_SITE_KEY must already be trimmed exactly as Vite will embed it." };
  }

  if (containsUnresolvedExpansion(siteKey)) {
    return { ok: false, reason: "VITE_RECAPTCHA_SITE_KEY contains unresolved environment interpolation." };
  }

  if (looksLikePlaceholder(siteKey)) {
    return { ok: false, reason: "VITE_RECAPTCHA_SITE_KEY still contains a placeholder value." };
  }

  if (!hasProductionRecaptchaSiteKeyShape(siteKey)) {
    return { ok: false, reason: "VITE_RECAPTCHA_SITE_KEY does not have a valid production reCAPTCHA site-key shape." };
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
