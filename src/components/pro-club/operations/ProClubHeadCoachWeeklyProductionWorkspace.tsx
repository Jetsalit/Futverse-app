import { ClipboardList, ShieldCheck } from "lucide-react";
import {
  WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE,
  WEEKLY_TRAINING_SAVED_DRAFT_READ_UNAVAILABLE_MESSAGE,
} from "../../../config/runtimeCapabilities";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import type { ProClubFitnessWeeklyTrainingReadV1Selection } from "../../../lib/proClubFitnessWeeklyTrainingRead";
import WeeklyTrainingDraftComposer from "./WeeklyTrainingDraftComposer";
import WeeklyTrainingSavedDrafts from "./WeeklyTrainingSavedDrafts";

export type ProClubWeeklyFitnessContext =
  | { readonly state: "LOADING" }
  | {
      readonly state: "READY";
      readonly referenceDate: string;
      readonly selection: ProClubFitnessWeeklyTrainingReadV1Selection;
    }
  | { readonly state: "READ_ERROR" };

export function canRenderHeadCoachWeeklyProductionWorkspace(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    authority.staffRole === "HEAD_COACH"
  );
}

function SavedDraftReadPending() {
  return (
    <article
      aria-label="Saved Weekly Training DRAFT history unavailable"
      className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 text-amber-300" size={20} />
        <div>
          <h4 className="font-bold text-white">
            Saved DRAFT history pending production index verification
          </h4>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {WEEKLY_TRAINING_SAVED_DRAFT_READ_UNAVAILABLE_MESSAGE}
          </p>
        </div>
      </div>
    </article>
  );
}

function FitnessTrainingBoundary({
  context,
}: {
  context: ProClubWeeklyFitnessContext;
}) {
  if (context.state === "LOADING") {
    return (
      <article role="status" className="rounded-2xl border border-slate-700 bg-slate-950/50 p-5">
        <p className="text-sm text-slate-300">Loading Fitness observations…</p>
      </article>
    );
  }

  if (context.state === "READ_ERROR") {
    return (
      <article role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
        <p className="text-sm font-semibold text-rose-200">Fitness context could not be loaded.</p>
      </article>
    );
  }

  if (context.selection.prescription !== null) {
    return (
      <article role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
        <p className="text-sm font-semibold text-rose-200">Fitness context could not be loaded.</p>
      </article>
    );
  }

  const observationsByPlayer = new Map<
    string,
    ProClubFitnessWeeklyTrainingReadV1Selection["observations"][number][]
  >();
  for (const observation of context.selection.observations) {
    const playerObservations = observationsByPlayer.get(observation.playerKey) ?? [];
    playerObservations.push(observation);
    observationsByPlayer.set(observation.playerKey, playerObservations);
  }

  return (
    <article aria-label="Persisted Fitness observations" className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
        Fitness observations as of {context.referenceDate}
      </p>
      {context.selection.state === "NO_DATA" ? (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            No eligible persisted Fitness observations were available as of {context.referenceDate}.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 space-y-3">
            {[...observationsByPlayer].map(([playerKey, observations]) => (
              <section key={playerKey} className="rounded-xl border border-slate-700/80 bg-slate-950/50 p-3">
                <h4 className="font-bold text-white">{observations[0]?.playerDisplayLabel}</h4>
                <ul className="mt-2 divide-y divide-slate-800">
                  {observations.map((observation) => (
                    <li key={observation.resultId} className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <span className="font-semibold text-slate-200">{observation.testName}</span>
                      <span className="text-slate-200">{observation.value} {observation.unit}</span>
                      <span className="text-xs text-slate-400 sm:col-span-2">
                        Tested <time dateTime={observation.observedOn}>{observation.observedOn}</time>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-300">
        Fitness observations are context only. The Head Coach remains responsible for training decisions.
      </p>
    </article>
  );
}

export default function ProClubHeadCoachWeeklyProductionWorkspace({
  authority,
  fitnessContext,
  onTakeAttendance,
  onOpenSubmissions,
}: {
  authority: ProClubOrganizationAuthority;
  fitnessContext: ProClubWeeklyFitnessContext;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
  onOpenSubmissions?: () => void;
}) {
  if (!canRenderHeadCoachWeeklyProductionWorkspace(authority)) {
    return (
      <section aria-label="Weekly Training authority required" className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 text-amber-100">
        <h3 className="font-bold">Weekly Training</h3>
        <p className="mt-2 text-sm leading-6">
          Active Pro Club Head Coach authority is required to view Weekly Training.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="head-coach-weekly-production-workspace"
      className="space-y-5 rounded-3xl bg-slate-900 p-6 text-white sm:p-8"
    >
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
          Head Coach
        </p>
        <h3
          id="head-coach-weekly-production-workspace"
          className="mt-2 text-2xl font-black"
        >
          Weekly Training
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Review the current weekly microcycle and Weekly Training history first, then create or revise a DRAFT when needed.
        </p>
        {onOpenSubmissions && (
          <button
            type="button"
            onClick={onOpenSubmissions}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-black text-cyan-200 transition hover:bg-cyan-500/20"
          >
            <ClipboardList size={16} />
            งานที่ส่งมา / Staff Submissions
          </button>
        )}
      </header>

      <FitnessTrainingBoundary context={fitnessContext} />

      {WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE ? (
        <WeeklyTrainingSavedDrafts
          authority={authority}
          onTakeAttendance={onTakeAttendance}
        />
      ) : (
        <SavedDraftReadPending />
      )}

      <WeeklyTrainingDraftComposer authority={authority} />
    </section>
  );
}
