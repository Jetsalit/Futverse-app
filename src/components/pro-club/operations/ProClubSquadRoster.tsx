import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  listProClubSquadRoster,
  type ProClubSquadRosterRecord,
} from "../../../lib/firestore/proClubSquadRosterRepository";
import {
  countProClubSquadRosterByGroup,
  filterProClubSquadRoster,
  PRO_CLUB_SQUAD_POSITION_GROUPS,
  resolveProClubSquadPositionGroup,
  type ProClubSquadPositionGroup,
  type ProClubSquadStatusFilter,
} from "./proClubSquadRosterViewModel";
import ProClubSquadRosterEditor from "./ProClubSquadRosterEditor";
import { generateProvisionalPlayerKey } from "./proClubSquadRosterEditorModel";

const STATUS_OPTIONS: readonly ProClubSquadStatusFilter[] = [
  "ALL",
  "ACTIVE",
  "INACTIVE",
  "RELEASED",
];

const GROUP_LABELS: Record<ProClubSquadPositionGroup, string> = {
  ALL: "All",
  GK: "GK",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

const ROSTER_SUMMARY_VISUALS = {
  ALL: { label: "Total roster", Icon: Users, tone: "total" },
  GK: { label: "GK", Icon: Shield, tone: "gk" },
  DEF: { label: "Defenders", Icon: ShieldCheck, tone: "defenders" },
  MID: { label: "Midfielders", Icon: Activity, tone: "midfielders" },
  FWD: { label: "Forwards", Icon: Target, tone: "forwards" },
} as const;

function statusClasses(status: ProClubSquadRosterRecord["status"]): string {
  if (status === "ACTIVE") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  }

  if (status === "INACTIVE") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }

  return "border-slate-600 bg-slate-800 text-slate-400";
}

export default function ProClubSquadRoster({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
}) {
  const [records, setRecords] = useState<ProClubSquadRosterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProClubSquadStatusFilter>("ALL");
  const [group, setGroup] = useState<ProClubSquadPositionGroup>("ALL");
  const [reloadToken, setReloadToken] = useState(0);
  const [createPlayerKey, setCreatePlayerKey] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<ProClubSquadRosterRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      setLoading(true);
      setError(null);

      try {
        const next = await listProClubSquadRoster(authority.organizationId);
        if (!cancelled) {
          setRecords(next);
        }
      } catch (caught) {
        console.error("Pro Club Squad roster load failed:", caught);
        if (!cancelled) {
          setRecords([]);
          setError("First-team squad could not be loaded from the authoritative Pro Club roster.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRoster();

    return () => {
      cancelled = true;
    };
  }, [authority.organizationId, reloadToken]);

  const filtered = useMemo(
    () => filterProClubSquadRoster(records, { search, status, group }),
    [records, search, status, group],
  );

  const counts = useMemo(
    () => countProClubSquadRosterByGroup(records),
    [records],
  );

  const canWrite = authority.staffRole === "HEAD_COACH";

  const openCreate = () => {
    if (!canWrite) return;
    setCreatePlayerKey(generateProvisionalPlayerKey(crypto.randomUUID()));
  };

  const handleSaved = (saved: ProClubSquadRosterRecord) => {
    setRecords((previous) => {
      const withoutSaved = previous.filter(
        (record) => record.playerKey !== saved.playerKey,
      );
      return [...withoutSaved, saved];
    });
    setCreatePlayerKey(null);
    setEditingPlayer(null);
    setError(null);
  };

  return (
    <section aria-labelledby="pro-club-squad-roster" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Squad</p>
          <h3 id="pro-club-squad-roster" className="mt-2 text-xl font-black text-white">First Team</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Canonical Pro Club roster from the reviewed tenant path. {canWrite ? "Head Coach may add and edit roster football fields. Other staff remain read-only." : "Your current staff role is read-only for roster data."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-cyan-300"
            >
              <Plus size={15} />
              Add player
            </button>
          )}
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-bold text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(["ALL", "GK", "DEF", "MID", "FWD"] as const).map((item) => {
          const visual = ROSTER_SUMMARY_VISUALS[item];
          const Icon = visual.Icon;
          const count = item === "ALL" ? records.length : counts[item];

          return (
            <article
              key={item}
              data-tone={visual.tone}
              className="pro-club-roster-summary-card relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="pro-club-roster-summary-icon flex h-9 w-9 items-center justify-center rounded-xl">
                  <Icon size={18} />
                </div>
                <p className="pro-club-roster-summary-label text-[10px] font-black uppercase tracking-[0.14em]">
                  {visual.label}
                </p>
              </div>
              <p className="pro-club-roster-summary-count mt-4 text-3xl font-black text-white">
                {count}
              </p>
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, FUTID, jersey, position or squad..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500/60"
          />
        </label>
        <select
          value={group}
          onChange={(event) => setGroup(event.target.value as ProClubSquadPositionGroup)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500/60"
        >
          {PRO_CLUB_SQUAD_POSITION_GROUPS.map((item) => (
            <option key={item} value={item}>{GROUP_LABELS[item]}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as ProClubSquadStatusFilter)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500/60"
        >
          {STATUS_OPTIONS.map((item) => (
            <option key={item} value={item}>{item === "ALL" ? "All statuses" : item}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-400">Loading authoritative First Team roster…</div>
      ) : error ? (
        <article className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 text-rose-300" size={20} />
            <div>
              <h4 className="font-bold text-white">Squad unavailable</h4>
              <p className="mt-2 text-sm leading-6 text-slate-300">{error}</p>
            </div>
          </div>
        </article>
      ) : records.length === 0 ? (
        <article className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center">
          <Users className="mx-auto text-slate-600" size={28} />
          <h4 className="mt-3 font-bold text-white">No First Team players yet</h4>
          <p className="mt-2 text-sm text-slate-500">The canonical Pro Club roster is empty. No Academy or global player fallback is shown.</p>
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-300"
            >
              Add first player
            </button>
          )}
        </article>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center text-sm text-slate-500">No players match the current filters.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((player) => (
            <article key={player.playerKey} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-2xl font-black text-cyan-200">
                    {player.jerseyNumber}
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate font-black text-white">{player.firstName} {player.lastName}</h4>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-cyan-300">{player.position} · {resolveProClubSquadPositionGroup(player.position)}</p>
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black tracking-wider ${statusClasses(player.status)}`}>{player.status}</span>
              </div>

              <div className="space-y-3 px-5 py-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">FUTID</span>
                  <span className="truncate font-mono text-xs text-slate-200">{player.futId ?? "Not bound"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Squad</span>
                  <span className="font-semibold text-slate-200">{player.squadLabel}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-slate-500">Additional</span>
                  <span className="text-right text-slate-300">{player.additionalPositions.length > 0 ? player.additionalPositions.join(" · ") : "—"}</span>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setEditingPlayer(player)}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
                  >
                    <Edit3 size={14} />
                    Edit roster record
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {createPlayerKey && canWrite && (
        <ProClubSquadRosterEditor
          clubId={authority.organizationId}
          mode="CREATE"
          playerKey={createPlayerKey}
          onClose={() => setCreatePlayerKey(null)}
          onSaved={handleSaved}
        />
      )}

      {editingPlayer && canWrite && (
        <ProClubSquadRosterEditor
          clubId={authority.organizationId}
          mode="EDIT"
          playerKey={editingPlayer.playerKey}
          current={editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
