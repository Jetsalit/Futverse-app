/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import firebaseConfig from "../../firebase-applet-config.json";

// Explicit local-only verification. Production builds always use the existing config.
const localOnboarding = import.meta.env?.DEV === true && import.meta.env?.VITE_PRO_CLUB_EMULATORS === "true";
export const app = initializeApp(localOnboarding ? {
  projectId: "demo-futverse-onboarding", apiKey: "demo-onboarding-key", authDomain: "localhost",
} : firebaseConfig);

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
export const isAppCheckConfigured = Boolean(
  typeof import.meta !== "undefined" && import.meta.env?.VITE_RECAPTCHA_SITE_KEY,
);

let appCheckInstance: AppCheck | null = null;
if (typeof window !== "undefined" && isAppCheckConfigured) {
  if (import.meta.env?.VITE_APP_CHECK_DEBUG_TOKEN) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
  }
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
export const appCheck = appCheckInstance;
