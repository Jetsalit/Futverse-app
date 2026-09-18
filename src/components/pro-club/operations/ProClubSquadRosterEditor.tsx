import { useState, type FormEvent } from "react";
import { ShieldCheck, Upload, UserCircle, X } from "lucide-react";
import { compressProClubPlayerPhoto } from "../../../lib/proClubPlayerPhotoBrowser";
import type { ProClubPlayerPhotoInput } from "../../../lib/proClubPlayerPhoto";
import {
  PLAYER_POSITION_CODES,
  type PlayerPositionCode,
} from "../../../lib/playerPositionSelection";
import {
  createProClubSquadRosterPlayer,
  updateProClubSquadRosterPlayer,
  type ProClubSquadRosterRecord,
} from "../../../lib/firestore/proClubSquadRosterRepository";
import {
  buildProClubSquadRosterEditorSubmission,
  createProClubSquadRosterEditorDraft,
  proClubSquadRosterAllowedStatuses,
  proClubSquadRosterEditorDraftFromRecord,
  type ProClubSquadRosterEditorDraft,
  type ProClubSquadRosterEditorMode,
} from "./proClubSquadRosterEditorModel";

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Roster change could not be saved.";
}

export default function ProClubSquadRosterEditor({
  clubId,
  mode,
  playerKey,
  current,
  currentPhotoDataUrl,
  onClose,
  onSaved,
}: {
  clubId: string;
  mode: ProClubSquadRosterEditorMode;
  playerKey: string;
  current?: ProClubSquadRosterRecord;
  currentPhotoDataUrl?: string | null;
  onClose: () => void;
  onSaved: (
    record: ProClubSquadRosterRecord,
    photo?: ProClubPlayerPhotoInput,
  ) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<ProClubSquadRosterEditorDraft>(() =>
    mode === "EDIT" && current
      ? proClubSquadRosterEditorDraftFromRecord(current)
      : createProClubSquadRosterEditorDraft(playerKey),
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [photoInput, setPhotoInput] = useState<ProClubPlayerPhotoInput | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    currentPhotoDataUrl ?? null,
  );
  const [photoProcessing, setPhotoProcessing] = useState(false);

  const allowedStatuses = proClubSquadRosterAllowedStatuses(
    mode,
    current?.status,
  );

  const setField = <K extends keyof ProClubSquadRosterEditorDraft>(
    key: K,
    value: ProClubSquadRosterEditorDraft[K],
  ) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setErrors([]);
  };

  const setAdditionalPosition = (index: number, value: string) => {
    const next = [...draft.additionalPositions];
    next[index] = value;
    setField("additionalPositions", next);
  };

  const handlePhotoSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPhotoProcessing(true);
    setErrors([]);

    try {
      const compressed = await compressProClubPlayerPhoto(file);
      setPhotoInput(compressed);
      setPhotoPreview(compressed.dataUrl);
    } catch (error) {
      setPhotoInput(null);
      setErrors([errorMessage(error)]);
    } finally {
      setPhotoProcessing(false);
      event.target.value = "";
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const built = buildProClubSquadRosterEditorSubmission(
      mode,
      draft,
      current,
    );

    if (built.ok === false) {
      setErrors(built.errors);
      return;
    }

    setSaving(true);
    setErrors([]);

    try {
      const saved = mode === "CREATE"
        ? await createProClubSquadRosterPlayer(
            clubId,
            built.playerKey,
            built.input,
          )
        : await updateProClubSquadRosterPlayer(
            clubId,
            built.playerKey,
            built.input,
          );

      await onSaved(saved, photoInput ?? undefined);
    } catch (error) {
      setErrors([errorMessage(error)]);
    } finally {
      setSaving(false);
    }
  };

  const futIdLocked = mode === "EDIT" && current?.futId !== null;
  const released = current?.status === "RELEASED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close roster editor"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />

      <section className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              Head Coach · Squad
            </p>
            <h4 className="mt-2 text-xl font-black text-white">
              {mode === "CREATE" ? "Add First Team Player" : "Edit First Team Player"}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              No delete action is available. FUTID binding is verified by Firestore Rules.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </header>

        <form onSubmit={submit} className="overflow-y-auto px-5 py-5 sm:px-6">
          {released && (
            <div className="mb-5 flex gap-3 rounded-2xl border border-amber-700/50 bg-amber-950/20 p-4 text-sm text-amber-100">
              <ShieldCheck className="mt-0.5 shrink-0" size={18} />
              RELEASED is terminal in V1. This record may remain RELEASED but cannot return to ACTIVE or INACTIVE.
            </div>
          )}

          {errors.length > 0 && (
            <div className="mb-5 rounded-2xl border border-rose-800/60 bg-rose-950/30 p-4">
              <p className="text-sm font-bold text-rose-200">Review before saving</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-rose-100/90">
                {errors.map((error) => <li key={error}>• {error}</li>)}
              </ul>
            </div>
          )}

          <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-500">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Player preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <UserCircle size={42} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Player photo
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Optional. The browser reduces the image to WebP up to 256×256 and about 60 KB before saving to Firestore. No Firebase Storage is used.
                </p>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-500/15">
                  <Upload size={14} />
                  {photoProcessing ? "Processing…" : photoPreview ? "Change photo" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={photoProcessing || saving}
                    onChange={(event) => void handlePhotoSelected(event)}
                    className="sr-only"
                  />
                </label>
                {photoInput && (
                  <p className="mt-2 text-[11px] text-emerald-300">
                    Ready: {photoInput.width}×{photoInput.height} · {Math.ceil(photoInput.byteSize / 1024)} KB
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Player key</span>
              <input
                value={draft.playerKey}
                readOnly
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-xs text-slate-400"
              />
            </label>

            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">First name</span>
              <input
                required
                maxLength={80}
                value={draft.firstName}
                onChange={(event) => setField("firstName", event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
              />
            </label>

            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Last name</span>
              <input
                maxLength={80}
                value={draft.lastName}
                onChange={(event) => setField("lastName", event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
              />
            </label>

            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Jersey number</span>
              <input
                required
                inputMode="numeric"
                value={draft.jerseyNumber}
                onChange={(event) => setField("jerseyNumber", event.target.value)}
                placeholder="0–99"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
              />
            </label>

            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Squad label</span>
              <input
                required
                maxLength={80}
                value={draft.squadLabel}
                onChange={(event) => setField("squadLabel", event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
              />
            </label>

            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Primary position</span>
              <select
                required
                value={draft.position}
                onChange={(event) => setField("position", event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
              >
                <option value="">Select position</option>
                {PLAYER_POSITION_CODES.map((position) => (
                  <option key={position} value={position}>{position}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Status</span>
              <select
                value={draft.status}
                disabled={mode === "CREATE"}
                onChange={(event) => setField("status", event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500 disabled:opacity-60"
              >
                {allowedStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">FUTID</span>
              <input
                value={draft.futId}
                readOnly={futIdLocked}
                onChange={(event) => setField("futId", event.target.value.toUpperCase())}
                placeholder="Optional until an issued FUTID can be bound"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-cyan-500 read-only:text-slate-500"
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                {futIdLocked
                  ? "Existing FUTID is immutable in V1."
                  : "Leave blank for a provisional roster record, or enter an existing issued FUTID that maps to this playerKey."}
              </p>
            </label>
          </div>

          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Additional positions</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {draft.additionalPositions.map((value, index) => (
                <select
                  key={`additional-${index}`}
                  value={value}
                  onChange={(event) => setAdditionalPosition(index, event.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
                >
                  <option value="">Optional</option>
                  {PLAYER_POSITION_CODES.map((position: PlayerPositionCode) => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </select>
              ))}
            </div>
          </div>

          <footer className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-800 pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || photoProcessing}
              className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || photoProcessing}
              className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : mode === "CREATE" ? "Add player" : "Save changes"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
