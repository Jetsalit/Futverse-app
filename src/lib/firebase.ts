/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Explicit local-only verification. Production builds always use the existing config.
const localOnboarding = import.meta.env?.DEV === true && import.meta.env?.VITE_PRO_CLUB_EMULATORS === "true";
const app = initializeApp(localOnboarding ? {
  projectId: "demo-futverse-onboarding", apiKey: "demo-onboarding-key", authDomain: "localhost",
} : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (localOnboarding) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
