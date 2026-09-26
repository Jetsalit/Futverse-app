import { Clock, MapPin, Users } from "lucide-react";

import type {
  WeeklyPlannerActivity,
  WeeklyPlannerSquadScope,
} from "./weeklyPlannerUiModel";
import { formatThaiTime } from "../../../lib/thaiDateTimePresentation";

const squadScopeLabel: Record<WeeklyPlannerSquadScope, string> = {
  ALL_SQUAD: "All squad",
  STARTERS: "Starters",
  NON_STARTERS: "Non-starters",
  SELECTED_PLAYERS: "Selected players",
};

const matchCategoryLabel = {
  LEAGUE: "League Match",
  CUP: "Cup Match",
  FRIENDLY: "Friendly Match",
  TOURNAMENT: "Tournament Match",
  OTHER: "Match",
} as const;

const loadPercent = {
  LOW: 33,
  MODERATE: 66,
  HIGH: 100,
} as const;

const LOAD_VISUALS = {
  LOW: {
    labelClass: "text-emerald-300",
    meterClass: "bg-emerald-400",
  },
  MODERATE: {
    labelClass: "text-amber-300",
    meterClass: "bg-amber-400",
  },
  HIGH: {
    labelClass: "text-rose-300",
    meterClass: "bg-rose-500",
  },
} as const;

function MetaItem({
  icon,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="shrink-0 text-cyan-300/80">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

function LoadMeter({ load }: { load: "LOW" | "MODERATE" | "HIGH" }) {
  const visual = LOAD_VISUALS[load];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        <span>Load</span>
        <span className={visual.labelClass}>{load}</span>
      </div>
      <div
        role="meter"
        aria-label={`Planned load ${load}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={loadPercent[load]}
        className="h-1.5 overflow-hidden rounded-full bg-slate-800"
      >
        <div
          className={`h-full rounded-full transition-[width] ${visual.meterClass}`}
          style={{ width: `${loadPercent[load]}%` }}
        />
      </div>
    </div>
  );
}

export default function WeeklyPlannerActivityCard({
  activity,
  sessionDate,
  onTakeAttendance,
}: {
  activity: WeeklyPlannerActivity;
  sessionDate?: string;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
}) {
  if (activity.source === "SAVED_TRAINING") {
    const { session } = activity;
    return (
      <article className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950/80 p-3 shadow-sm shadow-cyan-950/20">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex rounded-md bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">
              Training
            </span>
            <p className="mt-2 text-sm font-black text-white">{session.objective}</p>
          </div>
          <time className="text-sm font-black text-cyan-200">{formatThaiTime(session.startTime)}</time>
        </div>

        <div className="grid gap-2 text-[11px] text-slate-400 sm:grid-cols-2">
          <MetaItem icon={<Clock size={13} />}>{session.durationMinutes} min</MetaItem>
          <MetaItem icon={<Users size={13} />} className="sm:justify-end">
            {squadScopeLabel[activity.squadScope]}
          </MetaItem>
          <MetaItem icon={<MapPin size={13} />} className="sm:col-span-2">
            {session.location}
          </MetaItem>
          <span className="sm:col-span-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
            {session.phaseOfPlay.replaceAll("_", " ")}
          </span>
        </div>

        <LoadMeter load={session.plannedLoad} />

        {sessionDate && onTakeAttendance && (
          <button
            type="button"
            onClick={() =>
              onTakeAttendance({
                sessionDate,
                startTime: session.startTime,
              })
            }
            className="w-full rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[11px] font-black text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Take Attendance
          </button>
        )}

        <div className="space-y-2 border-t border-slate-800 pt-2">
          {session.blocks.map((block, index) => (
            <div key={`${activity.id}:block:${index}`} className="rounded-lg bg-slate-900/80 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold text-slate-100">
                  {index + 1}. {block.title}
                </p>
                <span className="shrink-0 text-[10px] font-semibold text-slate-500">
                  {block.durationMinutes} min
                </span>
              </div>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-300/80">
                {block.blockType}
              </p>
              {block.drillReference && (
                <p className="mt-1 break-all text-[10px] text-emerald-300">
                  Drill reference: {block.drillReference}
                </p>
              )}
              {block.coachingPoints.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-500">
                  {block.coachingPoints.map((point, pointIndex) => (
                    <li key={`${activity.id}:block:${index}:point:${pointIndex}`}>• {point}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </article>
    );
  }

  if (activity.activityType === "TRAINING") {
    return (
      <article className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950/80 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex rounded-md bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">
              Training
            </span>
            <p className="mt-2 text-sm font-black text-white">{activity.title}</p>
          </div>
          <span className="text-sm font-black text-cyan-200">{formatThaiTime(activity.startTime)}</span>
        </div>
        <p className="text-xs leading-5 text-slate-400">{activity.focus}</p>
        <div className="grid gap-2 text-[11px] text-slate-400 sm:grid-cols-2">
          <MetaItem icon={<Clock size={13} />}>{activity.durationMinutes} min</MetaItem>
          <MetaItem icon={<Users size={13} />} className="sm:justify-end">
            {squadScopeLabel[activity.squadScope]}
          </MetaItem>
          <MetaItem icon={<MapPin size={13} />} className="sm:col-span-2">
            {activity.location}
          </MetaItem>
        </div>
        <LoadMeter load={activity.plannedLoad} />
      </article>
    );
  }

  if (activity.activityType === "RECOVERY") {
    return (
      <article className="space-y-3 rounded-xl border border-emerald-400/20 bg-slate-950/80 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
              Recovery
            </span>
            <p className="mt-2 text-sm font-black text-white">{activity.focus}</p>
          </div>
          <span className="text-sm font-black text-emerald-200">{formatThaiTime(activity.startTime)}</span>
        </div>
        <div className="grid gap-2 text-[11px] text-slate-400 sm:grid-cols-2">
          <MetaItem icon={<Clock size={13} />}>{activity.durationMinutes} min</MetaItem>
          <MetaItem icon={<Users size={13} />} className="sm:justify-end">
            {squadScopeLabel[activity.squadScope]}
          </MetaItem>
          <MetaItem icon={<MapPin size={13} />} className="sm:col-span-2">
            {activity.location}
          </MetaItem>
        </div>
      </article>
    );
  }

  return (
    <article className="space-y-3 rounded-xl border border-amber-400/25 bg-slate-950/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="inline-flex rounded-md bg-amber-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">
            {matchCategoryLabel[activity.competitionCategory]}
          </span>
          <p className="mt-2 text-sm font-black text-white">vs {activity.opponent || "Opponent not set"}</p>
        </div>
        <span className="text-sm font-black text-amber-200">{formatThaiTime(activity.kickoffTime)}</span>
      </div>
      <div className="space-y-2 text-[11px] leading-4 text-slate-400">
        <p className="font-semibold text-slate-300">{activity.competition || "Competition not set"}</p>
        <MetaItem icon={<Clock size={13} />}>{formatThaiTime(activity.kickoffTime)}</MetaItem>
        <MetaItem icon={<MapPin size={13} />}>{activity.venue || "Venue not set"}</MetaItem>
        <MetaItem icon={<Users size={13} />}>
          {activity.squadLabel} · {squadScopeLabel[activity.squadScope]}
        </MetaItem>
      </div>
    </article>
  );
}
