/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import productionFirebaseConfig from "../../firebase-applet-config.json";
import { resolveFirebaseRuntimeConfig, type FutVerseFirebaseRuntimeEnv } from "./firebaseRuntimeConfig";

// Browser builds must use Vite-provided env only. Node-based contract tests may use
// process.env so CI can supply synthetic staging values without any production secrets.
const viteRuntimeEnv = import.meta.env as FutVerseFirebaseRuntimeEnv | undefined;
const nodeTestRuntimeEnv =
  typeof window === "undefined" && typeof process !== "undefined"
    ? (process.env as FutVerseFirebaseRuntimeEnv)
    : undefined;
const firebaseRuntimeEnv = viteRuntimeEnv ?? nodeTestRuntimeEnv;

// Explicit local-only verification. Production builds always use the existing config.
const localOnboarding = import.meta.env?.DEV === true && import.meta.env?.VITE_PRO_CLUB_EMULATORS === "true";
const runtimeFirebaseConfig = localOnboarding
  ? { projectId: "demo-futverse-onboarding", apiKey: "demo-onboarding-key", authDomain: "localhost" }
  : resolveFirebaseRuntimeConfig(firebaseRuntimeEnv, productionFirebaseConfig);

export const app = initializeApp(runtimeFirebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-southeast1");

if (localOnboarding) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

// App Check safe parameterized boundary:
// Requires real reCAPTCHA v3 / Enterprise site key from environment in production.
// Never invent fake site keys.
export function shouldEnableAppCheckDebug(env?: {
  DEV?: boolean;
  VITE_APP_CHECK_DEBUG_TOKEN?: string;
}): boolean {
  const currentEnv = env ?? (typeof import.meta !== "undefined" ? import.meta.env : undefined);
  return currentEnv?.DEV === true && Boolean(currentEnv?.VITE_APP_CHECK_DEBUG_TOKEN);
}

export function isAppCheckSiteKeyConfigured(env?: {
  VITE_RECAPTCHA_SITE_KEY?: string;
}): boolean {
  const currentEnv = env ?? (typeof import.meta !== "undefined" ? import.meta.env : undefined);
  return Boolean(currentEnv?.VITE_RECAPTCHA_SITE_KEY);
}

export const isAppCheckConfigured = isAppCheckSiteKeyConfigured();

let appCheckInstance: AppCheck | null = null;
if (typeof window !== "undefined" && isAppCheckConfigured) {
  if (shouldEnableAppCheckDebug()) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
  }
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
export const appCheck = appCheckInstance;
