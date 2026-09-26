import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Plus,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import {
  createProClubAttendanceRecord,
  createProClubAttendanceSession,
  getProClubAttendanceSession,
  listProClubAttendanceRecords,
  listProClubAttendanceSessions,
  updateProClubAttendanceRecord,
  type ProClubAttendancePlayerRecord,
  type ProClubAttendanceRepositoryOps,
  type ProClubAttendanceSessionRecord,
} from "../../../lib/firestore/proClubAttendanceRepository";
import {
  listProClubSquadRoster,
  type ProClubSquadRosterRecord,
  type ProClubSquadRosterRepositoryOps,
} from "../../../lib/firestore/proClubSquadRosterRepository";
import {
  buildProClubAttendanceSessionId,
  isEligibleProClubAttendanceRosterPlayer,
  isStrictProClubAttendanceDate,
  isStrictProClubAttendanceTime,
  PRO_CLUB_ATTENDANCE_STATUSES,
  type ProClubAttendanceStatus,
} from "../../../lib/proClubAttendance";
import {
  formatThaiDateShort,
  formatThaiDateWithWeekday,
  formatThaiTime,
} from "../../../lib/thaiDateTimePresentation";
import { FutVerseThaiDateInput, FutVerseThaiTimeInput } from "../../common/FutVerseThaiDateTimeInputs";

export interface ProClubAttendanceProps {
  authority: ProClubOrganizationAuthority;
  initialSlot?: {
    sessionDate: string;
    startTime: string;
  } | null;
  attendanceOps?: ProClubAttendanceRepositoryOps;
  rosterOps?: ProClubSquadRosterRepositoryOps;
}

export function canMutateProClubAttendance(
  authority: ProClubOrganizationAuthority,
): boolean {
  return (
    authority.organizationType === "PRO_CLUB" &&
    authority.organizationStatus === "ACTIVE" &&
    authority.membershipStatus === "ACTIVE" &&
    authority.hasMembershipAuthority === true &&
    authority.staffRole === "HEAD_COACH"
  );
}

export function sortProClubAttendanceSessionsNewestFirst<
  T extends Pick<ProClubAttendanceSessionRecord, "sessionDate" | "startTime">,
>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => {
    const dateCmp = b.sessionDate.localeCompare(a.sessionDate);
    if (dateCmp !== 0) return dateCmp;
    return b.startTime.localeCompare(a.startTime);
  });
}

const STATUS_STYLE: Record<
  ProClubAttendanceStatus,
  { badge: string; activeBtn: string; inactiveBtn: string }
> = {
  PRESENT: {
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    activeBtn: "bg-emerald-500 text-slate-950 font-black border-emerald-400 shadow-md",
    inactiveBtn: "border-slate-700 bg-slate-900/80 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10",
  },
  LATE: {
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    activeBtn: "bg-amber-400 text-slate-950 font-black border-amber-300 shadow-md",
    inactiveBtn: "border-slate-700 bg-slate-900/80 text-amber-400 hover:border-amber-500/50 hover:bg-amber-500/10",
  },
  ABSENT: {
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    activeBtn: "bg-rose-500 text-white font-black border-rose-400 shadow-md",
    inactiveBtn: "border-slate-700 bg-slate-900/80 text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/10",
  },
  EXCUSED: {
    badge: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    activeBtn: "bg-sky-400 text-slate-950 font-black border-sky-300 shadow-md",
    inactiveBtn: "border-slate-700 bg-slate-900/80 text-sky-400 hover:border-sky-500/50 hover:bg-sky-500/10",
  },
};

function getIsoDateToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ProClubAttendance({
  authority,
  initialSlot,
  attendanceOps,
  rosterOps,
}: ProClubAttendanceProps) {
  const clubId = authority.organizationId;
  const canMutate = canMutateProClubAttendance(authority);

  // Roster state
  const [roster, setRoster] = useState<ProClubSquadRosterRecord[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<ProClubAttendanceSessionRecord[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Selected session records state
  const [records, setRecords] = useState<Record<string, ProClubAttendancePlayerRecord>>({});
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [savingPlayerKey, setSavingPlayerKey] = useState<string | null>(null);
  const [playerErrors, setPlayerErrors] = useState<Record<string, string>>({});

  // Session form input state
  const [inputDate, setInputDate] = useState(
    () => initialSlot?.sessionDate ?? getIsoDateToday(),
  );
  const [inputTime, setInputTime] = useState(
    () => initialSlot?.startTime ?? "09:00",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  // Reload trigger
  const [reloadToken, setReloadToken] = useState(0);

  // Training Day Card handoff: prefill the deterministic attendance slot and
  // open an existing canonical session when one already exists. This handoff
  // never creates a session; creation stays behind the existing Head Coach flow.
  useEffect(() => {
    if (!initialSlot || loadingSessions) return;

    const { sessionDate, startTime } = initialSlot;
    setInputDate(sessionDate);
    setInputTime(startTime);
    setFormError(null);
    setSelectedSessionId(null);

    if (
      !isStrictProClubAttendanceDate(sessionDate) ||
      !isStrictProClubAttendanceTime(startTime)
    ) {
      setFormError("Invalid Training attendance slot.");
      return;
    }

    const attendanceSessionId =
      buildProClubAttendanceSessionId(sessionDate, startTime);
    if (!attendanceSessionId) {
      setFormError("Invalid Training attendance slot identity.");
      return;
    }

    let cancelled = false;

    async function openExistingLinkedSession() {
      try {
        const existing = await getProClubAttendanceSession(
          clubId,
          attendanceSessionId!,
          attendanceOps,
        );

        if (cancelled || !existing) return;

        setSessions((current) => [
          existing,
          ...current.filter(
            (session) =>
              session.attendanceSessionId !== existing.attendanceSessionId,
          ),
        ]);
        setSelectedSessionId(existing.attendanceSessionId);
      } catch (err) {
        if (!cancelled) {
          setFormError(
            err instanceof Error
              ? err.message
              : "Failed to open linked attendance session.",
          );
        }
      }
    }

    void openExistingLinkedSession();

    return () => {
      cancelled = true;
    };
  }, [
    attendanceOps,
    clubId,
    initialSlot?.sessionDate,
    initialSlot?.startTime,
    loadingSessions,
  ]);

  // Load canonical roster
  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      setLoadingRoster(true);
      setRosterError(null);
      try {
        const next = await listProClubSquadRoster(clubId, rosterOps);
        if (!cancelled) {
          setRoster(next);
        }
      } catch (err) {
        if (!cancelled) {
          setRoster([]);
          setRosterError(
            "First-team squad could not be loaded from the authoritative Pro Club roster.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRoster(false);
        }
      }
    }

    void loadRoster();

    return () => {
      cancelled = true;
    };
  }, [clubId, reloadToken, rosterOps]);

  // Load historical sessions
  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setLoadingSessions(true);
      setSessionsError(null);
      try {
        const next = await listProClubAttendanceSessions(clubId, attendanceOps);
        if (!cancelled) {
          // Sort newest session first
          const sorted = sortProClubAttendanceSessionsNewestFirst(next);
          setSessions(sorted);
        }
      } catch (err) {
        if (!cancelled) {
          setSessions([]);
          setSessionsError(
            err instanceof Error ? err.message : "Failed to load attendance sessions.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSessions(false);
        }
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [clubId, reloadToken, attendanceOps]);

  // Load records for selected session
  useEffect(() => {
    if (!selectedSessionId) {
      setRecords({});
      setRecordsError(null);
      return;
    }

    let cancelled = false;

    async function loadRecords() {
      setLoadingRecords(true);
      setRecordsError(null);
      setPlayerErrors({});
      try {
        const list = await listProClubAttendanceRecords(
          clubId,
          selectedSessionId!,
          attendanceOps,
        );
        if (!cancelled) {
          const map: Record<string, ProClubAttendancePlayerRecord> = {};
          for (const item of list) {
            map[item.playerKey] = item;
          }
          setRecords(map);
        }
      } catch (err) {
        if (!cancelled) {
          setRecords({});
          setRecordsError(
            err instanceof Error ? err.message : "Failed to load attendance records.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRecords(false);
        }
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, [clubId, selectedSessionId, attendanceOps]);

  // Filter for canonical ACTIVE First Team roster players
  const activeFirstTeamPlayers = useMemo(() => {
    return roster
      .filter((player) => isEligibleProClubAttendanceRosterPlayer(player.playerKey, player))
      .sort((a, b) => {
        if (a.jerseyNumber !== b.jerseyNumber) {
          return a.jerseyNumber - b.jerseyNumber;
        }
        return a.lastName.localeCompare(b.lastName);
      });
  }, [roster]);

  const selectedSession = useMemo(() => {
    return sessions.find((s) => s.attendanceSessionId === selectedSessionId) ?? null;
  }, [sessions, selectedSessionId]);

  // Attendance metrics for selected session
  const metrics = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;
    let unrecorded = 0;

    for (const player of activeFirstTeamPlayers) {
      const record = records[player.playerKey];
      if (!record) {
        unrecorded += 1;
      } else if (record.status === "PRESENT") {
        present += 1;
      } else if (record.status === "LATE") {
        late += 1;
      } else if (record.status === "ABSENT") {
        absent += 1;
      } else if (record.status === "EXCUSED") {
        excused += 1;
      }
    }

    return {
      total: activeFirstTeamPlayers.length,
      present,
      late,
      absent,
      excused,
      unrecorded,
    };
  }, [activeFirstTeamPlayers, records]);

  // Non-active players who have historical records in this session
  const nonActivePlayersWithRecords = useMemo(() => {
    const activeKeys = new Set(activeFirstTeamPlayers.map((p) => p.playerKey));
    return Object.values(records).filter((r) => !activeKeys.has(r.playerKey));
  }, [activeFirstTeamPlayers, records]);

  // Handle open or create session
  const handleOpenOrCreateSession = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    const trimmedDate = inputDate.trim();
    const trimmedTime = inputTime.trim();

    if (!isStrictProClubAttendanceDate(trimmedDate)) {
      setFormError("Please choose a valid date.");
      return;
    }

    if (!isStrictProClubAttendanceTime(trimmedTime)) {
      setFormError("Please choose a valid start time in 24-hour format.");
      return;
    }

    const expectedId = buildProClubAttendanceSessionId(trimmedDate, trimmedTime);
    if (!expectedId) {
      setFormError("Invalid session slot identity.");
      return;
    }

    // Canonical exact read is authoritative. A cache miss must never
    // be treated as proof that the deterministic session does not exist.
    setCreatingSession(true);
    try {
      const existing = await getProClubAttendanceSession(
        clubId,
        expectedId,
        attendanceOps,
      );

      if (existing) {
        setSessions((prev) => [
          existing,
          ...prev.filter(
            (session) =>
              session.attendanceSessionId !==
              existing.attendanceSessionId,
          ),
        ]);
        setSelectedSessionId(existing.attendanceSessionId);
        setFormError(null);
        return;
      }

      // Only a canonical exact-read null result permits creation.
      if (!canMutate) {
        setFormError(
          "Attendance session does not exist. Only Head Coach can create new sessions.",
        );
        return;
      }

      const created = await createProClubAttendanceSession(
        clubId,
        { sessionDate: trimmedDate, startTime: trimmedTime },
        attendanceOps,
      );

      setSessions((prev) => [
        created,
        ...prev.filter(
          (session) =>
            session.attendanceSessionId !==
            created.attendanceSessionId,
        ),
      ]);
      setSelectedSessionId(created.attendanceSessionId);
      setFormError(null);
    } catch (err) {
      // Exact-read failure fails closed: creation is never attempted.
      setFormError(
        err instanceof Error
          ? err.message
          : "Failed to open attendance session.",
      );
    } finally {
      setCreatingSession(false);
    }
  };

  // Handle setting attendance status for a player
  const handleSetStatus = async (
    playerKey: string,
    nextStatus: ProClubAttendanceStatus,
  ) => {
    if (!canMutate || !selectedSessionId) return;

    const currentRecord = records[playerKey];
    if (currentRecord && currentRecord.status === nextStatus) {
      return;
    }

    setSavingPlayerKey(playerKey);
    setPlayerErrors((prev) => {
      const copy = { ...prev };
      delete copy[playerKey];
      return copy;
    });

    try {
      let saved: ProClubAttendancePlayerRecord;
      if (currentRecord) {
        saved = await updateProClubAttendanceRecord(
          clubId,
          selectedSessionId,
          playerKey,
          nextStatus,
          attendanceOps,
        );
      } else {
        saved = await createProClubAttendanceRecord(
          clubId,
          selectedSessionId,
          { playerKey, status: nextStatus },
          attendanceOps,
        );
      }
      setRecords((prev) => ({
        ...prev,
        [playerKey]: saved,
      }));
    } catch (err) {
      setPlayerErrors((prev) => ({
        ...prev,
        [playerKey]:
          err instanceof Error ? err.message : "Failed to record attendance.",
      }));
    } finally {
      setSavingPlayerKey(null);
    }
  };

  return (
    <section
      aria-labelledby="pro-club-attendance-heading"
      className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-7 text-white shadow-xl"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-cyan-300">
              Operations V1
            </span>
            {canMutate ? (
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-emerald-300">
                Head Coach Authorized
              </span>
            ) : (
              <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Read-Only Session View
              </span>
            )}
          </div>
          <h3
            id="pro-club-attendance-heading"
            className="mt-2 text-2xl font-black tracking-tight text-white"
          >
            Training Attendance
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Authoritative session attendance for the First Team canonical squad. Attendance records are locked to deterministic session slots and active roster identity.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setReloadToken((prev) => prev + 1)}
          disabled={loadingRoster || loadingSessions || loadingRecords}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-2 text-xs font-bold text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={
              loadingRoster || loadingSessions || loadingRecords
                ? "animate-spin"
                : ""
            }
          />
          Refresh
        </button>
      </div>

      {/* Authority notification if read-only */}
      {!canMutate && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-800/40 bg-amber-950/20 p-4 text-xs text-amber-200">
          <ShieldAlert size={18} className="shrink-0 text-amber-400" />
          <span>
            You are viewing attendance in read-only mode. Creating sessions and recording attendance is restricted to the active Head Coach.
          </span>
        </div>
      )}

      {/* Session Slot Selector & Creator */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
        {/* Slot Entry Card */}
        <form
          onSubmit={handleOpenOrCreateSession}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Calendar size={15} />
            <span>Attendance Session Slot</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="attendance-session-date"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400"
              >
                วันที่
              </label>
              <div className="relative mt-1">
                <FutVerseThaiDateInput
                  id="attendance-session-date"
                  value={inputDate}
                  onChange={setInputDate}
                  className="border-slate-700 bg-slate-900 text-white hover:border-slate-600 focus:border-cyan-400 focus:ring-cyan-400/20"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="attendance-session-time"
                className="block text-xs font-bold uppercase tracking-wider text-slate-400"
              >
                เวลาเริ่ม
              </label>
              <div className="relative mt-1">
                <FutVerseThaiTimeInput
                  id="attendance-session-time"
                  value={inputTime}
                  onChange={setInputTime}
                  className="border-slate-700 bg-slate-900 text-white focus:border-cyan-400 focus:ring-cyan-400/20"
                  required
                  aria-label="เวลาเริ่ม (24 ชั่วโมง)"
                />
              </div>
            </div>
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-300">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-400" />
              <span>{formError}</span>
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={creatingSession}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingSession ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Creating Session…
                </>
              ) : (
                <>
                  <Plus size={15} />
                  Open or Create Session Slot
                </>
              )}
            </button>
          </div>
        </form>

        {/* Historical Sessions Browser */}
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
              <History size={15} className="text-cyan-400" />
              <span>Historical Sessions ({sessions.length})</span>
            </div>
            {selectedSession && (
              <span className="font-mono text-xs text-cyan-300">
                Active: {formatThaiDateShort(selectedSession.sessionDate)} {formatThaiTime(selectedSession.startTime)}
              </span>
            )}
          </div>

          {loadingSessions ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Loading sessions…
            </div>
          ) : sessionsError ? (
            <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-3 text-xs text-rose-300">
              {sessionsError}
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No historical attendance sessions recorded yet. Enter a date and time above to create one.
            </div>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {sessions.map((session) => {
                const isSelected =
                  session.attendanceSessionId === selectedSessionId;
                return (
                  <button
                    key={session.attendanceSessionId}
                    type="button"
                    onClick={() => {
                      setSelectedSessionId(session.attendanceSessionId);
                      setInputDate(session.sessionDate);
                      setInputTime(session.startTime);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                      isSelected
                        ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200"
                        : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Clock
                        size={14}
                        className={isSelected ? "text-cyan-400" : "text-slate-500"}
                      />
                      <span className="font-bold">{formatThaiDateShort(session.sessionDate)}</span>
                      <span className="text-slate-400">{formatThaiTime(session.startTime)}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {session.squadLabel}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Active Session Content */}
      {selectedSession ? (
        <div className="space-y-6 pt-2">
          {/* Active Session Card */}
          <div className="rounded-2xl border border-cyan-500/30 bg-slate-950/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <CheckCircle2 size={16} />
                  <span>Session Slot: {formatThaiDateWithWeekday(selectedSession.sessionDate)} · {formatThaiTime(selectedSession.startTime)}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-slate-400">
                  Squad: {selectedSession.squadLabel} · Type: {selectedSession.sessionType}
                </div>
              </div>

              <div className="text-right text-xs text-slate-400">
                Created by: <span className="font-mono text-slate-300">{selectedSession.createdBy}</span>
              </div>
            </div>

            {/* Attendance Status Summary Counters */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Total Active
                </span>
                <p className="mt-1 text-xl font-black text-white">{metrics.total}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Present
                </span>
                <p className="mt-1 text-xl font-black text-emerald-300">{metrics.present}</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Late
                </span>
                <p className="mt-1 text-xl font-black text-amber-300">{metrics.late}</p>
              </div>
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  Absent
                </span>
                <p className="mt-1 text-xl font-black text-rose-300">{metrics.absent}</p>
              </div>
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  Excused
                </span>
                <p className="mt-1 text-xl font-black text-sky-300">{metrics.excused}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Unmarked
                </span>
                <p className="mt-1 text-xl font-black text-slate-400">{metrics.unrecorded}</p>
              </div>
            </div>
          </div>

          {/* Roster Players Attendance Sheet */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                First Team Canonical Roster ({activeFirstTeamPlayers.length} Active Players)
              </h4>
              {loadingRecords && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <RefreshCw size={12} className="animate-spin" />
                  Loading records…
                </span>
              )}
            </div>

            {recordsError && (
              <div className="rounded-xl border border-rose-900/50 bg-rose-950/30 p-4 text-xs text-rose-300">
                {recordsError}
              </div>
            )}

            {loadingRoster ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-8 text-center text-sm text-slate-400">
                Loading canonical First Team roster…
              </div>
            ) : rosterError ? (
              <div className="rounded-2xl border border-rose-900/50 bg-rose-950/30 p-6 text-center text-sm text-rose-300">
                {rosterError}
              </div>
            ) : activeFirstTeamPlayers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-8 text-center">
                <Users className="mx-auto text-slate-600" size={28} />
                <h5 className="mt-2 font-bold text-white">No active First Team players found</h5>
                <p className="mt-1 text-xs text-slate-400">
                  Attendance requires active canonical First Team squad players. No Academy or global player fallback is permitted.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {activeFirstTeamPlayers.map((player) => {
                  const record = records[player.playerKey];
                  const currentStatus = record?.status;
                  const isSaving = savingPlayerKey === player.playerKey;
                  const playerError = playerErrors[player.playerKey];

                  return (
                    <article
                      key={player.playerKey}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition md:flex-row md:items-center"
                    >
                      {/* Player Info */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-base font-black text-cyan-200">
                          {player.jerseyNumber}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-white">
                              {player.firstName} {player.lastName}
                            </span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                              {player.position}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs">
                            <span className="font-mono text-[11px] text-slate-500">
                              {player.playerKey}
                            </span>
                            {record && (
                              <span className="text-[11px] text-emerald-400/80">
                                · Saved
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Controls / Status Badge */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {canMutate ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {PRO_CLUB_ATTENDANCE_STATUSES.map((status) => {
                              const isActive = currentStatus === status;
                              const style = STATUS_STYLE[status];
                              return (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() =>
                                    handleSetStatus(player.playerKey, status)
                                  }
                                  disabled={isSaving}
                                  className={`rounded-xl border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    isActive
                                      ? style.activeBtn
                                      : style.inactiveBtn
                                  }`}
                                >
                                  {status}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {currentStatus ? (
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-black tracking-wider ${
                                  STATUS_STYLE[currentStatus].badge
                                }`}
                              >
                                {currentStatus}
                              </span>
                            ) : (
                              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400">
                                Unmarked
                              </span>
                            )}
                          </div>
                        )}

                        {/* Player-level saving or error indicator */}
                        {isSaving && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-cyan-300">
                            <RefreshCw size={11} className="animate-spin" />
                            Updating…
                          </span>
                        )}
                        {playerError && (
                          <span className="text-[11px] text-rose-400">
                            {playerError}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Non-active roster players with historical records (if any) */}
            {nonActivePlayersWithRecords.length > 0 && (
              <div className="mt-6 space-y-3 border-t border-slate-800 pt-5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Historical Records for Released / Inactive Players ({nonActivePlayersWithRecords.length})
                </h5>
                <div className="grid gap-2">
                  {nonActivePlayersWithRecords.map((record) => (
                    <div
                      key={record.playerKey}
                      className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-xs"
                    >
                      <div className="font-mono text-slate-400">
                        {record.playerKey}
                      </div>
                      <div className="flex items-center gap-2">
                        {canMutate ? (
                          <div className="flex gap-1">
                            {PRO_CLUB_ATTENDANCE_STATUSES.map((status) => (
                              <button
                                key={status}
                                type="button"
                                onClick={() =>
                                  handleSetStatus(record.playerKey, status)
                                }
                                disabled={savingPlayerKey === record.playerKey}
                                className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                                  record.status === status
                                    ? STATUS_STYLE[status].activeBtn
                                    : STATUS_STYLE[status].inactiveBtn
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${
                              STATUS_STYLE[record.status].badge
                            }`}
                          >
                            {record.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-10 text-center text-sm text-slate-400">
          Select an existing session from the history list, or enter a date and start time to open or create an attendance session slot.
        </div>
      )}
    </section>
  );
}
