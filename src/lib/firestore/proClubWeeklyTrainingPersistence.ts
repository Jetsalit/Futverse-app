import { isValidDocumentIdentifier } from "../proClubModel";
import {
  parseProClubWeeklyTrainingDraft,
  type ProClubTrainingBlockDraft,
  type ProClubTrainingSessionDraft,
} from "../proClubWeeklyTraining";

export const PRO_CLUB_WEEKLY_TRAINING_SCHEMA_VERSION = 1 as const;

export interface ProClubWeeklyTrainingDraftPlanPayload {
  readonly schemaVersion: 1;
  readonly authorUid: string;
  readonly status: "DRAFT";
  readonly weekStartDate: string;
  readonly squadLabel: string;
  readonly mainObjective: string;
  readonly secondaryObjective?: string;
  readonly headCoachNote?: string;
}

export interface ProClubWeeklyTrainingDraftSessionPayload {
  readonly schemaVersion: 1;
  readonly orderIndex: number;
  readonly sessionDate: string;
  readonly startTime: string;
  readonly location: string;
  readonly objective: string;
  readonly phaseOfPlay: ProClubTrainingSessionDraft["phaseOfPlay"];
  readonly plannedLoad: ProClubTrainingSessionDraft["plannedLoad"];
  readonly durationMinutes: number;
}

export interface ProClubWeeklyTrainingDraftBlockPayload {
  readonly schemaVersion: 1;
  readonly orderIndex: number;
  readonly blockType: ProClubTrainingBlockDraft["blockType"];
  readonly title: string;
  readonly durationMinutes: number;
  readonly drillReference?: string;
  readonly coachingPoints: readonly string[];
}

export interface ProClubWeeklyTrainingDraftBlockWrite {
  readonly blockId: string;
  readonly path: string;
  readonly payload: ProClubWeeklyTrainingDraftBlockPayload;
}

export interface ProClubWeeklyTrainingDraftSessionWrite {
  readonly sessionId: string;
  readonly path: string;
  readonly payload: ProClubWeeklyTrainingDraftSessionPayload;
  readonly blocks: readonly ProClubWeeklyTrainingDraftBlockWrite[];
}

export interface ProClubWeeklyTrainingDraftPersistenceBundle {
  readonly planPath: string;
  readonly planPayload: ProClubWeeklyTrainingDraftPlanPayload;
  readonly sessions: readonly ProClubWeeklyTrainingDraftSessionWrite[];
}

export type ProClubWeeklyTrainingPersistenceBuildResult =
  | {
      readonly state: "VALID";
      readonly clubId: string;
      readonly planId: string;
      readonly bundle: ProClubWeeklyTrainingDraftPersistenceBundle;
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

export function proClubWeeklyTrainingSessionPath(
  clubId: unknown,
  planId: unknown,
  sessionId: unknown,
): string | null {
  const planPath = proClubWeeklyTrainingPlanPath(clubId, planId);
  if (!planPath || !isValidDocumentIdentifier(sessionId)) return null;
  return `${planPath}/sessions/${sessionId}`;
}

export function proClubWeeklyTrainingBlockPath(
  clubId: unknown,
  planId: unknown,
  sessionId: unknown,
  blockId: unknown,
): string | null {
  const sessionPath = proClubWeeklyTrainingSessionPath(clubId, planId, sessionId);
  if (!sessionPath || !isValidDocumentIdentifier(blockId)) return null;
  return `${sessionPath}/blocks/${blockId}`;
}

function sessionDocumentId(session: ProClubTrainingSessionDraft): string {
  return `${session.sessionDate}-${session.startTime.replace(":", "")}`;
}

function blockDocumentId(index: number): string {
  return `block-${String(index + 1).padStart(2, "0")}`;
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
  const planPath = proClubWeeklyTrainingPlanPath(input.clubId, input.planId);
  if (!planPath) return { state: "INVALID", reason: "INVALID_PLAN" };

  const sessions = plan.sessions.map((session, sessionIndex) => {
    const sessionId = sessionDocumentId(session);
    const sessionPath = proClubWeeklyTrainingSessionPath(
      input.clubId,
      input.planId,
      sessionId,
    );
    if (!sessionPath) throw new Error("Validated session produced an invalid path.");

    const blocks = session.blocks.map((block, blockIndex) => {
      const blockId = blockDocumentId(blockIndex);
      const blockPath = proClubWeeklyTrainingBlockPath(
        input.clubId,
        input.planId,
        sessionId,
        blockId,
      );
      if (!blockPath) throw new Error("Validated block produced an invalid path.");

      return {
        blockId,
        path: blockPath,
        payload: {
          schemaVersion: PRO_CLUB_WEEKLY_TRAINING_SCHEMA_VERSION,
          orderIndex: blockIndex,
          blockType: block.blockType,
          title: block.title,
          durationMinutes: block.durationMinutes,
          ...(block.drillReference ? { drillReference: block.drillReference } : {}),
          coachingPoints: block.coachingPoints,
        },
      } satisfies ProClubWeeklyTrainingDraftBlockWrite;
    });

    return {
      sessionId,
      path: sessionPath,
      payload: {
        schemaVersion: PRO_CLUB_WEEKLY_TRAINING_SCHEMA_VERSION,
        orderIndex: sessionIndex,
        sessionDate: session.sessionDate,
        startTime: session.startTime,
        location: session.location,
        objective: session.objective,
        phaseOfPlay: session.phaseOfPlay,
        plannedLoad: session.plannedLoad,
        durationMinutes: session.durationMinutes,
      },
      blocks,
    } satisfies ProClubWeeklyTrainingDraftSessionWrite;
  });

  return {
    state: "VALID",
    clubId: input.clubId,
    planId: input.planId,
    bundle: {
      planPath,
      planPayload: {
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
      },
      sessions,
    },
  };
}
