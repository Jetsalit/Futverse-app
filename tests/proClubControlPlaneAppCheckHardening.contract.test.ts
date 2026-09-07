import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const clientSource = fs.readFileSync(
  "src/lib/proClubProvisioningControlPlaneApi.ts",
  "utf8",
);
const firebaseSource = fs.readFileSync("src/lib/firebase.ts", "utf8");
const indexSource = fs.readFileSync("functions/src/index.ts", "utf8");
const gateSource = fs.readFileSync(
  "functions/src/lib/privilegedHttpAppCheckGate.ts",
  "utf8",
);
const verifierSource = fs.readFileSync(
  "functions/src/lib/serverAppCheckTokenVerifier.ts",
  "utf8",
);
const firebaseConfig = JSON.parse(fs.readFileSync("firebase.json", "utf8"));
const firebaseAppletConfig = JSON.parse(
  fs.readFileSync("firebase-applet-config.json", "utf8"),
);
const envExample = fs.readFileSync(".env.example", "utf8");

test("privileged Pro Club client requires Firebase App Check token and sends standard header", () => {
  assert.match(clientSource, /getToken\(appCheck, false\)/);
  assert.match(clientSource, /"X-Firebase-AppCheck": appCheckToken/);
  assert.match(clientSource, /ERROR_APP_CHECK_NOT_CONFIGURED/);
  assert.equal(clientSource.includes("cloudfunctions.net"), false);
});

test("production web App Check uses reCAPTCHA Enterprise and cannot regress to deprecated v3 provider", () => {
  assert.match(firebaseSource, /ReCaptchaEnterpriseProvider/);
  assert.match(firebaseSource, /new ReCaptchaEnterpriseProvider\(import\.meta\.env\.VITE_RECAPTCHA_SITE_KEY\)/);
  assert.equal(firebaseSource.includes("ReCaptchaV3Provider"), false);
});

test("both privileged HTTP functions gate App Check before business handlers", () => {
  const provisionGate = indexSource.indexOf("requireVerifiedAppCheckForPrivilegedHttp", indexSource.indexOf("export const provisionProClubV1"));
  const provisionHandler = indexSource.indexOf("handleProClubProvisioningHttpRequest", indexSource.indexOf("export const provisionProClubV1"));
  const verifyGate = indexSource.indexOf("requireVerifiedAppCheckForPrivilegedHttp", indexSource.indexOf("export const verifyProClubProvisioningAuditV1"));
  const verifyHandler = indexSource.indexOf("handleProClubProvisioningAuditVerificationHttpRequest", indexSource.indexOf("export const verifyProClubProvisioningAuditV1"));

  assert.ok(provisionGate > 0 && provisionHandler > provisionGate);
  assert.ok(verifyGate > 0 && verifyHandler > verifyGate);
  assert.match(indexSource, /getAppCheck\(adminServices\.app\)/);
});

test("server App Check verification is bound to the exact production FutVerse web app ID", () => {
  const appId = String(firebaseAppletConfig.appId);
  assert.ok(appId.length > 0);
  assert.ok(indexSource.includes(`FUTVERSE_PRODUCTION_WEB_APP_ID = "${appId}"`));
  assert.match(indexSource, /createServerAppCheckTokenVerifier\([\s\S]*\[FUTVERSE_PRODUCTION_WEB_APP_ID\]/);
  assert.match(verifierSource, /allowedAppIds\.has\(decoded\.appId\)/);
});

test("App Check gate fails closed with privacy-safe responses and logs", () => {
  assert.match(gateSource, /ERROR_APP_CHECK_REQUIRED/);
  assert.match(gateSource, /ERROR_APP_CHECK_INTERNAL/);
  assert.equal(gateSource.includes("appCheckHeader"), true);
  assert.equal(gateSource.includes("console.log"), false);
});

test("Firebase predeploy guard runs before Hosting build and Functions build", () => {
  assert.deepEqual(firebaseConfig.hosting.predeploy, [
    "node scripts/verifyProductionAppCheck.mjs",
    "npm run build",
  ]);
  assert.deepEqual(firebaseConfig.functions[0].predeploy, [
    "node scripts/verifyProductionAppCheck.mjs",
    'npm --prefix "$RESOURCE_DIR" run build',
  ]);
});

test("environment template documents App Check without embedding a production key", () => {
  assert.match(envExample, /VITE_RECAPTCHA_SITE_KEY=""/);
  assert.match(envExample, /reCAPTCHA Enterprise/i);
  assert.match(envExample, /VITE_APP_CHECK_DEBUG_TOKEN=""/);
  assert.equal(/VITE_RECAPTCHA_SITE_KEY="[^\"]+"/.test(envExample), false);
});
