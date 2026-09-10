export interface RuntimeCapabilityEnvironment {
  readonly dev?: boolean;
}

export interface WeeklyTrainingSavedDraftReadCapabilityEvidence {
  readonly dev?: boolean;
  readonly productionIndexVerified?: boolean;
}

export function isFunctionBackedProClubWebAvailable(
  environment: RuntimeCapabilityEnvironment,
): boolean {
  return environment.dev === true;
}

/**
 * Saved-DRAFT history requires the reviewed composite Firestore index.
 *
 * Production availability must be backed by source-controlled evidence that
 * the index has been deployed to the pinned production project and verified
 * READY. This value deliberately cannot come from a Vite environment variable:
 * flipping it requires a reviewed source change after the separate production
 * index deployment/verification gate has succeeded.
 */
export function isWeeklyTrainingSavedDraftReadAvailable(
  evidence: WeeklyTrainingSavedDraftReadCapabilityEvidence,
): boolean {
  return evidence.dev === true || evidence.productionIndexVerified === true;
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

/**
 * IMPORTANT: keep false until an explicitly authorized production operation
 * has deployed `firestore.indexes.json` to project `futverse-d7872`, the target
 * index reports READY, and a read-only production verification has succeeded.
 * Enabling it is a separate reviewed source change; never derive it from env.
 */
export const PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = false as const;

export const WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE =
  isWeeklyTrainingSavedDraftReadAvailable({
    dev: readViteDevMode(),
    productionIndexVerified:
      PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED,
  });

export const SPARK_FUNCTION_BACKED_WEB_UNAVAILABLE_MESSAGE =
  "This server-backed action is unavailable in the Spark production web app. Use the reviewed trusted-local operator path where available.";

export const WEEKLY_TRAINING_SAVED_DRAFT_READ_UNAVAILABLE_MESSAGE =
  "Saved Weekly Training DRAFT history will be enabled after its required Firestore index is deployed and verified in production.";
