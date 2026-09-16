import { useMemo, useState } from "react";
import { ArrowLeft, Edit2, Plus, RefreshCw, Search, X } from "lucide-react";
import TacticBoard from "../../TacticBoard";
import { useDrillDatabase, type Drill } from "../../../hooks/useDrillDatabase";

export default function ProClubTrainingDrillReferencePicker({
  onClose,
  onSelectDrill,
}: {
  onClose: () => void;
  onSelectDrill: (drill: Drill) => void;
}) {
  const { myDrills } = useDrillDatabase();
  const [mode, setMode] = useState<"library" | "tactic">("library");
  const [editingDrill, setEditingDrill] = useState<Drill | null>(null);
  const [search, setSearch] = useState("");

  const visibleDrills = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return myDrills;
    return myDrills.filter((drill) =>
      `${drill.title} ${drill.category}`.toLocaleLowerCase().includes(query),
    );
  }, [myDrills, search]);

  function openCreate() {
    setEditingDrill(null);
    setMode("tactic");
  }

  function openEdit(drill: Drill) {
    setEditingDrill(drill);
    setMode("tactic");
  }

  function returnToLibrary() {
    setEditingDrill(null);
    setMode("library");
  }

  if (mode === "tactic") {
    return (
      <section className="rounded-2xl border border-cyan-400/20 bg-slate-100 p-4 text-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={returnToLibrary}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700"
          >
            <ArrowLeft size={16} /> Back to drill library
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Weekly Training · Tactic Board
          </p>
        </div>
        <TacticBoard onBack={returnToLibrary} editingDrill={editingDrill} />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="pro-club-training-drill-picker"
      className="space-y-4 rounded-2xl border border-cyan-400/20 bg-slate-950 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">
            Session / Block
          </p>
          <h5 id="pro-club-training-drill-picker" className="mt-2 text-lg font-black text-white">
            Tactic Board & Drill Reference
          </h5>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Create or edit a drill with the existing FutVerse Tactic Board, then select that drill to bind its canonical drill ID to this Weekly Training block.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300"
        >
          <X size={14} /> Close
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <span className="sr-only">Search my drills</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search my drills"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400"
          />
        </label>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black text-slate-950"
        >
          <Plus size={16} /> Create in Tactic Board
        </button>
      </div>

      {myDrills.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
          <div className="flex items-center gap-2 font-bold text-slate-300">
            <RefreshCw size={15} /> No saved drills yet
          </div>
          <p className="mt-2">Create the first drill in Tactic Board, return here, then select it for this block.</p>
        </div>
      ) : visibleDrills.length === 0 ? (
        <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">No drills match this search.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleDrills.map((drill) => (
            <article key={drill.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-white">{drill.title}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.1em] text-cyan-300">{drill.category}</p>
                  <p className="mt-2 break-all text-[11px] text-slate-500">Drill ID: {drill.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(drill)}
                  className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white"
                  aria-label={`Edit ${drill.title} in Tactic Board`}
                >
                  <Edit2 size={15} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onSelectDrill(drill)}
                className="mt-4 w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-400/20"
              >
                Use this drill in block
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
