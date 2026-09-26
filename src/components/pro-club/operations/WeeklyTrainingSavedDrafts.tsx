import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Copy, Pencil, RefreshCw, ShieldCheck, X } from "lucide-react";
import { PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_AVAILABLE } from "../../../config/runtimeCapabilities";
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
import { buildFreshWeeklyTrainingDraftFromSavedDraft } from "../../../lib/proClubWeeklyTrainingReviseAsNewDraft";
import { formatThaiDateShort, formatThaiTime } from "../../../lib/thaiDateTimePresentation";
import WeeklyPeriodizationBoard from "./WeeklyPeriodizationBoard";
import WeeklyTrainingDraftComposer from "./WeeklyTrainingDraftComposer";
import WeeklyTrainingExistingDraftEditor from "./WeeklyTrainingExistingDraftEditor";

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
  return formatThaiDateShort(value);
}

function displayTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : `${formatThaiDateShort(date)} ${formatThaiTime(date)}`;
}

function DraftDetail({
  detail,
  onEdit,
  onUseAsNew,
  onTakeAttendance,
}: {
  detail: WeeklyTrainingSavedDraftDetail;
  onEdit: () => void;
  onUseAsNew: () => void;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
}) {
  const board = deriveProClubWeeklyPeriodizationBoard(detail.draft);

  return (
    <article className="space-y-5 rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Current weekly board</p>
          <p className="mt-2 text-sm text-slate-400">Validated from the current Head Coach DRAFT hierarchy.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">DRAFT</span>
          <button type="button" onClick={onUseAsNew} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/20"><Copy size={14} /> Use as new DRAFT</button>
          {PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_AVAILABLE && (
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-400/20"><Pencil size={14} /> Edit DRAFT</button>
          )}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Saved</p>
          <p className="mt-1 text-slate-200">{displayTimestamp(detail.updatedAt)}</p>
        </div>
        {detail.headCoachNote && <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Head Coach note</p><p className="mt-1 whitespace-pre-wrap text-slate-200">{detail.headCoachNote}</p></div>}
      </div>

      <WeeklyPeriodizationBoard
        board={board}
        onTakeAttendance={onTakeAttendance}
      />
    </article>
  );
}

export default function WeeklyTrainingSavedDrafts({
  authority,
  onTakeAttendance,
}: {
  authority: ProClubOrganizationAuthority;
  onTakeAttendance?: (slot: { sessionDate: string; startTime: string }) => void;
}) {
  const [drafts, setDrafts] = useState<readonly WeeklyTrainingSavedDraftSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<WeeklyTrainingSavedDraftPageCursor | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WeeklyTrainingSavedDraftDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [revisingAsNew, setRevisingAsNew] = useState(false);
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
      setEditing(false);
      setRevisingAsNew(false);
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

  async function openDetail(planId: string) {
    if (!allowed || !drafts.some((draft) => draft.planId === planId)) return;
    const generation = ++requestGeneration.current;
    setSelectedPlanId(planId);
    setDetail(null);
    setEditing(false);
    setRevisingAsNew(false);
    setLoadingDetail(true);
    setMessage("");
    const result = await getHeadCoachWeeklyTrainingSavedDraftDetail(authority.organizationId, authority.userId, planId);
    if (generation !== requestGeneration.current) return;
    setLoadingDetail(false);
    if (result.state !== "FOUND") { setMessage(safeReadMessage(result)); return; }
    setDetail(result.value);
  }

  useEffect(() => {
    requestGeneration.current += 1;
    setDrafts([]);
    setNextCursor(null);
    setSelectedPlanId(null);
    setDetail(null);
    setEditing(false);
    setRevisingAsNew(false);
    setLoadingList(false);
    setLoadingMore(false);
    setLoadingDetail(false);
    setMessage("");
    if (allowed) void refresh();
    return () => { requestGeneration.current += 1; };
  }, [allowed, authority.organizationId, authority.userId, refresh]);

  useEffect(() => {
    if (!selectedPlanId && drafts.length > 0 && !loadingList) {
      void openDetail(drafts[0].planId);
    }
  }, [drafts, loadingList, selectedPlanId]);

  function acceptCommittedDetail(nextDetail: WeeklyTrainingSavedDraftDetail) {
    setDetail(nextDetail);
    setEditing(false);
    setDrafts((current) => current.map((item) =>
      item.planId === nextDetail.planId
        ? {
            planId: nextDetail.planId,
            clubId: nextDetail.clubId,
            authorUid: nextDetail.authorUid,
            weekStartDate: nextDetail.weekStartDate,
            squadLabel: nextDetail.squadLabel,
            mainObjective: nextDetail.mainObjective,
            ...(nextDetail.secondaryObjective !== undefined ? { secondaryObjective: nextDetail.secondaryObjective } : {}),
            ...(nextDetail.headCoachNote !== undefined ? { headCoachNote: nextDetail.headCoachNote } : {}),
            sessionCount: nextDetail.sessionCount,
            createdAt: nextDetail.createdAt,
            updatedAt: nextDetail.updatedAt,
            createdAtOrder: nextDetail.createdAtOrder,
            updatedAtOrder: nextDetail.updatedAtOrder,
          }
        : item,
    ));
  }

  if (!allowed) return null;
  const busy = loadingList || loadingMore || loadingDetail;

  return (
    <section aria-labelledby="weekly-training-saved-drafts" className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Weekly Board</p>
          <h4 id="weekly-training-saved-drafts" className="mt-2 text-lg font-black text-white">Current microcycle & saved weeks</h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The newest validated Head Coach DRAFT opens as the current weekly card board. Older saved weeks remain available below without changing the source DRAFT.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy || editing || revisingAsNew} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-60">
          <RefreshCw size={16} className={loadingList ? "animate-spin" : ""} /> Refresh saved drafts
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-100/80"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-300" />Saved-DRAFT reads stay bound to the current active Head Coach and Pro Club. The card board remains a read-only presentation of the validated source; “Use as new DRAFT” creates a separate fresh plan.</div>
      {message && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{message}</p>}
      {loadingList && <p role="status" className="text-sm text-slate-400">Loading weekly board…</p>}
      {!loadingList && drafts.length === 0 && !message && <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No saved Weekly Training DRAFTs are available yet. Create the first DRAFT below and it will become the current weekly card board after save.</p>}
      {loadingDetail && selectedPlanId && <p role="status" className="text-sm text-slate-400">Validating current weekly board…</p>}

      {detail && !editing && !revisingAsNew && (
        <DraftDetail
          detail={detail}
          onEdit={() => { setRevisingAsNew(false); setEditing(true); }}
          onUseAsNew={() => { setEditing(false); setRevisingAsNew(true); }}
          onTakeAttendance={onTakeAttendance}
        />
      )}

      {drafts.length > 0 && !editing && !revisingAsNew && <div className="space-y-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Saved weeks</p>
          <p className="mt-1 text-xs text-slate-500">Choose another validated week to inspect its card board.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">{drafts.map((draft) => (
          <button key={draft.planId} type="button" onClick={() => void openDetail(draft.planId)} disabled={busy} aria-current={selectedPlanId === draft.planId ? "true" : undefined} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-left transition hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60">
            <div className="flex items-start justify-between gap-3"><div><p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-cyan-300"><CalendarDays size={14} /> {displayDate(draft.weekStartDate)}</p><p className="mt-2 font-black text-white">{draft.squadLabel}</p><p className="mt-1 line-clamp-2 text-sm text-slate-400">{draft.mainObjective}</p><p className="mt-3 text-xs text-slate-500">Saved {displayTimestamp(draft.updatedAt)}</p></div><ChevronRight size={18} className="mt-1 shrink-0 text-slate-500" /></div>
          </button>
        ))}</div>
      </div>}

      {nextCursor && !loadingList && !editing && !revisingAsNew && <button type="button" onClick={() => void loadPage(nextCursor, true)} disabled={busy} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-200 disabled:cursor-not-allowed disabled:opacity-60">{loadingMore ? "Loading more…" : "Load more saved drafts"}</button>}
      {detail && revisingAsNew && (
        <div className="space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">New DRAFT from saved plan</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">The saved source remains unchanged. Edit this copied content and save it through the existing Fresh-DRAFT path to create a new plan identity.</p>
            </div>
            <button type="button" onClick={() => setRevisingAsNew(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 hover:border-slate-500"><X size={14} /> Cancel</button>
          </div>
          <WeeklyTrainingDraftComposer
            key={`revise-as-new-${detail.planId}`}
            authority={authority}
            initialDraft={buildFreshWeeklyTrainingDraftFromSavedDraft(detail.draft)}
          />
        </div>
      )}
      {detail && editing && (
        <WeeklyTrainingExistingDraftEditor
          authority={authority}
          detail={detail}
          onCancel={() => setEditing(false)}
          onCommitted={acceptCommittedDetail}
        />
      )}
    </section>
  );
}
