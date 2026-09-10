import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import { FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE } from "../../../config/runtimeCapabilities";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  createWeeklyTrainingDraftSaveRequestId,
  isAmbiguousWeeklyTrainingDraftSaveError,
  saveProClubWeeklyTrainingFreshDraft,
  weeklyTrainingDraftSaveClientErrorMessage,
  type ProClubWeeklyTrainingFreshDraftInput,
} from "../../../lib/proClubWeeklyTrainingDraftSaveClient";
import type {
  ProClubTrainingBlockDraft,
  ProClubTrainingBlockType,
  ProClubTrainingPhaseOfPlay,
  ProClubTrainingPlannedLoad,
  ProClubTrainingSessionDraft,
} from "../../../lib/proClubWeeklyTraining";
import {
  PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES,
  proClubTrainingUtf8ByteLength,
} from "../../../lib/proClubWeeklyTrainingStorageBounds";
import {
  MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION,
  MAX_WEEKLY_TRAINING_SESSIONS,
  addTrainingBlock,
  addTrainingSession,
  createEmptyTrainingSession,
  expectedWeeklyTrainingDocumentCount,
  removeTrainingBlock,
  removeTrainingSession,
} from "./weeklyTrainingDraftComposerModel";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "text-xs font-bold uppercase tracking-[0.12em] text-slate-400";

const phaseOptions: readonly ProClubTrainingPhaseOfPlay[] = [
  "GENERAL",
  "IN_POSSESSION",
  "OUT_OF_POSSESSION",
  "TRANSITION_TO_ATTACK",
  "TRANSITION_TO_DEFEND",
  "SET_PIECES",
];
const loadOptions: readonly ProClubTrainingPlannedLoad[] = ["LOW", "MODERATE", "HIGH"];
const blockTypeOptions: readonly ProClubTrainingBlockType[] = [
  "WARM_UP",
  "TECHNICAL",
  "TACTICAL",
  "GAME",
  "CONDITIONING",
  "COOL_DOWN",
  "OTHER",
];

function replaceAt<T>(items: readonly T[], index: number, value: T): readonly T[] {
  return items.map((item, currentIndex) => (currentIndex === index ? value : item));
}

function toInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function freshDraft(): ProClubWeeklyTrainingFreshDraftInput {
  return {
    weekStartDate: "",
    squadLabel: "First Team",
    mainObjective: "",
    sessions: [createEmptyTrainingSession()],
  };
}

export function canUseWeeklyTrainingDraftSave(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority &&
    authority.staffRole === "HEAD_COACH"
  );
}

export default function WeeklyTrainingDraftComposer({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
}) {
  const [draft, setDraft] = useState<ProClubWeeklyTrainingFreshDraftInput>(freshDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [ambiguousSave, setAmbiguousSave] = useState(false);
  const [saved, setSaved] = useState<{
    requestId: string;
    planId: string;
    documentCount: number;
    createdAt: string;
  } | null>(null);

  const authorityAllowed = canUseWeeklyTrainingDraftSave(authority);
  const runtimeAllowed = FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE;
  const expectedDocuments = useMemo(
    () => expectedWeeklyTrainingDocumentCount(draft.sessions),
    [draft.sessions],
  );

  function updateSession(index: number, next: ProClubTrainingSessionDraft) {
    setDraft((current) => ({
      ...current,
      sessions: replaceAt(current.sessions, index, next),
    }));
  }

  function updateBlock(
    sessionIndex: number,
    blockIndex: number,
    next: ProClubTrainingBlockDraft,
  ) {
    const session = draft.sessions[sessionIndex];
    if (!session) return;
    updateSession(sessionIndex, {
      ...session,
      blocks: replaceAt(session.blocks, blockIndex, next),
    });
  }

  async function handleSave() {
    if (saving || saved || !authorityAllowed || !runtimeAllowed) return;

    let requestId = pendingRequestId;
    if (!requestId) {
      try {
        requestId = createWeeklyTrainingDraftSaveRequestId();
      } catch (cause) {
        setError(weeklyTrainingDraftSaveClientErrorMessage(cause));
        return;
      }
    }

    setPendingRequestId(requestId);
    setSaving(true);
    setError("");
    try {
      const result = await saveProClubWeeklyTrainingFreshDraft({
        requestId,
        clubId: authority.organizationId,
        actorUid: authority.userId,
        draft,
      });
      setSaved({
        requestId: result.requestId,
        planId: result.planId,
        documentCount: result.documentCount,
        createdAt: result.createdAt,
      });
      setAmbiguousSave(false);
    } catch (cause) {
      const ambiguous = isAmbiguousWeeklyTrainingDraftSaveError(cause);
      setAmbiguousSave(ambiguous);
      if (!ambiguous) setPendingRequestId(null);
      setError(weeklyTrainingDraftSaveClientErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  if (!authorityAllowed) {
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
        <h4 className="font-bold text-amber-200">Weekly Training fresh DRAFT unavailable</h4>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          A current active Head Coach assignment is required. Server-side membership, staff and
          technical-governance checks remain authoritative for every save.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="weekly-training-draft-title" className="space-y-5 rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Fresh DRAFT</p>
          <h4 id="weekly-training-draft-title" className="mt-2 text-lg font-black text-white">
            Weekly Training Plan
          </h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Create one new server-mediated DRAFT. Existing draft editing, lifecycle actions and
            Technical Director co-authoring remain closed in this slice.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
          Expected write set: <strong className="text-white">{expectedDocuments}</strong> documents
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm sm:grid-cols-2">
        <div>
          <span className={labelClass}>Bound club</span>
          <p className="mt-1 font-bold text-white">{authority.organizationName}</p>
          <p className="text-xs text-slate-500">{authority.organizationId}</p>
        </div>
        <div>
          <span className={labelClass}>Bound actor</span>
          <p className="mt-1 font-bold text-white">Head Coach</p>
          <p className="text-xs text-slate-500">{authority.userId}</p>
        </div>
      </div>

      {!runtimeAllowed && (
        <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
          Saving is intentionally disabled in this production web environment. The reviewed
          function-backed path remains DEV/emulator-only until a separate production rollout is approved.
        </p>
      )}

      {ambiguousSave && pendingRequestId && !saved && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-bold">Save result is uncertain — draft locked for safe reconciliation</p>
          <p className="mt-2 leading-6 text-amber-100/80">
            Do not change this draft. Retry the same save; FutVerse will reuse the same request identity
            and the server will return the already-created plan if the first transaction committed.
          </p>
          <p className="mt-2 break-all text-xs text-amber-200/70">Request: {pendingRequestId}</p>
        </div>
      )}

      {saved && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <div className="flex items-center gap-2 font-bold"><CheckCircle2 size={18} /> DRAFT save completed and verified</div>
          <p className="mt-2 break-all">Plan: {saved.planId}</p>
          <p className="mt-1 break-all text-xs text-emerald-200/80">Request: {saved.requestId}</p>
          <p className="mt-1 text-xs text-emerald-200/80">{saved.documentCount} documents · {saved.createdAt}</p>
          <p className="mt-2 text-xs text-emerald-200/80">This fresh-DRAFT form is locked after success to prevent an accidental duplicate save.</p>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</p>}

      <fieldset disabled={saving || Boolean(saved) || ambiguousSave} className="space-y-5 disabled:opacity-80">
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Week start date
            <input type="date" className={inputClass} value={draft.weekStartDate} onChange={(event) => setDraft((current) => ({ ...current, weekStartDate: event.target.value }))} />
          </label>
          <label className={labelClass}>
            Squad
            <input className={inputClass} maxLength={100} value={draft.squadLabel} onChange={(event) => setDraft((current) => ({ ...current, squadLabel: event.target.value }))} />
          </label>
        </div>
        <label className={labelClass}>
          Main objective
          <textarea className={inputClass} rows={3} maxLength={500} value={draft.mainObjective} onChange={(event) => setDraft((current) => ({ ...current, mainObjective: event.target.value }))} />
        </label>
        <label className={labelClass}>
          Secondary objective (optional)
          <textarea className={inputClass} rows={2} maxLength={500} value={draft.secondaryObjective ?? ""} onChange={(event) => setDraft((current) => ({ ...current, secondaryObjective: event.target.value }))} />
        </label>
        <label className={labelClass}>
          Head Coach note (optional)
          <textarea className={inputClass} rows={3} maxLength={2000} value={draft.headCoachNote ?? ""} onChange={(event) => setDraft((current) => ({ ...current, headCoachNote: event.target.value }))} />
        </label>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><CalendarDays size={18} className="text-cyan-300" /><h5 className="font-black text-white">Sessions ({draft.sessions.length}/{MAX_WEEKLY_TRAINING_SESSIONS})</h5></div>
            <button type="button" disabled={draft.sessions.length >= MAX_WEEKLY_TRAINING_SESSIONS} onClick={() => setDraft((current) => ({ ...current, sessions: addTrainingSession(current.sessions) }))} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-bold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={15} /> Add session</button>
          </div>

          {draft.sessions.map((session, sessionIndex) => (
            <article key={sessionIndex} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <h6 className="font-bold text-white">Session {sessionIndex + 1}</h6>
                <button type="button" disabled={draft.sessions.length <= 1} onClick={() => setDraft((current) => ({ ...current, sessions: removeTrainingSession(current.sessions, sessionIndex) }))} className="inline-flex items-center gap-1 text-xs font-bold text-rose-300 disabled:opacity-30"><Trash2 size={14} /> Remove session</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Date<input type="date" className={inputClass} value={session.sessionDate} onChange={(event) => updateSession(sessionIndex, { ...session, sessionDate: event.target.value })} /></label>
                <label className={labelClass}>Start time<input type="time" className={inputClass} value={session.startTime} onChange={(event) => updateSession(sessionIndex, { ...session, startTime: event.target.value })} /></label>
                <label className={labelClass}>Location<input className={inputClass} maxLength={200} value={session.location} onChange={(event) => updateSession(sessionIndex, { ...session, location: event.target.value })} /></label>
                <label className={labelClass}>Duration<input type="number" min={15} max={360} className={inputClass} value={session.durationMinutes} onChange={(event) => updateSession(sessionIndex, { ...session, durationMinutes: toInteger(event.target.value, session.durationMinutes) })} /></label>
              </div>
              <label className={labelClass}>Session objective<textarea className={inputClass} rows={2} maxLength={500} value={session.objective} onChange={(event) => updateSession(sessionIndex, { ...session, objective: event.target.value })} /></label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className={labelClass}>Phase of play<select className={inputClass} value={session.phaseOfPlay} onChange={(event) => updateSession(sessionIndex, { ...session, phaseOfPlay: event.target.value as ProClubTrainingPhaseOfPlay })}>{phaseOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                <label className={labelClass}>Planned load<select className={inputClass} value={session.plannedLoad} onChange={(event) => updateSession(sessionIndex, { ...session, plannedLoad: event.target.value as ProClubTrainingPlannedLoad })}>{loadOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              </div>

              <div className="space-y-3 border-t border-slate-800 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-300">Blocks ({session.blocks.length}/{MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION})</p><button type="button" disabled={session.blocks.length >= MAX_WEEKLY_TRAINING_BLOCKS_PER_SESSION} onClick={() => updateSession(sessionIndex, addTrainingBlock(session))} className="inline-flex items-center gap-1 text-xs font-bold text-cyan-300 disabled:opacity-30"><Plus size={14} /> Add block</button></div>
                {session.blocks.map((block, blockIndex) => (
                  <div key={blockIndex} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 lg:grid-cols-[150px_minmax(0,1fr)_110px]">
                    <label className={labelClass}>Type<select className={inputClass} value={block.blockType} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, blockType: event.target.value as ProClubTrainingBlockType })}>{blockTypeOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                    <label className={labelClass}>Block title<input className={inputClass} maxLength={200} value={block.title} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, title: event.target.value })} /></label>
                    <label className={labelClass}>Minutes<input type="number" min={1} max={180} className={inputClass} value={block.durationMinutes} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, durationMinutes: toInteger(event.target.value, block.durationMinutes) })} /></label>
                    <label className={`${labelClass} lg:col-span-2`}>
                      Drill reference (optional)
                      <input
                        className={inputClass}
                        maxLength={PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES}
                        value={block.drillReference ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (proClubTrainingUtf8ByteLength(value) > PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES) return;
                          updateBlock(sessionIndex, blockIndex, {
                            ...block,
                            ...(value ? { drillReference: value } : { drillReference: undefined }),
                          });
                        }}
                      />
                      <span className="mt-1 block normal-case tracking-normal text-[10px] font-medium text-slate-500">
                        {proClubTrainingUtf8ByteLength(block.drillReference ?? "")}/{PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES} UTF-8 bytes
                      </span>
                    </label>
                    <button type="button" disabled={session.blocks.length <= 1} onClick={() => updateSession(sessionIndex, removeTrainingBlock(session, blockIndex))} className="self-end rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 disabled:opacity-30">Remove block</button>
                    <label className={`${labelClass} lg:col-span-3`}>Coaching points (one per line)<textarea className={inputClass} rows={3} maxLength={3000} value={block.coachingPoints.join("\n")} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, coachingPoints: event.target.value.split("\n") })} /></label>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void handleSave()} disabled={saving || Boolean(saved) || !authorityAllowed || !runtimeAllowed} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><Save size={17} /> {saving ? "Saving DRAFT…" : saved ? "DRAFT saved" : ambiguousSave ? "Retry same save" : "Save fresh DRAFT"}</button>
        <p className="text-xs leading-5 text-slate-500">Server-side authorization, idempotency receipt and one atomic Admin transaction remain the final write boundary.</p>
      </div>
    </section>
  );
}