import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save } from "lucide-react";

import {
  PRO_CLUB_ANALYSIS_INPUT_TYPES,
  PRO_CLUB_ANALYSIS_TOPIC_SECTIONS,
  addProClubAnalysisTopic,
  archiveProClubAnalysisTopic,
  createProClubAnalysisTopic,
  reorderProClubAnalysisTopics,
  validateProClubAnalysisTopic,
  type ProClubAnalysisTopic,
} from "../../../lib/proClubMatchAnalysis";

type EditableTopic = {
  -readonly [Key in keyof ProClubAnalysisTopic]: Key extends "choices"
    ? string[]
    : ProClubAnalysisTopic[Key];
};

function cloneEditableTopics(topics: readonly ProClubAnalysisTopic[]): EditableTopic[] {
  return topics.map((topic) => ({ ...topic, choices: [...topic.choices] }));
}

function createTopicId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return "topic-" + crypto.randomUUID();
  }
  return "topic-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

export default function ProClubAnalysisTopicManager({
  topics,
  saving,
  onSave,
  onClose,
}: {
  topics: readonly ProClubAnalysisTopic[];
  saving: boolean;
  onSave: (topics: readonly ProClubAnalysisTopic[]) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EditableTopic[]>(() => cloneEditableTopics(topics));
  const [choiceText, setChoiceText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const active = useMemo(
    () => [...draft].filter((topic) => !topic.archived).sort((a, b) => a.displayOrder - b.displayOrder),
    [draft],
  );
  const archived = useMemo(() => draft.filter((topic) => topic.archived), [draft]);

  function patchTopic(topicId: string, patch: Partial<ProClubAnalysisTopic>) {
    setDraft((current) =>
      current.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              ...patch,
              choices: patch.choices ? [...patch.choices] : topic.choices,
            }
          : topic,
      ),
    );
    setError(null);
  }

  function moveTopic(topicId: string, delta: -1 | 1) {
    const index = active.findIndex((topic) => topic.id === topicId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= active.length) return;
    const ids = active.map((topic) => topic.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
    try {
      setDraft(cloneEditableTopics(reorderProClubAnalysisTopics(draft, ids)));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Topic order could not be changed.");
    }
  }

  function addTopic() {
    try {
      const next = createProClubAnalysisTopic({
        id: createTopicId(),
        name: "New Topic",
        section: "IN_POSSESSION_ATT",
        inputType: "NOTES",
        displayOrder: active.length,
        helperText: null,
      });
      setDraft(cloneEditableTopics(addProClubAnalysisTopic(draft, next)));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Topic could not be added.");
    }
  }

  function updateType(topic: ProClubAnalysisTopic, inputType: ProClubAnalysisTopic["inputType"]) {
    patchTopic(topic.id, {
      inputType,
      choices: inputType === "SINGLE_CHOICE"
        ? (topic.choices.length >= 2 ? [...topic.choices] : ["Option 1", "Option 2"])
        : [],
    });
  }

  async function save() {
    const ids = new Set<string>();
    const invalid = draft.find((topic) => {
      const result = validateProClubAnalysisTopic(topic);
      if (!result.ok || ids.has(topic.id)) return true;
      ids.add(topic.id);
      return false;
    });
    if (draft.length > 40) {
      setError("A Game Model can contain up to 40 topics.");
      return;
    }
    if (invalid) {
      const validation = validateProClubAnalysisTopic(invalid);
      setError(validation.errors[0] ?? "Topic IDs must be unique.");
      return;
    }
    setError(null);
    try {
      await onSave(draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis topics could not be saved.");
    }
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-topic-manager-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 sm:p-6"
    >
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">
              Editable Analysis Game Model
            </p>
            <h2 id="analysis-topic-manager-title" className="mt-1 text-2xl font-black text-slate-900">
              Manage topics
            </h2>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">
            Close
          </button>
        </header>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Topics are saved as a reusable template. Each new match stores its own topic snapshot.
        </p>

        <div className="mt-4 space-y-3">
          {active.map((topic, index) => (
            <article key={topic.id} className="rounded-xl border border-slate-200 p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_170px_auto]">
                <label className="text-xs font-bold text-slate-600">
                  Topic name
                  <input
                    aria-label={"Topic name " + topic.id}
                    value={topic.name}
                    maxLength={80}
                    disabled={saving}
                    onChange={(event) => patchTopic(topic.id, { name: event.currentTarget.value })}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Section
                  <select
                    aria-label={"Topic section " + topic.id}
                    value={topic.section}
                    disabled={saving}
                    onChange={(event) => patchTopic(topic.id, { section: event.currentTarget.value as ProClubAnalysisTopic["section"] })}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                  >
                    {PRO_CLUB_ANALYSIS_TOPIC_SECTIONS.map((section) => (
                      <option key={section} value={section}>{section === "IN_POSSESSION_ATT" ? "In Possession ATT" : "Out DEF"}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">
                  Input type
                  <select
                    aria-label={"Input type " + topic.id}
                    value={topic.inputType}
                    disabled={saving}
                    onChange={(event) => updateType(topic, event.currentTarget.value as ProClubAnalysisTopic["inputType"])}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                  >
                    {PRO_CLUB_ANALYSIS_INPUT_TYPES.map((type) => (
                      <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end gap-1">
                  <button type="button" aria-label={"Move " + topic.name + " up"} disabled={saving || index === 0} onClick={() => moveTopic(topic.id, -1)} className="rounded-lg border p-2 disabled:opacity-40">
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" aria-label={"Move " + topic.name + " down"} disabled={saving || index === active.length - 1} onClick={() => moveTopic(topic.id, 1)} className="rounded-lg border p-2 disabled:opacity-40">
                    <ArrowDown size={16} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-xs font-bold text-slate-600">
                  Display label (optional)
                  <input
                    aria-label={"Display label " + topic.id}
                    value={topic.displayLabel ?? ""}
                    maxLength={80}
                    disabled={saving}
                    onChange={(event) => patchTopic(topic.id, { displayLabel: event.currentTarget.value || null })}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                {topic.inputType === "SINGLE_CHOICE" && (
                  <label className="text-xs font-bold text-slate-600 md:col-span-2">
                    Choices (comma separated)
                    <input
                      aria-label={"Choices " + topic.id}
                      value={choiceText[topic.id] ?? topic.choices.join(", ")}
                      disabled={saving}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setChoiceText((current) => ({ ...current, [topic.id]: value }));
                        const choices = value.split(",").map((item) => item.trim()).filter(Boolean);
                        if (choices.length >= 2 && choices.length <= 8) patchTopic(topic.id, { choices });
                      }}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-700">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={topic.enabled} disabled={saving} onChange={(event) => patchTopic(topic.id, { enabled: event.currentTarget.checked })} />
                  Enabled for new matches
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={topic.includeInAnalysis} disabled={saving} onChange={(event) => patchTopic(topic.id, { includeInAnalysis: event.currentTarget.checked })} />
                  Include in Analysis
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={topic.includeInSummary} disabled={saving} onChange={(event) => patchTopic(topic.id, { includeInSummary: event.currentTarget.checked })} />
                  Include in Summary
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setDraft(cloneEditableTopics(archiveProClubAnalysisTopic(draft, topic.id)))}
                  className="ml-auto rounded-lg border border-rose-200 px-3 py-1.5 text-rose-700 disabled:opacity-50"
                >
                  Archive
                </button>
              </div>
              <label className="mt-3 block text-xs font-bold text-slate-600">
                Helper text
                <input
                  aria-label={"Helper text " + topic.id}
                  value={topic.helperText ?? ""}
                  maxLength={240}
                  disabled={saving}
                  onChange={(event) => patchTopic(topic.id, { helperText: event.currentTarget.value || null })}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-slate-900"
                />
              </label>
            </article>
          ))}

          {archived.length > 0 && (
            <details className="rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-700">
                Archived topics ({archived.length})
              </summary>
              <ul className="mt-2 space-y-1 text-sm text-slate-500">
                {archived.map((topic) => <li key={topic.id}>{topic.name} · archived</li>)}
              </ul>
            </details>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={saving} onClick={addTopic} className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 px-4 py-2 text-sm font-bold text-cyan-800 disabled:opacity-50">
            <Plus size={16} /> Add Topic
          </button>
          {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
          <button type="button" disabled={saving} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
            <Save size={16} /> {saving ? "Saving…" : "Save topics"}
          </button>
        </div>
      </div>
    </section>
  );
}
