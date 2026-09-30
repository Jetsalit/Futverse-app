import { useMemo, useState } from "react";
import { BookOpen, Edit2, Plus, Search, Send } from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import { canOpenProClubGKTraining } from "../../../lib/proClubGKTrainingAccess";
import { useDrillDatabase, type Drill } from "../../../hooks/useDrillDatabase";
import TacticBoard from "../../TacticBoard";

export default function ProClubGKTrainingWorkspace({
  authority,
  onOpenSubmissions,
  onOpenLibraryLogbook,
}: {
  authority: ProClubOrganizationAuthority;
  onOpenSubmissions?: () => void;
  onOpenLibraryLogbook?: () => void;
}) {
  if (!canOpenProClubGKTraining(authority)) return null;

  return (
    <ProClubGKTrainingWorkspaceAuthorized
      onOpenSubmissions={onOpenSubmissions}
      onOpenLibraryLogbook={onOpenLibraryLogbook}
    />
  );
}

function ProClubGKTrainingWorkspaceAuthorized({
  onOpenSubmissions,
  onOpenLibraryLogbook,
}: {
  onOpenSubmissions?: () => void;
  onOpenLibraryLogbook?: () => void;
}) {
  const { myDrills } = useDrillDatabase();
  const [query, setQuery] = useState("");
  const [showBoard, setShowBoard] = useState(false);
  const [editingDrill, setEditingDrill] = useState<Drill | null>(null);

  const visibleDrills = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return myDrills;
    return myDrills.filter((drill) =>
      `${drill.title} ${drill.category}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [myDrills, query]);

  function createDrill() {
    setEditingDrill(null);
    setShowBoard(true);
  }

  function openDrill(drill: Drill) {
    setEditingDrill(drill);
    setShowBoard(true);
  }

  function closeBoard() {
    setShowBoard(false);
    setEditingDrill(null);
  }

  if (showBoard) {
    return (
      <TacticBoard
        onBack={closeBoard}
        editingDrill={editingDrill}
        contextLabel="GK Training"
        backButtonLabel="Back to GK Training"
        defaultCategory="GK Training"
        presentation="pro-club"
      />
    );
  }

  return (
    <section
      aria-labelledby="pro-club-gk-training-heading"
      className="pro-club-gk-training-workspace space-y-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="pro-club-accent text-xs font-black uppercase tracking-[0.18em]">
            Goalkeeper development
          </p>
          <h2
            id="pro-club-gk-training-heading"
            className="pro-club-heading mt-2 text-2xl font-black"
          >
            GK Training
          </h2>
          <p className="pro-club-muted mt-2 max-w-2xl text-sm leading-6">
            Build, open, and edit your goalkeeper drills with the existing Tactic Board.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {onOpenSubmissions && (
            <button
              type="button"
              onClick={onOpenSubmissions}
              className="pro-club-gk-secondary-action inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition"
            >
              <Send size={16} /> Send Work
            </button>
          )}
          {onOpenLibraryLogbook && (
            <button
              type="button"
              onClick={onOpenLibraryLogbook}
              className="pro-club-gk-secondary-action inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-bold transition"
            >
              <BookOpen size={16} /> Open Library &amp; Logbook
            </button>
          )}
          <button
            type="button"
            onClick={createDrill}
            className="pro-club-gk-create-action inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition"
          >
            <Plus size={17} /> Create GK Drill
          </button>
        </div>
      </header>

      <section aria-labelledby="my-gk-drills-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3
              id="my-gk-drills-heading"
              className="pro-club-heading text-lg font-black"
            >
              My GK Drills
            </h3>
            <p className="pro-club-muted mt-1 text-sm">
              Your drills are loaded from your existing drill ownership.
            </p>
          </div>
          <label className="relative w-full sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pro-club-muted absolute left-3 top-1/2 -translate-y-1/2"
              size={16}
            />
            <span className="sr-only">Search my GK drills</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search my drills"
              className="pro-club-gk-search w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none transition"
            />
          </label>
        </div>

        {myDrills.length === 0 ? (
          <div className="pro-club-gk-drill-card rounded-2xl border border-dashed p-6">
            <p className="pro-club-heading font-bold">No saved drills yet</p>
            <p className="pro-club-muted mt-2 text-sm">
              Create your first GK drill in the Tactic Board. New drills use the GK Training category.
            </p>
          </div>
        ) : visibleDrills.length === 0 ? (
          <p className="pro-club-gk-drill-card rounded-2xl border p-5 text-sm">
            No drills match this search.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleDrills.map((drill) => (
              <article
                key={drill.id}
                className="pro-club-gk-drill-card rounded-2xl border p-4 shadow-sm"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="pro-club-heading truncate font-black">
                      {drill.title}
                    </h4>
                    <p className="pro-club-accent mt-1 truncate text-xs font-bold uppercase tracking-[0.1em]">
                      {drill.category}
                    </p>
                    {drill.description && (
                      <p className="pro-club-muted mt-2 line-clamp-2 text-sm">
                        {drill.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openDrill(drill)}
                    aria-label={`Edit ${drill.title}`}
                    className="pro-club-gk-secondary-action shrink-0 rounded-lg border p-2 transition"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => openDrill(drill)}
                  className="pro-club-gk-open-action mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-black transition"
                >
                  Open saved drill
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
