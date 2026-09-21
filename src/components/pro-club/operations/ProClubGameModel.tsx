import { useEffect, useState } from "react";
import { RefreshCw, Save, Sparkles } from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  getProClubGameModel,
  saveProClubGameModel,
  type ProClubGameModelRecord,
} from "../../../lib/firestore/proClubGameModelRepository";
import {
  GAME_MODEL_PHASES,
  GAME_MODEL_PHASE_LABELS,
  GAME_MODEL_PHASE_TEXT_LIMIT,
  cloneGameModelTextSnapshot,
  createEmptyGameModelTextSnapshot,
  type GameModelPhase,
  type GameModelTextSnapshot,
} from "../../../lib/gameModel";

function canEditGameModel(authority: ProClubOrganizationAuthority): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    (authority.staffRole === "HEAD_COACH" ||
      authority.staffRole === "TECHNICAL_DIRECTOR")
  );
}

export default function ProClubGameModel({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
}) {
  const [record, setRecord] = useState<ProClubGameModelRecord | null>(null);
  const [draft, setDraft] = useState<GameModelTextSnapshot>(
    createEmptyGameModelTextSnapshot,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const editable = canEditGameModel(authority);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const next = await getProClubGameModel(authority.organizationId);
        if (cancelled) return;
        setRecord(next);
        setDraft(
          next
            ? cloneGameModelTextSnapshot(next.phases)
            : createEmptyGameModelTextSnapshot(),
        );
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Game Model could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authority.organizationId, reloadToken]);

  function updatePhase(phase: GameModelPhase, text: string) {
    if (!editable) return;
    setDraft((current) => ({ ...current, [phase]: text }));
    setMessage(null);
  }

  async function save() {
    if (!editable || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveProClubGameModel(
        authority.organizationId,
        draft,
        record?.revision ?? 0,
      );
      setRecord(saved);
      setDraft(cloneGameModelTextSnapshot(saved.phases));
      setMessage(`Game Model saved at revision ${saved.revision}.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Game Model could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="pro-club-game-model-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Sparkles size={17} />
            <p className="text-xs font-black uppercase tracking-[0.18em]">
              Four Phases of Play
            </p>
          </div>
          <h3 id="pro-club-game-model-title" className="pro-club-heading mt-2 text-2xl font-black">
            Team Game Model
          </h3>
          <p className="pro-club-muted mt-2 max-w-3xl text-sm leading-6">
            The four phases are fixed. Coaches can write, edit or remove any text inside each phase. Saved Match plans keep their own snapshot.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadToken((current) => current + 1)}
          disabled={loading || saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {message}
        </p>
      )}

      {loading ? (
        <p className="pro-club-muted text-sm">Loading Game Model…</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {GAME_MODEL_PHASES.map((phase) => (
            <label
              key={phase}
              className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <span className="font-black text-white">
                {GAME_MODEL_PHASE_LABELS[phase]}
              </span>
              <textarea
                value={draft[phase]}
                disabled={!editable || saving}
                maxLength={GAME_MODEL_PHASE_TEXT_LIMIT}
                onChange={(event) => updatePhase(phase, event.target.value)}
                placeholder="Write the coach's Game Model text here…"
                rows={8}
                className="mt-3 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-cyan-400/50 disabled:opacity-60"
              />
              <span className="mt-2 block text-right text-[10px] text-slate-500">
                {draft[phase].length}/{GAME_MODEL_PHASE_TEXT_LIMIT}
              </span>
            </label>
          ))}
        </div>
      )}

      {editable && !loading && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-200 disabled:opacity-40"
        >
          <Save size={16} />
          {saving ? "Saving…" : "Save Game Model"}
        </button>
      )}
    </section>
  );
}
