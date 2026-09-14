import {
  validateWeeklyTrainingDraft,
  WeeklyTrainingDraftSaveError,
  type ValidatedWeeklyTrainingDraft,
} from "../proClubWeeklyTrainingDraftSave/core.ts";

export class WeeklyTrainingExistingDraftEditError extends Error {
  constructor(
    readonly code:
      | "INVALID_ARGUMENT"
      | "PERMISSION_DENIED"
      | "FAILED_PRECONDITION"
      | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "WeeklyTrainingExistingDraftEditError";
  }
}

export interface WeeklyTrainingExistingDraftEditTimestampToken {
  readonly seconds: number;
  readonly nanoseconds: number;
}

export interface ValidatedWeeklyTrainingExistingDraftEditInput {
  readonly planId: string;
  readonly expectedPlanUpdatedAt: WeeklyTrainingExistingDraftEditTimestampToken;
  readonly draft: ValidatedWeeklyTrainingDraft;
}

export function exactWeeklyTrainingDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

export function exactWeeklyTrainingTimestampToken(
  value: unknown,
): value is WeeklyTrainingExistingDraftEditTimestampToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  const keys = Object.keys(raw).sort();
  if (keys.length !== 2 || keys[0] !== "nanoseconds" || keys[1] !== "seconds") return false;
  return (
    Number.isSafeInteger(raw.seconds) &&
    Number.isInteger(raw.nanoseconds) &&
    (raw.nanoseconds as number) >= 0 &&
    (raw.nanoseconds as number) <= 999_999_999
  );
}

export function validateWeeklyTrainingExistingDraftEditInput(value: unknown):
  ValidatedWeeklyTrainingExistingDraftEditInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WeeklyTrainingExistingDraftEditError(
      "INVALID_ARGUMENT",
      "Invalid Existing-DRAFT edit request.",
    );
  }

  const input = value as Record<string, unknown>;
  const allowed = new Set(["planId", "expectedPlanUpdatedAt", "draft"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new WeeklyTrainingExistingDraftEditError(
      "INVALID_ARGUMENT",
      "Non-canonical Existing-DRAFT edit request field.",
    );
  }

  if (!exactWeeklyTrainingDocumentId(input.planId)) {
    throw new WeeklyTrainingExistingDraftEditError(
      "INVALID_ARGUMENT",
      "Canonical plan ID required.",
    );
  }
  if (!exactWeeklyTrainingTimestampToken(input.expectedPlanUpdatedAt)) {
    throw new WeeklyTrainingExistingDraftEditError(
      "INVALID_ARGUMENT",
      "Exact expected plan update timestamp required.",
    );
  }

  try {
    return {
      planId: input.planId,
      expectedPlanUpdatedAt: {
        seconds: input.expectedPlanUpdatedAt.seconds,
        nanoseconds: input.expectedPlanUpdatedAt.nanoseconds,
      },
      draft: validateWeeklyTrainingDraft(input.draft),
    };
  } catch (error) {
    if (error instanceof WeeklyTrainingDraftSaveError) {
      throw new WeeklyTrainingExistingDraftEditError(error.code, error.message);
    }
    throw error;
  }
}
