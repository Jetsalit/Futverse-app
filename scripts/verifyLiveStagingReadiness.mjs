import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const requireAppCheck = args.has("--require-app-check");

function fail(reason) {
  console.error(`LIVE_STAGING_READINESS_GATE=BLOCKED:${reason}`);
  process.exit(1);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireRealValue(key) {
  const value = clean(process.env[key]);
  if (!value || value === "CHANGE_ME" || value.includes("CHANGE_ME")) {
    fail(`MISSING_OR_PLACEHOLDER_${key}`);
  }
  return value;
}

const runtimeEnv = clean(process.env.VITE_FUTVERSE_ENV).toLowerCase();
if (runtimeEnv !== "staging") {
  fail("RUNTIME_ENV_MUST_BE_STAGING");
}

const productionConfig = JSON.parse(readFileSync(new URL("../firebase-applet-config.json", import.meta.url), "utf8"));
const firebaseRc = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"));

const cliProjectId = clean(firebaseRc?.projects?.default);
if (!cliProjectId || cliProjectId === "futverse-staging-not-configured") {
  fail("FIREBASE_CLI_STAGING_PROJECT_NOT_CONFIGURED");
}

const projectId = requireRealValue("VITE_FIREBASE_PROJECT_ID");
const appId = requireRealValue("VITE_FIREBASE_APP_ID");
const apiKey = requireRealValue("VITE_FIREBASE_API_KEY");
const authDomain = requireRealValue("VITE_FIREBASE_AUTH_DOMAIN");
const storageBucket = requireRealValue("VITE_FIREBASE_STORAGE_BUCKET");
const messagingSenderId = requireRealValue("VITE_FIREBASE_MESSAGING_SENDER_ID");

if (!projectId.startsWith("futverse-staging-")) {
  fail("STAGING_PROJECT_ID_PREFIX_INVALID");
}

if (cliProjectId !== projectId) {
  fail("FIREBASE_CLI_AND_WEB_PROJECT_MISMATCH");
}

const collisions = [
  ["PROJECT_ID", projectId, clean(productionConfig.projectId)],
  ["APP_ID", appId, clean(productionConfig.appId)],
  ["API_KEY", apiKey, clean(productionConfig.apiKey)],
  ["AUTH_DOMAIN", authDomain, clean(productionConfig.authDomain)],
  ["STORAGE_BUCKET", storageBucket, clean(productionConfig.storageBucket)],
  ["MESSAGING_SENDER_ID", messagingSenderId, clean(productionConfig.messagingSenderId)],
];

for (const [name, stagingValue, productionValue] of collisions) {
  if (stagingValue === productionValue) {
    fail(`PRODUCTION_COLLISION_${name}`);
  }
}

if (!authDomain.includes(projectId)) {
  fail("AUTH_DOMAIN_PROJECT_MISMATCH");
}

if (!storageBucket.includes(projectId)) {
  fail("STORAGE_BUCKET_PROJECT_MISMATCH");
}

if (requireAppCheck) {
  requireRealValue("VITE_RECAPTCHA_SITE_KEY");
}

console.log(`LIVE_STAGING_READINESS_GATE=PASS:${requireAppCheck ? "APP_CHECK" : "BASE"}`);
console.log(`STAGING_PROJECT_ID=${projectId}`);
console.log("PRODUCTION_COLLISION=NO");
console.log(`APP_CHECK_REQUIRED=${requireAppCheck ? "YES" : "NO"}`);
