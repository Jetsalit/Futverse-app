import { isValidDocumentIdentifier } from "../proClubModel";
import {
  parseProClubWeeklyTrainingDraft,
  type ProClubTrainingSessionDraft,
} from "../proClubWeeklyTraining";

export const PRO_CLUB_WEEKLY_TRAINING_SCHEMA_VERSION = 1 as const;

export interface ProClubWeeklyTrainingDraftWritePayload {
  readonly schemaVersion: 1;
  readonly authorUid: string;
  readonly status: "DRAFT";
  readonly weekStartDate: string;
  readonly squadLabel: string;
  readonly mainObjective: string;
  readonly secondaryObjective?: string;
  readonly headCoachNote?: string;
  readonly sessions: readonly ProClubTrainingSessionDraft[];
}

export type ProClubWeeklyTrainingPersistenceBuildResult =
  | {
      readonly state: "VALID";
      readonly clubId: string;
      readonly planId: string;
      readonly payload: ProClubWeeklyTrainingDraftWritePayload;
    }
  | {
      readonly state: "INVALID";
      readonly reason: "INVALID_CLUB_ID" | "INVALID_PLAN_ID" | "INVALID_PLAN";
    };

export function proClubTechnicalGovernanceCurrentPath(clubId: unknown): string | null {
  if (!isValidDocumentIdentifier(clubId)) return null;
  return `proClubs/${clubId}/technicalGovernance/current`;
}

export function proClubWeeklyTrainingPlanPath(
  clubId: unknown,
  planId: unknown,
): string | null {
  if (!isValidDocumentIdentifier(clubId)) return null;
  if (!isValidDocumentIdentifier(planId)) return null;
  return `proClubs/${clubId}/weeklyTrainingPlans/${planId}`;
}

export function buildProClubWeeklyTrainingDraftWrite(input: {
  readonly clubId: unknown;
  readonly planId: unknown;
  readonly plan: unknown;
}): ProClubWeeklyTrainingPersistenceBuildResult {
  if (!isValidDocumentIdentifier(input.clubId)) {
    return { state: "INVALID", reason: "INVALID_CLUB_ID" };
  }
  if (!isValidDocumentIdentifier(input.planId)) {
    return { state: "INVALID", reason: "INVALID_PLAN_ID" };
  }

  const parsed = parseProClubWeeklyTrainingDraft(input.plan);
  if (parsed.state !== "VALID" || parsed.value.clubId !== input.clubId) {
    return { state: "INVALID", reason: "INVALID_PLAN" };
  }

  const plan = parsed.value;
  return {
    state: "VALID",
    clubId: input.clubId,
    planId: input.planId,
    payload: {
      schemaVersion: PRO_CLUB_WEEKLY_TRAINING_SCHEMA_VERSION,
      authorUid: plan.authorUid,
      status: "DRAFT",
      weekStartDate: plan.weekStartDate,
      squadLabel: plan.squadLabel,
      mainObjective: plan.mainObjective,
      ...(plan.secondaryObjective
        ? { secondaryObjective: plan.secondaryObjective }
        : {}),
      ...(plan.headCoachNote ? { headCoachNote: plan.headCoachNote } : {}),
      sessions: plan.sessions,
    },
  };
}
