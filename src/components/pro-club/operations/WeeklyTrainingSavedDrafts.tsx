import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  getHeadCoachWeeklyTrainingSavedDraftDetail,
  listHeadCoachWeeklyTrainingSavedDrafts,
  type WeeklyTrainingSavedDraftPageCursor,
  type WeeklyTrainingSavedDraftReadResult,
} from "../../../lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";
import type {
  WeeklyTrainingSavedDraftDetail,
  WeeklyTrainingSavedDraftSummary,
} from "../../../lib/proClubWeeklyTrainingSavedDraftReadModel";
import { deriveProClubWeeklyPeriodizationBoard } from "../../../lib/proClubWeeklyPeriodizationBoard";
import WeeklyPeriodizationBoard from "./WeeklyPeriodizationBoard";

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
  const board = deriveProClubWeeklyPeriodizationBoard(detail.draft);

  return (
    <article className="space-y-5 rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Read-only detail</p>
          <p className="mt-2 text-sm text-slate-400">Validated from the saved Head Coach DRAFT.</p>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">DRAFT</span>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Saved</p>
          <p className="mt-1 text-slate-200">{displayTimestamp(detail.updatedAt)}</p>
        </div>
        {detail.headCoachNote && <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Head Coach note</p><p className="mt-1 whitespace-pre-wrap text-slate-200">{detail.headCoachNote}</p></div>}
      </div>

      <WeeklyPeriodizationBoard board={board} />
    </article>
  );
}

export default function WeeklyTrainingSavedDrafts({ authority }: { authority: ProClubOrganizationAuthority }) {
  const [drafts, setDrafts] = useState<readonly WeeklyTrainingSavedDraftSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<WeeklyTrainingSavedDraftPageCursor | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WeeklyTrainingSavedDraftDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState("");
  const requestGeneration = useRef(0);
  const allowed = canReadSavedDrafts(authority);

  const loadPage = useCallback(async (cursor: WeeklyTrainingSavedDraftPageCursor | null, append: boolean) => {
    if (!allowed) return;
    const generation = ++requestGeneration.current;
    if (append) setLoadingMore(true); else setLoadingList(true);
    setMessage("");
    if (!append) {
      setSelectedPlanId(null);
      setDetail(null);
    }
    const result = await listHeadCoachWeeklyTrainingSavedDrafts(authority.organizationId, authority.userId, cursor);
    if (generation !== requestGeneration.current) return;
    if (append) setLoadingMore(false); else setLoadingList(false);
    if (result.state !== "FOUND") {
      if (!append) setDrafts([]);
      setMessage(safeReadMessage(result));
      return;
    }
    setNextCursor(result.value.nextCursor);
    if (!append) {
      setDrafts(result.value.items);
      return;
    }
    setDrafts((current) => {
      const byId = new Map(current.map((item) => [item.planId, item] as const));
      result.value.items.forEach((item) => byId.set(item.planId, item));
      return [...byId.values()];
    });
  }, [allowed, authority.organizationId, authority.userId]);

  const refresh = useCallback(async () => {
    setNextCursor(null);
    await loadPage(null, false);
  }, [loadPage]);

  useEffect(() => {
    requestGeneration.current += 1;
    setDrafts([]);
    setNextCursor(null);
    setSelectedPlanId(null);
    setDetail(null);
    setLoadingList(false);
    setLoadingMore(false);
    setLoadingDetail(false);
    setMessage("");
    if (allowed) void refresh();
    return () => { requestGeneration.current += 1; };
  }, [allowed, authority.organizationId, authority.userId, refresh]);

  async function openDetail(planId: string) {
    if (!allowed || !drafts.some((draft) => draft.planId === planId)) return;
    const generation = ++requestGeneration.current;
    setSelectedPlanId(planId);
    setDetail(null);
    setLoadingDetail(true);
    setMessage("");
    const result = await getHeadCoachWeeklyTrainingSavedDraftDetail(authority.organizationId, authority.userId, planId);
    if (generation !== requestGeneration.current) return;
    setLoadingDetail(false);
    if (result.state !== "FOUND") { setMessage(safeReadMessage(result)); return; }
    setDetail(result.value);
  }

  if (!allowed) return null;
  const busy = loadingList || loadingMore || loadingDetail;

  return (
    <section aria-labelledby="weekly-training-saved-drafts" className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Saved DRAFTs</p>
          <h4 id="weekly-training-saved-drafts" className="mt-2 text-lg font-black text-white">Weekly Training history</h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Read your persisted Head Coach DRAFTs from the club source of truth. History loads in bounded pages; editing and lifecycle actions remain closed.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-60">
          <RefreshCw size={16} className={loadingList ? "animate-spin" : ""} /> Refresh saved drafts
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-100/80"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-300" />This view is read-only and bound to the current active Head Coach and Pro Club.</div>
      {message && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{message}</p>}
      {loadingList && <p role="status" className="text-sm text-slate-400">Loading saved drafts…</p>}
      {!loadingList && drafts.length === 0 && !message && <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No saved Weekly Training DRAFTs are available for this Head Coach yet.</p>}

      {drafts.length > 0 && <div className="grid gap-3 lg:grid-cols-2">{drafts.map((draft) => (
        <button key={draft.planId} type="button" onClick={() => void openDetail(draft.planId)} disabled={busy} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60">
          <div className="flex items-start justify-between gap-3"><div><p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-cyan-300"><CalendarDays size={14} /> {displayDate(draft.weekStartDate)}</p><p className="mt-2 font-black text-white">{draft.squadLabel}</p><p className="mt-1 line-clamp-2 text-sm text-slate-400">{draft.mainObjective}</p><p className="mt-3 text-xs text-slate-500">Saved {displayTimestamp(draft.updatedAt)}</p></div><ChevronRight size={18} className="mt-1 shrink-0 text-slate-500" /></div>
        </button>
      ))}</div>}

      {nextCursor && !loadingList && <button type="button" onClick={() => void loadPage(nextCursor, true)} disabled={busy} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60">{loadingMore ? "Loading more…" : "Load more saved drafts"}</button>}
      {loadingDetail && selectedPlanId && <p role="status" className="text-sm text-slate-400">Validating saved DRAFT detail…</p>}
      {detail && <DraftDetail detail={detail} />}
    </section>
  );
}
