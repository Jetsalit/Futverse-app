export interface LegacyPlayerEvaluationRecord {
  id: string;
  sourceCollectionPath: string;
  player_id?: string | null;
  academy_id?: string | null;
  coach_id?: string | null;
  evaluation_date?: string | null;
  scores?: Record<string, unknown> | null;
  timestamp?: unknown;
}

export interface LegacyEvaluationCriterionRecord {
  id: string;
  sourceCollectionPath: string;
  criteria_name?: string | null;
  category?: string | null;
  academy_id?: string | null;
  status?: string | null;
}

export interface AcademyEvaluationPartition<
  T extends LegacyPlayerEvaluationRecord = LegacyPlayerEvaluationRecord,
> {
  all: T[];
  resolved: T[];
  orphans: T[];
}

function requireDocumentIdSegment(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed.includes("/")) {
    throw new Error(`${label} must be a single Firestore document ID segment.`);
  }

  return trimmed;
}

export function getAcademyPlayerEvaluationsPath(academyId: string): string {
  const safeAcademyId = requireDocumentIdSegment(academyId, "academyId");
  return `academies/${safeAcademyId}/player_evaluations`;
}

export function getAcademyEvaluationCriteriaPath(academyId: string): string {
  const safeAcademyId = requireDocumentIdSegment(academyId, "academyId");
  return `academies/${safeAcademyId}/evaluation_criteria`;
}

export const SUPERADMIN_EVALUATION_CRITERIA_PATH =
  "academies/superadmin_system/evaluation_criteria";

export const TOP_LEVEL_EVALUATION_CRITERIA_PATH = "evaluation_criteria";

/**
 * Legacy academy_id is intentionally NOT used as tenant authority.
 *
 * Historical FutVerse records may contain academy_id === "" even though the
 * document is correctly stored under an Academy-scoped collection path.
 *
 * The Firestore collection path is therefore authoritative for compatibility
 * reads. Records are never deduplicated or rewritten here.
 */
export function partitionAcademyPlayerEvaluations<
  T extends LegacyPlayerEvaluationRecord,
>(
  academyId: string,
  records: readonly T[],
  knownPlayerIds: Iterable<string>,
): AcademyEvaluationPartition<T> {
  const academyPath = getAcademyPlayerEvaluationsPath(academyId);
  const knownPlayers = new Set(knownPlayerIds);

  const all = records.filter(
    (record) => record.sourceCollectionPath === academyPath,
  );

  const resolved: T[] = [];
  const orphans: T[] = [];

  for (const record of all) {
    if (
      typeof record.player_id === "string" &&
      record.player_id.length > 0 &&
      knownPlayers.has(record.player_id)
    ) {
      resolved.push(record);
    } else {
      orphans.push(record);
    }
  }

  return {
    all: [...all],
    resolved,
    orphans,
  };
}

function normalizeCriterionText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getCriterionLogicalKey(
  record: LegacyEvaluationCriterionRecord,
): string | null {
  const name = normalizeCriterionText(record.criteria_name);

  // Missing names are not safe to deduplicate automatically.
  if (!name) {
    return null;
  }

  const category = normalizeCriterionText(record.category);
  return `${name}\u0000${category}`;
}

/**
 * Criteria compatibility precedence for UI only:
 *
 *   Academy-specific > superadmin_system > top-level legacy
 *
 * Original Firestore documents remain untouched. Only the returned UI view is
 * deduplicated by normalized criteria_name + category.
 */
export function selectEvaluationCriteriaForUi<
  T extends LegacyEvaluationCriterionRecord,
>(
  academyId: string,
  records: readonly T[],
): T[] {
  const academyPath = getAcademyEvaluationCriteriaPath(academyId);

  const sourceOrder = [
    academyPath,
    SUPERADMIN_EVALUATION_CRITERIA_PATH,
    TOP_LEVEL_EVALUATION_CRITERIA_PATH,
  ];

  const selected: T[] = [];
  const seenLogicalKeys = new Set<string>();

  for (const sourcePath of sourceOrder) {
    for (const record of records) {
      if (record.sourceCollectionPath !== sourcePath) {
        continue;
      }

      const logicalKey = getCriterionLogicalKey(record);

      if (logicalKey && seenLogicalKeys.has(logicalKey)) {
        continue;
      }

      if (logicalKey) {
        seenLogicalKeys.add(logicalKey);
      }

      selected.push(record);
    }
  }

  return selected;
}