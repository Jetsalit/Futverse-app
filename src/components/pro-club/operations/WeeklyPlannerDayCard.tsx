import WeeklyPlannerActivityCard from "./WeeklyPlannerActivityCard";
import {
  sortWeeklyPlannerActivities,
  summarizeWeeklyPlannerDay,
  type WeeklyPlannerDay,
} from "./weeklyPlannerUiModel";

function formatPlannerDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day))
    .toLocaleDateString(undefined, {
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
  onAddActivity: (date: string) => void;
  onMarkRest: (date: string) => void;
  onClearRest: (date: string) => void;
  onRemoveLocalActivity: (date: string, activityId: string) => void;
}) {
  const summary = summarizeWeeklyPlannerDay(day);
  const sortedActivities = sortWeeklyPlannerActivities(day.activities);

  return (
    <section
      data-weekly-planner-day={day.date}
      className="flex min-h-[34rem] min-w-[16rem] max-w-[16rem] flex-col rounded-2xl border border-slate-800 bg-slate-900/75 p-3 shadow-lg shadow-slate-950/20"
    >
      <header className="border-b border-slate-800 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-black tracking-[0.08em] text-white">
              {day.dayOfWeek.slice(0, 3)}
            </p>
            <time
              dateTime={day.date}
              className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
            >
              {formatPlannerDate(day.date)}
            </time>
          </div>
          <span className="rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
            {summary.label}
          </span>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-slate-500">{summary.detail}</p>
      </header>

      <div className="mt-3 flex flex-1 flex-col gap-3">
        {day.rest ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
            <div>
              <p className="text-sm font-black text-emerald-200">Rest Day</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">No football activity planned.</p>
            </div>
          </div>
        ) : sortedActivities.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/30 p-5 text-center">
            <div>
              <p className="text-sm font-black text-slate-400">Not set</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">Add training, recovery or match activity.</p>
            </div>
          </div>
        ) : (
          sortedActivities.map((activity) => (
            <div key={activity.id} className="space-y-1.5">
              <WeeklyPlannerActivityCard activity={activity} />
              {activity.source === "LOCAL_UI" && (
                <button
                  type="button"
                  onClick={() => onRemoveLocalActivity(day.date, activity.id)}
                  className="w-full rounded-lg border border-rose-500/20 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-rose-300 transition hover:bg-rose-500/10"
                >
                  Remove activity
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <footer className="mt-3 border-t border-slate-800 pt-3">
        {day.rest ? (
          <button
            type="button"
            onClick={() => onClearRest(day.date)}
            className="w-full rounded-xl border border-emerald-400/30 bg-emerald-400/5 px-3 py-2.5 text-xs font-black text-emerald-200 transition hover:bg-emerald-400/10"
          >
            Clear Rest
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAddActivity(day.date)}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-3 py-2.5 text-xs font-black text-cyan-200 transition hover:bg-cyan-400/10"
            >
              + Add Activity
            </button>
            <button
              type="button"
              onClick={() => onMarkRest(day.date)}
              className="rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-black text-slate-400 transition hover:bg-slate-800"
            >
              Rest
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
