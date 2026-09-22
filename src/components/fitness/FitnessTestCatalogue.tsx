import { useEffect, useMemo, useState } from "react";
import { Archive, Edit2, Plus, ShieldAlert, Trash2, X } from "lucide-react";

import {
  FITNESS_TEST_CATEGORIES,
  FOOTBALL_FITNESS_TEST_CATALOGUE,
  archiveFitnessTestDefinition,
  createFitnessTestDefinition,
  deleteFitnessTestDefinition,
  editFitnessTestDefinition,
  fitnessDefinitionBelongsToOrganization,
  type FitnessMeasurementDirection,
  type FitnessOrganizationRef,
  type FitnessTestCategory,
  type FitnessTestDefinition,
} from "../../lib/fitnessTestFoundation";

interface DefinitionForm {
  key: string;
  name: string;
  category: FitnessTestCategory;
  measurementMethod: string;
  unit: string;
  direction: FitnessMeasurementDirection;
}

const EMPTY_FORM: DefinitionForm = {
  key: "",
  name: "",
  category: "AEROBIC_ENDURANCE",
  measurementMethod: "",
  unit: "",
  direction: "HIGHER_IS_BETTER",
};

const CATEGORY_LABELS: Record<FitnessTestCategory, string> = {
  AEROBIC_ENDURANCE: "Aerobic / endurance",
  ACCELERATION: "Acceleration",
  SPEED: "Speed",
  AGILITY: "Agility / change of direction",
  POWER: "Power",
  STRENGTH_ENDURANCE: "Strength / endurance",
};

export default function FitnessTestCatalogue({
  organization,
  canManage,
  variant = "academy",
}: {
  organization: FitnessOrganizationRef;
  canManage: boolean;
  variant?: "academy" | "pro-club";
}) {
  const [definitions, setDefinitions] = useState<readonly FitnessTestDefinition[]>(
    FOOTBALL_FITNESS_TEST_CATALOGUE,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DefinitionForm>(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const organizationKey = `${organization.organizationType}:${organization.organizationId}`;

  useEffect(() => {
    setDefinitions(FOOTBALL_FITNESS_TEST_CATALOGUE);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(false);
    setMessage(null);
  }, [organizationKey]);

  const visibleDefinitions = useMemo(
    () => definitions.filter((definition) =>
      fitnessDefinitionBelongsToOrganization(definition, organization),
    ),
    [definitions, organizationKey],
  );

  const panelClass = variant === "pro-club"
    ? "rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white sm:p-6"
    : "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";
  const cardClass = variant === "pro-club"
    ? "rounded-2xl border border-slate-700 bg-slate-950/60 p-4"
    : "rounded-2xl border border-slate-200 bg-slate-50 p-4";
  const mutedClass = variant === "pro-club" ? "text-slate-400" : "text-slate-500";
  const inputClass = variant === "pro-club"
    ? "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
    : "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
    setFormOpen(true);
  }

  function openEdit(definition: FitnessTestDefinition) {
    setEditingId(definition.id);
    setForm({
      key: definition.key,
      name: definition.name,
      category: definition.category,
      measurementMethod: definition.measurementMethod,
      unit: definition.unit,
      direction: definition.direction,
    });
    setMessage(null);
    setFormOpen(true);
  }

  function closeForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(false);
  }

  function saveDefinition(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage) return;

    if (editingId === null) {
      const created = createFitnessTestDefinition(organization, form);
      if (!created.ok) {
        setMessage("Enter complete, valid test-definition metadata.");
        return;
      }
      if (definitions.some((definition) => definition.key === created.definition.key)) {
        setMessage("Test keys must be unique within this catalogue.");
        return;
      }
      setDefinitions((current) => [...current, created.definition]);
      setMessage("Draft test definition created for this organization view.");
      closeForm();
      return;
    }

    const currentDefinition = definitions.find(({ id }) => id === editingId);
    if (!currentDefinition) return;
    const edited = editFitnessTestDefinition(organization, currentDefinition, {
      name: form.name,
      category: form.category,
      measurementMethod: form.measurementMethod,
      unit: form.unit,
      direction: form.direction,
    });
    if (!edited.ok) {
      setMessage("This definition cannot be edited in its current state.");
      return;
    }
    setDefinitions((current) => current.flatMap((definition) => {
      if (definition.id !== editingId) return [definition];
      return edited.kind === "VERSIONED"
        ? [edited.previous, edited.definition]
        : [edited.definition];
    }));
    setMessage(
      edited.kind === "VERSIONED"
        ? "Measurement semantics changed, so a new draft version was created and the historical version was archived."
        : "Test definition metadata updated.",
    );
    closeForm();
  }

  function archiveDefinition(definition: FitnessTestDefinition) {
    if (!canManage) return;
    const archived = archiveFitnessTestDefinition(organization, definition);
    if (!archived.ok) return;
    setDefinitions((current) => current.map((candidate) =>
      candidate.id === definition.id ? archived.definition : candidate,
    ));
    setMessage(`${definition.name} archived. Existing result meaning is preserved.`);
  }

  function deleteDefinition(definition: FitnessTestDefinition) {
    if (!canManage) return;
    const deleted = deleteFitnessTestDefinition(organization, definition);
    if (!deleted.ok) {
      setMessage("Only draft definitions with no result history can be deleted.");
      return;
    }
    setDefinitions((current) => current.filter(({ id }) => id !== deleted.deletedDefinitionId));
    setMessage(`${definition.name} draft deleted.`);
  }

  return (
    <section aria-labelledby="fitness-test-catalogue-title" className={panelClass}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-500">
            Shared football testing foundation
          </p>
          <h2 id="fitness-test-catalogue-title" className="mt-2 text-xl font-black">
            Fitness test catalogue
          </h2>
          <p className={`mt-2 max-w-3xl text-sm leading-6 ${mutedClass}`}>
            Definitions describe the test and measurement only. They do not add medical thresholds,
            readiness scores, or automatic training prescriptions.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700"
          >
            <Plus size={16} /> Add test
          </button>
        )}
      </div>

      {!canManage && (
        <div className={`mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 p-3 text-sm ${mutedClass}`}>
          <ShieldAlert className="mt-0.5 shrink-0 text-amber-500" size={17} />
          Catalogue management is read-only for your current organization authority.
        </div>
      )}

      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-600">{message}</p>}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleDefinitions.map((definition) => (
          <article key={`${definition.id}:${definition.version}`} className={cardClass}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-500">
                  {CATEGORY_LABELS[definition.category]}
                </span>
                <h3 className="mt-1 font-black">{definition.name}</h3>
              </div>
              <span className="rounded-full border border-current/10 px-2 py-1 text-[10px] font-black uppercase">
                {definition.status}
              </span>
            </div>
            <dl className={`mt-3 space-y-2 text-xs leading-5 ${mutedClass}`}>
              <div><dt className="inline font-bold">Method: </dt><dd className="inline">{definition.measurementMethod}</dd></div>
              <div><dt className="inline font-bold">Measure: </dt><dd className="inline">{definition.unit} · {definition.direction === "LOWER_IS_BETTER" ? "lower result" : "higher result"}</dd></div>
              <div><dt className="inline font-bold">Version: </dt><dd className="inline">{definition.version}</dd></div>
            </dl>
            {canManage && definition.origin === "ORGANIZATION" && definition.status !== "ARCHIVED" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => openEdit(definition)} className="inline-flex items-center gap-1 rounded-lg border border-slate-400/30 px-2.5 py-1.5 text-xs font-bold">
                  <Edit2 size={13} /> Edit
                </button>
                <button type="button" onClick={() => archiveDefinition(definition)} className="inline-flex items-center gap-1 rounded-lg border border-slate-400/30 px-2.5 py-1.5 text-xs font-bold">
                  <Archive size={13} /> Archive
                </button>
                <button type="button" onClick={() => deleteDefinition(definition)} disabled={definition.status !== "DRAFT" || definition.resultCount > 0} title="Only draft definitions without result history can be deleted" className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-xs font-bold text-rose-500 disabled:cursor-not-allowed disabled:opacity-40">
                  <Trash2 size={13} /> Delete draft
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <p className={`mt-4 text-xs ${mutedClass}`}>
        Catalogue changes in this foundation are session-only. Production persistence requires a separately reviewed schema and rules contract.
      </p>

      {formOpen && canManage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={saveDefinition} className={`${panelClass} max-h-[90vh] w-full max-w-xl overflow-y-auto shadow-2xl`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black">{editingId ? "Edit test definition" : "Add test definition"}</h3>
              <button type="button" onClick={closeForm} aria-label="Close test definition form" className="rounded-lg p-2"><X size={18} /></button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">Key
                <input required disabled={editingId !== null} value={form.key} onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))} pattern="[a-z0-9][a-z0-9_-]*" className={`${inputClass} mt-1 disabled:opacity-60`} />
              </label>
              <label className="text-sm font-bold">Name
                <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm font-bold">Category
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as FitnessTestCategory }))} className={`${inputClass} mt-1`}>
                  {FITNESS_TEST_CATEGORIES.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold">Unit
                <input required value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} className={`${inputClass} mt-1`} />
              </label>
              <label className="text-sm font-bold sm:col-span-2">Measurement method
                <textarea required value={form.measurementMethod} onChange={(event) => setForm((current) => ({ ...current, measurementMethod: event.target.value }))} className={`${inputClass} mt-1 min-h-20`} />
              </label>
              <label className="text-sm font-bold sm:col-span-2">Result direction
                <select value={form.direction} onChange={(event) => setForm((current) => ({ ...current, direction: event.target.value as FitnessMeasurementDirection }))} className={`${inputClass} mt-1`}>
                  <option value="HIGHER_IS_BETTER">Higher result</option>
                  <option value="LOWER_IS_BETTER">Lower result</option>
                </select>
              </label>
            </div>
            {editingId && (
              <p className={`mt-4 text-xs leading-5 ${mutedClass}`}>
                If method, unit, category, or result direction changes after results exist, the domain creates a new version and archives the historical definition.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeForm} className="rounded-xl border border-slate-400/30 px-4 py-2 text-sm font-bold">Cancel</button>
              <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">Save definition</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
