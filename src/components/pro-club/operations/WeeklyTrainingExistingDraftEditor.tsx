import { useState } from "react";
import { CheckCircle2, Save, X } from "lucide-react";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  getHeadCoachWeeklyTrainingSavedDraftDetail,
} from "../../../lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";
import {
  editProClubWeeklyTrainingExistingDraft,
  isAmbiguousWeeklyTrainingExistingDraftEditError,
  weeklyTrainingExistingDraftEditErrorMessage,
} from "../../../lib/proClubWeeklyTrainingExistingDraftEditClient";
import type {
  ProClubTrainingBlockDraft,
  ProClubTrainingBlockType,
  ProClubTrainingPhaseOfPlay,
  ProClubTrainingPlannedLoad,
  ProClubTrainingSessionDraft,
  ProClubWeeklyTrainingDraft,
} from "../../../lib/proClubWeeklyTraining";
import type {
  WeeklyTrainingSavedDraftDetail,
} from "../../../lib/proClubWeeklyTrainingSavedDraftReadModel";
import {
  PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES,
  proClubTrainingUtf8ByteLength,
} from "../../../lib/proClubWeeklyTrainingStorageBounds";
import { formatThaiDateLong, formatThaiDateShort, formatThaiTime } from "../../../lib/thaiDateTimePresentation";

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

function cloneDraft(draft: ProClubWeeklyTrainingDraft): ProClubWeeklyTrainingDraft {
  return {
    ...draft,
    sessions: draft.sessions.map((session) => ({
      ...session,
      blocks: session.blocks.map((block) => ({
        ...block,
        coachingPoints: [...block.coachingPoints],
      })),
    })),
  };
}

function replaceAt<T>(items: readonly T[], index: number, value: T): readonly T[] {
  return items.map((item, currentIndex) => (currentIndex === index ? value : item));
}

function toInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function sameOptionalString(left: string | undefined, right: string | undefined): boolean {
  return (left ?? undefined) === (right ?? undefined);
}

function exactIntendedDraft(
  actual: ProClubWeeklyTrainingDraft,
  intended: ProClubWeeklyTrainingDraft,
): boolean {
  if (
    actual.clubId !== intended.clubId ||
    actual.authorUid !== intended.authorUid ||
    actual.weekStartDate !== intended.weekStartDate ||
    actual.squadLabel !== intended.squadLabel ||
    actual.mainObjective !== intended.mainObjective ||
    !sameOptionalString(actual.secondaryObjective, intended.secondaryObjective) ||
    !sameOptionalString(actual.headCoachNote, intended.headCoachNote) ||
    actual.sessions.length !== intended.sessions.length
  ) {
    return false;
  }

  return actual.sessions.every((session, sessionIndex) => {
    const target = intended.sessions[sessionIndex];
    if (!target) return false;
    if (
      session.sessionDate !== target.sessionDate ||
      session.startTime !== target.startTime ||
      session.location !== target.location ||
      session.objective !== target.objective ||
      session.phaseOfPlay !== target.phaseOfPlay ||
      session.plannedLoad !== target.plannedLoad ||
      session.durationMinutes !== target.durationMinutes ||
      session.blocks.length !== target.blocks.length
    ) {
      return false;
    }
    return session.blocks.every((block, blockIndex) => {
      const targetBlock = target.blocks[blockIndex];
      return Boolean(
        targetBlock &&
        block.blockType === targetBlock.blockType &&
        block.title === targetBlock.title &&
        block.durationMinutes === targetBlock.durationMinutes &&
        sameOptionalString(block.drillReference, targetBlock.drillReference) &&
        block.coachingPoints.length === targetBlock.coachingPoints.length &&
        block.coachingPoints.every((point, pointIndex) => point === targetBlock.coachingPoints[pointIndex]),
      );
    });
  });
}

export default function WeeklyTrainingExistingDraftEditor({
  authority,
  detail,
  onCancel,
  onCommitted,
}: {
  authority: ProClubOrganizationAuthority;
  detail: WeeklyTrainingSavedDraftDetail;
  onCancel: () => void;
  onCommitted: (detail: WeeklyTrainingSavedDraftDetail) => void;
}) {
  const [draft, setDraft] = useState<ProClubWeeklyTrainingDraft>(() => cloneDraft(detail.draft));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

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

  async function readBackIntendedState(): Promise<WeeklyTrainingSavedDraftDetail | null> {
    const result = await getHeadCoachWeeklyTrainingSavedDraftDetail(
      authority.organizationId,
      authority.userId,
      detail.planId,
    );
    if (result.state !== "FOUND") return null;
    return exactIntendedDraft(result.value.draft, draft) ? result.value : null;
  }

  async function handleSave() {
    if (saving || saved) return;
    setSaving(true);
    setMessage("");
    try {
      await editProClubWeeklyTrainingExistingDraft({
        planId: detail.planId,
        expectedPlanUpdatedAt: detail.updatedAtOrder,
        draft,
      });
      const confirmed = await readBackIntendedState();
      if (!confirmed) {
        setMessage("The writer returned success, but the complete saved hierarchy could not be verified. Reload before editing again.");
        return;
      }
      setSaved(true);
      setMessage("DRAFT edit saved and verified.");
      onCommitted(confirmed);
    } catch (cause) {
      if (isAmbiguousWeeklyTrainingExistingDraftEditError(cause)) {
        const confirmed = await readBackIntendedState();
        if (confirmed) {
          setSaved(true);
          setMessage("DRAFT edit committed and was verified by complete read-back.");
          onCommitted(confirmed);
          return;
        }
        setMessage("The save result is uncertain and the complete hierarchy does not prove the intended edit. Reload the latest DRAFT before editing again.");
        return;
      }
      setMessage(weeklyTrainingExistingDraftEditErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-cyan-400/30 bg-slate-950/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Edit existing DRAFT</p>
          <h5 className="mt-2 text-lg font-black text-white">Fixed-shape Weekly Training edit</h5>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Session dates, start times, ordering and hierarchy shape are locked. Only reviewed content fields can change.
          </p>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 disabled:opacity-50"><X size={16} /> Cancel</button>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-400 sm:grid-cols-3">
        <div><span className="font-bold text-slate-300">Week</span><p className="mt-1">{formatThaiDateShort(draft.weekStartDate)}</p></div>
        <div><span className="font-bold text-slate-300">Plan</span><p className="mt-1 break-all">{detail.planId}</p></div>
        <div><span className="font-bold text-slate-300">Concurrency base</span><p className="mt-1">{formatThaiDateLong(detail.updatedAt)} {formatThaiTime(detail.updatedAt)}</p></div>
      </div>

      {message && <p role="status" className={`rounded-xl border p-3 text-sm ${saved ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-amber-500/30 bg-amber-500/10 text-amber-100"}`}>{saved && <CheckCircle2 className="mr-2 inline" size={16} />}{message}</p>}

      <fieldset disabled={saving || saved} className="space-y-5 disabled:opacity-70">
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>Squad<input className={inputClass} maxLength={100} value={draft.squadLabel} onChange={(event) => setDraft((current) => ({ ...current, squadLabel: event.target.value }))} /></label>
          <label className={labelClass}>Main objective<textarea className={inputClass} rows={2} maxLength={500} value={draft.mainObjective} onChange={(event) => setDraft((current) => ({ ...current, mainObjective: event.target.value }))} /></label>
        </div>
        <label className={labelClass}>Secondary objective (optional)<textarea className={inputClass} rows={2} maxLength={500} value={draft.secondaryObjective ?? ""} onChange={(event) => setDraft((current) => ({ ...current, secondaryObjective: event.target.value || undefined }))} /></label>
        <label className={labelClass}>Head Coach note (optional)<textarea className={inputClass} rows={3} maxLength={2000} value={draft.headCoachNote ?? ""} onChange={(event) => setDraft((current) => ({ ...current, headCoachNote: event.target.value || undefined }))} /></label>

        <div className="space-y-4">
          {draft.sessions.map((session, sessionIndex) => (
            <article key={`${session.sessionDate}-${session.startTime}`} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h6 className="font-black text-white">Session {sessionIndex + 1}</h6>
                <p className="text-xs text-slate-500">Locked: {formatThaiDateShort(session.sessionDate)} · {formatThaiTime(session.startTime)}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className={labelClass}>Location<input className={inputClass} maxLength={200} value={session.location} onChange={(event) => updateSession(sessionIndex, { ...session, location: event.target.value })} /></label>
                <label className={labelClass}>Duration<input type="number" min={15} max={360} className={inputClass} value={session.durationMinutes} onChange={(event) => updateSession(sessionIndex, { ...session, durationMinutes: toInteger(event.target.value, session.durationMinutes) })} /></label>
                <label className={labelClass}>Phase<select className={inputClass} value={session.phaseOfPlay} onChange={(event) => updateSession(sessionIndex, { ...session, phaseOfPlay: event.target.value as ProClubTrainingPhaseOfPlay })}>{phaseOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                <label className={labelClass}>Load<select className={inputClass} value={session.plannedLoad} onChange={(event) => updateSession(sessionIndex, { ...session, plannedLoad: event.target.value as ProClubTrainingPlannedLoad })}>{loadOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              </div>
              <label className={labelClass}>Session objective<textarea className={inputClass} rows={2} maxLength={500} value={session.objective} onChange={(event) => updateSession(sessionIndex, { ...session, objective: event.target.value })} /></label>

              <div className="space-y-3 border-t border-slate-800 pt-4">
                {session.blocks.map((block, blockIndex) => (
                  <div key={blockIndex} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 lg:grid-cols-[150px_minmax(0,1fr)_110px]">
                    <label className={labelClass}>Type<select className={inputClass} value={block.blockType} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, blockType: event.target.value as ProClubTrainingBlockType })}>{blockTypeOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                    <label className={labelClass}>Block title<input className={inputClass} maxLength={200} value={block.title} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, title: event.target.value })} /></label>
                    <label className={labelClass}>Minutes<input type="number" min={1} max={180} className={inputClass} value={block.durationMinutes} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, durationMinutes: toInteger(event.target.value, block.durationMinutes) })} /></label>
                    <label className={`${labelClass} lg:col-span-2`}>Drill reference (optional)<input className={inputClass} value={block.drillReference ?? ""} onChange={(event) => {
                      const value = event.target.value;
                      if (proClubTrainingUtf8ByteLength(value) > PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES) return;
                      updateBlock(sessionIndex, blockIndex, { ...block, drillReference: value || undefined });
                    }} /><span className="mt-1 block normal-case tracking-normal text-[10px] font-medium text-slate-500">{proClubTrainingUtf8ByteLength(block.drillReference ?? "")}/{PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES} UTF-8 bytes</span></label>
                    <label className={`${labelClass} lg:col-span-3`}>Coaching points (one per line)<textarea className={inputClass} rows={3} maxLength={3000} value={block.coachingPoints.join("\n")} onChange={(event) => updateBlock(sessionIndex, blockIndex, { ...block, coachingPoints: event.target.value.split("\n") })} /></label>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void handleSave()} disabled={saving || saved} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><Save size={17} /> {saving ? "Saving edit…" : saved ? "Edit verified" : "Save DRAFT edit"}</button>
        <p className="text-xs leading-5 text-slate-500">A stale or structurally changed DRAFT fails closed without overwrite.</p>
      </div>
    </section>
  );
}
