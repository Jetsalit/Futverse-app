import { ShieldCheck } from "lucide-react";
import {
  WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE,
  WEEKLY_TRAINING_SAVED_DRAFT_READ_UNAVAILABLE_MESSAGE,
} from "../../../config/runtimeCapabilities";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
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

export default function ProClubHeadCoachWeeklyProductionWorkspace({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
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
          Create a fresh Weekly Training DRAFT or review your saved DRAFT history.
        </p>
      </header>

      <WeeklyTrainingDraftComposer authority={authority} />
      {WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE ? (
        <WeeklyTrainingSavedDrafts authority={authority} />
      ) : (
        <SavedDraftReadPending />
      )}
    </section>
  );
}
