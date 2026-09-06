import fs from "node:fs";

const productionConfig = JSON.parse(
  fs.readFileSync(new URL("../firebase-applet-config.json", import.meta.url), "utf8"),
);

const STAGING_BRANCH = "integration/pro-club-v1";
const requiredKeys = [
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
];

function fail(reason) {
  console.error(`STAGING_ISOLATION_PREBUILD_GATE=BLOCKED:${reason}`);
  process.exit(1);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

const explicitRuntimeEnv = clean(process.env.VITE_FUTVERSE_ENV).toLowerCase();
const vercelEnv = clean(process.env.VERCEL_ENV).toLowerCase();
const vercelBranch = clean(process.env.VERCEL_GIT_COMMIT_REF);
const exactVercelStagingPreview =
  vercelEnv === "preview" && vercelBranch === STAGING_BRANCH;

if (vercelEnv === "production") {
  fail("VERCEL_PRODUCTION_TARGET_BLOCKED");
}

if (vercelEnv === "preview" && vercelBranch !== STAGING_BRANCH) {
  fail("VERCEL_PREVIEW_BRANCH_MISMATCH");
}

const runtimeEnv = explicitRuntimeEnv || (exactVercelStagingPreview ? "staging" : "");
if (runtimeEnv !== "staging") {
  fail("RUNTIME_ENV_MUST_BE_STAGING");
}

for (const key of requiredKeys) {
  if (!clean(process.env[key])) {
    fail(`MISSING_${key}`);
  }
}

const collisions = [
  ["VITE_FIREBASE_PROJECT_ID", productionConfig.projectId],
  ["VITE_FIREBASE_APP_ID", productionConfig.appId],
  ["VITE_FIREBASE_API_KEY", productionConfig.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", productionConfig.authDomain],
  ["VITE_FIREBASE_STORAGE_BUCKET", productionConfig.storageBucket],
  ["VITE_FIREBASE_MESSAGING_SENDER_ID", productionConfig.messagingSenderId],
];

for (const [key, productionValue] of collisions) {
  if (productionValue && clean(process.env[key]) === String(productionValue).trim()) {
    fail(`PRODUCTION_COLLISION_${key}`);
  }
}

if (exactVercelStagingPreview && !clean(process.env.VITE_RECAPTCHA_SITE_KEY)) {
  fail("MISSING_VITE_RECAPTCHA_SITE_KEY");
}

console.log("STAGING_ISOLATION_PREBUILD_GATE=PASS");
console.log(`STAGING_ISOLATION_CONTEXT=${exactVercelStagingPreview ? "VERCEL_PREVIEW" : "EXPLICIT_STAGING"}`);
