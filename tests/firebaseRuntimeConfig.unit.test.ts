import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveFirebaseRuntimeConfig,
  type FirebaseClientConfig,
} from "../src/lib/firebaseRuntimeConfig";

const productionConfig: FirebaseClientConfig = {
  projectId: "futverse-d7872",
  appId: "prod-app-id",
  apiKey: "prod-api-key",
  authDomain: "futverse-d7872.firebaseapp.com",
  storageBucket: "futverse-d7872.firebasestorage.app",
  messagingSenderId: "504089427500",
  measurementId: "",
};

const stagingEnv = {
  VITE_FUTVERSE_ENV: "staging",
  VITE_FIREBASE_PROJECT_ID: "futverse-staging-example",
  VITE_FIREBASE_APP_ID: "staging-app-id",
  VITE_FIREBASE_API_KEY: "staging-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "futverse-staging-example.firebaseapp.com",
  VITE_FIREBASE_STORAGE_BUCKET: "futverse-staging-example.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789",
};

test("integration branch defaults to staging and fails closed without staging config", () => {
  assert.throws(
    () => resolveFirebaseRuntimeConfig({}, productionConfig),
    /FUTVERSE_STAGING_FIREBASE_CONFIG_MISSING:VITE_FIREBASE_PROJECT_ID/,
  );
});

test("production use must be explicit and preserves the existing production Firebase config", () => {
  assert.deepEqual(
    resolveFirebaseRuntimeConfig({ VITE_FUTVERSE_ENV: "production" }, productionConfig),
    productionConfig,
  );
});

test("staging resolves only from explicit staging Firebase configuration", () => {
  const resolved = resolveFirebaseRuntimeConfig(stagingEnv, productionConfig);
  assert.equal(resolved.projectId, "futverse-staging-example");
  assert.equal(resolved.authDomain, "futverse-staging-example.firebaseapp.com");
  assert.notEqual(resolved.projectId, productionConfig.projectId);
  assert.notEqual(resolved.authDomain, productionConfig.authDomain);
});

test("staging fails closed when required Firebase configuration is missing", () => {
  const { VITE_FIREBASE_API_KEY: _removed, ...missingApiKey } = stagingEnv;
  assert.throws(
    () => resolveFirebaseRuntimeConfig(missingApiKey, productionConfig),
    /FUTVERSE_STAGING_FIREBASE_CONFIG_MISSING:VITE_FIREBASE_API_KEY/,
  );
});

test("staging fails closed when it points at the production Firebase project", () => {
  assert.throws(
    () => resolveFirebaseRuntimeConfig({
      ...stagingEnv,
      VITE_FIREBASE_PROJECT_ID: productionConfig.projectId,
    }, productionConfig),
    /FUTVERSE_STAGING_FIREBASE_PROJECT_COLLISION/,
  );
});

test("staging fails closed when it points at the production Firebase auth domain", () => {
  assert.throws(
    () => resolveFirebaseRuntimeConfig({
      ...stagingEnv,
      VITE_FIREBASE_AUTH_DOMAIN: productionConfig.authDomain,
    }, productionConfig),
    /FUTVERSE_STAGING_FIREBASE_AUTH_DOMAIN_COLLISION/,
  );
});

test("unknown runtime environments fail closed", () => {
  assert.throws(
    () => resolveFirebaseRuntimeConfig({ VITE_FUTVERSE_ENV: "preview" }, productionConfig),
    /FUTVERSE_RUNTIME_ENV_INVALID:preview/,
  );
});
