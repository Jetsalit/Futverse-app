import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ClipboardList,
  Goal,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import type { ProClubSquadRosterRecord } from "../../../lib/firestore/proClubSquadRosterRepository";
import type {
  ProClubPersistedShootoutPlan,
  ProClubPersistedStartingXIPlan,
} from "../../../lib/proClubMatchStartingXI";
import {
  PRO_CLUB_GAME_MODEL_PHASES,
  PRO_CLUB_SET_PIECE_DUTIES,
  PRO_CLUB_STARTING_XI_FIXED_FORMATIONS,
  PRO_CLUB_STARTING_XI_FIXED_SLOTS,
  canAuthorProClubStartingXI,
  createEmptyProClubStartingXIDraft,
  type ProClubSetPieceDuty,
  type ProClubStartingXIFixedFormation,
} from "../../../lib/proClubStartingXI11v11";
import {
  availableProClubStartingXIPlayers,
  buildProClubStartingXIPlayerViews,
  buildProClubStartingXISlotViews,
} from "./proClubStartingXIViewModel";
import ProClubStartingXIPlayerPicker, {
  type ProClubPlayerPickerMode,
} from "./ProClubStartingXIPlayerPicker";

const GAME_MODEL_COPY: Record<(typeof PRO_CLUB_GAME_MODEL_PHASES)[number], readonly string[]> = {
  IN_POSSESSION: [
    "Build out from the back",
    "Create width before progressing",
    "Support underneath the ball",
  ],
  OUT_OF_POSSESSION: [
    "Compact central spaces",
    "Press on agreed triggers",
    "Protect depth behind pressure",
  ],
  TRANSITION_TO_ATTACK: [
    "First pass forward when available",
    "Attack open wide channels",
    "Support the runner beyond the ball",
  ],
  TRANSITION_TO_DEFEND: [
    "Counter-press nearest options",
    "Recover central compactness",
    "Delay if immediate regain is unavailable",
  ],
};

const PHASE_LABELS: Record<(typeof PRO_CLUB_GAME_MODEL_PHASES)[number], string> = {
  IN_POSSESSION: "In Possession",
  OUT_OF_POSSESSION: "Out of Possession",
  TRANSITION_TO_ATTACK: "Transition to Attack",
  TRANSITION_TO_DEFEND: "Transition to Defend",
};

const DUTY_LABELS: Record<ProClubSetPieceDuty, string> = {
  CORNER_LEFT: "Corners (L)",
  CORNER_RIGHT: "Corners (R)",
  FREE_KICK_LEFT: "Free Kicks (L)",
  FREE_KICK_RIGHT: "Free Kicks (R)",
  THROW_IN_LEFT: "Throw-ins (L)",
  THROW_IN_RIGHT: "Throw-ins (R)",
  PENALTY: "Penalty",
};

function displayPhaseTone(phase: (typeof PRO_CLUB_GAME_MODEL_PHASES)[number]): string {
  switch (phase) {
    case "IN_POSSESSION":
      return "border-emerald-400/20 bg-emerald-400/5 text-emerald-300";
    case "OUT_OF_POSSESSION":
      return "border-rose-400/20 bg-rose-400/5 text-rose-300";
    case "TRANSITION_TO_ATTACK":
      return "border-cyan-400/20 bg-cyan-400/5 text-cyan-300";
    case "TRANSITION_TO_DEFEND":
      return "border-amber-400/20 bg-amber-400/5 text-amber-300";
  }
}

export default function ProClubStartingXI11v11({
  authority,
  roster,
  initialStartingXI = null,
  initialShootout = null,
  saving = false,
  saveMessage = null,
  startingXIWritable = true,
  shootoutWritable = true,
  onSaveStartingXI,
  onSaveShootout,
}: {
  authority: ProClubOrganizationAuthority;
  roster: readonly ProClubSquadRosterRecord[];
  initialStartingXI?: ProClubPersistedStartingXIPlan | null;
  initialShootout?: ProClubPersistedShootoutPlan | null;
  saving?: boolean;
  saveMessage?: string | null;
  startingXIWritable?: boolean;
  shootoutWritable?: boolean;
  onSaveStartingXI?: (plan: ProClubPersistedStartingXIPlan) => void | Promise<void>;
  onSaveShootout?: (plan: ProClubPersistedShootoutPlan) => void | Promise<void>;
}) {
  const persistedFixedFormation =
    initialStartingXI &&
    (PRO_CLUB_STARTING_XI_FIXED_FORMATIONS as readonly string[]).includes(
      initialStartingXI.formation,
    )
      ? initialStartingXI.formation as ProClubStartingXIFixedFormation
      : "4-3-3";
  const initialDraft = createEmptyProClubStartingXIDraft(persistedFixedFormation);
  const [formation, setFormation] = useState<ProClubStartingXIFixedFormation>(
    persistedFixedFormation,
  );
  const [slotPlayerKeys, setSlotPlayerKeys] = useState<(string | null)[]>(
    () => [...(initialStartingXI?.slotPlayerKeys ?? initialDraft.slotPlayerKeys)],
  );
  const [substitutePlayerKeys, setSubstitutePlayerKeys] = useState<string[]>(
    () => [...(initialStartingXI?.substitutePlayerKeys ?? [])],
  );
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [playerPickerMode, setPlayerPickerMode] = useState<ProClubPlayerPickerMode | null>(null);
  const [activeTacticalPanel, setActiveTacticalPanel] = useState<
    "ROLES" | "GAME_MODEL" | "SET_PIECES" | "SHOOTOUT"
  >("ROLES");
  const [roleAssignments, setRoleAssignments] = useState<(string | null)[]>(
    () => [...(initialStartingXI?.positionRoleAssignments ?? initialDraft.positionRoleAssignments)],
  );
  const [setPieceAssignments, setSetPieceAssignments] = useState(
    () => ({ ...(initialStartingXI?.setPieceAssignments ?? initialDraft.setPieceAssignments) }),
  );
  const [penaltyPrimary, setPenaltyPrimary] = useState<string[]>(
    () => [...(initialShootout?.primaryTakers ?? [])],
  );
  const [penaltyBackups, setPenaltyBackups] = useState<string[]>(
    () => [...(initialShootout?.backupTakers ?? [])],
  );
  const [coachNotes, setCoachNotes] = useState(initialStartingXI?.coachNotes ?? "");

  const authorCanEdit = canAuthorProClubStartingXI(authority) && !saving;
  const startingXIEditable = authorCanEdit && startingXIWritable;
  const shootoutEditable = authorCanEdit && shootoutWritable;

  useEffect(() => {
    if (!initialStartingXI) return;

    const nextFormation =
      (PRO_CLUB_STARTING_XI_FIXED_FORMATIONS as readonly string[]).includes(
        initialStartingXI.formation,
      )
        ? initialStartingXI.formation as ProClubStartingXIFixedFormation
        : "4-3-3";

    setFormation(nextFormation);
    setSlotPlayerKeys([...initialStartingXI.slotPlayerKeys]);
    setSubstitutePlayerKeys([...initialStartingXI.substitutePlayerKeys]);
    setRoleAssignments([...initialStartingXI.positionRoleAssignments]);
    setSetPieceAssignments({ ...initialStartingXI.setPieceAssignments });
    setCoachNotes(initialStartingXI.coachNotes);
    setActiveSlot(null);
  }, [initialStartingXI]);

  useEffect(() => {
    if (!initialShootout) return;
    setPenaltyPrimary([...initialShootout.primaryTakers]);
    setPenaltyBackups([...initialShootout.backupTakers]);
  }, [initialShootout]);

  const players = useMemo(() => buildProClubStartingXIPlayerViews(roster), [roster]);
  const slotViews = useMemo(
    () => buildProClubStartingXISlotViews(formation, slotPlayerKeys, players),
    [formation, slotPlayerKeys, players],
  );
  const availablePlayers = useMemo(
    () =>
      availableProClubStartingXIPlayers(
        players,
        slotPlayerKeys,
        substitutePlayerKeys,
      ),
    [players, slotPlayerKeys, substitutePlayerKeys],
  );
  const byKey = useMemo(
    () => new Map(players.map((player) => [player.playerKey, player] as const)),
    [players],
  );

  function selectFormation(next: ProClubStartingXIFixedFormation) {
    setFormation(next);
    setActiveSlot(null);
    setPlayerPickerMode(null);
  }

  function assignStarter(playerKey: string) {
    if (!startingXIEditable || activeSlot === null) return;

    setSlotPlayerKeys((current) => {
      if (current.includes(playerKey)) return current;
      const next = [...current];
      next[activeSlot] = playerKey;
      return next;
    });
    setSubstitutePlayerKeys((current) => current.filter((key) => key !== playerKey));
    setActiveSlot(null);
    setPlayerPickerMode(null);
  }

  function removeStarter(slotIndex: number) {
    if (!startingXIEditable) return;
    setSlotPlayerKeys((current) => {
      const next = [...current];
      next[slotIndex] = null;
      return next;
    });
  }

  function addSubstitute(playerKey: string) {
    if (!startingXIEditable) return;
    setSlotPlayerKeys((current) => current.map((key) => key === playerKey ? null : key));
    setSubstitutePlayerKeys((current) =>
      current.includes(playerKey) ? current : [...current, playerKey],
    );
    setPlayerPickerMode(null);
  }

  function removeSubstitute(playerKey: string) {
    if (!startingXIEditable) return;
    setSubstitutePlayerKeys((current) => current.filter((key) => key !== playerKey));
  }

  function assignRole(slotIndex: number, value: string) {
    if (!startingXIEditable) return;
    setRoleAssignments((current) => {
      const next = [...current];
      next[slotIndex] = value.trim() ? value : null;
      return next;
    });
  }

  function assignSetPiece(duty: ProClubSetPieceDuty, playerKey: string) {
    if (!startingXIEditable) return;
    setSetPieceAssignments((current) => ({
      ...current,
      [duty]: playerKey || null,
    }));
  }

  async function saveStartingXI() {
    if (!startingXIEditable || !onSaveStartingXI) return;
    await onSaveStartingXI({
      schemaVersion: 1,
      formation,
      slotPlayerKeys: [...slotPlayerKeys],
      substitutePlayerKeys: [...substitutePlayerKeys],
      positionRoleAssignments: [...roleAssignments],
      setPieceAssignments: { ...setPieceAssignments },
      coachNotes,
    });
  }

  async function saveShootout() {
    if (!shootoutEditable || !onSaveShootout) return;
    await onSaveShootout({
      schemaVersion: 1,
      primaryTakers: [...penaltyPrimary],
      backupTakers: [...penaltyBackups],
    });
  }

  function appendPenaltyTaker(playerKey: string, target: "PRIMARY" | "BACKUP") {
    if (!shootoutEditable) return;
    if ([...penaltyPrimary, ...penaltyBackups].includes(playerKey)) return;

    if (target === "PRIMARY") {
      if (penaltyPrimary.length >= 5) return;
      setPenaltyPrimary((current) => [...current, playerKey]);
      return;
    }

    if (penaltyBackups.length >= 5) return;
    setPenaltyBackups((current) => [...current, playerKey]);
  }

  function removePenaltyTaker(playerKey: string) {
    if (!shootoutEditable) return;
    setPenaltyPrimary((current) => current.filter((key) => key !== playerKey));
    setPenaltyBackups((current) => current.filter((key) => key !== playerKey));
  }

  const selectedSquadKeys = [
    ...slotPlayerKeys.filter((value): value is string => value !== null),
    ...substitutePlayerKeys,
  ];

  return (
    <section aria-labelledby="pro-club-starting-xi-title" className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              Pro Club 11v11
            </p>
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-300">
              {onSaveStartingXI || onSaveShootout
                ? "Persistence connected"
                : "UI Adapter Preview · Persistence disabled"}
            </span>
          </div>
          <h3 id="pro-club-starting-xi-title" className="mt-2 text-2xl font-black text-white">
            Starting XI Command Center
          </h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            จัดตัวจริง · ตัวสำรอง · แผนการเล่น · หน้าที่รายตำแหน่ง · จุดโทษตัดสิน · เตรียมข้อมูลก่อนส่งถึงนักกีฬา
          </p>
        </div>
        <div className="space-y-2 text-right">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-200">
            {startingXIEditable || shootoutEditable
              ? String(authority.staffRole) + " authoring"
              : saving
                ? "Saving canonical Match plan…"
                : "Read-only at this Match status"}
          </div>
          {saveMessage && (
            <p className="max-w-sm text-xs text-slate-400">{saveMessage}</p>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                Formation
              </span>
              {PRO_CLUB_STARTING_XI_FIXED_FORMATIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={formation === item}
                  onClick={() => selectFormation(item)}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-black transition",
                    formation === item
                      ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                      : "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400/30",
                  ].join(" ")}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                disabled
                title="Custom formation remains a later reviewed slice."
                className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-black text-slate-600"
              >
                Custom · later
              </button>
            </div>

            <div className="mt-4">
              <div className="relative min-h-[610px] overflow-hidden rounded-2xl border border-emerald-400/20 bg-[linear-gradient(180deg,rgba(4,120,87,.82),rgba(6,78,59,.92))] shadow-inner">
                <div className="absolute inset-4 border-2 border-white/40" />
                <div className="absolute left-4 right-4 top-1/2 h-px bg-white/40" />
                <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40" />
                <div className="absolute left-1/2 top-4 h-24 w-52 -translate-x-1/2 border-2 border-white/40" />
                <div className="absolute bottom-4 left-1/2 h-24 w-52 -translate-x-1/2 border-2 border-white/40" />

                {slotViews.map((slot) => (
                  <div
                    key={slot.slotIndex}
                    data-starting-xi-slot={slot.slotIndex}
                    className="absolute w-28 -translate-x-1/2 -translate-y-1/2 text-center"
                    style={{ left: String(slot.x) + "%", top: String(slot.y) + "%" }}
                  >
                    <button
                      type="button"
                      disabled={!startingXIEditable}
                      onClick={() => {
                        setActiveSlot(slot.slotIndex);
                        setPlayerPickerMode("STARTER");
                      }}
                      className={[
                        "mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-black shadow-lg transition",
                        activeSlot === slot.slotIndex
                          ? "border-amber-300 bg-amber-300 text-slate-950 ring-4 ring-amber-300/20"
                          : slot.player
                            ? "border-cyan-200/60 bg-slate-950 text-cyan-200"
                            : "border-dashed border-white/50 bg-black/30 text-white",
                      ].join(" ")}
                    >
                      {slot.player ? slot.player.jerseyNumber : "+"}
                    </button>
                    <div className="mt-1 rounded-lg border border-white/10 bg-slate-950/85 px-2 py-1 text-[10px] shadow-lg">
                      <p className="truncate font-black text-white">
                        {slot.player ? slot.player.shortName : slot.position}
                      </p>
                      <p className="mt-0.5 font-bold text-cyan-300">{slot.position}</p>
                    </div>
                    {slot.player && startingXIEditable && (
                      <button
                        type="button"
                        onClick={() => removeStarter(slot.slotIndex)}
                        className="mt-1 text-[9px] font-bold uppercase tracking-wide text-rose-200 hover:text-rose-100"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="flex items-center gap-2 font-black text-white">
                  <Users size={17} className="text-emerald-300" />
                  Substitutes
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  {substitutePlayerKeys.length} selected from Match Squad
                </p>
              </div>

              {startingXIEditable && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSlot(null);
                    setPlayerPickerMode("SUBSTITUTE");
                  }}
                  className="min-h-11 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-200"
                >
                  + Add Substitute
                </button>
              )}
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {substitutePlayerKeys.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">No substitutes selected.</p>
              ) : (
                substitutePlayerKeys.map((playerKey) => {
                  const player = byKey.get(playerKey);
                  if (!player) return null;
                  return (
                    <button
                      key={playerKey}
                      type="button"
                      disabled={!startingXIEditable}
                      onClick={() => removeSubstitute(playerKey)}
                      className="min-h-16 min-w-28 rounded-xl border border-slate-700 bg-slate-900 p-2 text-left disabled:opacity-60"
                    >
                      <p className="text-lg font-black text-cyan-200">#{player.jerseyNumber}</p>
                      <p className="truncate text-xs font-bold text-white">{player.shortName}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{player.positionLabel}</p>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
              <h4 className="font-black text-white">Head Coach / Technical Director Notes</h4>
              <textarea
                value={coachNotes}
                disabled={!startingXIEditable}
                onChange={(event) => setCoachNotes(event.target.value)}
                placeholder="Local preview notes only. Persistence is not enabled."
                className="mt-3 min-h-36 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200 outline-none focus:border-cyan-400/50 disabled:opacity-60"
              />
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
              <h4 className="flex items-center gap-2 font-black text-white">
                <Send size={17} className="text-cyan-300" />
                Player Communication & Sync
              </h4>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["Sent", "0/0"],
                  ["Seen", "0/0"],
                  ["Updated", "0/0"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-center">
                    <p className="text-[10px] text-slate-500">{label}</p>
                    <p className="mt-1 font-black text-white">{value}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled
                className="mt-3 w-full rounded-xl bg-emerald-400/20 px-3 py-2 text-xs font-black text-emerald-300 opacity-70"
              >
                Send to Players · persistence pending
              </button>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
              <h4 className="font-black text-white">Matchday Control</h4>
              <div className="mt-3 space-y-2">
                <button type="button" disabled className="flex w-full items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-400">
                  <ArrowLeftRight size={15} /> Swap Players · later persistence slice
                </button>
                <button type="button" disabled className="flex w-full items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-400">
                  <ClipboardList size={15} /> Adjust Roles · local role fields above
                </button>
                <button type="button" disabled className="flex w-full items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-400">
                  <RotateCcw size={15} /> Reset to Saved XI · no saved XI yet
                </button>
              </div>
            </section>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-900 p-1 2xl:grid-cols-4">
              {([
                ["ROLES", "Roles"],
                ["GAME_MODEL", "Game Model"],
                ["SET_PIECES", "Set Pieces"],
                ["SHOOTOUT", "Shootout"],
              ] as const).map(([panel, label]) => (
                <button
                  key={panel}
                  type="button"
                  aria-pressed={activeTacticalPanel === panel}
                  onClick={() => setActiveTacticalPanel(panel)}
                  className={[
                    "min-h-10 rounded-lg px-2 py-2 text-[10px] font-black transition",
                    activeTacticalPanel === panel
                      ? "bg-cyan-400/15 text-cyan-200"
                      : "text-slate-500 hover:text-slate-300",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {activeTacticalPanel === "ROLES" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-black text-white">Position Role Assignments</h4>
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  11 slots
                </span>
              </div>
              <div className="mt-3 max-h-[66vh] space-y-2 overflow-y-auto pr-1">
                {PRO_CLUB_STARTING_XI_FIXED_SLOTS[formation].map((slot) => {
                  const playerKey = slotPlayerKeys[slot.slotIndex];
                  const player = playerKey ? byKey.get(playerKey) : null;
                  return (
                    <label key={slot.slotIndex} className="block rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
                      <span className="flex items-center justify-between gap-2 text-[10px]">
                        <strong className="rounded-md bg-cyan-400/10 px-1.5 py-0.5 text-cyan-300">
                          {slot.position}
                        </strong>
                        <span className="truncate text-slate-500">
                          {player ? "#" + player.jerseyNumber + " " + player.shortName : "Player not selected"}
                        </span>
                      </span>
                      <input
                        value={roleAssignments[slot.slotIndex] ?? ""}
                        disabled={!startingXIEditable}
                        maxLength={160}
                        onChange={(event) => assignRole(slot.slotIndex, event.target.value)}
                        placeholder="Assign positional duty..."
                        className="mt-2 min-h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {activeTacticalPanel === "GAME_MODEL" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
              <div className="flex items-center gap-2 text-cyan-300">
                <Sparkles size={15} />
                <h4 className="font-black text-white">Game Model</h4>
              </div>
              <div className="mt-3 space-y-2">
                {PRO_CLUB_GAME_MODEL_PHASES.map((phase) => (
                  <article
                    key={phase}
                    className={["rounded-xl border p-3", displayPhaseTone(phase)].join(" ")}
                  >
                    <p className="text-[10px] font-black uppercase tracking-wide">
                      {PHASE_LABELS[phase]}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-300">
                      {GAME_MODEL_COPY[phase].map((line) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTacticalPanel === "SET_PIECES" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
              <h4 className="font-black text-white">Set-Piece Duties</h4>
              <div className="mt-3 space-y-2">
                {PRO_CLUB_SET_PIECE_DUTIES.map((duty) => (
                  <label key={duty} className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2 text-xs">
                    <span className="text-slate-400">{DUTY_LABELS[duty]}</span>
                    <select
                      value={setPieceAssignments[duty] ?? ""}
                      disabled={!startingXIEditable}
                      onChange={(event) => assignSetPiece(duty, event.target.value)}
                      className="max-w-44 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value="">Not assigned</option>
                      {selectedSquadKeys.map((playerKey) => {
                        const player = byKey.get(playerKey);
                        return player ? (
                          <option key={playerKey} value={playerKey}>
                            #{player.jerseyNumber} {player.shortName}
                          </option>
                        ) : null;
                      })}
                    </select>
                  </label>
                ))}
              </div>
              {onSaveStartingXI && (
                <button
                  type="button"
                  disabled={!startingXIEditable}
                  onClick={() => void saveStartingXI()}
                  className="mt-4 min-h-11 w-full rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-200 disabled:opacity-40"
                >
                  Save Starting XI
                </button>
              )}
            </section>
          )}

          {activeTacticalPanel === "SHOOTOUT" && (
            <section className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
              <h4 className="flex items-center gap-2 font-black text-white">
                <Goal size={17} className="text-amber-300" />
                Penalty Shootout Order
              </h4>
              <p className="mt-1 text-[10px] text-slate-500">
                For competitions requiring kicks from the penalty mark after a draw.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-cyan-300">
                    Primary 1–5
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {Array.from({ length: 5 }, (_, index) => {
                      const player = byKey.get(penaltyPrimary[index] ?? "");
                      return (
                        <div key={index} className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-300">
                          <span>{index + 1}. {player ? "#" + player.jerseyNumber + " " + player.shortName : "Not set"}</span>
                          {player && shootoutEditable && (
                            <button
                              type="button"
                              onClick={() => removePenaltyTaker(player.playerKey)}
                              className="text-[9px] font-bold uppercase tracking-wide text-rose-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-violet-300">
                    Backups
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {Array.from({ length: 5 }, (_, index) => {
                      const player = byKey.get(penaltyBackups[index] ?? "");
                      return (
                        <div key={index} className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs text-slate-300">
                          <span>B{index + 1}. {player ? "#" + player.jerseyNumber + " " + player.shortName : "Not set"}</span>
                          {player && shootoutEditable && (
                            <button
                              type="button"
                              onClick={() => removePenaltyTaker(player.playerKey)}
                              className="text-[9px] font-bold uppercase tracking-wide text-rose-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {onSaveShootout && (
                <button
                  type="button"
                  disabled={!shootoutEditable}
                  onClick={() => void saveShootout()}
                  className="mt-4 min-h-11 w-full rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-200 disabled:opacity-40"
                >
                  Save Shootout Order
                </button>
              )}

              {shootoutEditable && selectedSquadKeys.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                  <p className="text-[10px] font-bold text-slate-500">
                    Add selected Match Squad player
                  </p>
                  <div className="max-h-44 space-y-1 overflow-y-auto">
                    {selectedSquadKeys.map((playerKey) => {
                      const player = byKey.get(playerKey);
                      if (!player) return null;
                      return (
                        <div key={playerKey} className="flex min-h-10 items-center justify-between gap-2 text-[10px]">
                          <span className="truncate text-slate-300">
                            #{player.jerseyNumber} {player.shortName}
                          </span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => appendPenaltyTaker(playerKey, "PRIMARY")}
                              className="rounded-md border border-cyan-400/20 px-2 py-1.5 font-bold text-cyan-300"
                            >
                              1–5
                            </button>
                            <button
                              type="button"
                              onClick={() => appendPenaltyTaker(playerKey, "BACKUP")}
                              className="rounded-md border border-violet-400/20 px-2 py-1.5 font-bold text-violet-300"
                            >
                              Backup
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      <ProClubStartingXIPlayerPicker
        open={playerPickerMode !== null}
        mode={playerPickerMode ?? "STARTER"}
        slotLabel={
          activeSlot === null
            ? null
            : PRO_CLUB_STARTING_XI_FIXED_SLOTS[formation].find(
            (slot) => slot.slotIndex === activeSlot,
          )?.position ?? null
        }
        players={availablePlayers}
        onClose={() => {
          setPlayerPickerMode(null);
          setActiveSlot(null);
        }}
        onSelect={(playerKey) => {
          if (playerPickerMode === "SUBSTITUTE") {
            addSubstitute(playerKey);
          } else {
            assignStarter(playerKey);
          }
        }}
      />
    </section>
  );
}
