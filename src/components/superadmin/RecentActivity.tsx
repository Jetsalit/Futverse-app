import { Activity, Loader2 } from "lucide-react";
import type { DashboardLoadState, RecentActivityItem } from "./dashboardModel";

interface RecentActivityProps {
  activities: readonly RecentActivityItem[];
  loadState: DashboardLoadState;
}

function formatActivityTime(value: unknown): string {
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }
  if (value && typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") return timestamp.toDate().toLocaleString();
    if (typeof timestamp.seconds === "number") return new Date(timestamp.seconds * 1000).toLocaleString();
  }
  return "—";
}

export default function RecentActivity({ activities, loadState }: RecentActivityProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="recent-activity-title">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Activity className="text-emerald-600" size={19} />
        <h2 id="recent-activity-title" className="text-base font-black text-slate-900">Recent Activity</h2>
      </div>

      {loadState === "loading" || loadState === "idle" ? (
        <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-500">
          <Loader2 className="animate-spin" size={18} /> Loading activity…
        </div>
      ) : loadState === "unavailable" ? (
        <div className="px-5 py-12 text-center text-sm text-slate-500">Activity history is currently unavailable.</div>
      ) : activities.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-slate-500">No activity history available yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Actor</th>
                <th className="px-5 py-3">Target</th>
                <th className="px-5 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activities.map((activity) => (
                <tr key={activity.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-bold capitalize text-slate-800">{activity.action}</td>
                  <td className="px-5 py-3 text-slate-600">{activity.actor}</td>
                  <td className="px-5 py-3 text-slate-600">{activity.target}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{formatActivityTime(activity.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
