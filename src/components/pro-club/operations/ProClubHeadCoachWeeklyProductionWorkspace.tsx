import { ClipboardList, ShieldCheck } from "lucide-react";
import {
  WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE,
  WEEKLY_TRAINING_SAVED_DRAFT_READ_UNAVAILABLE_MESSAGE,
} from "../../../config/runtimeCapabilities";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import type { FitnessTrainingConnection } from "../../../lib/fitnessTestFoundation";
import WeeklyTrainingDraftComposer from "./WeeklyTrainingDraftComposer";
import WeeklyTrainingSavedDrafts from "./WeeklyTrainingSavedDrafts";

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
  connection,
}: {
  connection: FitnessTrainingConnection;
}) {
  return (
    <article className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
        Fitness connection
      </p>
      {connection.state === "NO_DATA" ? (
        <>
          <h4 className="mt-2 font-bold text-white">
            No recorded fitness results are connected to this training plan
          </h4>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            The shared definition catalogue is available, but result persistence needs a separately reviewed backend contract.
            This boundary does not generate training prescriptions.
          </p>
        </>
      ) : (
        <>
          <h4 className="mt-2 font-bold text-white">
            Recorded fitness observations
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {connection.observations.map((observation) => (
              <li key={observation.id}>
                {observation.testName}: {observation.value} {observation.unit}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Observations are context only; this boundary does not generate training prescriptions.
          </p>
        </>
      )}
    </article>
  );
}

export default function ProClubHeadCoachWeeklyProductionWorkspace({
  authority,
  fitnessConnection,
  onTakeAttendance,
  onOpenSubmissions,
}: {
  authority: ProClubOrganizationAuthority;
  fitnessConnection?: FitnessTrainingConnection;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
  onOpenSubmissions?: () => void;
}) {
  if (!canRenderHeadCoachWeeklyProductionWorkspace(authority)) return null;

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

      {fitnessConnection && (
        <FitnessTrainingBoundary connection={fitnessConnection} />
      )}

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
