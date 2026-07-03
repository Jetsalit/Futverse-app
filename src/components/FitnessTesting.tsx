import { useState, memo, useCallback, useEffect } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Save,
  User,
  ShieldAlert,
  Activity,
  ChevronLeft,
  ClipboardList,
  Database,
  Check,
  Users,
} from "lucide-react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, addDoc, updateDoc } from "firebase/firestore";
import { EmptyState } from "./common/EmptyState";
import { useAcademy } from "../contexts/AcademyContext";
import { Plus, Edit2, Trash2, X, Upload, Calendar, ChevronDown, Filter } from "lucide-react";

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
}

const METRICS_CONFIG = [
  { key: "yoyo_level", label: "Yo-Yo Test", unit: "Level", max: 20 },
  {
    key: "calculated_vo2max",
    label: "VO2 Max (Auto)",
    unit: "ml/kg/min",
    max: 80,
    readonly: true,
  },
  { key: "speed_10m", label: "10m Sprint", unit: "Sec", max: 3, invert: true },
  { key: "speed_30m", label: "30m Sprint", unit: "Sec", max: 6, invert: true },
  { key: "vertical_jump", label: "Vertical Jump", unit: "cm", max: 80 },
];

// --- FitnessTestingGrid Implementation ---

// 1. ฟังก์ชันคำนวณอัตโนมัติ (Real-time Calculation)
const calculateVO2Max = (yoyoLevel: string) => {
  if (!yoyoLevel) return "";
  const level = parseFloat(yoyoLevel);
  if (isNaN(level)) return "";
  // จำลองสูตรคำนวณ (เช่น ถ้าระดับ 16.1 -> 44.4)
  // ตัวอย่างใช้สูตรสมมุติเพื่อให้ใกล้เคียงกับเงื่อนไข
  return (level * 2.758).toFixed(1);
};

// 2. จัดการ State ของตารางระดับ Row (เพื่อประสิทธิภาพที่ดี ไม่ให้เกิดการ re-render ทั้ง 30 แถวเมื่อพิมพ์ทีละช่อง)
const PlayerTestRow = memo(
  ({
    player,
    rowData,
    onChange,
    onEdit,
    onDelete,
  }: {
    player: Player;
    rowData: any;
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
        {METRICS_CONFIG.map((m) => (
          <td key={m.key} className="px-4 py-3 text-center">
            <input
              type="number"
              step="any"
              readOnly={m.readonly}
              placeholder={m.readonly ? "-" : "0.0"}
              value={rowData?.[m.key] || ""}
              onChange={(e) => handleInputChange(m.key, e.target.value)}
              className={`w-20 border rounded px-2 py-1.5 text-sm text-center mx-auto block font-mono transition-all ${
                m.readonly
                  ? "bg-emerald-50 border-emerald-100 text-emerald-700 font-bold focus:outline-none cursor-default shadow-inner"
                  : "bg-white border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              }`}
            />
          </td>
        ))}
      </tr>
    );
  },
);

function FitnessTestingGrid({
  players,
  isOnline,
  onOfflineSave,
  saveStatus,
  setSaveStatus,
  testData,
  setTestData,
  onEditPlayer,
  onDeletePlayer,
  filterAge,
  setFilterAge,
  squads,
  onAddPlayer,
}: {
  players: Player[];
  isOnline: boolean;
  onOfflineSave?: () => void;
  saveStatus: "success" | "offline_queued" | null;
  setSaveStatus: React.Dispatch<React.SetStateAction<"success" | "offline_queued" | null>>;
  testData: Record<string, any>;
  setTestData: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  onEditPlayer: (player: Player) => void;
  onDeletePlayer: (player: Player) => void;
  filterAge: string;
  setFilterAge: (val: string) => void;
  squads: string[];
  onAddPlayer: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  // ควบคุมการอัปเดตข้อมูลรายบุคคลและคำนวณอัตโนมัติ
  const handleRowChange = useCallback(
    (playerId: string, field: string, value: string) => {
      setTestData((prev) => {
        const updatedPlayerStats = {
          ...(prev[playerId] || {}),
          [field]: value,
        };

        // เมื่อกรอก Yo-Yo Test Level ให้คำนวณ VO2 Max ใส่ช่องแบบ Read-only ทันที
        if (field === "yoyo_level") {
          updatedPlayerStats["calculated_vo2max"] = calculateVO2Max(value);
        }

        return {
          ...prev,
          [playerId]: updatedPlayerStats,
        };
      });
      setSaveStatus(null);
    },
    [setTestData, setSaveStatus],
  );

  // 3. ระบบจัดเก็บข้อมูลแยกรายบุคคล (Upsert Logic)
  const handleSaveAllResults = () => {
    setIsSaving(true);

    // แปลงเทเบิล State ให้อยู่ในรูปแบบ Array of Objects ตามเงื่อนไข
    const todayDate = new Date().toISOString().split("T")[0];
    const payloadToSave = players
      .map((player) => {
        const stats = testData[player.id] || {};
        return {
          player_id: player.id.toString(),
          test_date: todayDate,
          yoyo_level: Number(stats["yoyo_level"]) || null,
          calculated_vo2max: Number(stats["calculated_vo2max"]) || null,
          speed_10m: Number(stats["speed_10m"]) || null,
          speed_30m: Number(stats["speed_30m"]) || null,
          vertical_jump: Number(stats["vertical_jump"]) || null,
        };
      })
      .filter(
        (data) =>
          data.yoyo_level !== null ||
          data.speed_10m !== null ||
          data.speed_30m !== null ||
          data.vertical_jump !== null,
      ); // Filter rows that actually have data filled

    // Simulate Supabase Response wait time
    setTimeout(() => {
      setIsSaving(false);
      console.log(
        "--- Payload Prepared for Upsert (Supabase) ---",
        payloadToSave,
      );

      if (isOnline) {
        setSaveStatus("success");
      } else {
        setSaveStatus("offline_queued");
        onOfflineSave?.();
      }

      setTimeout(() => setSaveStatus(null), 3000);
    }, 800);
  };

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
              Input auto-calculates secondary metrics
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

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {saveStatus === "success" && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <Check size={14} /> Saved to Cloud
            </span>
          )}
          {saveStatus === "offline_queued" && (
            <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
              <Database size={14} /> Saved Offline
            </span>
          )}

          <button
            onClick={handleSaveAllResults}
            disabled={isSaving}
            className="px-4 py-2 flex items-center justify-center gap-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition shadow-sm disabled:opacity-70 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {isSaving ? (
              "Saving..."
            ) : (
              <>
                <Save size={16} />
                {isOnline ? "Save All Results" : "Save Offline"}
              </>
            )}
          </button>
        </div>
      </div>

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

const MOCK_PLAYERS: Player[] = [
  {
    id: "p1",
    firstName: "Suphanat",
    lastName: "Mueanta",
    position: "Striker",
    ageGroup: "U17",
    dob: "2007-08-02",
    age: 17,
    fitness_status: "Fit",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Suphanat",
  },
  {
    id: "p2",
    firstName: "Ekanit",
    lastName: "Panya",
    position: "Winger",
    ageGroup: "U15",
    dob: "2009-10-21",
    age: 15,
    fitness_status: "Fit",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Ekanit",
  },
];

export default function FitnessTesting({
  onBack,
  teamName,
  isOnline = true,
  onOfflineSave,
}: {
  onBack: () => void;
  teamName?: string;
  isOnline?: boolean;
  onOfflineSave?: () => void;
}) {
  const { settings } = useAcademy();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"entry" | "report">("entry");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [filterAge, setFilterAge] = useState("All");

  // CRUD state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerToDelete, setPlayerToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    fitness_status: "Fit",
    position: "CM",
    ageGroup: "U15",
    avatarUrl: "",
  });

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, "players"), (snapshot) => {
      const playersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Player[];
      setPlayers(playersData);
      if (playersData.length > 0) {
        setSelectedPlayerId(prev => prev ? prev : playersData[0].id);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching players:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const calculateAge = (dob: string) => {
    if (!dob) return 0;
    const diff_ms = Date.now() - new Date(dob).getTime();
    const age_dt = new Date(diff_ms);
    return Math.abs(age_dt.getUTCFullYear() - 1970);
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
    setFormData({
      firstName: "",
      lastName: "",
      dob: "",
      fitness_status: "Fit",
      position: "CM",
      ageGroup: settings?.squads?.[0] || "U15",
      avatarUrl: "",
    });
    setIsModalOpen(true);
  };

  const handleEditClick = (player: Player) => {
    setFormData({
      firstName: player.firstName,
      lastName: player.lastName,
      dob: player.dob,
      fitness_status: player.fitness_status || "Fit",
      position: player.position,
      ageGroup: player.ageGroup,
      avatarUrl: player.avatar || "",
    });
    setEditingPlayerId(player.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPlayerId(null);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const playerData: any = {
        ...formData,
        age: calculateAge(formData.dob),
        avatar: formData.avatarUrl,
      };
      delete playerData.avatarUrl;

      if (editingPlayerId) {
        await updateDoc(doc(db, "players", editingPlayerId), playerData);
      } else {
        await addDoc(collection(db, "players"), playerData);
      }
      closeModal();
    } catch (error: any) {
      console.error("Error saving player:", error);
      alert("Error saving: " + error.message);
    }
  };

  const handleDeleteConfirm = async () => {
    if (playerToDelete) {
      try {
        await deleteDoc(doc(db, "players", playerToDelete));
        setPlayerToDelete(null);
      } catch (error: any) {
        console.error("Error deleting player:", error);
        alert("Error deleting: " + error.message);
      }
    }
  };

  const filteredPlayers = players.filter((p) => filterAge === "All" || p.ageGroup === filterAge);

  // State from main wrapper for reports functionality and passing to grid
  const [testData, setTestData] = useState<
    Record<string, Record<string, string>>
  >({});
  const [saveStatus, setSaveStatus] = useState<
    null | "success" | "offline_queued"
  >(null);

  const getRadarData = (playerId: string) => {
    return METRICS_CONFIG.filter((m) => m.key !== "calculated_vo2max").map(
      (m) => {
        let val = 0;
        if (testData[playerId]?.[m.key]) {
          val = parseFloat(testData[playerId][m.key]);
        } else {
          val = 0; // fallback to 0 if no data
        }

        // Normalize for radar (0-100 scale)
        let normalized = 0;
        if (m.invert) {
          normalized = Math.max(0, 100 - (val / m.max) * 50);
        } else {
          normalized = Math.min(100, (val / m.max) * 100);
        }

        return {
          subject: m.label,
          A: Math.round(normalized),
          fullMark: 100,
          actualValue: val,
        };
      },
    );
  };

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
              Fitness Testing System
            </h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              Assessment Engine
            </p>
          </div>
        </div>
        <EmptyState
          icon={Users}
          title="No Players Available"
          description="You need to add players to the academy before you can test their fitness."
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
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
            Fitness Testing System
          </h1>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Assessment Engine
          </p>
        </div>
      </div>

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
            isOnline={isOnline}
            onOfflineSave={onOfflineSave}
            saveStatus={saveStatus}
            setSaveStatus={setSaveStatus}
            testData={testData}
            setTestData={setTestData}
            onEditPlayer={handleEditClick}
            onDeletePlayer={(p) => setPlayerToDelete(p.id)}
            filterAge={filterAge}
            setFilterAge={setFilterAge}
            squads={settings?.squads || ["U13", "U15", "U17", "U19", "U21"]}
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
              <div className="flex gap-3 mb-2">
                <ShieldAlert className="text-amber-500 shrink-0" size={20} />
                <span className="font-semibold text-amber-800 text-sm">
                  Injury Risk Analysis
                </span>
              </div>
              <div className="text-sm text-amber-700/90 leading-relaxed">
                High load detected in last 3 microcycles for selected position
                group. Recommend active recovery session.
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-6 border-b border-slate-100 pb-3">
                Performance Spider Chart
              </h3>
              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    outerRadius="75%"
                    data={getRadarData(selectedPlayerId)}
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
                      name="Current Assessment"
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
                        props?.payload?.actualValue || value,
                        "Value",
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
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-6 border-b border-slate-100 pb-3">
                Fitness Progression Timeline
              </h3>
              <div className="h-[300px] w-full mt-4 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-slate-400 font-medium">
                  Historical data will appear here after multiple tests
                </p>
              </div>
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
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input required name="dob" value={formData.dob} onChange={handleInputChange} type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fitness Status</label>
                    <div className="relative">
                      <select name="fitness_status" value={formData.fitness_status} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
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
                      <select name="position" value={formData.position} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        <option value="GK">GK</option>
                        <option value="CB">CB</option>
                        <option value="LB">LB</option>
                        <option value="RB">RB</option>
                        <option value="CM">CM</option>
                        <option value="Winger">Winger</option>
                        <option value="Striker">Striker</option>
                      </select>
                      <ChevronDown className="absolute right-3 text-slate-400 pointer-events-none top-1/2 -translate-y-1/2" size={18} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Age Group</label>
                    <div className="relative">
                      <select name="ageGroup" value={formData.ageGroup} onChange={handleInputChange} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all">
                        {(settings?.squads || ["U13", "U15", "U17", "U19"]).map((squad: string) => (
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
