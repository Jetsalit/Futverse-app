import fs from "node:fs";

const productionConfig = JSON.parse(
  fs.readFileSync(new URL("../firebase-applet-config.json", import.meta.url), "utf8"),
);

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

const runtimeEnv = (process.env.VITE_FUTVERSE_ENV || "").trim().toLowerCase();
if (runtimeEnv !== "staging") {
  fail("RUNTIME_ENV_MUST_BE_STAGING");
}

for (const key of requiredKeys) {
  if (!process.env[key] || process.env[key].trim() === "") {
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
  if (productionValue && process.env[key].trim() === String(productionValue).trim()) {
    fail(`PRODUCTION_COLLISION_${key}`);
  }
}

console.log("STAGING_ISOLATION_PREBUILD_GATE=PASS");
