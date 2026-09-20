import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserMinus,
  UserPlus,
} from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  addProClubMatchRosterPlayer,
  createProClubMatch,
  getProClubMatch,
  getProClubShootout,
  getProClubStartingXI,
  listProClubMatches,
  listProClubMatchRoster,
  removeProClubMatchRosterPlayer,
  saveProClubShootout,
  saveProClubStartingXI,
  type ProClubMatchRecord,
  type ProClubMatchRosterRecord,
  type ProClubShootoutRecord,
  type ProClubStartingXIRecord,
} from "../../../lib/firestore/proClubMatchStartingXIRepository";
import {
  listProClubSquadRoster,
  type ProClubSquadRosterRecord,
} from "../../../lib/firestore/proClubSquadRosterRepository";
import {
  canAuthorProClubMatchStartingXI,
  type ProClubMatchCoreData,
  type ProClubPersistedShootoutPlan,
  type ProClubPersistedStartingXIPlan,
} from "../../../lib/proClubMatchStartingXI";
import ProClubStartingXI11v11 from "./ProClubStartingXI11v11";

function createMatchId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `match-${crypto.randomUUID()}`;
  }
  return `match-${Date.now()}`;
}

function matchRosterToUiRoster(
  record: ProClubMatchRosterRecord,
): ProClubSquadRosterRecord {
  return {
    playerKey: record.playerKey,
    schemaVersion: 1,
    futId: record.futId,
    firstName: record.firstName,
    lastName: record.lastName,
    position: record.position,
    additionalPositions: [...record.additionalPositions],
    jerseyNumber: record.jerseyNumber,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

function matchLabel(match: ProClubMatchRecord): string {
  const opponent = match.opponentName ? ` · vs ${match.opponentName}` : "";
  return `${match.competitionName}${opponent}`;
}

export default function ProClubMatchStartingXIWorkspace({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
}) {
  const clubId = authority.organizationId;
  const canMutate = canAuthorProClubMatchStartingXI(authority);

  const [matches, setMatches] = useState<ProClubMatchRecord[]>([]);
  const [canonicalRoster, setCanonicalRoster] = useState<ProClubSquadRosterRecord[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<ProClubMatchRecord | null>(null);
  const [matchRoster, setMatchRoster] = useState<ProClubMatchRosterRecord[]>([]);
  const [startingXI, setStartingXI] = useState<ProClubStartingXIRecord | null>(null);
  const [shootout, setShootout] = useState<ProClubShootoutRecord | null>(null);

  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [competitionName, setCompetitionName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [creatingMatch, setCreatingMatch] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      setLoadingIndex(true);
      setError(null);
      try {
        const [nextMatches, nextRoster] = await Promise.all([
          listProClubMatches(clubId),
          listProClubSquadRoster(clubId),
        ]);
        if (cancelled) return;

        setMatches(nextMatches);
        setCanonicalRoster(nextRoster);
        setSelectedMatchId((current) => {
          if (current && nextMatches.some((item) => item.matchId === current)) {
            return current;
          }
          const editableMatch = nextMatches.find(
            (item) => item.status === "DRAFT" || item.status === "SCHEDULED",
          );
          return editableMatch?.matchId ?? nextMatches[0]?.matchId ?? null;
        });
      } catch (caught) {
        console.error("Pro Club Match workspace index load failed:", caught);
        if (!cancelled) {
          setMatches([]);
          setCanonicalRoster([]);
          setSelectedMatchId(null);
          setError(
            caught instanceof Error
              ? caught.message
              : "Match workspace could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    }

    void loadIndex();

    return () => {
      cancelled = true;
    };
  }, [clubId, reloadToken]);

  useEffect(() => {
    if (!selectedMatchId) {
      setMatch(null);
      setMatchRoster([]);
      setStartingXI(null);
      setShootout(null);
      return;
    }

    let cancelled = false;

    async function loadSelectedMatch() {
      setLoadingMatch(true);
      setError(null);
      setSaveMessage(null);

      try {
        const nextMatch = await getProClubMatch(clubId, selectedMatchId);
        if (!nextMatch) {
          throw new Error("Selected Pro Club Match no longer exists.");
        }

        const [nextRoster, nextStartingXI, nextShootout] = await Promise.all([
          listProClubMatchRoster(clubId, selectedMatchId),
          getProClubStartingXI(clubId, selectedMatchId),
          getProClubShootout(clubId, selectedMatchId),
        ]);

        if (cancelled) return;
        setMatch(nextMatch);
        setMatchRoster(nextRoster);
        setStartingXI(nextStartingXI);
        setShootout(nextShootout);
      } catch (caught) {
        console.error("Pro Club Match workspace detail load failed:", caught);
        if (!cancelled) {
          setMatch(null);
          setMatchRoster([]);
          setStartingXI(null);
          setShootout(null);
          setError(
            caught instanceof Error
              ? caught.message
              : "Selected Match could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoadingMatch(false);
      }
    }

    void loadSelectedMatch();

    return () => {
      cancelled = true;
    };
  }, [clubId, selectedMatchId, reloadToken]);

  const matchRosterKeys = useMemo(
    () => new Set(matchRoster.map((player) => player.playerKey)),
    [matchRoster],
  );

  const availableCanonicalRoster = useMemo(
    () =>
      canonicalRoster.filter(
        (player) =>
          player.status === "ACTIVE" &&
          !matchRosterKeys.has(player.playerKey),
      ),
    [canonicalRoster, matchRosterKeys],
  );

  const uiMatchRoster = useMemo(
    () => matchRoster.map(matchRosterToUiRoster),
    [matchRoster],
  );

  async function handleCreateMatch() {
    if (!canMutate || creatingMatch) return;

    const normalizedCompetition = competitionName.trim();
    const normalizedOpponent = opponentName.trim();
    if (!normalizedCompetition) {
      setError("Competition name is required.");
      return;
    }

    const matchId = createMatchId();
    const data: ProClubMatchCoreData = {
      schemaVersion: 1,
      status: "DRAFT",
      squadLabel: "First Team",
      competitionName: normalizedCompetition,
      opponentName: normalizedOpponent || null,
      kickoffAt: null,
      venueType: null,
    };

    setCreatingMatch(true);
    setError(null);
    try {
      const created = await createProClubMatch(clubId, matchId, data);
      setCompetitionName("");
      setOpponentName("");
      setMatches((current) => [created, ...current]);
      setSelectedMatchId(created.matchId);
      setSaveMessage("DRAFT Match created.");
    } catch (caught) {
      console.error("Pro Club Match create failed:", caught);
      setError(caught instanceof Error ? caught.message : "Match could not be created.");
    } finally {
      setCreatingMatch(false);
    }
  }

  async function addRosterPlayer(playerKey: string) {
    if (!canMutate || !match || saving) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const result = await addProClubMatchRosterPlayer(
        clubId,
        match.matchId,
        playerKey,
        match.rosterRevision,
      );
      setMatch(result.match);
      setMatchRoster(result.roster as ProClubMatchRosterRecord[]);
      setStartingXI(await getProClubStartingXI(clubId, match.matchId));
      setShootout(await getProClubShootout(clubId, match.matchId));
      setSaveMessage("Player added to authoritative Match roster.");
    } catch (caught) {
      console.error("Match roster add failed:", caught);
      setError(caught instanceof Error ? caught.message : "Player could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRosterPlayer(playerKey: string) {
    if (!canMutate || !match || saving) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const result = await removeProClubMatchRosterPlayer(
        clubId,
        match.matchId,
        playerKey,
        match.rosterRevision,
      );
      setMatch(result.match);
      setMatchRoster(result.roster as ProClubMatchRosterRecord[]);
      setStartingXI(await getProClubStartingXI(clubId, match.matchId));
      setShootout(await getProClubShootout(clubId, match.matchId));
      setSaveMessage("Player removed from authoritative Match roster.");
    } catch (caught) {
      console.error("Match roster remove failed:", caught);
      setError(caught instanceof Error ? caught.message : "Player could not be removed.");
    } finally {
      setSaving(false);
    }
  }

  async function persistStartingXI(plan: ProClubPersistedStartingXIPlan) {
    if (!match || saving) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const saved = await saveProClubStartingXI(
        clubId,
        match.matchId,
        plan,
        startingXI?.revision ?? 0,
      );
      setStartingXI(saved);
      setSaveMessage(`Starting XI saved at revision ${saved.revision}.`);
    } catch (caught) {
      console.error("Starting XI save failed:", caught);
      setError(caught instanceof Error ? caught.message : "Starting XI could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function persistShootout(plan: ProClubPersistedShootoutPlan) {
    if (!match || saving) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const saved = await saveProClubShootout(
        clubId,
        match.matchId,
        plan,
        shootout?.revision ?? 0,
      );
      setShootout(saved);
      setSaveMessage(`Shootout order saved at revision ${saved.revision}.`);
    } catch (caught) {
      console.error("Shootout save failed:", caught);
      setError(caught instanceof Error ? caught.message : "Shootout order could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="pro-club-match-workspace" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="pro-club-accent text-xs font-bold uppercase tracking-[0.18em]">
            Matches
          </p>
          <h3 id="pro-club-match-workspace" className="pro-club-heading mt-2 text-2xl font-black">
            Match & Starting XI
          </h3>
          <p className="pro-club-muted mt-2 max-w-3xl text-sm leading-6">
            Canonical Match roster, Starting XI, set-piece duties and penalty shootout order share the reviewed Pro Club Match persistence contract.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReloadToken((current) => current + 1)}
          disabled={loadingIndex || loadingMatch || saving}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          <ShieldAlert size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {canMutate && (
        <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-cyan-300" />
            <h4 className="font-black text-white">Create DRAFT Match</h4>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={competitionName}
              onChange={(event) => setCompetitionName(event.target.value)}
              placeholder="Competition name"
              maxLength={120}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
            <input
              value={opponentName}
              onChange={(event) => setOpponentName(event.target.value)}
              placeholder="Opponent (optional in DRAFT)"
              maxLength={120}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              disabled={creatingMatch}
              onClick={() => void handleCreateMatch()}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-200 disabled:opacity-40"
            >
              {creatingMatch ? "Creating…" : "Create Match"}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-cyan-300" />
          <h4 className="font-black text-white">Match</h4>
        </div>

        {loadingIndex ? (
          <p className="mt-3 text-sm text-slate-500">Loading Matches…</p>
        ) : matches.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No canonical Pro Club Match exists yet.
          </p>
        ) : (
          <select
            value={selectedMatchId ?? ""}
            onChange={(event) => setSelectedMatchId(event.target.value || null)}
            className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {matches.map((item) => (
              <option key={item.matchId} value={item.matchId}>
                {matchLabel(item)} · {item.status} · roster r{item.rosterRevision}
              </option>
            ))}
          </select>
        )}
      </section>

      {match && (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <h4 className="font-black text-white">
                Match roster · {matchRoster.length}
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Canonical snapshot revision {match.rosterRevision}
              </p>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {matchRoster.length === 0 ? (
                  <p className="text-sm text-slate-500">No Match roster players yet.</p>
                ) : (
                  matchRoster.map((player) => (
                    <div
                      key={player.playerKey}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          #{player.jerseyNumber} · {player.firstName} {player.lastName}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {player.position ?? "Position not set"} · {player.futId ?? "FUTID not bound"}
                        </p>
                      </div>
                      {canMutate && (match.status === "DRAFT" || match.status === "SCHEDULED") && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void removeRosterPlayer(player.playerKey)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-400/20 px-2 py-1 text-[10px] font-bold text-rose-300 disabled:opacity-40"
                        >
                          <UserMinus size={12} />
                          Remove
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <h4 className="font-black text-white">Add from First Team</h4>
              <p className="mt-1 text-xs text-slate-500">
                Only ACTIVE canonical Pro Club roster players can be snapshotted.
              </p>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {availableCanonicalRoster.length === 0 ? (
                  <p className="text-sm text-slate-500">No additional ACTIVE players available.</p>
                ) : (
                  availableCanonicalRoster.map((player) => (
                    <div
                      key={player.playerKey}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          #{player.jerseyNumber} · {player.firstName} {player.lastName}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {player.position ?? "Position not set"} · {player.futId ?? "FUTID not bound"}
                        </p>
                      </div>
                      {canMutate && (match.status === "DRAFT" || match.status === "SCHEDULED") && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void addRosterPlayer(player.playerKey)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/20 px-2 py-1 text-[10px] font-bold text-emerald-300 disabled:opacity-40"
                        >
                          <UserPlus size={12} />
                          Add
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {loadingMatch ? (
            <p className="text-sm text-slate-500">Loading Match plan…</p>
          ) : startingXI?.formation === "CUSTOM" ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              This Match contains a CUSTOM formation. Custom formation editing remains outside the reviewed fixed-formation UI slice.
            </div>
          ) : (
            <ProClubStartingXI11v11
              key={`${match.matchId}:${startingXI?.revision ?? 0}:${shootout?.revision ?? 0}:${match.rosterRevision}`}
              authority={authority}
              roster={uiMatchRoster}
              initialStartingXI={startingXI}
              initialShootout={shootout}
              saving={saving}
              saveMessage={saveMessage}
              onSaveStartingXI={persistStartingXI}
              onSaveShootout={persistShootout}
            />
          )}
        </>
      )}
    </section>
  );
}
