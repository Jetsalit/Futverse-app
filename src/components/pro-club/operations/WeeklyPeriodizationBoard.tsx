import type { ProClubWeeklyPeriodizationBoard as ProClubWeeklyPeriodizationBoardModel } from "../../../lib/proClubWeeklyPeriodizationBoard";

type PlannedLoad =
  ProClubWeeklyPeriodizationBoardModel["sessions"][number]["plannedLoad"];

const PLANNED_LOAD_PRESENTATION: Record<
  PlannedLoad,
  {
    readonly barClassName: string;
    readonly labelClassName: string;
    readonly meterValue: number;
  }
> = {
  LOW: {
    barClassName: "w-1/3 bg-emerald-500",
    labelClassName: "text-emerald-700",
    meterValue: 33,
  },
  MODERATE: {
    barClassName: "w-2/3 bg-amber-500",
    labelClassName: "text-amber-700",
    meterValue: 67,
  },
  HIGH: {
    barClassName: "w-full bg-rose-500",
    labelClassName: "text-rose-700",
    meterValue: 100,
  },
};

function formatSessionDate(sessionDate: string): string {
  const [year, month, day] = sessionDate.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDayLabel(dayOfWeek: string): string {
  return dayOfWeek.slice(0, 3);
}

export default function WeeklyPeriodizationBoard({
  board,
}: {
  board: ProClubWeeklyPeriodizationBoardModel;
}) {
  return (
    <section
      aria-labelledby="weekly-periodization-board-title"
      className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm"
    >
      <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h5
                id="weekly-periodization-board-title"
                className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl"
              >
                Weekly Periodization Board
              </h5>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[0.65rem] font-black tracking-[0.16em] text-indigo-700">
                MICROCYCLE
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.65rem] font-black tracking-[0.16em] text-slate-500">
                READ ONLY
              </span>
            </div>
            <p className="mt-2 text-sm font-black text-indigo-700">{board.squadLabel}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Week starting <time dateTime={board.weekStartDate}>{board.weekStartDate}</time>
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <div>
            <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-400">
              Main objective
            </dt>
            <dd className="mt-1 text-sm font-semibold leading-6 text-slate-800">
              {board.mainObjective}
            </dd>
          </div>
          {board.secondaryObjective !== undefined && (
            <div>
              <dt className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-400">
                Secondary objective
              </dt>
              <dd className="mt-1 text-sm font-semibold leading-6 text-slate-800">
                {board.secondaryObjective}
              </dd>
            </div>
          )}
        </dl>
      </header>

      <div
        aria-label="Weekly microcycle sessions"
        className="flex gap-4 overflow-x-auto px-4 py-5 sm:px-6"
      >
        {board.sessions.map((session, sessionIndex) => {
          const sessionTitleId = `weekly-periodization-session-${sessionIndex}`;
          const loadPresentation = PLANNED_LOAD_PRESENTATION[session.plannedLoad];

          return (
            <article
              key={`${session.sessionDate}-${session.startTime}-${sessionIndex}`}
              aria-labelledby={sessionTitleId}
              className="flex min-h-[31rem] min-w-[18rem] max-w-[20rem] flex-1 flex-col rounded-2xl border border-sky-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                    {formatDayLabel(session.dayOfWeek)}
                    <span className="sr-only"> {session.dayOfWeek}</span>
                  </p>
                  <h6
                    id={sessionTitleId}
                    className="mt-1 text-xl font-black tracking-tight text-slate-950"
                  >
                    <time dateTime={session.sessionDate}>{formatSessionDate(session.sessionDate)}</time>
                  </h6>
                  <p className="mt-0.5 text-[0.7rem] font-semibold text-slate-400">
                    {session.sessionDate}
                  </p>
                </div>

                <span className="max-w-[9rem] rounded-xl bg-sky-50 px-2.5 py-1.5 text-right text-[0.65rem] font-black tracking-[0.08em] text-sky-700">
                  {session.phaseOfPlay}
                </span>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-500">
                    Training load
                  </p>
                  <p
                    className={`text-xs font-black ${loadPresentation.labelClassName}`}
                  >
                    {session.plannedLoad}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    role="meter"
                    aria-label={`${session.dayOfWeek} training load ${session.plannedLoad}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={loadPresentation.meterValue}
                    className={`h-full rounded-full ${loadPresentation.barClassName}`}
                  />
                </div>
              </div>

              <blockquote className="mt-5 min-h-[4.5rem] text-sm font-semibold leading-6 text-slate-700">
                “{session.objective}”
              </blockquote>

              <div className="mt-4 space-y-2">
                {session.blocks.map((block, blockIndex) => (
                  <section
                    key={`${blockIndex}-${block.title}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-800">
                          {blockIndex + 1}. {block.title}
                        </p>
                        <p className="mt-1 text-[0.65rem] font-black uppercase tracking-[0.08em] text-sky-700">
                          {block.blockType}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-black text-slate-500 shadow-sm">
                        {block.durationMinutes} min
                      </span>
                    </div>

                    {block.drillReference !== undefined && (
                      <p className="mt-2 break-all text-[0.7rem] font-semibold text-indigo-600">
                        Drill reference: {block.drillReference}
                      </p>
                    )}

                    {block.coachingPoints.length > 0 && (
                      <div className="mt-2 border-t border-slate-200 pt-2">
                        <p className="text-[0.62rem] font-black uppercase tracking-[0.08em] text-slate-400">
                          Coaching points
                        </p>
                        <ul className="mt-1 space-y-1 text-[0.7rem] leading-4 text-slate-500">
                          {block.coachingPoints.map((point, pointIndex) => (
                            <li key={`${pointIndex}-${point}`}>• {point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                ))}
              </div>

              <div className="mt-auto pt-5">
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-400">
                    Total session
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    {session.durationMinutes} min
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  <time dateTime={session.startTime}>{session.startTime}</time>
                  <span aria-hidden="true"> · </span>
                  {session.location}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
