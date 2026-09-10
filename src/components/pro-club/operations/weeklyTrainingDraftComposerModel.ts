import type {
  ProClubTrainingBlockDraft,
  ProClubTrainingSessionDraft,
} from "../../../lib/proClubWeeklyTraining";

export const MAX_WEEKLY_TRAINING_SESSIONS = 14;
export const MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION = 12;

export function createEmptyTrainingBlock(): ProClubTrainingBlockDraft {
  return {
    blockType: "TACTICAL",
    title: "",
    durationMinutes: 15,
    coachingPoints: [""],
  };
}

export function createEmptyTrainingSession(): ProClubTrainingSessionDraft {
  return {
    sessionDate: "",
    startTime: "",
    location: "",
    objective: "",
    phaseOfPlay: "GENERAL",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    blocks: [createEmptyTrainingBlock()],
  };
}

export function addTrainingSession(
  sessions: readonly ProClubTrainingSessionDraft[],
): readonly ProClubTrainingSessionDraft[] {
  if (sessions.length >= MAX_WEEKLY_TRAINING_SESSIONS) return sessions;
  return [...sessions, createEmptyTrainingSession()];
}

export function removeTrainingSession(
  sessions: readonly ProClubTrainingSessionDraft[],
  index: number,
): readonly ProClubTrainingSessionDraft[] {
  if (sessions.length <= 1 || index < 0 || index >= sessions.length) return sessions;
  return sessions.filter((_, currentIndex) => currentIndex !== index);
}

export function addTrainingBlock(
  session: ProClubTrainingSessionDraft,
): ProClubTrainingSessionDraft {
  if (session.blocks.length >= MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION) return session;
  return { ...session, blocks: [...session.blocks, createEmptyTrainingBlock()] };
}

export function removeTrainingBlock(
  session: ProClubTrainingSessionDraft,
  index: number,
): ProClubTrainingSessionDraft {
  if (session.blocks.length <= 1 || index < 0 || index >= session.blocks.length) return session;
  return {
    ...session,
    blocks: session.blocks.filter((_, currentIndex) => currentIndex !== index),
  };
}

export function expectedWeeklyTrainingDocumentCount(
  sessions: readonly ProClubTrainingSessionDraft[],
): number {
  return 1 + sessions.length + sessions.reduce((sum, session) => sum + session.blocks.length, 0);
}
