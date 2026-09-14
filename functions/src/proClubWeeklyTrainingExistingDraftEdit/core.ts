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

export interface ValidatedWeeklyTrainingExistingDraftEditInput {
  readonly planId: string;
  readonly expectedPlanUpdatedAt: string;
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

export function canonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const millis = Date.parse(value);
  return !Number.isNaN(millis) && new Date(millis).toISOString() === value;
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
  if (!canonicalIsoTimestamp(input.expectedPlanUpdatedAt)) {
    throw new WeeklyTrainingExistingDraftEditError(
      "INVALID_ARGUMENT",
      "Canonical expected plan update timestamp required.",
    );
  }

  try {
    return {
      planId: input.planId,
      expectedPlanUpdatedAt: input.expectedPlanUpdatedAt,
      draft: validateWeeklyTrainingDraft(input.draft),
    };
  } catch (error) {
    if (error instanceof WeeklyTrainingDraftSaveError) {
      throw new WeeklyTrainingExistingDraftEditError(error.code, error.message);
    }
    throw error;
  }
}
