import { useMemo, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";

import type { ProClubStartingXIPlayerView } from "./proClubStartingXIViewModel";
import { filterProClubStartingXIPlayerViews } from "./proClubStartingXIViewModel";

export type ProClubPlayerPickerMode = "STARTER" | "SUBSTITUTE";

export default function ProClubStartingXIPlayerPicker({
  open,
  mode,
  slotLabel,
  players,
  onClose,
  onSelect,
}: {
  open: boolean;
  mode: ProClubPlayerPickerMode;
  slotLabel?: string | null;
  players: readonly ProClubStartingXIPlayerView[];
  onClose: () => void;
  onSelect: (playerKey: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => filterProClubStartingXIPlayerViews(players, search),
    [players, search],
  );

  if (!open) return null;

  const title =
    mode === "STARTER"
      ? "Select Player" + (slotLabel ? " · " + slotLabel : "")
      : "Add Substitute";

  return (
    <div className="fixed inset-0 z-[80] flex bg-slate-950/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close player picker"
        onClick={onClose}
        className="hidden flex-1 cursor-default md:block"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="starting-xi-player-picker-title"
        className="ml-auto flex h-full w-full max-w-lg flex-col border-l border-cyan-400/20 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
              Match Squad
            </p>
            <h4 id="starting-xi-player-picker-title" className="mt-1 text-xl font-black text-white">
              {title}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              {filtered.length} available players
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 text-slate-300"
          >
            <X size={18} />
          </button>
        </header>

        <div className="border-b border-slate-800 p-4">
          <label className="relative block">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search player, jersey, position or FUTID..."
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">
              No available player matches this search.
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((player) => (
                <button
                  key={player.playerKey}
                  type="button"
                  onClick={() => {
                    onSelect(player.playerKey);
                    setSearch("");
                  }}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-left transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">
                      #{player.jerseyNumber} · {player.fullName}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {player.positionLabel} · FUTID {player.futIdLabel}
                    </p>
                  </div>
                  <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/20 px-3 py-2 text-[10px] font-black text-cyan-200">
                    <UserPlus size={13} />
                    {mode === "STARTER" ? "Select" : "Bench"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
