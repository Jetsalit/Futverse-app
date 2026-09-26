import { useEffect, useMemo, useRef, useState } from "react";

import type { ProClubWeeklyPeriodizationBoard } from "../../../lib/proClubWeeklyPeriodizationBoard";
import { formatThaiDateShort, formatThaiTime } from "../../../lib/thaiDateTimePresentation";
import WeeklyPlannerDayCard from "./WeeklyPlannerDayCard";
import {
  addWeeklyPlannerActivity,
  buildWeeklyPlannerState,
  clearWeeklyPlannerDayRest,
  markWeeklyPlannerDayRest,
  removeWeeklyPlannerLocalActivity,
  type WeeklyPlannerLocalActivity,
  type WeeklyPlannerSquadScope,
} from "./weeklyPlannerUiModel";

type ComposerType = "TRAINING" | "RECOVERY" | "MATCH";
type MatchCategory = "LEAGUE" | "CUP" | "FRIENDLY" | "TOURNAMENT" | "OTHER";
type TrainingLoad = "LOW" | "MODERATE" | "HIGH";

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white outline-none transition focus:border-cyan-400";
const labelClass = "text-[10px] font-black uppercase tracking-[0.1em] text-slate-500";

const squadOptions: readonly { value: WeeklyPlannerSquadScope; label: string }[] = [
  { value: "ALL_SQUAD", label: "All squad" },
  { value: "STARTERS", label: "Starters" },
  { value: "NON_STARTERS", label: "Non-starters" },
  { value: "SELECTED_PLAYERS", label: "Selected players" },
];

function dateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(value: string, amount: number): string {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekDate(value: string): string {
  return formatThaiDateShort(value);
}

function activityDuration(activity: ReturnType<typeof buildWeeklyPlannerState>["days"][number]["activities"][number]): number {
  if (activity.source === "SAVED_TRAINING") return activity.session.durationMinutes;
  if (activity.activityType === "MATCH") return 0;
  return activity.durationMinutes;
}

function activityLoad(activity: ReturnType<typeof buildWeeklyPlannerState>["days"][number]["activities"][number]): TrainingLoad | null {
  if (activity.source === "SAVED_TRAINING") return activity.session.plannedLoad;
  if (activity.activityType === "TRAINING") return activity.plannedLoad;
  return null;
}

export default function WeeklyPlannerBoard({
  board,
  onTakeAttendance,
}: {
  board: ProClubWeeklyPeriodizationBoard;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
}) {
  const [planner, setPlanner] = useState(() => buildWeeklyPlannerState(board));
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [composerType, setComposerType] = useState<ComposerType>("TRAINING");
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [title, setTitle] = useState("Training session");
  const [focus, setFocus] = useState("");
  const [location, setLocation] = useState("");
  const [plannedLoad, setPlannedLoad] = useState<TrainingLoad>("MODERATE");
  const [squadScope, setSquadScope] = useState<WeeklyPlannerSquadScope>("ALL_SQUAD");
  const [competition, setCompetition] = useState("");
  const [competitionCategory, setCompetitionCategory] = useState<MatchCategory>("LEAGUE");
  const [opponent, setOpponent] = useState("");
  const [venue, setVenue] = useState("");
  const [squadLabel, setSquadLabel] = useState(board.squadLabel);
  const [status, setStatus] = useState("Persistence not enabled — UI preview only.");
  const localCounter = useRef(0);

  useEffect(() => {
    setPlanner(buildWeeklyPlannerState(board));
    setComposerDate(null);
    setSquadLabel(board.squadLabel);
    setStatus("Persistence not enabled — UI preview only.");
  }, [board]);

  const metrics = useMemo(() => {
    const activities = planner.days.flatMap((day) => day.activities);
    const training = activities.filter((activity) => activity.activityType === "TRAINING");
    const recovery = activities.filter((activity) => activity.activityType === "RECOVERY");
    const matches = activities.filter((activity) => activity.activityType === "MATCH");
    const loadValues = training
      .map(activityLoad)
      .filter((value): value is TrainingLoad => value !== null)
      .map((load) => ({ LOW: 1, MODERATE: 2, HIGH: 3 })[load]);
    const averageLoad =
      loadValues.length === 0
        ? "—"
        : (loadValues.reduce((sum, value) => sum + value, 0) / loadValues.length).toFixed(1);

    return {
      trainingMinutes: training.reduce((sum, activity) => sum + activityDuration(activity), 0),
      sessions: training.length + recovery.length,
      matches: matches.length,
      averageLoad,
    };
  }, [planner.days]);

  function resetComposer(type: ComposerType) {
    setComposerType(type);
    setSquadScope("ALL_SQUAD");
    setLocation("");
    if (type === "TRAINING") {
      setStartTime("09:00");
      setDurationMinutes(60);
      setTitle("Training session");
      setFocus("");
      setPlannedLoad("MODERATE");
    } else if (type === "RECOVERY") {
      setStartTime("10:00");
      setDurationMinutes(45);
      setFocus("Recovery & mobility");
    } else {
      setStartTime("18:00");
      setCompetition("");
      setCompetitionCategory("LEAGUE");
      setOpponent("");
      setVenue("");
      setSquadLabel(board.squadLabel);
    }
  }

  function openComposer(date: string) {
    setComposerDate(date);
    resetComposer("TRAINING");
    setStatus("Persistence not enabled — changes remain in this UI preview only.");
  }

  function nextLocalId(type: ComposerType): string {
    localCounter.current += 1;
    return `local:${type.toLowerCase()}:${localCounter.current}`;
  }

  function addLocalActivity() {
    if (!composerDate) return;

    let activity: WeeklyPlannerLocalActivity;
    if (composerType === "TRAINING") {
      activity = {
        id: nextLocalId("TRAINING"),
        source: "LOCAL_UI",
        activityType: "TRAINING",
        startTime,
        durationMinutes,
        title: title.trim() || "Training session",
        focus: focus.trim(),
        location: location.trim(),
        plannedLoad,
        squadScope,
      };
    } else if (composerType === "RECOVERY") {
      activity = {
        id: nextLocalId("RECOVERY"),
        source: "LOCAL_UI",
        activityType: "RECOVERY",
        startTime,
        durationMinutes,
        focus: focus.trim() || "Recovery & mobility",
        location: location.trim(),
        squadScope,
      };
    } else {
      activity = {
        id: nextLocalId("MATCH"),
        source: "LOCAL_UI",
        activityType: "MATCH",
        kickoffTime: startTime,
        competition: competition.trim(),
        competitionCategory,
        opponent: opponent.trim(),
        venue: venue.trim(),
        squadLabel: squadLabel.trim() || board.squadLabel,
        squadScope,
      };
    }

    setPlanner((current) => addWeeklyPlannerActivity(current, composerDate, activity));
    setComposerDate(null);
    setStatus("Local planner activity added — persistence is still disabled.");
  }

  function markRest(date: string) {
    const day = planner.days.find((candidate) => candidate.date === date);
    if (!day) return;
    if (day.activities.some((activity) => activity.source === "SAVED_TRAINING")) {
      setStatus("Saved training exists on this day. Rest cannot replace saved training in UI preview.");
      return;
    }
    if (
      day.activities.length > 0 &&
      typeof window !== "undefined" &&
      !window.confirm("Mark this day as Rest and remove local planner activities for this day?")
    ) {
      return;
    }
    setPlanner((current) => markWeeklyPlannerDayRest(current, date));
    setComposerDate(null);
    setStatus("Rest Day set locally — persistence is still disabled.");
  }

  const weekEndDate = addDays(board.weekStartDate, 6);

  return (
    <section aria-labelledby="weekly-planner-title" className="space-y-5 rounded-2xl border border-slate-800 bg-slate-950/45 p-4 lg:p-5">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">7-day microcycle</p>
              <span className="rounded-md border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-fuchsia-200">
                UI PREVIEW
              </span>
            </div>
            <h3 id="weekly-planner-title" className="mt-2 text-2xl font-black tracking-tight text-white">
              Weekly Training Plan
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {board.squadLabel} · {formatWeekDate(board.weekStartDate)} – {formatWeekDate(weekEndDate)}
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">{board.mainObjective}</p>
          </div>

          <button
            type="button"
            onClick={() => setStatus("UI preview only — persistence is intentionally not enabled yet.")}
            className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300"
          >
            Save Plan
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Training duration</p>
            <p className="mt-1 text-lg font-black text-white">{metrics.trainingMinutes} min</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Sessions</p>
            <p className="mt-1 text-lg font-black text-white">{metrics.sessions}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Matches</p>
            <p className="mt-1 text-lg font-black text-white">{metrics.matches}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Average load</p>
            <p className="mt-1 text-lg font-black text-white">{metrics.averageLoad}</p>
          </div>
        </div>

        <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100/80">
          {status}
        </p>
      </header>

      {composerDate && (
        <section aria-label="Add planner activity" className="rounded-2xl border border-cyan-400/25 bg-slate-900/95 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">Add activity · {composerDate}</p>
              <h4 className="mt-1 font-black text-white">Local UI preview</h4>
            </div>
            <button type="button" onClick={() => setComposerDate(null)} className="text-xs font-bold text-slate-400 hover:text-white">
              Close
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["TRAINING", "RECOVERY", "MATCH"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => resetComposer(type)}
                className={`rounded-lg border px-3 py-2 text-xs font-black ${
                  composerType === type
                    ? "border-cyan-400 bg-cyan-400/10 text-cyan-200"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                {type === "TRAINING" ? "Training" : type === "RECOVERY" ? "Recovery" : "Match"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => markRest(composerDate)}
              className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-black text-emerald-300"
            >
              Rest
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={labelClass}>
              {composerType === "MATCH" ? "Kickoff" : "Start time"}
              <input type="time" lang="th-TH" className={fieldClass} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              <span className="mt-1 block text-[11px] text-slate-500" aria-live="polite">{formatThaiTime(startTime)}</span>
            </label>

            {composerType !== "MATCH" && (
              <label className={labelClass}>
                Duration
                <input type="number" min={1} max={360} className={fieldClass} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) || 1)} />
              </label>
            )}

            {composerType === "TRAINING" && (
              <label className={labelClass}>
                Planned load
                <select className={fieldClass} value={plannedLoad} onChange={(event) => setPlannedLoad(event.target.value as TrainingLoad)}>
                  <option value="LOW">LOW</option>
                  <option value="MODERATE">MODERATE</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </label>
            )}

            <label className={labelClass}>
              Player group
              <select className={fieldClass} value={squadScope} onChange={(event) => setSquadScope(event.target.value as WeeklyPlannerSquadScope)}>
                {squadOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {composerType === "TRAINING" && (
              <label className={`${labelClass} md:col-span-2`}>
                Session title
                <input className={fieldClass} value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
            )}

            {composerType !== "MATCH" && (
              <label className={`${labelClass} md:col-span-2`}>
                Focus
                <input className={fieldClass} value={focus} onChange={(event) => setFocus(event.target.value)} />
              </label>
            )}

            {composerType !== "MATCH" && (
              <label className={`${labelClass} md:col-span-2`}>
                Location
                <input className={fieldClass} value={location} onChange={(event) => setLocation(event.target.value)} />
              </label>
            )}

            {composerType === "MATCH" && (
              <>
                <label className={labelClass}>
                  Competition category
                  <select className={fieldClass} value={competitionCategory} onChange={(event) => setCompetitionCategory(event.target.value as MatchCategory)}>
                    <option value="LEAGUE">League</option>
                    <option value="CUP">Cup</option>
                    <option value="FRIENDLY">Friendly</option>
                    <option value="TOURNAMENT">Tournament</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className={labelClass}>
                  Competition
                  <input className={fieldClass} value={competition} onChange={(event) => setCompetition(event.target.value)} />
                </label>
                <label className={labelClass}>
                  Opponent
                  <input className={fieldClass} value={opponent} onChange={(event) => setOpponent(event.target.value)} />
                </label>
                <label className={labelClass}>
                  Venue
                  <input className={fieldClass} value={venue} onChange={(event) => setVenue(event.target.value)} />
                </label>
                <label className={labelClass}>
                  Squad / team
                  <input className={fieldClass} value={squadLabel} onChange={(event) => setSquadLabel(event.target.value)} />
                </label>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={addLocalActivity} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-300">
              Add {composerType === "TRAINING" ? "Training" : composerType === "RECOVERY" ? "Recovery" : "Match"}
            </button>
            <p className="self-center text-[11px] text-slate-500">Local state only · reload clears this activity</p>
          </div>
        </section>
      )}

      <div aria-label="Weekly planner days" className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {planner.days.map((day) => (
            <WeeklyPlannerDayCard
              key={day.date}
              day={day}
              onAddActivity={openComposer}
              onMarkRest={markRest}
              onClearRest={(date) => {
                setPlanner((current) => clearWeeklyPlannerDayRest(current, date));
                setStatus("Rest cleared locally — persistence is still disabled.");
              }}
              onRemoveLocalActivity={(date, activityId) => {
                setPlanner((current) => removeWeeklyPlannerLocalActivity(current, date, activityId));
                setStatus("Local activity removed — persistence is still disabled.");
              }}
              onTakeAttendance={onTakeAttendance}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
