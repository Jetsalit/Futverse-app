import type {
  ProClubWeeklyPeriodizationBoard,
  ProClubWeeklyPeriodizationDayOfWeek,
} from "../../../lib/proClubWeeklyPeriodizationBoard";

export type WeeklyPlannerSquadScope =
  | "ALL_SQUAD"
  | "STARTERS"
  | "NON_STARTERS"
  | "SELECTED_PLAYERS";

export interface WeeklyPlannerSavedTrainingActivity {
  readonly id: string;
  readonly source: "SAVED_TRAINING";
  readonly activityType: "TRAINING";
  readonly squadScope: "ALL_SQUAD";
  readonly session: ProClubWeeklyPeriodizationBoard["sessions"][number];
}

export interface WeeklyPlannerLocalTrainingActivity {
  readonly id: string;
  readonly source: "LOCAL_UI";
  readonly activityType: "TRAINING";
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly title: string;
  readonly focus: string;
  readonly location: string;
  readonly plannedLoad: "LOW" | "MODERATE" | "HIGH";
  readonly squadScope: WeeklyPlannerSquadScope;
}

export interface WeeklyPlannerRecoveryActivity {
  readonly id: string;
  readonly source: "LOCAL_UI";
  readonly activityType: "RECOVERY";
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly focus: string;
  readonly location: string;
  readonly squadScope: WeeklyPlannerSquadScope;
}

export interface WeeklyPlannerMatchActivity {
  readonly id: string;
  readonly source: "LOCAL_UI";
  readonly activityType: "MATCH";
  readonly kickoffTime: string;
  readonly competition: string;
  readonly competitionCategory:
    | "LEAGUE"
    | "CUP"
    | "FRIENDLY"
    | "TOURNAMENT"
    | "OTHER";
  readonly opponent: string;
  readonly venue: string;
  readonly squadLabel: string;
  readonly squadScope: WeeklyPlannerSquadScope;
}

export type WeeklyPlannerLocalActivity =
  | WeeklyPlannerLocalTrainingActivity
  | WeeklyPlannerRecoveryActivity
  | WeeklyPlannerMatchActivity;

export type WeeklyPlannerActivity =
  | WeeklyPlannerSavedTrainingActivity
  | WeeklyPlannerLocalActivity;

export interface WeeklyPlannerDay {
  readonly date: string;
  readonly dayOfWeek: ProClubWeeklyPeriodizationDayOfWeek;
  readonly rest: boolean;
  readonly activities: readonly WeeklyPlannerActivity[];
}

export interface WeeklyPlannerState {
  readonly weekStartDate: string;
  readonly days: readonly WeeklyPlannerDay[];
}

export interface WeeklyPlannerDaySummary {
  readonly label:
    | "Not set"
    | "Rest Day"
    | "Training Day"
    | "Recovery Day"
    | "Match Day"
    | "Mixed Day";
  readonly detail: string;
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

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, amount: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateOnly(date);
}

function deriveDayOfWeek(date: string): ProClubWeeklyPeriodizationDayOfWeek {
  return DAY_OF_WEEK_BY_UTC_INDEX[parseDateOnly(date).getUTCDay()];
}

function activityTime(activity: WeeklyPlannerActivity): string {
  if (activity.source === "SAVED_TRAINING") return activity.session.startTime;
  if (activity.activityType === "MATCH") return activity.kickoffTime;
  return activity.startTime;
}

function updateDay(
  state: WeeklyPlannerState,
  date: string,
  updater: (day: WeeklyPlannerDay) => WeeklyPlannerDay,
): WeeklyPlannerState {
  return {
    ...state,
    days: state.days.map((day) => (day.date === date ? updater(day) : day)),
  };
}

export function sortWeeklyPlannerActivities<T extends WeeklyPlannerActivity>(
  activities: readonly T[],
): readonly T[] {
  return activities
    .map((activity, index) => ({ activity, index }))
    .sort((left, right) => {
      const timeOrder = activityTime(left.activity).localeCompare(
        activityTime(right.activity),
      );
      return timeOrder === 0 ? left.index - right.index : timeOrder;
    })
    .map(({ activity }) => activity);
}

export function buildWeeklyPlannerState(
  board: ProClubWeeklyPeriodizationBoard,
): WeeklyPlannerState {
  const savedByDate = new Map<string, WeeklyPlannerSavedTrainingActivity[]>();

  board.sessions.forEach((session, originalIndex) => {
    const current = savedByDate.get(session.sessionDate) ?? [];
    current.push({
      id: `saved-training:${session.sessionDate}:${session.startTime}:${originalIndex}`,
      source: "SAVED_TRAINING",
      activityType: "TRAINING",
      squadScope: "ALL_SQUAD",
      session,
    });
    savedByDate.set(session.sessionDate, current);
  });

  return {
    weekStartDate: board.weekStartDate,
    days: Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(board.weekStartDate, offset);
      return {
        date,
        dayOfWeek: deriveDayOfWeek(date),
        rest: false,
        activities: sortWeeklyPlannerActivities(savedByDate.get(date) ?? []),
      };
    }),
  };
}

export function summarizeWeeklyPlannerDay(
  day: WeeklyPlannerDay,
): WeeklyPlannerDaySummary {
  if (day.rest) return { label: "Rest Day", detail: "Rest & recover" };
  if (day.activities.length === 0) {
    return { label: "Not set", detail: "No activity planned" };
  }

  const types = new Set(day.activities.map((activity) => activity.activityType));
  const count = day.activities.length;

  if (types.size > 1) {
    return { label: "Mixed Day", detail: `${count} activities` };
  }
  if (types.has("TRAINING")) {
    return {
      label: "Training Day",
      detail: `${count} ${count === 1 ? "session" : "sessions"}`,
    };
  }
  if (types.has("RECOVERY")) {
    return {
      label: "Recovery Day",
      detail: `${count} ${count === 1 ? "session" : "sessions"}`,
    };
  }
  return {
    label: "Match Day",
    detail: `${count} ${count === 1 ? "match" : "matches"}`,
  };
}

export function addWeeklyPlannerActivity(
  state: WeeklyPlannerState,
  date: string,
  activity: WeeklyPlannerLocalActivity,
): WeeklyPlannerState {
  return updateDay(state, date, (day) => ({
    ...day,
    rest: false,
    activities: sortWeeklyPlannerActivities([...day.activities, activity]),
  }));
}

export function markWeeklyPlannerDayRest(
  state: WeeklyPlannerState,
  date: string,
): WeeklyPlannerState {
  return updateDay(state, date, (day) => {
    if (day.activities.some((activity) => activity.source === "SAVED_TRAINING")) {
      return day;
    }
    return {
      ...day,
      rest: true,
      activities: [],
    };
  });
}

export function clearWeeklyPlannerDayRest(
  state: WeeklyPlannerState,
  date: string,
): WeeklyPlannerState {
  return updateDay(state, date, (day) => ({
    ...day,
    rest: false,
  }));
}

export function removeWeeklyPlannerLocalActivity(
  state: WeeklyPlannerState,
  date: string,
  activityId: string,
): WeeklyPlannerState {
  return updateDay(state, date, (day) => ({
    ...day,
    activities: day.activities.filter(
      (activity) =>
        activity.source !== "LOCAL_UI" || activity.id !== activityId,
    ),
  }));
}
