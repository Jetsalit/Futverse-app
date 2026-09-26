import { useState, memo, useCallback, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  User,
  ShieldAlert,
  Activity,
  ChevronLeft,
  ClipboardList,
  Users,
} from "lucide-react";
import { auth, db } from "../lib/firebase";
import {
  calculateAgeFromDateOnly,
  calendarDateInTimeZone,
} from "../lib/dateTimeFoundation";
import {
  formatThaiDateLong,
  formatThaiDateShort,
} from "../lib/thaiDateTimePresentation";
import { collection, onSnapshot, doc, deleteField, addDoc, updateDoc } from "firebase/firestore";
import { EmptyState } from "./common/EmptyState";
import { FutVerseThaiDateInput } from "./common/FutVerseThaiDateTimeInputs";
import FitnessTestCatalogue from "./fitness/FitnessTestCatalogue";
import { useAcademy } from "../contexts/AcademyContext";
import { useAuth } from "../contexts/AuthContext";
import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../lib/fitnessTestFoundation";
import {
  prepareAcademyFitnessResultDrafts,
  type AcademyFitnessResultHistoryEntry,
} from "../lib/academyFitnessResult";
import {
  createAcademyFitnessResultEntries,
  watchAcademyFitnessResultHistory,
  watchAcademyFitnessResultsForDate,
} from "../lib/firestore/academyFitnessResultRepository";
import { mapCanonicalSnapshot } from "../lib/firestore/canonicalDocument";
import {
  PLAYER_POSITION_CODES,
  POSITION_ADDITIONAL_STORAGE_FIELD,
  inspectStoredPosition,
  isPlayerPositionCode,
  validatePositionSelection,
} from "../lib/playerPositionSelection";
import { Plus, Edit2, Trash2, X, Upload, ChevronDown, Filter } from "lucide-react";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  ageGroup: string;
  dob: string;
  age: number;
  fitness_status: string;
  avatar: string;
  hideFromFitness?: boolean;
}

const FITNESS_DISPLAY_SCALE: Record<string, number> = {
  yoyo_level: 20,
  speed_10m: 3,
  speed_30m: 6,
  vertical_jump: 80,
  agility_505: 8,
};

const METRICS_CONFIG = FOOTBALL_FITNESS_TEST_CATALOGUE
  .filter((definition) => definition.key in FITNESS_DISPLAY_SCALE)
  .map((definition) => ({
    key: definition.key,
    label: definition.name,
    unit: definition.unit,
    max: FITNESS_DISPLAY_SCALE[definition.key],
    invert: definition.direction === "LOWER_IS_BETTER",
  }));

// --- FitnessTestingGrid Implementation ---

// 2. จัดการ State ของตารางระดับ Row (เพื่อประสิทธิภาพที่ดี ไม่ให้เกิดการ re-render ทั้ง 30 แถวเมื่อพิมพ์ทีละช่อง)
const PlayerTestRow = memo(
  ({
    player,
    rowData,
    savedRow,
    canEnterResults,
    onChange,
    onEdit,
    onDelete,
  }: {
    player: Player;
    rowData?: Record<string, string>;
    savedRow?: Record<string, number>;
    canEnterResults: boolean;
    onChange: (id: string, field: string, value: string) => void;
    onEdit: (player: Player) => void;
    onDelete: (player: Player) => void;
  }) => {
    const handleInputChange = (field: string, value: string) => {
      onChange(player.id, field, value);
    };

    return (
      <tr className="hover:bg-slate-50 border-b border-slate-100 transition-colors group">
        <td className="px-6 py-3 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[1px_0_0_#e2e8f0]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors shrink-0 overflow-hidden border border-slate-200">
              {player.avatar ? (
                <img
                  src={player.avatar}
                  alt={player.firstName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={14} />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate">
                {player.firstName} {player.lastName}
              </div>
              <div className="text-[10px] text-slate-500 flex gap-1.5 mt-0.5">
                <span className="font-bold text-slate-400">
                  {player.position}
                </span>
                <span>•</span>
                <span>{player.ageGroup}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2 mt-3 pl-11">
             <button type="button" onClick={() => onEdit(player)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded">
               <Edit2 size={12} /> Edit
             </button>
             <button type="button" onClick={() => onDelete(player)} className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1 bg-rose-50 px-2 py-1 rounded">
               <Trash2 size={12} /> Delete
             </button>
          </div>
        </td>
        {METRICS_CONFIG.map((m) => {
          const isSaved = Object.hasOwn(savedRow ?? {}, m.key);
          return (
            <td key={m.key} className="px-4 py-3 text-center">
              <input
                aria-label={`${m.label} for ${player.firstName} ${player.lastName}`}
                type="number"
                step="any"
                placeholder="0.0"
                value={isSaved ? String(savedRow?.[m.key]) : (rowData?.[m.key] ?? "")}
                disabled={isSaved || !canEnterResults}
                title={isSaved ? "Recorded result cannot be changed" : undefined}
                onChange={(e) => handleInputChange(m.key, e.target.value)}
                className="mx-auto block w-20 rounded border border-slate-200 bg-white px-2 py-1.5 text-center font-mono text-sm transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </td>
          );
        })}
      </tr>
    );
  },
);

export function FitnessTestingGrid({
  players,
  testData,
  setTestData,
  savedData,
  observedOn,
  onObservedOnChange,
  canRecordResults,
  resultsLoading,
  saving,
  pendingCount,
  onSaveResults,
  entryMessage,
  onEditPlayer,
  onDeletePlayer,
  filterAge,
  setFilterAge,
  squads,
  onAddPlayer,
}: {
  players: Player[];
  testData: Record<string, Record<string, string>>;
  setTestData: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  savedData: Record<string, Record<string, number>>;
  observedOn: string;
  onObservedOnChange: (date: string) => void;
  canRecordResults: boolean;
  resultsLoading: boolean;
  saving: boolean;
  pendingCount: number;
  onSaveResults: () => void;
  entryMessage: string | null;
  onEditPlayer: (player: Player) => void;
  onDeletePlayer: (player: Player) => void;
  filterAge: string;
  setFilterAge: (val: string) => void;
  squads: string[];
  onAddPlayer: () => void;
}) {
  // ควบคุมการอัปเดตข้อมูลรายบุคคลและคำนวณอัตโนมัติ
  const handleRowChange = useCallback(
    (playerId: string, field: string, value: string) => {
      setTestData((prev) => {
        const updatedPlayerStats = {
          ...(prev[playerId] || {}),
          [field]: value,
        };

        return {
          ...prev,
          [playerId]: updatedPlayerStats,
        };
      });
    },
    [setTestData],
  );

  const canEnterResults = canRecordResults && !resultsLoading && !saving;
  return (
    <>
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
            ⚡
          </div>
          <div>
            <h2 className="font-bold text-sm sm:text-base">
              Squad Fitness Testing Bulk Entry
            </h2>
            <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
              Enter observed results for the selected testing date
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto shrink-0">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={filterAge}
              onChange={(e) => setFilterAge(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-sm font-bold text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
            >
              <option value="All">All Squads</option>
              {squads.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
          
          <button type="button" onClick={onAddPlayer} className="px-3 py-2 flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-sm font-bold transition shadow-sm">
            <Plus size={16} /> Add Player
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <label className="text-xs font-bold text-slate-600">
            Testing date
            <FutVerseThaiDateInput
              value={observedOn}
              disabled={saving}
              onChange={onObservedOnChange}
              className="ml-2 rounded-lg border-slate-200 px-3 py-2 text-sm"
              aria-label="Testing date"
            />
          </label>
          <button
            type="button"
            onClick={onSaveResults}
            disabled={!canEnterResults || pendingCount === 0}
            className="px-4 py-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {saving ? "Saving…" : `Save ${pendingCount} result${pendingCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {(entryMessage || resultsLoading) && (
        <p role="status" className="px-6 py-2 text-sm text-slate-600">
          {resultsLoading ? "Loading recorded results…" : entryMessage}
        </p>
      )}

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              <th className="px-6 py-3 border-b sticky left-0 bg-slate-50 z-10 w-72 shadow-[1px_0_0_#e2e8f0]">
                Player Info & Actions
              </th>
              {METRICS_CONFIG.map((m) => (
                <th
                  key={m.key}
                  className="px-4 py-3 border-b text-center align-bottom min-w-[120px]"
                >
                  {m.label}{" "}
                  <span className="font-normal text-slate-400 block mt-0.5">
                    ({m.unit})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            {players.map((player) => (
              <PlayerTestRow
                key={player.id}
                player={player}
                rowData={testData[player.id]}
                savedRow={savedData[player.id]}
                canEnterResults={canEnterResults}
                onChange={handleRowChange}
                onEdit={onEditPlayer}
                onDelete={onDeletePlayer}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FitnessResultHistory({
  history,
  loading,
  error,
}: {
  history: readonly AcademyFitnessResultHistoryEntry[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return <p role="status" className="text-sm text-slate-500">Loading persisted observations…</p>;
  }
  if (error) {
    return <p role="alert" className="text-sm text-rose-700">{error}</p>;
  }
  if (history.length === 0) {
    return <p className="text-sm text-slate-500">No persisted observations for this player yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <th scope="col" className="px-3 py-2">Observed on</th>
            <th scope="col" className="px-3 py-2">Test</th>
            <th scope="col" className="px-3 py-2 text-right">Recorded observation</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => (
            <tr key={entry.id} className="border-b border-slate-50 text-slate-700">
              <td className="px-3 py-2 text-xs">
                <time dateTime={entry.observedOn}>{formatThaiDateShort(entry.observedOn)}</time>
              </td>
              <td className="px-3 py-2">{entry.definitionName}</td>
              <td className="px-3 py-2 text-right font-mono">{entry.value} {entry.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FitnessTesting({
  onBack,
  teamName,
  canManageCatalogue = false,
  canRecordResults = false,
}: {
  onBack: () => void;
  teamName?: string;
  canManageCatalogue?: boolean;
  canRecordResults?: boolean;
}) {
  const { settings, academyId } = useAcademy();
  const { actualUser } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"entry" | "report">("entry");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [filterAge, setFilterAge] = useState("All");

  // CRUD state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [storedPositionBeforeEdit, setStoredPositionBeforeEdit] =
    useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    fitness_status: "",
    position: "",
    ageGroup: settings.squads[0] || "",
    avatarUrl: "",
  });

  useEffect(() => {
    if (!academyId) {
      setPlayers([]);
      setReadError("Authoritative Academy access is unavailable.");
      setLoading(false);
      return;
    }

    setPlayers([]);
    setReadError(null);
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, "academies", academyId, "players"),
      (snapshot) => {
        const playersData = snapshot.docs.map((doc) =>
          mapCanonicalSnapshot<Player>(doc)
        );
        setPlayers(playersData);
        setReadError(null);
        if (playersData.length > 0) {
          setSelectedPlayerId(prev => prev ? prev : playersData[0].id);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching players:", error);
        setPlayers([]);
        setSelectedPlayerId("");
        setReadError("Player records could not be loaded.");
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [academyId]);

  const calculateAge = (dob: string): number | null => {
    const today =
      calendarDateInTimeZone(new Date(), "Asia/Bangkok") ?? "";
    return calculateAgeFromDateOnly(dob, today);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const openAddModal = () => {
    setEditingPlayerId(null);
    setStoredPositionBeforeEdit(null);
    setFormData({
      firstName: "",
      lastName: "",
      dob: "",
      fitness_status: "",
      position: "",
      ageGroup: settings?.squads?.[0] || "",
      avatarUrl: "",
    });
    setIsModalOpen(true);
  };

  const handleEditClick = (player: Player) => {
    const positionReview =
      inspectStoredPosition(player.position);

    setFormData({
      firstName: player.firstName,
      lastName: player.lastName,
      dob: player.dob,
      fitness_status: player.fitness_status || "",
      position: isPlayerPositionCode(player.position)
        ? player.position
        : "",
      ageGroup: player.ageGroup,
      avatarUrl: player.avatar || "",
    });

    setStoredPositionBeforeEdit(
      positionReview.requiresConfirmation
        ? positionReview.originalText
        : null,
    );

    setEditingPlayerId(player.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPlayerId(null);
    setStoredPositionBeforeEdit(null);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!academyId) {
      console.error("FitnessTesting: Missing academyId; refusing to save player.");
      alert("Missing academy context. Please try again once the academy is available.");
      return;
    }

    try {
      const derivedAge = calculateAge(formData.dob);

      if (derivedAge === null) {
        console.error(
          "FitnessTesting: invalid date of birth; refusing to save player.",
        );
        alert("Invalid date of birth. Please enter a valid birth date.");
        return;
      }

      const preservingStoredPosition =
        editingPlayerId !== null &&
        storedPositionBeforeEdit !== null &&
        formData.position === "";

      const positionValidation =
        validatePositionSelection({
          primary: formData.position,
          additional: [],
        });

      if (
        !preservingStoredPosition &&
        !positionValidation.valid
      ) {
        console.error(
          "FitnessTesting: invalid canonical position; refusing to save player.",
          positionValidation.errors,
        );
        alert(
          "Please select a valid canonical player position before saving.",
        );
        return;
      }

      const playerData: any = {
        ...formData,
        age: derivedAge,
        avatar: formData.avatarUrl,
      };
      delete playerData.avatarUrl;

      if (preservingStoredPosition) {
        delete playerData.position;
      }

      if (!editingPlayerId) {
        playerData[
          POSITION_ADDITIONAL_STORAGE_FIELD
        ] = [];
      }

      if (editingPlayerId) {
        await updateDoc(doc(db, "academies", academyId, "players", editingPlayerId), {
          ...playerData,
          id: deleteField(),
        });
      } else {
        await addDoc(collection(db, "academies", academyId, "players"), playerData);
      }
      closeModal();
    } catch (error: any) {
      console.error("Error saving player:", error);
      alert("Error saving: " + error.message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!playerToDelete) {
      return;
    }

    if (!academyId) {
      console.error("FitnessTesting: Missing academyId; refusing to hide player.");
      alert("Missing academy context. Please try again once the academy is available.");
      return;
    }

    try {
      await updateDoc(doc(db, "academies", academyId, "players", playerToDelete), {
        hideFromFitness: true,
        id: deleteField(),
      });
      setPlayerToDelete(null);
    } catch (error: any) {
      console.error("Error deleting player:", error);
      alert("Error deleting: " + error.message);
    }
  };

  const filteredPlayers = players.filter((p) => !p.hideFromFitness && (filterAge === "All" || p.ageGroup === filterAge));

  const storedPositionReviewRequired =
    editingPlayerId !== null &&
    storedPositionBeforeEdit !== null;

  const [observedOn, setObservedOn] = useState(
    () => calendarDateInTimeZone(new Date(), "Asia/Bangkok") ?? "",
  );
  const resultScope = academyId ? JSON.stringify([academyId, observedOn]) : "";
  const [draftsByScope, setDraftsByScope] = useState<
    Record<string, Record<string, Record<string, string>>>
  >({});
  const testData = draftsByScope[resultScope] ?? {};
  const setTestData = useCallback<React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>>(
    (update) => {
      setDraftsByScope((current) => {
        const previous = current[resultScope] ?? {};
        const next = typeof update === "function" ? update(previous) : update;
        return { ...current, [resultScope]: next };
      });
    },
    [resultScope],
  );
  const [resultsState, setResultsState] = useState<{
    scope: string;
    status: "LOADING" | "READY" | "ERROR";
    values: Record<string, Record<string, number>>;
    error: string | null;
  }>({ scope: "", status: "LOADING", values: {}, error: null });
  const historyScope = academyId && selectedPlayerId
    ? JSON.stringify([academyId, selectedPlayerId])
    : "";
  const [historyState, setHistoryState] = useState<{
    scope: string;
    status: "LOADING" | "READY" | "ERROR";
    values: AcademyFitnessResultHistoryEntry[];
    error: string | null;
  }>({ scope: "", status: "READY", values: [], error: null });
  const historyReady = historyScope !== "" && historyState.scope === historyScope && historyState.status === "READY";
  const playerHistory = historyReady ? historyState.values : [];
  const historyLoading = historyScope !== "" && (
    historyState.scope !== historyScope || historyState.status === "LOADING"
  );
  const historyError = historyState.scope === historyScope && historyState.status === "ERROR"
    ? historyState.error
    : null;
  const [savingResults, setSavingResults] = useState(false);
  const [entryMessage, setEntryMessage] = useState<string | null>(null);
  const resultsReady = resultsState.scope === resultScope && resultsState.status === "READY";
  const savedData = resultsReady ? resultsState.values : {};
  const resultsLoading = resultsState.scope !== resultScope || resultsState.status === "LOADING";
  const activePlayerIds = new Set(players.filter((player) => !player.hideFromFitness).map((player) => player.id));
  const pendingCount = Object.entries(testData).reduce(
    (count, [playerId, cells]) => count + (activePlayerIds.has(playerId) ? Object.entries(cells)
      .filter(([key, value]) => value.trim() !== "" && !Object.hasOwn(savedData[playerId] ?? {}, key))
      .length : 0),
    0,
  );

  useEffect(() => {
    if (!academyId || !observedOn) return;
    const scope = JSON.stringify([academyId, observedOn]);
    setResultsState({ scope, status: "LOADING", values: {}, error: null });
    let active = true;
    const unsubscribe = watchAcademyFitnessResultsForDate({
      firestore: db,
      academyId,
      observedOn,
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
      onResults: (values) => {
        if (!active) return;
        setResultsState({
          scope,
          status: "READY",
          values,
          error: null,
        });
        setDraftsByScope((current) => {
          const scoped = current[scope];
          if (!scoped) return current;
          let changed = false;
          const next = Object.fromEntries(Object.entries(scoped).map(([playerId, cells]) => {
            const remaining = Object.fromEntries(Object.entries(cells).filter(([key]) => {
              const isSaved = Object.hasOwn(values[playerId] ?? {}, key);
              if (isSaved) changed = true;
              return !isSaved;
            }));
            return [playerId, remaining];
          }));
          return changed ? { ...current, [scope]: next } : current;
        });
      },
      onError: (error) => {
        if (!active) return;
        console.error("Error fetching Fitness results:", error);
        setResultsState({
          scope,
          status: "ERROR",
          values: {},
          error: "Recorded results could not be loaded. Check your Academy access and try again.",
        });
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [academyId, observedOn]);

  useEffect(() => {
    if (!academyId || !selectedPlayerId) {
      setHistoryState({ scope: "", status: "READY", values: [], error: null });
      return;
    }

    const scope = JSON.stringify([academyId, selectedPlayerId]);
    setHistoryState({ scope, status: "LOADING", values: [], error: null });
    let active = true;
    const unsubscribe = watchAcademyFitnessResultHistory({
      firestore: db,
      academyId,
      playerId: selectedPlayerId,
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
      onResults: (values) => {
        if (!active) return;
        setHistoryState({ scope, status: "READY", values, error: null });
      },
      onError: (error) => {
        if (!active) return;
        console.error("Error fetching Fitness result history:", error);
        setHistoryState({
          scope,
          status: "ERROR",
          values: [],
          error: "Saved observations could not be loaded. Check your Academy access and try again.",
        });
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [academyId, selectedPlayerId]);

  const handleSaveResults = async () => {
    const actorUid = auth.currentUser?.uid;
    if (!academyId || !actorUid || actorUid !== actualUser?.uid || !canRecordResults || !resultsReady) {
      setEntryMessage("Academy access or recorded results are unavailable.");
      return;
    }
    const prepared = prepareAcademyFitnessResultDrafts({
      observedOn,
      playerIds: [...activePlayerIds],
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
      drafts: Object.fromEntries(Object.entries(testData).filter(([playerId]) => activePlayerIds.has(playerId))),
      saved: savedData,
    });
    if (prepared.ok === false) {
      setEntryMessage(prepared.errors.join(" "));
      return;
    }
    if (prepared.entries.length === 0) {
      setEntryMessage("Enter at least one observed result before saving.");
      return;
    }

    setSavingResults(true);
    setEntryMessage(null);
    let committedCount = 0;
    try {
      await createAcademyFitnessResultEntries({
        firestore: db,
        academyId,
        actorUid,
        entries: prepared.entries,
        onCommitted: (committed) => {
          committedCount += committed.length;
          setDraftsByScope((current) => {
            const next = { ...(current[resultScope] ?? {}) };
            for (const entry of committed) {
              const cells = { ...(next[entry.playerId] ?? {}) };
              delete cells[entry.definitionKey];
              next[entry.playerId] = cells;
            }
            return { ...current, [resultScope]: next };
          });
          setResultsState((current) => {
            if (current.scope !== resultScope || current.status !== "READY") return current;
            const values = { ...current.values };
            for (const entry of committed) {
              values[entry.playerId] = {
                ...(values[entry.playerId] ?? {}),
                [entry.definitionKey]: entry.input.value,
              };
            }
            return { ...current, values };
          });
        },
      });
      setEntryMessage(`${committedCount} result${committedCount === 1 ? "" : "s"} saved.`);
    } catch (error) {
      console.error("Error saving Fitness results:", error);
      setEntryMessage(committedCount > 0
        ? `${committedCount} results saved. Remaining entries are still in the grid; check Academy access and retry.`
        : "Results could not be saved. Check Academy access and player records, then retry.");
    } finally {
      setSavingResults(false);
    }
  };

  const getRadarData = (playerId: string) => {
    const latestByDefinition = new Map<string, AcademyFitnessResultHistoryEntry>();
    if (historyReady && playerId === selectedPlayerId) {
      for (const entry of playerHistory) {
        if (!latestByDefinition.has(entry.definitionKey)) {
          latestByDefinition.set(entry.definitionKey, entry);
        }
      }
    }
    return METRICS_CONFIG.flatMap((m) => {
      const latest = latestByDefinition.get(m.key);
      const val = latest?.value;
      if (!Number.isFinite(val)) return [];

      // Preserve the established chart display scale only for recorded values.
      let normalized = 0;
      if (m.invert) {
        normalized = Math.max(0, 100 - (val / m.max) * 50);
      } else {
        normalized = Math.min(100, (val / m.max) * 100);
      }

      return [{
        subject: m.label,
        A: Math.round(normalized),
        fullMark: 100,
        actualValue: val,
        unit: m.unit,
        observedOn: latest?.observedOn,
      }];
    });
  };
  const selectedRadarData = getRadarData(selectedPlayerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-200 bg-white shadow-sm text-slate-600 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
              Fitness & Training
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              Assessment Engine
            </p>
          </div>
        </div>
        <div className="space-y-6">
          {academyId && (
            <FitnessTestCatalogue
              organization={{ organizationType: "ACADEMY", organizationId: academyId }}
              canManage={canManageCatalogue}
            />
          )}
          <EmptyState
            icon={Users}
            title={readError ? "Players Unavailable" : "No Players Available"}
            description={readError || "You need to add players to the academy before you can test their fitness."}
            primaryActionLabel="Go Back"
            onPrimaryAction={onBack}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col animate-in fade-in duration-300 relative">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-slate-200 bg-white shadow-sm text-slate-600 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight">
            Fitness & Training
          </h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Assessment Engine
          </p>
        </div>
      </div>

      {academyId && (
        <div className="mb-6">
          <FitnessTestCatalogue
            organization={{ organizationType: "ACADEMY", organizationId: academyId }}
            canManage={canManageCatalogue}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 space-x-8">
        <button
          onClick={() => setActiveTab("entry")}
          className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === "entry"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <ClipboardList size={18} />
          Squad Entry Grid
          {activeTab === "entry" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("report")}
          className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
            activeTab === "report"
              ? "text-emerald-600"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Activity size={18} />
          Player Reports Overview
          {activeTab === "report" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />
          )}
        </button>
      </div>

      {activeTab === "entry" && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col animate-in fade-in duration-300">
          <FitnessTestingGrid
            players={filteredPlayers}
            testData={testData}
            setTestData={setTestData}
            savedData={savedData}
            observedOn={observedOn}
            onObservedOnChange={(date) => {
              setObservedOn(date);
              setEntryMessage(null);
            }}
            canRecordResults={canRecordResults && resultsReady}
            resultsLoading={resultsLoading}
            saving={savingResults}
            pendingCount={pendingCount}
            onSaveResults={handleSaveResults}
            entryMessage={entryMessage ?? (resultsState.scope === resultScope ? resultsState.error : null)}
            onEditPlayer={handleEditClick}
            onDeletePlayer={(p) => setPlayerToDelete(p.id)}
            filterAge={filterAge}
            setFilterAge={setFilterAge}
            squads={settings.squads}
            onAddPlayer={openAddModal}
          />
        </section>
      )}

      {activeTab === "report" && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
          <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sticky top-6 h-fit">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 px-2">
              Squad Roster
            </h3>
            <div className="space-y-1.5">
              {players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayerId(player.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between border ${
                    selectedPlayerId === player.id
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm"
                      : "border-transparent hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="font-medium text-sm">
                    {player.firstName} {player.lastName}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded ${selectedPlayerId === player.id ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}
                  >
                    {player.position}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <div className="flex gap-3">
                <ShieldAlert className="text-amber-500 shrink-0" size={20} />
                <span className="font-semibold text-amber-800 text-sm">
                  Injury-risk analysis is unavailable because no authoritative load-history backend is configured.
                </span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-6 border-b border-slate-100 pb-3">
                Latest Recorded Fitness Observations
              </h3>
              <p className="mb-2 text-xs text-slate-400">
                The chart uses the most recent stored value for each test; each tooltip shows its observation date.
              </p>
              {!selectedPlayerId ? (
                <p className="flex h-[300px] items-center justify-center text-sm text-slate-500">
                  Select a player to view recorded observations.
                </p>
              ) : historyLoading ? (
                <p role="status" className="flex h-[300px] items-center justify-center text-sm text-slate-500">
                  Loading persisted observations…
                </p>
              ) : historyError ? (
                <p role="alert" className="flex h-[300px] items-center justify-center text-sm text-rose-700">
                  {historyError}
                </p>
              ) : selectedRadarData.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
                  <div>
                    <Activity className="mx-auto text-slate-300" size={28} />
                    <p className="mt-3 font-bold text-slate-600">No recorded fitness results for this player</p>
                    <p className="mt-1 text-sm text-slate-400">Enter an observed test result to populate this report.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      cx="50%"
                      cy="50%"
                      outerRadius="75%"
                      data={selectedRadarData}
                    >
                    <PolarGrid stroke="#e2e8f0" strokeWidth={1.5} />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{
                        fill: "#64748b",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      name="Latest recorded result"
                      dataKey="A"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="#10b981"
                      fillOpacity={0.3}
                      dot={{
                        r: 4,
                        fill: "#10b981",
                        strokeWidth: 2,
                        stroke: "#fff",
                      }}
                      activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
                    />
                    <Tooltip
                      formatter={(value: any, name: any, props: any) => [
                        `${props?.payload?.actualValue ?? value} ${props?.payload?.unit ?? ""} · ${formatThaiDateLong(props?.payload?.observedOn)}`.trim(),
                        "Latest recorded result",
                      ]}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "1px solid #e2e8f0",
                        boxShadow:
                          "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                        padding: "12px",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-6 border-b border-slate-100 pb-3">
                Fitness Progression Timeline
              </h3>
              {!selectedPlayerId ? (
                <p className="text-sm text-slate-500">Select a player to view persisted observations.</p>
              ) : (
                <FitnessResultHistory
                  history={playerHistory}
                  loading={historyLoading}
                  error={historyError}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-0">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingPlayerId ? "Edit Player" : "Add New Player"}
              </h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSavePlayer} className="p-6 overflow-y-auto">
              <div className="flex flex-col items-center justify-center mb-6">
                <label className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 hover:border-slate-400 transition-colors group relative overflow-hidden">
                  {formData.avatarUrl ? (
                    <img src={formData.avatarUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Upload size={24} className="mb-1 group-hover:-translate-y-1 transition-transform" />
                      <span className="text-[10px] font-medium uppercase tracking-wider">Photo</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">First Name</label>
                    <input required name="firstName" value={formData.firstName} onChange={handleInputChange} type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Last Name</label>
                    <input required name="lastName" value={formData.lastName} onChange={handleInputChange} type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Date of Birth</label>
                  <FutVerseThaiDateInput
                    required
                    name="dob"
                    value={formData.dob}
                    onChange={(dob) => setFormData((current) => ({ ...current, dob }))}
                    className="w-full bg-slate-50 border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    aria-label="Date of Birth"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fitness Status</label>
                    <div className="relative">
                      <select required name="fitness_status" value={formData.fitness_status} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        <option value="" disabled>Select fitness status</option>
                        <option value="Fit">Fit</option>
                        <option value="Injured">Injured</option>
                        <option value="Returning">Returning</option>
                      </select>
                      <ChevronDown className="absolute right-3 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" size={18} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Position</label>
                    <div className="relative">
                      <select required={!storedPositionReviewRequired} name="position" value={formData.position} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        <option value="" disabled={!storedPositionReviewRequired}>
                          {storedPositionReviewRequired
                            ? "Keep stored position unchanged"
                            : "Select position"}
                        </option>
                        {PLAYER_POSITION_CODES.map((position) => (
                          <option key={position} value={position}>
                            {position}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" size={18} />
                    </div>
                    {storedPositionReviewRequired && (
                      <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
                        Stored position under review:{" "}
                        <span className="font-bold">
                          {storedPositionBeforeEdit || "[empty]"}
                        </span>
                        . Leave unselected to preserve the stored value,
                        or choose a canonical position to update it.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Age Group</label>
                    <div className="relative">
                      <select required name="ageGroup" value={formData.ageGroup} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        <option value="" disabled>Select a configured squad</option>
                        {settings.squads.map((squad: string) => (
                          <option key={squad} value={squad}>{squad}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" size={18} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-8 flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">{editingPlayerId ? "Save Changes" : "Save Player"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {playerToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPlayerToDelete(null)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm shadow-xl p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirm Delete</h3>
            <p className="text-slate-500 text-sm mb-6">Are you sure you want to delete this player? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPlayerToDelete(null)} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
              <button type="button" onClick={handleDeleteConfirm} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
