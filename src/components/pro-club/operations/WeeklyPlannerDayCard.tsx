import WeeklyPlannerActivityCard from "./WeeklyPlannerActivityCard";
import {
  sortWeeklyPlannerActivities,
  summarizeWeeklyPlannerDay,
  type WeeklyPlannerDay,
  type WeeklyPlannerLocalActivity,
} from "./weeklyPlannerUiModel";

const shortDay: Record<WeeklyPlannerDay["dayOfWeek"], string> = {
  MONDAY: "MON",
  TUESDAY: "TUE",
  WEDNESDAY: "WED",
  THURSDAY: "THU",
  FRIDAY: "FRI",
  SATURDAY: "SAT",
  SUNDAY: "SUN",
};

function displayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day))
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

export default function WeeklyPlannerDayCard({
  day,
  onAddActivity,
  onMarkRest,
  onClearRest,
  onRemoveLocalActivity,
}: {
  day: WeeklyPlannerDay;
  onAddActivity: (date: string, activity?: WeeklyPlannerLocalActivity) => void;
  onMarkRest: (date: string) => void;
  onClearRest: (date: string) => void;
  onRemoveLocalActivity: (date: string, activityId: string) => void;
}) {
  const summary = summarizeWeeklyPlannerDay(day);
  const activities = sortWeeklyPlannerActivities(day.activities);

  return (
    <article
      data-weekly-planner-day={day.date}
      className="flex min-h-[30rem] min-w-[15rem] max-w-[17rem] flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900/80 shadow-lg shadow-black/10"
    >
      <header className="border-b border-slate-800 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black tracking-[0.16em] text-white">
              {shortDay[day.dayOfWeek]}
            </p>
            <time
              dateTime={day.date}
              className="mt-1 block text-[11px] font-semibold tracking-[0.08em] text-slate-500"
            >
              {displayDate(day.date)}
            </time>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-300">
            {summary.label}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500">{summary.detail}</p>
      </header>

      <div className="flex-1 space-y-3 p-3">
        {day.rest ? (
          <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
            <p className="text-sm font-black text-emerald-200">Rest Day</p>
            <p className="mt-1 text-xs text-slate-500">Rest & recover</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center">
            <p className="text-sm font-bold text-slate-400">Not set</p>
            <p className="mt-1 text-xs text-slate-600">No activity planned</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div key={activity.id} className="space-y-1">
              <WeeklyPlannerActivityCard activity={activity} />
              {activity.source === "LOCAL_UI" && (
                <button
                  type="button"
                  onClick={() => onRemoveLocalActivity(day.date, activity.id)}
                  className="w-full rounded-lg px-2 py-1.5 text-[10px] font-bold text-rose-300 hover:bg-rose-500/10"
                >
                  Remove activity
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <footer className="border-t border-slate-800 p-3">
        {day.rest ? (
          <button
            type="button"
            onClick={() => onClearRest(day.date)}
            className="w-full rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-200"
          >
            Clear Rest
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAddActivity(day.date)}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-100"
            >
              + Add Activity
            </button>
            <button
              type="button"
              onClick={() => onMarkRest(day.date)}
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-black text-slate-300"
            >
              Rest
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}
