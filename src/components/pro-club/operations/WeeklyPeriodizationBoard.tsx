import type { ProClubWeeklyPeriodizationBoard as ProClubWeeklyPeriodizationBoardModel } from "../../../lib/proClubWeeklyPeriodizationBoard";

type PlannedLoad =
  ProClubWeeklyPeriodizationBoardModel["sessions"][number]["plannedLoad"];

const PLANNED_LOAD_STYLES: Record<PlannedLoad, string> = {
  LOW: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  MODERATE: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  HIGH: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

export default function WeeklyPeriodizationBoard({
  board,
}: {
  board: ProClubWeeklyPeriodizationBoardModel;
}) {
  return (
    <section
      aria-labelledby="weekly-periodization-board-title"
      className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h5
              id="weekly-periodization-board-title"
              className="text-lg font-black text-white sm:text-xl"
            >
              Weekly Periodization Board
            </h5>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[0.65rem] font-black tracking-[0.16em] text-cyan-200">
              READ ONLY
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-cyan-200">
            {board.squadLabel}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Week starting <time dateTime={board.weekStartDate}>{board.weekStartDate}</time>
          </p>
        </div>
      </header>

      <dl className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Main objective
          </dt>
          <dd className="mt-1 text-sm leading-6 text-slate-200">
            {board.mainObjective}
          </dd>
        </div>
        {board.secondaryObjective !== undefined && (
          <div>
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Secondary objective
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-200">
              {board.secondaryObjective}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {board.sessions.map((session, sessionIndex) => {
          const sessionTitleId = `weekly-periodization-session-${sessionIndex}`;

          return (
            <article
              key={`${session.sessionDate}-${session.startTime}-${sessionIndex}`}
              aria-labelledby={sessionTitleId}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-300">
                    {session.dayOfWeek}
                  </p>
                  <h6 id={sessionTitleId} className="mt-1 font-bold text-white">
                    <time dateTime={session.sessionDate}>{session.sessionDate}</time>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={session.startTime}>{session.startTime}</time>
                  </h6>
                  <p className="mt-1 text-sm text-slate-400">
                    {session.location}
                    <span aria-hidden="true"> · </span>
                    {session.durationMinutes} min
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-black tracking-[0.1em] ${PLANNED_LOAD_STYLES[session.plannedLoad]}`}
                >
                  {session.plannedLoad}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    Phase of play
                  </dt>
                  <dd className="mt-1 text-sm text-slate-200">
                    {session.phaseOfPlay}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    Objective
                  </dt>
                  <dd className="mt-1 text-sm leading-5 text-slate-200">
                    {session.objective}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 space-y-2">
                {session.blocks.map((block, blockIndex) => (
                  <section
                    key={`${blockIndex}-${block.title}`}
                    className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                          {block.blockType}
                        </p>
                        <p className="mt-1 font-bold text-white">{block.title}</p>
                      </div>
                      <p className="text-xs text-slate-400">
                        {block.durationMinutes} min
                      </p>
                    </div>
                    {block.drillReference !== undefined && (
                      <p className="mt-2 break-all text-xs text-cyan-300">
                        Drill reference: {block.drillReference}
                      </p>
                    )}
                    {block.coachingPoints.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                          Coaching points
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
                          {block.coachingPoints.map((point, pointIndex) => (
                            <li key={`${pointIndex}-${point}`}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
