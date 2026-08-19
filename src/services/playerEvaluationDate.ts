import type {
  LegacyPlayerEvaluationRecord,
} from "./playerEvaluationCompatibility";

interface FirestoreTimestampLike {
  toMillis?: () => unknown;
  toDate?: () => unknown;
}

function validDateMillis(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : value;
}

function normalizeDateValue(
  value: unknown,
): number | null {
  if (value instanceof Date) {
    return validDateMillis(value.getTime());
  }

  if (typeof value === "number") {
    return validDateMillis(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    return validDateMillis(
      Date.parse(trimmed),
    );
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const timestamp =
    value as FirestoreTimestampLike;

  if (
    typeof timestamp.toMillis === "function"
  ) {
    try {
      const millis =
        validDateMillis(timestamp.toMillis());

      if (millis !== null) {
        return millis;
      }
    } catch {
      // Fall through to toDate compatibility.
    }
  }

  if (
    typeof timestamp.toDate === "function"
  ) {
    try {
      const date = timestamp.toDate();

      if (date instanceof Date) {
        return validDateMillis(
          date.getTime(),
        );
      }
    } catch {
      return null;
    }
  }

  return null;
}

function evaluationDateValue(
  evaluation: LegacyPlayerEvaluationRecord,
): unknown {
  // Preserve the legacy field-precedence behavior:
  // evaluation_date wins whenever it is truthy.
  return (
    evaluation.evaluation_date ||
    evaluation.timestamp
  );
}

export function playerEvaluationDateMillis(
  evaluation: LegacyPlayerEvaluationRecord,
): number | null {
  return normalizeDateValue(
    evaluationDateValue(evaluation),
  );
}

export function evaluationDateLabel(
  evaluation: LegacyPlayerEvaluationRecord,
): string {
  const value =
    evaluationDateValue(evaluation);

  // Preserve the existing UI contract for legacy strings.
  // Do not timezone-shift or rewrite their displayed date.
  if (typeof value === "string") {
    if (!value.trim()) {
      return "Date unavailable";
    }

    return value.slice(0, 10);
  }

  const millis =
    normalizeDateValue(value);

  if (millis === null) {
    return "Date unavailable";
  }

  return new Date(millis)
    .toISOString()
    .slice(0, 10);
}

export function comparePlayerEvaluationsNewestFirst(
  left: LegacyPlayerEvaluationRecord,
  right: LegacyPlayerEvaluationRecord,
): number {
  const leftMillis =
    playerEvaluationDateMillis(left);

  const rightMillis =
    playerEvaluationDateMillis(right);

  if (
    leftMillis === null &&
    rightMillis === null
  ) {
    return 0;
  }

  if (leftMillis === null) {
    return 1;
  }

  if (rightMillis === null) {
    return -1;
  }

  return rightMillis - leftMillis;
}
