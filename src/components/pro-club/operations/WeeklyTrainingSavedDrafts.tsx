import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  getHeadCoachWeeklyTrainingSavedDraftDetail,
  listHeadCoachWeeklyTrainingSavedDrafts,
  type WeeklyTrainingSavedDraftReadResult,
} from "../../../lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";
import type {
  WeeklyTrainingSavedDraftDetail,
  WeeklyTrainingSavedDraftSummary,
} from "../../../lib/proClubWeeklyTrainingSavedDraftReadModel";

function canReadSavedDrafts(authority: ProClubOrganizationAuthority): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority &&
    authority.staffRole === "HEAD_COACH"
  );
}

function safeReadMessage(
  result: Exclude<WeeklyTrainingSavedDraftReadResult<unknown>, { state: "FOUND" }>,
): string {
  if (result.state === "PERMISSION_DENIED") {
    return "Saved drafts are unavailable for the current club authority.";
  }
  if (result.state === "INVALID_DATA") {
    return "A saved draft failed integrity validation and was not displayed.";
  }
  if (result.state === "MISSING") {
    return "That saved draft is no longer available.";
  }
  return "Saved drafts could not be loaded. Try again.";
}

function displayDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function displayTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function DraftDetail({ detail }: { detail: WeeklyTrainingSavedDraftDetail }) {
  return (
    <article className="rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Read-only detail</p>
          <h5 className="mt-2 text-lg font-black text-white">{detail.squadLabel}</h5>
          <p className="mt-1 text-sm text-slate-400">Week of {displayDate(detail.weekStartDate)}</p>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">
          DRAFT
        </span>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Main objective</p>
          <p className="mt-1 text-slate-200">{detail.mainObjective}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Last saved</p>
          <p className="mt-1 text-slate-200">{displayTimestamp(detail.updatedAt)}</p>
        </div>
        {detail.secondaryObjective && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Secondary objective</p>
            <p className="mt-1 text-slate-200">{detail.secondaryObjective}</p>
          </div>
        )}
        {detail.headCoachNote && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Head Coach note</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-200">{detail.headCoachNote}</p>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {detail.draft.sessions.map((session, sessionIndex) => (
          <section key={`${session.sessionDate}-${session.startTime}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Session {sessionIndex + 1}</p>
                <h6 className="mt-1 font-bold text-white">{displayDate(session.sessionDate)} · {session.startTime}</h6>
                <p className="mt-1 text-sm text-slate-400">{session.location} · {session.durationMinutes} min · {session.plannedLoad}</p>
              </div>
              <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300">{session.phaseOfPlay}</span>
            </div>
            <p className="mt-3 text-sm text-slate-200">{session.objective}</p>
            <div className="mt-4 space-y-2">
              {session.blocks.map((block, blockIndex) => (
                <div key={`${blockIndex}-${block.title}`} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-white">{blockIndex + 1}. {block.title}</p>
                    <p className="text-xs text-slate-400">{block.blockType} · {block.durationMinutes} min</p>
                  </div>
                  {block.drillReference && <p className="mt-2 break-all text-xs text-cyan-300">Drill: {block.drillReference}</p>}
                  {block.coachingPoints.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
                      {block.coachingPoints.map((point, pointIndex) => <li key={`${pointIndex}-${point}`}>{point}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export default function WeeklyTrainingSavedDrafts({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
}) {
  const [drafts, setDrafts] = useState<readonly WeeklyTrainingSavedDraftSummary[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WeeklyTrainingSavedDraftDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState("");
  const requestGeneration = useRef(0);
  const allowed = canReadSavedDrafts(authority);

  const loadList = useCallback(async () => {
    if (!allowed) return;
    const generation = ++requestGeneration.current;
    setLoadingList(true);
    setMessage("");
    setSelectedPlanId(null);
    setDetail(null);
    const result = await listHeadCoachWeeklyTrainingSavedDrafts(
      authority.organizationId,
      authority.userId,
    );
    if (generation !== requestGeneration.current) return;
    setLoadingList(false);
    if (result.state !== "FOUND") {
      setDrafts([]);
      setMessage(safeReadMessage(result));
      return;
    }
    setDrafts(result.value);
  }, [allowed, authority.organizationId, authority.userId]);

  useEffect(() => {
    requestGeneration.current += 1;
    setDrafts([]);
    setSelectedPlanId(null);
    setDetail(null);
    setMessage("");
    if (allowed) void loadList();
    return () => {
      requestGeneration.current += 1;
    };
  }, [allowed, authority.organizationId, authority.userId, loadList]);

  async function openDetail(planId: string) {
    if (!allowed || !drafts.some((draft) => draft.planId === planId)) return;
    const generation = ++requestGeneration.current;
    setSelectedPlanId(planId);
    setDetail(null);
    setLoadingDetail(true);
    setMessage("");
    const result = await getHeadCoachWeeklyTrainingSavedDraftDetail(
      authority.organizationId,
      authority.userId,
      planId,
    );
    if (generation !== requestGeneration.current) return;
    setLoadingDetail(false);
    if (result.state !== "FOUND") {
      setMessage(safeReadMessage(result));
      return;
    }
    setDetail(result.value);
  }

  if (!allowed) return null;

  return (
    <section aria-labelledby="weekly-training-saved-drafts" className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Saved DRAFTs</p>
          <h4 id="weekly-training-saved-drafts" className="mt-2 text-lg font-black text-white">Weekly Training history</h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Read your persisted Head Coach DRAFTs from the club source of truth. Editing and lifecycle actions remain closed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          disabled={loadingList || loadingDetail}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={loadingList ? "animate-spin" : ""} />
          Refresh saved drafts
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-100/80">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-300" />
        This view is read-only and bound to the current active Head Coach and Pro Club.
      </div>

      {message && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{message}</p>}
      {loadingList && <p role="status" className="text-sm text-slate-400">Loading saved drafts…</p>}
      {!loadingList && drafts.length === 0 && !message && (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No saved Weekly Training DRAFTs are available for this Head Coach yet.</p>
      )}

      {drafts.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {drafts.map((draft) => (
            <button
              key={draft.planId}
              type="button"
              onClick={() => void openDetail(draft.planId)}
              disabled={loadingDetail}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-cyan-300"><CalendarDays size={14} /> {displayDate(draft.weekStartDate)}</p>
                  <p className="mt-2 font-black text-white">{draft.squadLabel}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{draft.mainObjective}</p>
                  <p className="mt-3 text-xs text-slate-500">Saved {displayTimestamp(draft.updatedAt)}</p>
                </div>
                <ChevronRight size={18} className="mt-1 shrink-0 text-slate-500" />
              </div>
            </button>
          ))}
        </div>
      )}

      {loadingDetail && selectedPlanId && <p role="status" className="text-sm text-slate-400">Validating saved DRAFT detail…</p>}
      {detail && <DraftDetail detail={detail} />}
    </section>
  );
}
