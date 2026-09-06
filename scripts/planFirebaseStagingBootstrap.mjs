import { readFileSync } from "node:fs";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(reason) {
  console.error(`FIREBASE_STAGING_BOOTSTRAP_PLAN=BLOCKED:${reason}`);
  process.exit(1);
}

function requireRealValue(key) {
  const value = clean(process.env[key]);
  if (!value || value === "CHANGE_ME" || value.includes("CHANGE_ME")) {
    fail(`MISSING_OR_PLACEHOLDER_${key}`);
  }
  return value;
}

function quote(value) {
  return JSON.stringify(value);
}

const productionConfig = JSON.parse(
  readFileSync(new URL("../firebase-applet-config.json", import.meta.url), "utf8"),
);

const projectId = requireRealValue("FIREBASE_STAGING_PROJECT_ID");
const firestoreLocation = requireRealValue("FIREBASE_STAGING_FIRESTORE_LOCATION");
const displayName = clean(process.env.FIREBASE_STAGING_DISPLAY_NAME) || "FutVerse Staging";
const webAppName = clean(process.env.FIREBASE_STAGING_WEB_APP_NAME) || "FutVerse Staging Web";

if (!/^futverse-staging-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(projectId)) {
  fail("STAGING_PROJECT_ID_FORMAT_INVALID");
}

if (projectId === clean(productionConfig.projectId)) {
  fail("PRODUCTION_PROJECT_COLLISION");
}

if (/\s/.test(firestoreLocation) || !/^[a-z0-9-]+$/.test(firestoreLocation)) {
  fail("FIRESTORE_LOCATION_FORMAT_INVALID");
}

const optionalWebProject = clean(process.env.VITE_FIREBASE_PROJECT_ID);
if (optionalWebProject && optionalWebProject !== projectId) {
  fail("FIREBASE_WEB_PROJECT_MISMATCH");
}

console.log("FIREBASE_STAGING_BOOTSTRAP_PLAN=PASS");
console.log("MUTATION_EXECUTED=NO");
console.log("PRODUCTION_TARGET_ALLOWED=NO");
console.log("FIREBASE_HOSTING_SETUP=NO");
console.log("BLAZE_PLAN_REQUIRED_FOR_FUNCTIONS=YES");
console.log(`TARGET_PROJECT_ID=${projectId}`);
console.log(`FIRESTORE_LOCATION=${firestoreLocation}`);
console.log("FUNCTIONS_REGION_EXPECTED=asia-southeast1");
console.log("--- READ-ONLY PRECHECKS ---");
console.log("STEP_01=npx --no-install firebase projects:list");
console.log("STEP_02=npx --no-install firebase firestore:locations");
console.log("--- EXTERNAL MUTATION PLAN (DO NOT RUN UNTIL REVIEWED) ---");
console.log(`STEP_03=npx --no-install firebase projects:create ${projectId} --display-name ${quote(displayName)}`);
console.log("STEP_04=Firebase Console: upgrade the staging project to Blaze and configure budget alerts before Functions deployment");
console.log(`STEP_05=npx --no-install firebase firestore:databases:create \"(default)\" --project ${projectId} --location ${firestoreLocation} --delete-protection ENABLED`);
console.log(`STEP_06=npx --no-install firebase apps:create WEB ${quote(webAppName)} --project ${projectId}`);
console.log(`STEP_07=npx --no-install firebase apps:list WEB --project ${projectId}`);
console.log(`STEP_08=npx --no-install firebase apps:sdkconfig WEB <STAGING_WEB_APP_ID> --project ${projectId}`);
console.log("STEP_09=Firebase Console: Authentication -> enable only the providers required for staging test users");
console.log("STEP_10=Firebase Console: App Check -> register the staging Web App and configure a staging-only provider/site key");
console.log("STEP_11=Vercel: set Firebase Web/App Check values in Preview for integration/pro-club-v1 only; do not set Production");
console.log("STEP_12=npm run verify:staging-live:app-check");
console.log("STEP_13=npm run plan:staging-live-deploy");
console.log("NEXT_PHASE=REVIEW_EXTERNAL_SETUP_PLAN_BEFORE_ANY_RESOURCE_CREATION");
