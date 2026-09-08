export interface RuntimeCapabilityEnvironment {
  readonly dev?: boolean;
}

export function isFunctionBackedProClubWebAvailable(
  environment: RuntimeCapabilityEnvironment,
): boolean {
  return environment.dev === true;
}

function readViteDevMode(): boolean {
  const environment = (
    import.meta as ImportMeta & {
      env?: { readonly DEV?: boolean };
    }
  ).env;

  return environment?.DEV === true;
}

/**
 * Spark-first hard boundary.
 *
 * Function-backed Pro Club browser operations are allowed only in Vite DEV
 * (for local/emulator development). Production builds are fail-closed and
 * cannot be re-enabled by an environment variable while FutVerse remains on
 * Spark. A future post-revenue server rollout requires a reviewed source
 * change rather than an accidental production environment toggle.
 */
export const FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE =
  isFunctionBackedProClubWebAvailable({ dev: readViteDevMode() });

export const SPARK_FUNCTION_BACKED_WEB_UNAVAILABLE_MESSAGE =
  "This server-backed action is unavailable in the Spark production web app. Use the reviewed trusted-local operator path where available.";
