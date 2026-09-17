import type {
  WeeklyPlannerActivity,
  WeeklyPlannerSquadScope,
} from "./weeklyPlannerUiModel";

const squadScopeLabel: Record<WeeklyPlannerSquadScope, string> = {
  ALL_SQUAD: "All squad",
  STARTERS: "Starters",
  NON_STARTERS: "Non-starters",
  SELECTED_PLAYERS: "Selected players",
};

function matchBadge(activity: Extract<WeeklyPlannerActivity, { activityType: "MATCH" }>) {
  switch (activity.competitionCategory) {
    case "LEAGUE":
      return "League Match";
    case "CUP":
      return "Cup Match";
    case "FRIENDLY":
      return "Friendly Match";
    case "TOURNAMENT":
      return "Tournament Match";
    default:
      return "Match";
  }
}

export default function WeeklyPlannerActivityCard({
  activity,
}: {
  activity: WeeklyPlannerActivity;
}) {
  if (activity.source === "SAVED_TRAINING") {
    const { session } = activity;
    return (
      <article className="space-y-3 rounded-xl border border-cyan-400/20 bg-slate-950/80 p-3 shadow-sm shadow-cyan-950/20">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">
            Training
          </span>
          <span className="text-xs font-black text-white">{session.startTime}</span>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-black text-white">{session.objective}</p>
          <p className="text-xs text-slate-400">{session.location}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-300">
          <span>{session.durationMinutes} min</span>
          <span>{session.plannedLoad}</span>
          <span>{session.phaseOfPlay}</span>
          <span>{squadScopeLabel[activity.squadScope]}</span>
        </div>
        <div className="space-y-2 border-t border-slate-800 pt-2">
          {session.blocks.map((block, index) => (
            <div key={`${block.title}:${index}`} className="rounded-lg bg-slate-900/80 p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold text-slate-100">
                  {index + 1}. {block.title}
                </p>
                <span className="text-[10px] font-semibold text-slate-500">
                  {block.durationMinutes} min
                </span>
              </div>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                {block.blockType}
              </p>
              {block.drillReference && (
                <p className="mt-1 text-[11px] text-cyan-300">
                  Drill reference: {block.drillReference}
                </p>
              )}
              {block.coachingPoints.length > 0 && (
                <ul className="mt-1 space-y-1 text-[11px] text-slate-400">
                  {block.coachingPoints.map((point, pointIndex) => (
                    <li key={`${point}:${pointIndex}`}>{point}</li>
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
      <article className="space-y-2 rounded-xl border border-cyan-400/20 bg-slate-950/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">
            Training
          </span>
          <span className="text-xs font-black text-white">{activity.startTime}</span>
        </div>
        <p className="text-sm font-black text-white">{activity.title}</p>
        <p className="text-xs text-slate-300">{activity.focus}</p>
        <p className="text-xs text-slate-500">{activity.location}</p>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-300">
          <span>{activity.durationMinutes} min</span>
          <span>{activity.plannedLoad}</span>
          <span>{squadScopeLabel[activity.squadScope]}</span>
        </div>
      </article>
    );
  }

  if (activity.activityType === "RECOVERY") {
    return (
      <article className="space-y-2 rounded-xl border border-emerald-400/20 bg-slate-950/80 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">
            Recovery
          </span>
          <span className="text-xs font-black text-white">{activity.startTime}</span>
        </div>
        <p className="text-sm font-black text-white">{activity.focus}</p>
        <p className="text-xs text-slate-500">{activity.location}</p>
        <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-300">
          <span>{activity.durationMinutes} min</span>
          <span>{squadScopeLabel[activity.squadScope]}</span>
        </div>
      </article>
    );
  }

  return (
    <article className="space-y-2 rounded-xl border border-amber-400/20 bg-slate-950/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">
          {matchBadge(activity)}
        </span>
        <span className="text-xs font-black text-white">{activity.kickoffTime}</span>
      </div>
      <p className="text-sm font-black text-white">
        {activity.opponent ? `vs ${activity.opponent}` : "Opponent not set"}
      </p>
      <p className="text-xs text-slate-300">{activity.competition || "Competition not set"}</p>
      <p className="text-xs text-slate-500">{activity.venue || "Venue not set"}</p>
      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-slate-300">
        <span>{activity.squadLabel}</span>
        <span>{squadScopeLabel[activity.squadScope]}</span>
      </div>
    </article>
  );
}
