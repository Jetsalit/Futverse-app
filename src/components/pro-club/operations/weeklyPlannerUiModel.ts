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

const MONDAY_TO_SUNDAY = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const satisfies readonly ProClubWeeklyPeriodizationDayOfWeek[];

function dateOnlyTimestamp(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function isoDateFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function activityTime(activity: WeeklyPlannerActivity): string {
  if (activity.source === "SAVED_TRAINING") return activity.session.startTime;
  if (activity.activityType === "MATCH") return activity.kickoffTime;
  return activity.startTime;
}

export function sortWeeklyPlannerActivities(
  activities: readonly WeeklyPlannerActivity[],
): readonly WeeklyPlannerActivity[] {
  return activities
    .map((activity, index) => ({ activity, index }))
    .sort((left, right) => {
      const timeComparison = activityTime(left.activity).localeCompare(
        activityTime(right.activity),
      );
      return timeComparison !== 0 ? timeComparison : left.index - right.index;
    })
    .map(({ activity }) => activity);
}

export function buildWeeklyPlannerState(
  board: ProClubWeeklyPeriodizationBoard,
): WeeklyPlannerState {
  const weekStartTimestamp = dateOnlyTimestamp(board.weekStartDate);
  const days = MONDAY_TO_SUNDAY.map((dayOfWeek, dayOffset) => {
    const date = isoDateFromTimestamp(weekStartTimestamp + dayOffset * 86_400_000);
    const activities = board.sessions
      .map((session, originalIndex) => ({ session, originalIndex }))
      .filter(({ session }) => session.sessionDate === date)
      .map<WeeklyPlannerSavedTrainingActivity>(({ session, originalIndex }) => ({
        id: `saved-training:${session.sessionDate}:${session.startTime}:${originalIndex}`,
        source: "SAVED_TRAINING",
        activityType: "TRAINING",
        squadScope: "ALL_SQUAD",
        session,
      }));

    return {
      date,
      dayOfWeek,
      rest: false,
      activities: sortWeeklyPlannerActivities(activities),
    } satisfies WeeklyPlannerDay;
  });

  return {
    weekStartDate: board.weekStartDate,
    days,
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
  return {
    ...state,
    days: state.days.map((day) =>
      day.date === date
        ? {
            ...day,
            rest: false,
            activities: sortWeeklyPlannerActivities([...day.activities, activity]),
          }
        : day,
    ),
  };
}

export function markWeeklyPlannerDayRest(
  state: WeeklyPlannerState,
  date: string,
): WeeklyPlannerState {
  return {
    ...state,
    days: state.days.map((day) =>
      day.date === date
        ? {
            ...day,
            rest: true,
            activities: [],
          }
        : day,
    ),
  };
}

export function clearWeeklyPlannerDayRest(
  state: WeeklyPlannerState,
  date: string,
): WeeklyPlannerState {
  return {
    ...state,
    days: state.days.map((day) =>
      day.date === date
        ? {
            ...day,
            rest: false,
          }
        : day,
    ),
  };
}

export function removeWeeklyPlannerLocalActivity(
  state: WeeklyPlannerState,
  date: string,
  activityId: string,
): WeeklyPlannerState {
  return {
    ...state,
    days: state.days.map((day) =>
      day.date === date
        ? {
            ...day,
            activities: day.activities.filter(
              (activity) =>
                activity.source !== "LOCAL_UI" || activity.id !== activityId,
            ),
          }
        : day,
    ),
  };
}
