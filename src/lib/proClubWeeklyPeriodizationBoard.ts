import type { WeeklyTrainingSavedDraftDetail } from "./proClubWeeklyTrainingSavedDraftReadModel";

type CanonicalWeeklyTrainingDraft = WeeklyTrainingSavedDraftDetail["draft"];
type CanonicalWeeklyTrainingSession = CanonicalWeeklyTrainingDraft["sessions"][number];
type CanonicalWeeklyTrainingBlock = CanonicalWeeklyTrainingSession["blocks"][number];

export type ProClubWeeklyPeriodizationDayOfWeek =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

export interface ProClubWeeklyPeriodizationBoardBlock {
  readonly blockType: CanonicalWeeklyTrainingBlock["blockType"];
  readonly title: string;
  readonly durationMinutes: number;
  readonly drillReference?: string;
  readonly coachingPoints: readonly string[];
}

export interface ProClubWeeklyPeriodizationBoardSession {
  readonly sessionDate: string;
  readonly dayOfWeek: ProClubWeeklyPeriodizationDayOfWeek;
  readonly startTime: string;
  readonly location: string;
  readonly objective: string;
  readonly phaseOfPlay: CanonicalWeeklyTrainingSession["phaseOfPlay"];
  readonly plannedLoad: CanonicalWeeklyTrainingSession["plannedLoad"];
  readonly durationMinutes: number;
  readonly blocks: readonly ProClubWeeklyPeriodizationBoardBlock[];
}

export interface ProClubWeeklyPeriodizationBoard {
  readonly weekStartDate: string;
  readonly squadLabel: string;
  readonly mainObjective: string;
  readonly secondaryObjective?: string;
  readonly sessions: readonly ProClubWeeklyPeriodizationBoardSession[];
}

const DAY_OF_WEEK_BY_UTC_INDEX = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const satisfies readonly ProClubWeeklyPeriodizationDayOfWeek[];

function deriveDayOfWeek(
  sessionDate: CanonicalWeeklyTrainingSession["sessionDate"],
): ProClubWeeklyPeriodizationDayOfWeek {
  const [year, month, day] = sessionDate.split("-").map(Number);
  return DAY_OF_WEEK_BY_UTC_INDEX[
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
}

function deriveBlock(
  block: CanonicalWeeklyTrainingBlock,
): ProClubWeeklyPeriodizationBoardBlock {
  return {
    blockType: block.blockType,
    title: block.title,
    durationMinutes: block.durationMinutes,
    ...(block.drillReference !== undefined
      ? { drillReference: block.drillReference }
      : {}),
    coachingPoints: [...block.coachingPoints],
  };
}

function deriveSession(
  session: CanonicalWeeklyTrainingSession,
): ProClubWeeklyPeriodizationBoardSession {
  return {
    sessionDate: session.sessionDate,
    dayOfWeek: deriveDayOfWeek(session.sessionDate),
    startTime: session.startTime,
    location: session.location,
    objective: session.objective,
    phaseOfPlay: session.phaseOfPlay,
    plannedLoad: session.plannedLoad,
    durationMinutes: session.durationMinutes,
    blocks: session.blocks.map(deriveBlock),
  };
}

export function deriveProClubWeeklyPeriodizationBoard(
  draft: WeeklyTrainingSavedDraftDetail["draft"],
): ProClubWeeklyPeriodizationBoard {
  return {
    weekStartDate: draft.weekStartDate,
    squadLabel: draft.squadLabel,
    mainObjective: draft.mainObjective,
    ...(draft.secondaryObjective !== undefined
      ? { secondaryObjective: draft.secondaryObjective }
      : {}),
    sessions: draft.sessions.map(deriveSession),
  };
}
