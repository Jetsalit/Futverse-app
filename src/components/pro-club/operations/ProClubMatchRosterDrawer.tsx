import { useMemo, useState } from "react";
import { Search, UserMinus, UserPlus, X } from "lucide-react";

import type { ProClubMatchRosterRecord } from "../../../lib/firestore/proClubMatchStartingXIRepository";
import type { ProClubSquadRosterRecord } from "../../../lib/firestore/proClubSquadRosterRepository";

type RosterTab = "SELECTED" | "FIRST_TEAM";

function rosterSearchText(
  player: Pick<
    ProClubSquadRosterRecord,
    "firstName" | "lastName" | "jerseyNumber" | "position" | "futId"
  >,
): string {
  return [
    player.firstName,
    player.lastName,
    String(player.jerseyNumber),
    player.position ?? "",
    player.futId ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export default function ProClubMatchRosterDrawer({
  open,
  canMutate,
  saving,
  matchStatus,
  matchRoster,
  firstTeamRoster,
  onClose,
  onAdd,
  onRemove,
}: {
  open: boolean;
  canMutate: boolean;
  saving: boolean;
  matchStatus: string;
  matchRoster: readonly ProClubMatchRosterRecord[];
  firstTeamRoster: readonly ProClubSquadRosterRecord[];
  onClose: () => void;
  onAdd: (playerKey: string) => void | Promise<void>;
  onRemove: (playerKey: string) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<RosterTab>("SELECTED");
  const [search, setSearch] = useState("");

  const selectedKeys = useMemo(
    () => new Set(matchRoster.map((player) => player.playerKey)),
    [matchRoster],
  );
  const editableMatch = matchStatus === "DRAFT" || matchStatus === "SCHEDULED";

  const selected = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return matchRoster.filter(
      (player) => !query || rosterSearchText(player).includes(query),
    );
  }, [matchRoster, search]);

  const available = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return firstTeamRoster.filter(
      (player) =>
        player.status === "ACTIVE" &&
        !selectedKeys.has(player.playerKey) &&
        (!query || rosterSearchText(player).includes(query)),
    );
  }, [firstTeamRoster, search, selectedKeys]);

  if (!open) return null;

  const list = tab === "SELECTED" ? selected : available;

  return (
    <div className="fixed inset-0 z-[70] flex bg-slate-950/70 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close Match roster"
        onClick={onClose}
        className="hidden flex-1 cursor-default md:block"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-roster-drawer-title"
        className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-cyan-400/20 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 p-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
              Match Squad
            </p>
            <h4 id="match-roster-drawer-title" className="mt-1 text-xl font-black text-white">
              Manage Roster
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              {matchRoster.length} selected · First Team {firstTeamRoster.length}
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
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setTab("SELECTED")}
              className={[
                "min-h-11 rounded-lg px-3 py-2 text-xs font-black",
                tab === "SELECTED"
                  ? "bg-cyan-400/15 text-cyan-200"
                  : "text-slate-400",
              ].join(" ")}
            >
              Selected {matchRoster.length}
            </button>
            <button
              type="button"
              onClick={() => setTab("FIRST_TEAM")}
              className={[
                "min-h-11 rounded-lg px-3 py-2 text-xs font-black",
                tab === "FIRST_TEAM"
                  ? "bg-cyan-400/15 text-cyan-200"
                  : "text-slate-400",
              ].join(" ")}
            >
              First Team
            </button>
          </div>

          <label className="relative mt-3 block">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search player, jersey, position or FUTID..."
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-sm text-slate-500">
              {tab === "SELECTED"
                ? "No selected player matches this search."
                : "No additional ACTIVE First Team player matches this search."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {list.map((player) => (
                <article
                  key={player.playerKey}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">
                      #{player.jerseyNumber} · {player.firstName} {player.lastName}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {player.position ?? "Position not set"} · {player.futId ?? "FUTID not bound"}
                    </p>
                  </div>

                  {canMutate && editableMatch && (
                    tab === "SELECTED" ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onRemove(player.playerKey)}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/20 px-3 py-2 text-[10px] font-black text-rose-300 disabled:opacity-40"
                      >
                        <UserMinus size={13} />
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onAdd(player.playerKey)}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/20 px-3 py-2 text-[10px] font-black text-emerald-300 disabled:opacity-40"
                      >
                        <UserPlus size={13} />
                        Add
                      </button>
                    )
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
