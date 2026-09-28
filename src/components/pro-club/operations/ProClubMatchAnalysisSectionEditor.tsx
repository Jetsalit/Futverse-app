import type { Dispatch, SetStateAction } from "react";
import {
  PRO_CLUB_ANALYSIS_ATTACKING_PATTERNS,
  PRO_CLUB_ANALYSIS_SECTIONS,
  type ProClubAnalysisKeyMan,
  type ProClubAnalysisSectionId,
  type ProClubAnalysisTopic,
  type ProClubAnalysisTopicValue,
  type ProClubMatchAnalysis,
} from "../../../lib/proClubMatchAnalysis";
import {
  PRO_CLUB_STARTING_XI_FIXED_FORMATIONS,
  createProClubCustomFormationSlotsFromFixed,
  type ProClubCustomFormationSlot,
  type ProClubStartingXIFixedFormation,
} from "../../../lib/proClubStartingXI11v11";
import { PLAYER_POSITION_CODES, type PlayerPositionCode } from "../../../lib/playerPositionSelection";

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
        className="mt-1 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100"
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
  const title = PRO_CLUB_ANALYSIS_SECTIONS.find((section) => section.id === sectionId)!.label;

  if (sectionId === "FORMATION_LINEUP") {
    const lineup = analysis.sections.FORMATION_LINEUP;
    const isCustom = lineup.formation === "CUSTOM";

    function changeFormation(value: string) {
      if (value === "CUSTOM") {
        const base: readonly ProClubCustomFormationSlot[] =
          lineup.formation === "CUSTOM" && lineup.customFormationSlots
            ? lineup.customFormationSlots
            : createProClubCustomFormationSlotsFromFixed(
                lineup.formation === "CUSTOM" ? "4-3-3" : lineup.formation,
              );
        const custom = base.map((slot) => ({ ...slot }));
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
      if (!PRO_CLUB_STARTING_XI_FIXED_FORMATIONS.includes(value as ProClubStartingXIFixedFormation)) return;
      const formation = value as ProClubStartingXIFixedFormation;
      const slots = rebuildLineupSlots(
        createProClubCustomFormationSlotsFromFixed(formation),
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

    return (
      <section aria-labelledby="analysis-section-editor-title" className="space-y-5">
        <SectionHeading title={title} hint="Map the opponent's shape and first XI." />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">
            Opponent
            <input
              aria-label="Opponent name"
              value={analysis.opponentSnapshot.name}
              maxLength={120}
              disabled={disabled}
              onChange={(event) => onOpponentNameChange(event.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100"
            />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Opponent formation
            <select
              aria-label="Opponent formation"
              value={lineup.formation}
              disabled={disabled}
              onChange={(event) => changeFormation(event.currentTarget.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
            >
              {PRO_CLUB_STARTING_XI_FIXED_FORMATIONS.map((formation) => <option key={formation} value={formation}>{formation}</option>)}
              <option value="CUSTOM">Custom</option>
            </select>
          </label>
        </div>

        <div className="relative mx-auto aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border-2 border-emerald-900 bg-emerald-700">
          <div className="absolute inset-3 rounded-xl border border-white/55" />
          <div className="absolute left-1/2 top-1/2 h-px w-[calc(100%-24px)] -translate-x-1/2 bg-white/50" />
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />
          {lineup.slots.map((slot) => (
            <div key={slot.slotIndex} className="absolute z-10 flex max-w-[24%] -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: slot.x + "%", top: slot.y + "%" }}>
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-slate-900 px-1 text-[10px] font-black text-white">
                {slot.jerseyNumber ?? slot.position}
              </span>
              <span className="max-w-full truncate rounded bg-slate-950/80 px-1 text-[9px] font-bold text-white">{slot.playerName || slot.label}</span>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {lineup.slots.map((slot) => (
            <article key={slot.slotIndex} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[80px_minmax(0,1fr)_100px]">
              <p className="self-center text-sm font-black text-slate-800">{slot.label}</p>
              <label className="text-xs font-bold text-slate-600">
                Player name
                <input aria-label={"Player name slot " + (slot.slotIndex + 1)} value={slot.playerName} maxLength={100} disabled={disabled} onChange={(event) => patchSlot(slot.slotIndex, { playerName: event.currentTarget.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100" />
              </label>
              <label className="text-xs font-bold text-slate-600">
                Shirt number
                <input aria-label={"Shirt number slot " + (slot.slotIndex + 1)} type="number" min="0" max="99" value={slot.jerseyNumber ?? ""} disabled={disabled} onChange={(event) => patchSlot(slot.slotIndex, { jerseyNumber: event.currentTarget.value === "" ? null : Number(event.currentTarget.value) })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100" />
              </label>
              {isCustom && (
                <>
                  <label className="text-xs font-bold text-slate-600">
                    Position
                    <select aria-label={"Position slot " + (slot.slotIndex + 1)} value={slot.position} disabled={disabled} onChange={(event) => patchSlot(slot.slotIndex, { position: event.currentTarget.value as PlayerPositionCode, label: event.currentTarget.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100">
                      {PLAYER_POSITION_CODES.map((position) => <option key={position} value={position}>{position}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Horizontal position
                    <input aria-label={"Horizontal position slot " + (slot.slotIndex + 1)} type="number" min="6" max="94" value={slot.x} disabled={disabled} onChange={(event) => patchSlot(slot.slotIndex, { x: Number(event.currentTarget.value) })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    Vertical position
                    <input aria-label={"Vertical position slot " + (slot.slotIndex + 1)} type="number" min="6" max="94" value={slot.y} disabled={disabled} onChange={(event) => patchSlot(slot.slotIndex, { y: Number(event.currentTarget.value) })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100" />
                  </label>
                </>
              )}
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                Lineup notes
                <input aria-label={"Lineup notes slot " + (slot.slotIndex + 1)} value={slot.notes} maxLength={400} disabled={disabled} onChange={(event) => patchSlot(slot.slotIndex, { notes: event.currentTarget.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal text-slate-900 disabled:bg-slate-100" />
              </label>
            </article>
          ))}
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
              <label key={key} className="text-sm font-bold text-slate-700">{label}: {player[key] ?? "—"}<input aria-label={label + " " + player.id} type="range" min="1" max="5" step="1" value={player[key] ?? 3} disabled={disabled} onChange={(event) => patchPlayer(player.id, { [key]: Number(event.currentTarget.value) as 1 | 2 | 3 | 4 | 5 })} className="mt-2 block w-full accent-cyan-700 disabled:opacity-50" /></label>
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
          {value ?? "Not rated"} / 5
          <input aria-label={label} type="range" min="1" max="5" step="1" value={typeof value === "number" ? value : 3} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))} className="mt-2 block w-full accent-cyan-700 disabled:opacity-50" />
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
