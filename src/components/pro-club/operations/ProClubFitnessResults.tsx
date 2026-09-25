import { useEffect, useMemo, useState } from "react";

import {
  FOOTBALL_FITNESS_TEST_CATALOGUE,
  type FitnessTestDefinition,
} from "../../../lib/fitnessTestFoundation";
import { calendarDateInTimeZone, parseCanonicalDateOnly } from "../../../lib/dateTimeFoundation";
import {
  prepareProClubFitnessResultDrafts,
  type ProClubFitnessResultCreateInput,
  type ProClubFitnessResultHistoryEntry,
} from "../../../lib/proClubFitnessResult";
import {
  createProClubFitnessResults,
  listProClubFitnessResultHistory,
  listProClubFitnessResultsForDate,
  type ProClubFitnessResultCreateOutcome,
} from "../../../lib/firestore/proClubFitnessResultRepository";
import {
  listProClubSquadRoster,
  type ProClubSquadRosterRecord,
} from "../../../lib/firestore/proClubSquadRosterRepository";
import {
  listProClubPlayerPhotos,
  type ProClubPlayerPhotoRecord,
} from "../../../lib/firestore/proClubPlayerPhotoRepository";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import { isValidDocumentIdentifier } from "../../../lib/proClubModel";

export interface ProClubFitnessResultsServices {
  listRoster(clubId: string): Promise<ProClubSquadRosterRecord[]>;
  listPhotos(clubId: string): Promise<ProClubPlayerPhotoRecord[]>;
  listResultsForDate(input: {
    clubId: string;
    observedOn: string;
    definitions: readonly FitnessTestDefinition[];
  }): Promise<Record<string, Record<string, number>>>;
  listHistory(input: {
    clubId: string;
    playerKey: string;
    definitions: readonly FitnessTestDefinition[];
  }): Promise<ProClubFitnessResultHistoryEntry[]>;
  createResults(input: {
    clubId: string;
    inputs: readonly ProClubFitnessResultCreateInput[];
  }): Promise<ProClubFitnessResultCreateOutcome[]>;
}

const DEFAULT_SERVICES: ProClubFitnessResultsServices = {
  listRoster: listProClubSquadRoster,
  listPhotos: listProClubPlayerPhotos,
  listResultsForDate: listProClubFitnessResultsForDate,
  listHistory: listProClubFitnessResultHistory,
  createResults: createProClubFitnessResults,
};

function hasActiveStaffAuthority(authority: ProClubOrganizationAuthority): boolean {
  return authority.organizationType === "PRO_CLUB" &&
    isValidDocumentIdentifier(authority.organizationId) &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    authority.staffRole !== null;
}

export function canCreateProClubFitnessResults(
  authority: ProClubOrganizationAuthority,
): boolean {
  return hasActiveStaffAuthority(authority) && authority.staffRole === "FITNESS_COACH";
}

interface ScopedDateResults {
  clubId: string;
  observedOn: string;
  values: Record<string, Record<string, number>>;
}

interface ScopedHistory {
  clubId: string;
  playerKey: string;
  entries: ProClubFitnessResultHistoryEntry[];
}

function playerLabel(player: ProClubSquadRosterRecord): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The request could not be completed.";
}

export default function ProClubFitnessResults({
  authority,
  services = DEFAULT_SERVICES,
  definitions = FOOTBALL_FITNESS_TEST_CATALOGUE,
}: {
  authority: ProClubOrganizationAuthority;
  services?: ProClubFitnessResultsServices;
  definitions?: readonly FitnessTestDefinition[];
}) {
  const canRead = hasActiveStaffAuthority(authority);
  const canCreate = canCreateProClubFitnessResults(authority);
  const activeDefinitions = useMemo(
    () => definitions.filter((definition) =>
      definition.origin === "BUILT_IN" && definition.status === "ACTIVE",
    ),
    [definitions],
  );
  const authorityScope = [
    authority.organizationId,
    authority.userId,
    authority.organizationStatus,
    authority.membershipStatus,
    authority.hasMembershipAuthority ? "AUTHORIZED" : "UNAUTHORIZED",
    authority.staffRole ?? "NO_ROLE",
  ].join("|");
  const [observedOn, setObservedOn] = useState(
    () => calendarDateInTimeZone(new Date(), "Asia/Bangkok") ?? "",
  );
  const [rosterState, setRosterState] = useState<{
    scope: string;
    players: ProClubSquadRosterRecord[];
  } | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{
    scope: string;
    dataUrlsByPlayerKey: Record<string, string>;
  } | null>(null);
  const [selectedPlayerKey, setSelectedPlayerKey] = useState("");
  const [dateResults, setDateResults] = useState<ScopedDateResults | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScopedHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [message, setMessage] = useState<{ kind: "status" | "error"; text: string } | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const clubId = authority.organizationId;
  const players = rosterState?.scope === authorityScope ? rosterState.players : [];
  const dataUrlsByPlayerKey = photos?.scope === authorityScope
    ? photos.dataUrlsByPlayerKey
    : {};
  const rosterLoading = canRead && rosterState?.scope !== authorityScope && rosterError === null;
  const selectedDateResults = dateResults?.clubId === clubId && dateResults.observedOn === observedOn
    ? dateResults.values
    : null;
  const saved = selectedDateResults ?? {};
  const validDate = parseCanonicalDateOnly(observedOn) !== null;

  useEffect(() => {
    let current = true;
    setRosterState(null);
    setRosterError(null);
    setSelectedPlayerKey("");
    if (!canRead) return () => { current = false; };

    services.listRoster(clubId).then((roster) => {
      if (current) setRosterState({ scope: authorityScope, players: roster });
    }).catch((error: unknown) => {
      if (current) setRosterError(`Roster could not be loaded: ${errorMessage(error)}`);
    });
    return () => { current = false; };
  }, [authorityScope, canRead, clubId, services]);

  useEffect(() => {
    let current = true;
    setPhotos(null);
    if (!canRead) return () => { current = false; };

    services.listPhotos(clubId).then((records) => {
      if (!current) return;
      const dataUrlsByPlayerKey: Record<string, string> = {};
      for (const record of records) {
        if (typeof record.dataUrl === "string" && record.dataUrl.length > 0) {
          dataUrlsByPlayerKey[record.playerKey] = record.dataUrl;
        }
      }
      setPhotos({ scope: authorityScope, dataUrlsByPlayerKey });
    }).catch(() => {
      if (current) setPhotos({ scope: authorityScope, dataUrlsByPlayerKey: {} });
    });
    return () => { current = false; };
  }, [authorityScope, canRead, clubId, services]);

  useEffect(() => {
    setDrafts({});
    setMessage(null);
  }, [authorityScope, clubId, observedOn]);

  useEffect(() => {
    let current = true;
    setDateResults(null);
    setDateError(null);
    if (!canRead || !validDate) return () => { current = false; };

    services.listResultsForDate({
      clubId,
      observedOn,
      definitions,
    }).then((values) => {
      if (current) setDateResults({ clubId, observedOn, values });
    }).catch((error: unknown) => {
      if (current) setDateError(`Saved results could not be loaded: ${errorMessage(error)}`);
    });
    return () => { current = false; };
  }, [canRead, clubId, definitions, observedOn, refreshVersion, services, validDate]);

  useEffect(() => {
    const firstPlayer = players[0]?.playerKey ?? "";
    if (!players.some(({ playerKey }) => playerKey === selectedPlayerKey)) {
      setSelectedPlayerKey(firstPlayer);
    }
  }, [players, selectedPlayerKey]);

  useEffect(() => {
    let current = true;
    setHistory(null);
    setHistoryError(null);
    if (!canRead || !selectedPlayerKey) return () => { current = false; };

    services.listHistory({
      clubId,
      playerKey: selectedPlayerKey,
      definitions,
    }).then((entries) => {
      if (current) setHistory({ clubId, playerKey: selectedPlayerKey, entries });
    }).catch((error: unknown) => {
      if (current) setHistoryError(`Player history could not be loaded: ${errorMessage(error)}`);
    });
    return () => { current = false; };
  }, [canRead, clubId, definitions, refreshVersion, selectedPlayerKey, services]);

  function updateDraft(playerKey: string, definitionKey: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [playerKey]: {
        ...(current[playerKey] ?? {}),
        [definitionKey]: value,
      },
    }));
    setMessage(null);
  }

  async function saveDrafts() {
    if (!canCreate || saving || !validDate || selectedDateResults === null) return;
    const prepared = prepareProClubFitnessResultDrafts({
      observedOn,
      players: players.map(({ playerKey, status }) => ({ playerKey, status })),
      definitions: activeDefinitions,
      drafts,
      saved,
    });
    if (prepared.ok === false) {
      setMessage({ kind: "error", text: prepared.errors.join(" ") });
      return;
    }
    if (prepared.entries.length === 0) {
      setMessage({ kind: "status", text: "Enter at least one unsaved result before saving." });
      return;
    }

    setSaving(true);
    setMessage(null);
    let committed = 0;
    let conflicts = 0;
    let failed = 0;
    const completed: typeof prepared.entries = [];
    let outcomes: readonly (ProClubFitnessResultCreateOutcome | null)[];
    try {
      const results = await services.createResults({
        clubId,
        inputs: prepared.entries.map(({ input }) => input),
      });
      outcomes = prepared.entries.map((_, index) => results[index] ?? null);
    } catch {
      outcomes = prepared.entries.map(() => null);
    }
    for (const [index, entry] of prepared.entries.entries()) {
      const result = outcomes[index];
      if (!result || result.kind === "WRITE_FAILED") {
        failed += 1;
      } else if (result.kind === "DEFINITELY_CREATED" || result.kind === "ALREADY_COMMITTED_EQUIVALENT") {
        committed += 1;
        completed.push(entry);
      } else if (result.kind === "OBSERVATION_CONFLICT") {
        conflicts += 1;
        completed.push(entry);
      }
    }

    if (completed.length > 0) {
      setDrafts((current) => {
        const next = { ...current };
        for (const entry of completed) {
          const cells = { ...(next[entry.playerKey] ?? {}) };
          if (cells[entry.definitionKey] !== undefined &&
            Number(cells[entry.definitionKey]) === entry.input.value) {
            delete cells[entry.definitionKey];
          }
          if (Object.keys(cells).length === 0) delete next[entry.playerKey];
          else next[entry.playerKey] = cells;
        }
        return next;
      });
      setRefreshVersion((version) => version + 1);
    }

    setSaving(false);
    if (failed > 0 || conflicts > 0) {
      const details = [
        committed > 0 ? `${committed} observation(s) confirmed.` : "",
        conflicts > 0 ? `${conflicts} deterministic identity conflict(s) were preserved without overwrite.` : "",
        failed > 0 ? `${failed} observation(s) could not be confirmed; their drafts remain available.` : "",
      ].filter(Boolean).join(" ");
      setMessage({ kind: "error", text: details });
    } else {
      setMessage({ kind: "status", text: `${committed} observation(s) confirmed. Refreshing persisted Pro Club results.` });
    }
  }

  const visibleHistory = history?.clubId === clubId && history.playerKey === selectedPlayerKey
    ? history.entries
    : [];

  return (
    <section aria-labelledby="pro-club-fitness-results-title" className="rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-400">Persisted Pro Club observations</p>
          <h2 id="pro-club-fitness-results-title" className="mt-2 text-xl font-black">Fitness results</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Record numeric observations from the shared football tests. Saved results are immutable and do not create readiness or medical assessments.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-slate-300">Testing date
            <input
              aria-label="Testing date"
              type="date"
              value={observedOn}
              disabled={saving}
              onInput={(event) => {
                const nextDate = event.currentTarget.value;
                setObservedOn(nextDate);
                setMessage(parseCanonicalDateOnly(nextDate) === null
                  ? { kind: "error", text: "Select a valid testing date." }
                  : null);
              }}
              className="mt-1 block min-h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => setRefreshVersion((version) => version + 1)}
            disabled={!canRead || !validDate || saving}
            className="min-h-10 rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >Refresh saved results</button>
        </div>
      </div>

      {!canRead ? (
        <p role="alert" className="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          Active Pro Club staff authority is required to view results.
        </p>
      ) : !canCreate ? (
        <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Read-only Pro Club Fitness results. Only an active FITNESS_COACH can save new observations.
        </p>
      ) : null}

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-sm ${message.kind === "error" ? "bg-rose-500/10 text-rose-200" : "bg-emerald-500/10 text-emerald-200"}`}>
          {message.text}
        </p>
      )}
      {rosterError && <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{rosterError}</p>}
      {dateError && <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{dateError}</p>}
      {historyError && <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{historyError}</p>}

      {!validDate && <p role="alert" className="mt-4 text-sm text-rose-200">Select a valid testing date.</p>}
      {rosterLoading && <p role="status" className="mt-4 text-sm text-slate-400">Loading the canonical Pro Club roster…</p>}
      {canRead && validDate && selectedDateResults === null && !dateError && (
        <p role="status" className="mt-4 text-sm text-slate-400">Loading saved results for {observedOn}…</p>
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-700">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th scope="col" className="sticky left-0 min-w-48 bg-slate-950 px-3 py-3">Player</th>
              {activeDefinitions.map((definition) => (
                <th key={`${definition.id}:${definition.version}`} scope="col" className="min-w-40 px-3 py-3">
                  <span className="block text-slate-200">{definition.name}</span>
                  <span className="mt-1 block normal-case">{definition.unit} · v{definition.version}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.playerKey} className="border-t border-slate-800">
                <th scope="row" className="sticky left-0 bg-slate-900 px-3 py-3 align-top">
                  <div className="flex min-w-48 items-center gap-3">
                    {dataUrlsByPlayerKey[player.playerKey] ? (
                      <img
                        src={dataUrlsByPlayerKey[player.playerKey]}
                        alt={playerLabel(player)}
                        width={48}
                        height={48}
                        className="h-12 w-12 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                      />
                    ) : (
                      <span
                        role="img"
                        aria-label={`Jersey number ${player.jerseyNumber}`}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-xs font-black text-slate-100"
                      >
                        #{player.jerseyNumber}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-white">{playerLabel(player)}</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-300">
                        #{player.jerseyNumber} · {player.position ?? "Position not set"}
                      </span>
                      <span className={[
                        "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide",
                        player.status === "ACTIVE"
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                          : player.status === "INACTIVE"
                            ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
                            : "border-slate-500/50 bg-slate-700/50 text-slate-300",
                      ].join(" ")}>
                        {player.status}
                      </span>
                    </span>
                  </div>
                </th>
                {activeDefinitions.map((definition) => {
                  const hasSaved = Object.hasOwn(saved[player.playerKey] ?? {}, definition.key);
                  const savedValue = saved[player.playerKey]?.[definition.key];
                  const draftValue = drafts[player.playerKey]?.[definition.key] ?? "";
                  const disabled = saving || hasSaved || !canCreate || player.status === "RELEASED" || selectedDateResults === null;
                  return (
                    <td key={`${definition.id}:${definition.version}`} className="px-3 py-3 align-top">
                      <input
                        aria-label={`${playerLabel(player)} · ${definition.name}`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={hasSaved ? String(savedValue) : draftValue}
                        disabled={disabled}
                        title={hasSaved ? "Saved observations are immutable." : undefined}
                        onInput={(event) => updateDraft(player.playerKey, definition.key, event.currentTarget.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white disabled:bg-slate-800 disabled:text-slate-300 disabled:opacity-90"
                      />
                      {hasSaved && <span className="mt-1 block text-[10px] text-emerald-300">Saved · immutable</span>}
                      {!hasSaved && player.status === "RELEASED" && <span className="mt-1 block text-[10px] text-slate-500">Released players cannot receive new results.</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rosterLoading && players.length === 0 && (
              <tr><td colSpan={activeDefinitions.length + 1} className="px-3 py-6 text-center text-sm text-slate-400">No canonical Pro Club roster players were found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canCreate && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-slate-400">ACTIVE and INACTIVE roster players may receive results. Each saved observation is append-only.</p>
          <button
            type="button"
            onClick={() => void saveDrafts()}
            disabled={saving || !validDate || selectedDateResults === null || rosterLoading}
            className="min-h-10 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >{saving ? "Saving results…" : "Save results"}</button>
        </div>
      )}

      <section aria-labelledby="pro-club-fitness-history-title" className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="pro-club-fitness-history-title" className="font-black">Player history</h3>
            <p className="mt-1 text-xs text-slate-400">Persisted results sorted by testing date, newest first.</p>
          </div>
          <label className="text-xs font-bold text-slate-300">Player history
            <select
              aria-label="Player history"
              value={selectedPlayerKey}
              disabled={!canRead || players.length === 0}
              onChange={(event) => setSelectedPlayerKey(event.currentTarget.value)}
              className="mt-1 block min-h-10 min-w-60 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {players.map((player) => (
                <option key={player.playerKey} value={player.playerKey}>{playerLabel(player)} · {player.status}</option>
              ))}
            </select>
          </label>
        </div>
        {selectedPlayerKey && history?.clubId === clubId && history.playerKey === selectedPlayerKey ? (
          visibleHistory.length > 0 ? (
            <ol className="mt-4 divide-y divide-slate-800">
              {visibleHistory.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="font-semibold">{entry.definitionName}</span>
                  <span className="text-slate-300">{entry.value} {entry.unit}</span>
                  <time dateTime={entry.observedOn} className="text-xs text-slate-400">{entry.observedOn}</time>
                </li>
              ))}
            </ol>
          ) : <p className="mt-4 text-sm text-slate-400">No persisted result history for this player.</p>
        ) : canRead && selectedPlayerKey ? (
          <p role="status" className="mt-4 text-sm text-slate-400">Loading persisted player history…</p>
        ) : <p className="mt-4 text-sm text-slate-400">Select a roster player to view history.</p>}
      </section>
    </section>
  );
}
