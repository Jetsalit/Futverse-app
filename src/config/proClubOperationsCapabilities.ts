export interface ProClubOperationsCapabilityEnvironment {
  readonly dev?: boolean;
}

export function isProClubOperationsPreviewAvailable(
  environment: ProClubOperationsCapabilityEnvironment,
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
 * Pro Club Operations V1 is a local/preview-only shell while its authoritative
 * training/report persistence contracts are still being built. Production is
 * fail-closed by source and cannot be enabled with an environment variable.
 */
export const PRO_CLUB_OPERATIONS_PREVIEW_AVAILABLE =
  isProClubOperationsPreviewAvailable({ dev: readViteDevMode() });
