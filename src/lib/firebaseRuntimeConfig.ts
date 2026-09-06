export interface FirebaseClientConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export interface FutVerseFirebaseRuntimeEnv {
  VITE_FUTVERSE_ENV?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_MEASUREMENT_ID?: string;
}

function requiredEnvValue(env: FutVerseFirebaseRuntimeEnv, key: keyof FutVerseFirebaseRuntimeEnv): string {
  const value = env[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`FUTVERSE_STAGING_FIREBASE_CONFIG_MISSING:${String(key)}`);
  }
  return value.trim();
}

export function resolveFirebaseRuntimeConfig(
  env: FutVerseFirebaseRuntimeEnv,
  productionConfig: FirebaseClientConfig,
): FirebaseClientConfig {
  const runtimeEnv = env.VITE_FUTVERSE_ENV?.trim().toLowerCase() || "production";

  if (runtimeEnv === "production") {
    return productionConfig;
  }

  if (runtimeEnv !== "staging") {
    throw new Error(`FUTVERSE_RUNTIME_ENV_INVALID:${runtimeEnv}`);
  }

  const stagingConfig: FirebaseClientConfig = {
    projectId: requiredEnvValue(env, "VITE_FIREBASE_PROJECT_ID"),
    appId: requiredEnvValue(env, "VITE_FIREBASE_APP_ID"),
    apiKey: requiredEnvValue(env, "VITE_FIREBASE_API_KEY"),
    authDomain: requiredEnvValue(env, "VITE_FIREBASE_AUTH_DOMAIN"),
    storageBucket: requiredEnvValue(env, "VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requiredEnvValue(env, "VITE_FIREBASE_MESSAGING_SENDER_ID"),
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID?.trim() || "",
  };

  if (stagingConfig.projectId === productionConfig.projectId) {
    throw new Error("FUTVERSE_STAGING_FIREBASE_PROJECT_COLLISION");
  }

  if (stagingConfig.authDomain === productionConfig.authDomain) {
    throw new Error("FUTVERSE_STAGING_FIREBASE_AUTH_DOMAIN_COLLISION");
  }

  return stagingConfig;
}
