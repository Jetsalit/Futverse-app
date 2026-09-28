import { useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import {
  PRO_CLUB_ANALYSIS_ATTACKING_PATTERNS,
  PRO_CLUB_ANALYSIS_FIXED_FORMATIONS,
  PRO_CLUB_ANALYSIS_FIXED_SLOTS,
  PRO_CLUB_ANALYSIS_SECTIONS,
  createProClubAnalysisFormationSlots,
  getProClubAnalysisPointerCoordinates,
  moveProClubAnalysisCustomFormationSlot,
  type ProClubAnalysisFixedFormation,
  type ProClubAnalysisKeyMan,
  type ProClubAnalysisSectionId,
  type ProClubAnalysisTopic,
  type ProClubAnalysisTopicValue,
  type ProClubMatchAnalysis,
} from "../../../lib/proClubMatchAnalysis";
import type { ProClubCustomFormationSlot } from "../../../lib/proClubStartingXI11v11";
import type { PlayerPositionCode } from "../../../lib/playerPositionSelection";
import { getProClubAnalysisRatingClass } from "./proClubTheme";

const TEXT_LIMIT = 2000;

function updateAnalysis(
  setAnalysis: Dispatch<SetStateAction<ProClubMatchAnalysis | null>>,
  update: (current: ProClubMatchAnalysis) => ProClubMatchAnalysis,
) {
  setAnalysis((current) => current ? update(current) : current);
}

function Field({
  label,
  value,
  onChange,
  disabled,
  maxLength = TEXT_LIMIT,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <textarea
        aria-label={label}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={3}
        className="pro-club-analysis-input mt-1 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100"
      />
    </label>
  );
}

function rebuildLineupSlots(
  base: readonly { slotIndex: number; position: PlayerPositionCode; x: number; y: number; label?: string }[],
  oldSlots: ProClubMatchAnalysis["sections"]["FORMATION_LINEUP"]["slots"],
) {
  return base.map((slot, index) => {
    const old = oldSlots[index];
    return {
      slotIndex: index,
      position: slot.position,
      x: slot.x,
      y: slot.y,
      label: slot.label ?? slot.position,
      playerName: old?.playerName ?? "",
      jerseyNumber: old?.jerseyNumber ?? null,
      notes: old?.notes ?? "",
    };
  });
}

export default function ProClubMatchAnalysisSectionEditor({
  sectionId,
  analysis,
  setAnalysis,
  disabled,
  topics,
  onOpponentNameChange,
}: {
  sectionId: ProClubAnalysisSectionId;
  analysis: ProClubMatchAnalysis;
  setAnalysis: Dispatch<SetStateAction<ProClubMatchAnalysis | null>>;
  disabled: boolean;
  topics: readonly ProClubAnalysisTopic[];
  onOpponentNameChange: (name: string) => void;
}) {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [expandedNotesSlotIndex, setExpandedNotesSlotIndex] = useState<number | null>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ slotIndex: number; pointerId: number } | null>(null);
  const initialLineup = analysis.sections.FORMATION_LINEUP;
  const customResetSeedRef = useRef<readonly ProClubCustomFormationSlot[] | null>(
    initialLineup.formation === "CUSTOM" && initialLineup.customFormationSlots
      ? initialLineup.customFormationSlots.map((slot) => ({ ...slot }))
      : null,
  );
  const title = PRO_CLUB_ANALYSIS_SECTIONS.find((section) => section.id === sectionId)!.label;

  if (sectionId === "FORMATION_LINEUP") {
    const lineup = analysis.sections.FORMATION_LINEUP;
    const isCustom = lineup.formation === "CUSTOM";

    function changeFormation(value: string) {
      if (value === "CUSTOM") {
        const base: readonly ProClubCustomFormationSlot[] =
          lineup.formation === "CUSTOM"
            ? lineup.customFormationSlots ?? createProClubAnalysisFormationSlots("4-3-3")
            : createProClubAnalysisFormationSlots(lineup.formation);
        const custom = base.map((slot) => ({ ...slot }));
        customResetSeedRef.current = custom.map((slot) => ({ ...slot }));
        const slots = rebuildLineupSlots(custom, lineup.slots);
        updateAnalysis(setAnalysis, (current) => ({
          ...current,
          sections: {
            ...current.sections,
            FORMATION_LINEUP: { ...current.sections.FORMATION_LINEUP, formation: "CUSTOM", customFormationSlots: custom, slots },
          },
        }));
        return;
      }
      if (!(PRO_CLUB_ANALYSIS_FIXED_FORMATIONS as readonly string[]).includes(value)) return;
      const formation = value as ProClubAnalysisFixedFormation;
      const slots = rebuildLineupSlots(
        createProClubAnalysisFormationSlots(formation),
        lineup.slots,
      );
      updateAnalysis(setAnalysis, (current) => ({
        ...current,
        sections: {
          ...current.sections,
          FORMATION_LINEUP: { ...current.sections.FORMATION_LINEUP, formation, customFormationSlots: null, slots },
        },
      }));
    }

    function resetFormation() {
      const currentLineup = analysis.sections.FORMATION_LINEUP;
      const seed = currentLineup.formation === "CUSTOM"
        ? customResetSeedRef.current ?? currentLineup.customFormationSlots
        : PRO_CLUB_ANALYSIS_FIXED_SLOTS[currentLineup.formation];
      if (!seed) return;
      updateAnalysis(setAnalysis, (current) => {
        const currentFormation = current.sections.FORMATION_LINEUP;
        const slots = currentFormation.slots.map((slot, index) => ({
          ...slot,
          x: seed[index]?.x ?? slot.x,
          y: seed[index]?.y ?? slot.y,
        }));
        const customFormationSlots = currentFormation.formation === "CUSTOM"
          ? (currentFormation.customFormationSlots ?? []).map((slot, index) => ({
              ...slot,
              x: seed[index]?.x ?? slot.x,
              y: seed[index]?.y ?? slot.y,
            }))
          : null;
        return {
          ...current,
          sections: {
            ...current.sections,
            FORMATION_LINEUP: { ...currentFormation, slots, customFormationSlots },
          },
        };
      });
    }

    function patchSlot(
      slotIndex: number,
      patch: Partial<ProClubMatchAnalysis["sections"]["FORMATION_LINEUP"]["slots"][number]>,
    ) {
      updateAnalysis(setAnalysis, (current) => {
        const currentLineup = current.sections.FORMATION_LINEUP;
        const slots = currentLineup.slots.map((slot, index) =>
          index === slotIndex ? { ...slot, ...patch } : slot,
        );
        const customFormationSlots = currentLineup.formation === "CUSTOM"
          ? (currentLineup.customFormationSlots ?? []).map((slot, index) => {
              if (index !== slotIndex) return slot;
              return {
                ...slot,
                position: (patch.position ?? slot.position) as PlayerPositionCode,
                x: patch.x ?? slot.x,
                y: patch.y ?? slot.y,
                label: patch.label ?? slot.label,
              };
            })
          : null;
        return {
          ...current,
          sections: {
            ...current.sections,
            FORMATION_LINEUP: { ...currentLineup, slots, customFormationSlots },
          },
        };
      });
    }

    function handleMarkerPointerDown(
      slotIndex: number,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) {
      setSelectedSlotIndex(slotIndex);
      if (!isCustom || disabled) return;
      event.preventDefault();
      dragRef.current = { slotIndex, pointerId: event.pointerId };
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    function handleMarkerPointerMove(
      slotIndex: number,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) {
      const activeDrag = dragRef.current;
      if (!isCustom || disabled || !pitchRef.current ||
        activeDrag?.slotIndex !== slotIndex || activeDrag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const coordinates = getProClubAnalysisPointerCoordinates(
        pitchRef.current.getBoundingClientRect(),
        event.clientX,
        event.clientY,
      );
      const customSlots = analysis.sections.FORMATION_LINEUP.customFormationSlots ?? [];
      const moved = moveProClubAnalysisCustomFormationSlot(
        customSlots,
        slotIndex,
        coordinates.x,
        coordinates.y,
      )[slotIndex];
      if (moved) patchSlot(slotIndex, { x: moved.x, y: moved.y });
    }

    function finishMarkerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      if (typeof event.currentTarget.releasePointerCapture === "function") {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }

    return (
      <section aria-labelledby="analysis-section-editor-title" className="space-y-4">
        <SectionHeading title={title} hint="Map the opponent's shape and first XI." />
        <label className="block max-w-sm text-sm font-bold text-slate-700">
          Opponent
          <input
            aria-label="Opponent name"
            value={analysis.opponentSnapshot.name}
            maxLength={120}
            disabled={disabled}
            onChange={(event) => onOpponentNameChange(event.currentTarget.value)}
            className="pro-club-analysis-input mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100"
          />
        </label>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <section className="pro-club-analysis-card min-w-0 rounded-2xl border border-slate-200 p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-slate-900">Formation · {lineup.formation}</h3>
                {isCustom && <p className="text-xs text-slate-500">Drag markers to adjust player positions.</p>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Opponent formation"
                  value={lineup.formation}
                  disabled={disabled}
                  onChange={(event) => changeFormation(event.currentTarget.value)}
                  className="pro-club-analysis-input rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900 disabled:bg-slate-100"
                >
                  {PRO_CLUB_ANALYSIS_FIXED_FORMATIONS.map((formation) => <option key={formation} value={formation}>{formation}</option>)}
                  <option value="CUSTOM">Custom</option>
                </select>
                <button type="button" disabled={disabled} onClick={resetFormation} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
                  Reset formation
                </button>
              </div>
            </div>

            <div
              ref={pitchRef}
              aria-label="Opponent formation pitch"
              className="pro-club-analysis-pitch relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-emerald-900 bg-emerald-700"
            >
              <div className="absolute inset-3 rounded-xl border border-white/55" />
              <div className="absolute left-1/2 top-1/2 h-px w-[calc(100%-24px)] -translate-x-1/2 bg-white/50" />
              <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
              {lineup.slots.map((slot) => (
                <button
                  key={slot.slotIndex}
                  type="button"
                  aria-label={`Select lineup slot ${slot.slotIndex + 1} ${slot.position}`}
                  aria-pressed={selectedSlotIndex === slot.slotIndex}
                  aria-grabbed={isCustom && selectedSlotIndex === slot.slotIndex && dragRef.current?.slotIndex === slot.slotIndex}
                  data-lineup-marker={slot.slotIndex}
                  data-custom-draggable={isCustom && !disabled ? "true" : "false"}
                  data-selected={selectedSlotIndex === slot.slotIndex}
                  onClick={() => setSelectedSlotIndex(slot.slotIndex)}
                  onPointerDown={(event) => handleMarkerPointerDown(slot.slotIndex, event)}
                  onPointerMove={(event) => handleMarkerPointerMove(slot.slotIndex, event)}
                  onPointerUp={finishMarkerDrag}
                  onPointerCancel={finishMarkerDrag}
                  className={`pro-club-analysis-marker absolute z-10 flex max-w-[28%] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg px-1 py-0.5 text-white ${isCustom && !disabled ? "touch-none cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                  style={{ left: slot.x + "%", top: slot.y + "%" }}
                >
                  <span className="rounded-full border border-white/80 bg-slate-950/90 px-2 py-1 text-[10px] font-black">
                    {slot.jerseyNumber === null ? slot.position : `#${slot.jerseyNumber} · ${slot.position}`}
                  </span>
                  {slot.playerName && <span className="max-w-full truncate rounded bg-slate-950/80 px-1 text-[9px] font-bold">{slot.playerName}</span>}
                </button>
              ))}
            </div>
          </section>

          <section className="pro-club-analysis-card min-w-0 rounded-2xl border border-slate-200 p-3 shadow-sm sm:p-4">
            <h3 className="mb-3 text-lg font-black text-slate-900">Opponent Lineup (11)</h3>
            <div className="space-y-1.5 lg:max-h-[min(70vh,44rem)] lg:overflow-y-auto lg:pr-1">
              {lineup.slots.map((slot) => (
                <article
                  key={slot.slotIndex}
                  role="group"
                  aria-label={`Lineup slot ${slot.slotIndex + 1}`}
                  data-lineup-row={slot.slotIndex}
                  data-selected={selectedSlotIndex === slot.slotIndex}
                  onClick={() => setSelectedSlotIndex(slot.slotIndex)}
                  className="pro-club-analysis-lineup-row grid min-w-0 grid-cols-[1.65rem_2.5rem_minmax(0,1fr)_3.4rem_2rem] items-center gap-1.5 rounded-xl border border-slate-200 p-1.5"
                >
                  <span className="text-center text-xs font-black text-slate-500">{slot.slotIndex + 1}</span>
                  <span className="text-center text-xs font-black text-slate-700">{slot.position}</span>
                  <input
                    aria-label={"Player name slot " + (slot.slotIndex + 1)}
                    placeholder="Player name"
                    value={slot.playerName}
                    maxLength={100}
                    disabled={disabled}
                    onFocus={() => setSelectedSlotIndex(slot.slotIndex)}
                    onChange={(event) => patchSlot(slot.slotIndex, { playerName: event.currentTarget.value })}
                    className="pro-club-analysis-input min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-xs font-normal text-slate-900 disabled:bg-slate-100"
                  />
                  <input
                    aria-label={"Shirt number slot " + (slot.slotIndex + 1)}
                    type="number"
                    min="0"
                    max="99"
                    placeholder="#"
                    value={slot.jerseyNumber ?? ""}
                    disabled={disabled}
                    onFocus={() => setSelectedSlotIndex(slot.slotIndex)}
                    onChange={(event) => patchSlot(slot.slotIndex, { jerseyNumber: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) })}
                    className="pro-club-analysis-input min-w-0 rounded-lg border border-slate-300 px-2 py-2 text-center text-xs font-normal text-slate-900 disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    aria-label={`Toggle lineup notes slot ${slot.slotIndex + 1}`}
                    aria-expanded={expandedNotesSlotIndex === slot.slotIndex}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedSlotIndex(slot.slotIndex);
                      setExpandedNotesSlotIndex((current) => current === slot.slotIndex ? null : slot.slotIndex);
                    }}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-sm font-black text-slate-700"
                  >
                    {expandedNotesSlotIndex === slot.slotIndex ? "⌃" : "⌄"}
                  </button>
                  {expandedNotesSlotIndex === slot.slotIndex && (
                    <label className="col-span-5 block text-xs font-bold text-slate-600">
                      Lineup notes
                      <textarea
                        aria-label={"Lineup notes slot " + (slot.slotIndex + 1)}
                        value={slot.notes}
                        maxLength={400}
                        rows={2}
                        disabled={disabled}
                        onFocus={() => setSelectedSlotIndex(slot.slotIndex)}
                        onChange={(event) => patchSlot(slot.slotIndex, { notes: event.currentTarget.value })}
                        className="pro-club-analysis-input mt-1 w-full resize-y rounded-lg border border-slate-300 px-2 py-2 text-xs font-normal text-slate-900 disabled:bg-slate-100"
                      />
                    </label>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>

        <Field
          label="Formation and lineup notes"
          value={lineup.notes}
          disabled={disabled}
          onChange={(notes) => updateAnalysis(setAnalysis, (current) => ({
            ...current,
            sections: { ...current.sections, FORMATION_LINEUP: { ...current.sections.FORMATION_LINEUP, notes } },
          }))}
        />
        <p className="text-xs text-slate-500">Saved as an opponent lineup; your operational Starting XI is unchanged.</p>
      </section>
    );
  }

  if (sectionId === "IN_POSSESSION_ATT" || sectionId === "OUT_DEF") {
    const section = analysis.sections[sectionId];
    const sectionTopics = topics
      .filter((topic) => topic.section === sectionId && !topic.archived)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    function setTopicValue(topicId: string, value: ProClubAnalysisTopicValue) {
      updateAnalysis(setAnalysis, (current) => {
        if (sectionId === "IN_POSSESSION_ATT") {
          return {
            ...current,
            sections: {
              ...current.sections,
              IN_POSSESSION_ATT: {
                ...current.sections.IN_POSSESSION_ATT,
                topicValues: {
                  ...current.sections.IN_POSSESSION_ATT.topicValues,
                  [topicId]: value,
                },
              },
            },
          };
        }
        return {
          ...current,
          sections: {
            ...current.sections,
            OUT_DEF: {
              ...current.sections.OUT_DEF,
              topicValues: {
                ...current.sections.OUT_DEF.topicValues,
                [topicId]: value,
              },
            },
          },
        };
      });
    }
    return (
      <section aria-labelledby="analysis-section-editor-title" className="space-y-5">
        <SectionHeading title={title} hint="Use the editable Game Model topics for quick match-day findings." />
        {sectionTopics.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No enabled topics in this section. Add or enable topics in Manage topics.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sectionTopics.map((topic) => (
              <TopicInput
                key={topic.id}
                topic={topic}
                value={section.topicValues[topic.id] ?? null}
                disabled={disabled}
                onChange={(value) => setTopicValue(topic.id, value)}
              />
            ))}
          </div>
        )}
        <Field label={title + " notes"} value={section.notes} disabled={disabled} onChange={(notes) => updateAnalysis(setAnalysis, (current) => ({
          ...current,
          sections: { ...current.sections, [sectionId]: { ...current.sections[sectionId], notes } },
        }))} />
      </section>
    );
  }

  if (sectionId === "KEY_MAN") {
    const players = analysis.sections.KEY_MAN.players;
    function patchPlayer(playerId: string, patch: Partial<ProClubAnalysisKeyMan>) {
      updateAnalysis(setAnalysis, (current) => ({
        ...current,
        sections: {
          ...current.sections,
          KEY_MAN: {
            players: current.sections.KEY_MAN.players.map((player) =>
              player.id === playerId ? { ...player, ...patch } : player,
            ),
          },
        },
      }));
    }
    function addPlayer() {
      const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "key-man-" + Date.now();
      const player: ProClubAnalysisKeyMan = {
        id, name: "", position: "", jerseyNumber: null, preferredFoot: null,
        dangerLevel: null, pace: null, aerialThreat: null, oneVsOne: null,
        workRate: null, strengths: "", weaknesses: "", notes: "",
      };
      updateAnalysis(setAnalysis, (current) => ({
        ...current,
        sections: { ...current.sections, KEY_MAN: { players: [...current.sections.KEY_MAN.players, player] } },
      }));
    }
    return (
      <section aria-labelledby="analysis-section-editor-title" className="space-y-5">
        <SectionHeading title={title} hint="Record a few practical opposition threats." />
        {players.map((player) => (
          <article key={player.id} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-bold text-slate-700">Player<input aria-label={"Key man name " + player.id} value={player.name} maxLength={100} disabled={disabled} onChange={(event) => patchPlayer(player.id, { name: event.currentTarget.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100" /></label>
            <label className="text-sm font-bold text-slate-700">Position<input aria-label={"Key man position " + player.id} value={player.position} maxLength={32} disabled={disabled} onChange={(event) => patchPlayer(player.id, { position: event.currentTarget.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100" /></label>
            <label className="text-sm font-bold text-slate-700">Shirt number<input aria-label={"Key man shirt number " + player.id} type="number" min="0" max="99" value={player.jerseyNumber ?? ""} disabled={disabled} onChange={(event) => patchPlayer(player.id, { jerseyNumber: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100" /></label>
            <label className="text-sm font-bold text-slate-700">Preferred foot<select aria-label={"Preferred foot " + player.id} value={player.preferredFoot ?? ""} disabled={disabled} onChange={(event) => patchPlayer(player.id, { preferredFoot: event.currentTarget.value ? event.currentTarget.value as ProClubAnalysisKeyMan["preferredFoot"] : null })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"><option value="">Not recorded</option><option value="LEFT">Left</option><option value="RIGHT">Right</option><option value="BOTH">Both</option></select></label>
            {([
              ["Danger level", "dangerLevel"], ["Pace", "pace"], ["Aerial threat", "aerialThreat"],
              ["1v1 threat", "oneVsOne"], ["Work rate", "workRate"],
            ] as const).map(([label, key]) => (
              <label key={key} className="text-sm font-bold text-slate-700">
                <span className="inline-flex items-center gap-2">{label}<span data-rating={player[key] ?? "neutral"} className={`${getProClubAnalysisRatingClass(player[key])} px-2 py-0.5`}>{player[key] ?? "—"}</span></span>
                <input aria-label={label + " " + player.id} data-rating={player[key] ?? "neutral"} type="range" min="1" max="5" step="1" value={player[key] ?? 3} disabled={disabled} onChange={(event) => patchPlayer(player.id, { [key]: Number(event.currentTarget.value) as 1 | 2 | 3 | 4 | 5 })} className={`mt-2 block w-full accent-cyan-700 disabled:opacity-50 ${getProClubAnalysisRatingClass(player[key])}`} />
              </label>
            ))}
            <Field label={"Strengths " + player.id} value={player.strengths} disabled={disabled} onChange={(strengths) => patchPlayer(player.id, { strengths })} />
            <Field label={"Weaknesses " + player.id} value={player.weaknesses} disabled={disabled} onChange={(weaknesses) => patchPlayer(player.id, { weaknesses })} />
            <Field label={"Key man notes " + player.id} value={player.notes} disabled={disabled} onChange={(notes) => patchPlayer(player.id, { notes })} />
            {!disabled && <button type="button" onClick={() => updateAnalysis(setAnalysis, (current) => ({
              ...current,
              sections: { ...current.sections, KEY_MAN: { players: current.sections.KEY_MAN.players.filter((item) => item.id !== player.id) } },
            }))} className="justify-self-start rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">Remove key man</button>}
          </article>
        ))}
        {!disabled && players.length < 12 && <button type="button" onClick={addPlayer} className="rounded-xl border border-cyan-700 px-4 py-2 text-sm font-bold text-cyan-800">Add Key Man</button>}
      </section>
    );
  }

  if (sectionId === "ANALYSIS") {
    const summary = analysis.sections.ANALYSIS;
    return (
      <section aria-labelledby="analysis-section-editor-title" className="space-y-5">
        <SectionHeading title={title} hint="Write the coach's short match plan." />
        <div className="grid gap-4 md:grid-cols-2">
          {([
            ["Strengths", "strengths"], ["Weaknesses", "weaknesses"],
            ["Key observations", "keyObservations"], ["Key threats", "keyThreats"],
            ["Areas to exploit", "areasToExploit"], ["Tactical notes", "tacticalNotes"],
          ] as const).map(([label, key]) => (
            <Field key={key} label={label} value={summary[key]} disabled={disabled} onChange={(value) => updateAnalysis(setAnalysis, (current) => ({
              ...current,
              sections: { ...current.sections, ANALYSIS: { ...current.sections.ANALYSIS, [key]: value } },
            }))} />
          ))}
        </div>
      </section>
    );
  }

  if (sectionId === "SET_PIECES") {
    const setPieces = analysis.sections.SET_PIECES;
    return (
      <section aria-labelledby="analysis-section-editor-title" className="space-y-5">
        <SectionHeading title={title} hint="Capture patterns that the staff can use before kick-off." />
        <div className="grid gap-4 md:grid-cols-2">
          {([
            ["Attacking corners", "attackingCorners"], ["Defending corners", "defendingCorners"],
            ["Free kicks", "freeKicks"], ["Throw-ins", "throwIns"], ["Penalties", "penalties"],
          ] as const).map(([label, key]) => (
            <Field key={key} label={label} value={setPieces[key]} disabled={disabled} onChange={(value) => updateAnalysis(setAnalysis, (current) => ({
              ...current,
              sections: { ...current.sections, SET_PIECES: { ...current.sections.SET_PIECES, [key]: value } },
            }))} />
          ))}
        </div>
      </section>
    );
  }

  const patterns = analysis.sections.ATTACKING_PATTERNS;
  return (
    <section aria-labelledby="analysis-section-editor-title" className="space-y-5">
      <SectionHeading title={title} hint="Select the opponent's preferred attacking routes." />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PRO_CLUB_ANALYSIS_ATTACKING_PATTERNS.map((pattern) => (
          <label key={pattern.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-800">
            <input
              type="checkbox"
              checked={patterns.selected.includes(pattern.id)}
              disabled={disabled}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                updateAnalysis(setAnalysis, (current) => {
                  const selected = current.sections.ATTACKING_PATTERNS.selected;
                  return {
                    ...current,
                    sections: {
                      ...current.sections,
                      ATTACKING_PATTERNS: {
                        ...current.sections.ATTACKING_PATTERNS,
                        selected: checked
                          ? [...selected, pattern.id]
                          : selected.filter((id) => id !== pattern.id),
                      },
                    },
                  };
                });
              }}
            />
            {pattern.label}
          </label>
        ))}
      </div>
      <Field label="Attacking pattern notes" value={patterns.notes} disabled={disabled} onChange={(notes) => updateAnalysis(setAnalysis, (current) => ({
        ...current,
        sections: { ...current.sections, ATTACKING_PATTERNS: { ...current.sections.ATTACKING_PATTERNS, notes } },
      }))} />
    </section>
  );
}

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 id="analysis-section-editor-title" className="text-xl font-black text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function TopicInput({
  topic,
  value,
  disabled,
  onChange,
}: {
  topic: ProClubAnalysisTopic;
  value: ProClubAnalysisTopicValue;
  disabled: boolean;
  onChange: (value: ProClubAnalysisTopicValue) => void;
}) {
  const label = topic.displayLabel || topic.name;
  return (
    <fieldset className="rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-black text-slate-800">{label}</legend>
      {topic.helperText && <p className="mb-2 text-xs text-slate-500">{topic.helperText}</p>}
      {topic.inputType === "CHECKBOX" && (
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input aria-label={label} type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
          Observed
        </label>
      )}
      {topic.inputType === "RATING" && (
        <label className="block text-sm font-bold text-slate-700">
          <span className="inline-flex items-center gap-2">
            <span data-rating={typeof value === "number" ? value : "neutral"} className={`${getProClubAnalysisRatingClass(typeof value === "number" ? value : null)} px-2 py-0.5`}>{value ?? "Not rated"} / 5</span>
          </span>
          <input aria-label={label} data-rating={typeof value === "number" ? value : "neutral"} type="range" min="1" max="5" step="1" value={typeof value === "number" ? value : 3} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))} className={`mt-2 block w-full accent-cyan-700 disabled:opacity-50 ${getProClubAnalysisRatingClass(typeof value === "number" ? value : null)}`} />
        </label>
      )}
      {topic.inputType === "SINGLE_CHOICE" && (
        <select aria-label={label} value={typeof value === "string" ? value : ""} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value || null)} className="w-full rounded-lg border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100">
          <option value="">Choose</option>
          {topic.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        </select>
      )}
      {topic.inputType === "NOTES" && (
        <textarea aria-label={label} rows={2} maxLength={1200} value={typeof value === "string" ? value : ""} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} className="w-full resize-y rounded-lg border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
      )}
    </fieldset>
  );
}
