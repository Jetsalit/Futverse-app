export interface RuntimeCapabilityEnvironment {
  readonly dev?: boolean;
}

export interface WeeklyTrainingSavedDraftReadCapabilityEvidence {
  readonly dev?: boolean;
  readonly productionIndexVerified?: boolean;
}

export interface WeeklyTrainingFreshDraftProductionCapabilityEvidence {
  readonly productionRulesVerified?: boolean;
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
 * READY. This value deliberately cannot come from a Vite/Node environment
 * variable: flipping it requires a reviewed source change after the separate
 * production index deployment/verification gate has succeeded.
 */
export function isWeeklyTrainingSavedDraftReadAvailable(
  evidence: WeeklyTrainingSavedDraftReadCapabilityEvidence,
): boolean {
  return evidence.dev === true || evidence.productionIndexVerified === true;
}

/**
 * Fresh-DRAFT browser persistence is intentionally a dedicated production
 * capability. It must never inherit the generic Function-backed capability and
 * it must never be controlled by an environment variable. The only production
 * activation input is reviewed, source-controlled evidence that the exact
 * schema-v2 Firestore Rules have been deployed and independently verified.
 */
export function isWeeklyTrainingFreshDraftProductionAvailable(
  evidence: WeeklyTrainingFreshDraftProductionCapabilityEvidence,
): boolean {
  return evidence.productionRulesVerified === true;
}

/**
 * Vite injects `import.meta.hot` only while a module is served by the dev
 * server. It is not a build-mode flag and is unavailable in deployable build
 * output, even when a build process inherits NODE_ENV=development or uses a
 * non-production Vite mode. Use this serve-only signal for local/emulator UI
 * exceptions so every `vite build` remains fail-closed by construction.
 */
function readViteDevServerRuntime(): boolean {
  return (
    import.meta as ImportMeta & {
      readonly hot?: unknown;
    }
  ).hot !== undefined;
}

/**
 * Spark-first hard boundary.
 *
 * Function-backed Pro Club browser operations are allowed only while served by
 * the Vite dev server (for local/emulator development). Every production build
 * is fail-closed and cannot be re-enabled by NODE_ENV, Vite mode, or another
 * environment variable while FutVerse remains on Spark. A future post-revenue
 * server rollout requires a reviewed source change rather than an accidental
 * production environment toggle.
 */
export const FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE =
  isFunctionBackedProClubWebAvailable({ dev: readViteDevServerRuntime() });

/**
 * Production activation evidence:
 * - reviewed composite index deployed to project `futverse-d7872`;
 * - index `CICAgOjXh4EK` verified READY with the exact reviewed field/order contract;
 * - independent read-only production StructuredQuery verification succeeded;
 * - no production documents were created, updated, or deleted by verification.
 *
 * This remains source-controlled and must never be derived from environment
 * variables. Any future rollback must be a reviewed source change.
 */
export const PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = true as const;

export const WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE =
  isWeeklyTrainingSavedDraftReadAvailable({
    dev: readViteDevServerRuntime(),
    productionIndexVerified:
      PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED,
  });

/**
 * Production activation evidence:
 * - exact reviewed schema-v2 Firestore Rules are deployed to `futverse-d7872`;
 * - deployed Rules Git blob exactly matches the independently reviewed Git blob;
 * - read-only production acceptance passed;
 * - no Rules redeploy or production document write belongs to this activation PR.
 *
 * This source-controlled capability is dedicated only to Weekly Training
 * fresh-DRAFT creation. Generic Function-backed Pro Club production remains unchanged.
 */
export const PRODUCTION_WEEKLY_TRAINING_FRESH_DRAFT_RULES_VERIFIED = true as const;

export const PRO_CLUB_WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_AVAILABLE =
  isWeeklyTrainingFreshDraftProductionAvailable({
    productionRulesVerified:
      PRODUCTION_WEEKLY_TRAINING_FRESH_DRAFT_RULES_VERIFIED,
  });

export const SPARK_FUNCTION_BACKED_WEB_UNAVAILABLE_MESSAGE =
  "This server-backed action is unavailable in the Spark production web app. Use the reviewed trusted-local operator path where available.";

export const WEEKLY_TRAINING_SAVED_DRAFT_READ_UNAVAILABLE_MESSAGE =
  "Saved Weekly Training DRAFT history will be enabled after its required Firestore index is deployed and verified in production.";

export const WEEKLY_TRAINING_FRESH_DRAFT_PRODUCTION_UNAVAILABLE_MESSAGE =
  "Fresh Weekly Training DRAFT saving will be enabled only after the exact schema-v2 Firestore Rules are deployed and independently verified in production.";
