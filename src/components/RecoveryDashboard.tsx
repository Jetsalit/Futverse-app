import React, { useState, useEffect, useMemo } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import {
  ArrowLeft,
  UserCircle,
  Plus,
  Activity,
  Moon,
  Battery,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  X,
  HeartPulse,
  Flame,
} from "lucide-react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, doc, getDocs } from "firebase/firestore";
import { useAcademy } from "../contexts/AcademyContext";
import { EmptyState } from "./common/EmptyState";
import { injectMockData } from "../utils/mockDataInjector";

interface InjuredPlayer {
  id: string;
  name: string;
  image: string;
  injury: string;
  startDate: string;
  expectedReturn: string;
  status: "Injured" | "Rehab";
  notes: string;
}

interface WellnessPlayer {
  id: string;
  name: string;
  image: string;
  muscleSoreness: number; // 1-5 (5 = worst)
  sleepQuality: number; // 1-5 (1 = worst, 5 = best)
  fatigue: number; // 1-5 (5 = worst)
  recentLoad: number; // 7-Day Rolling Load
  hasData: boolean;
}

const MOCK_INJURED: InjuredPlayer[] = [];

const MOCK_WELLNESS: WellnessPlayer[] = [];

export default function RecoveryDashboard({
  onBack,
  teamName,
}: {
  onBack: () => void;
  teamName: string;
}) {
  const { academyId } = useAcademy();
  const [filterTeam, setFilterTeam] = useState(teamName);
  const [injuredPlayers, setInjuredPlayers] = useState<InjuredPlayer[]>(MOCK_INJURED);
  const [wellnessPlayers, setWellnessPlayers] = useState<WellnessPlayer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!academyId) return;

    let isSubscribed = true;
    
    // Fetch all players for wellness mapping
    const fetchWellness = async () => {
      setLoading(true);
      try {
        const playersRef = collection(db, `academies/${academyId}/players`);
        const snapshot = await getDocs(playersRef);
        
        const playersData: WellnessPlayer[] = [];
        const today = new Date().toISOString().split("T")[0];

        // 1. Calculate Recent Loads (Matches & Training)
        const playerLoads: Record<string, number> = {};
        
        // Matches Load
        const matchesRef = collection(db, `academies/${academyId}/matches`);
        const matchSnap = await getDocs(matchesRef);
        matchSnap.forEach(docSnap => {
          const m = docSnap.data();
          const matchDate = new Date(m.matchDate);
          if (matchDate >= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)) {
            if (m.playersData) {
              Object.keys(m.playersData).forEach(pid => {
                const mins = Number(m.playersData[pid].minutesPlayed || m.playersData[pid].metrics?.minutes || 0);
                playerLoads[pid] = (playerLoads[pid] || 0) + (mins * 9);
              });
            }
            if (m.players) {
              m.players.forEach((p:any) => {
                const mins = Number(p.minutesPlayed || p.metrics?.minutes || 0);
                playerLoads[p.id] = (playerLoads[p.id] || 0) + (mins * 9);
              });
            }
          }
        });

        // Training Load
        const twRef = collection(db, `academies/${academyId}/training_weeks`);
        const twSnap = await getDocs(twRef);
        twSnap.forEach(docSnap => {
          const docDate = new Date(docSnap.id);
          if (docDate >= new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)) {
            const data = docSnap.data();
            const trainingLogsDB = data.trainingLogsDB || {};
            Object.values(trainingLogsDB).forEach((dayLogs: any) => {
              Object.keys(dayLogs).forEach(pid => {
                const log = dayLogs[pid];
                playerLoads[pid] = (playerLoads[pid] || 0) + ((log.minutes || 0) * (log.rpe || 0));
              });
            });
          }
        });

        for (const playerDoc of snapshot.docs) {
          const pd = playerDoc.data();
          const wellnessRef = collection(db, `academies/${academyId}/players/${playerDoc.id}/daily_wellness`);
          const wellSnap = await getDocs(wellnessRef);
          const todayWellness = wellSnap.docs.find(d => d.id === today);
          
          const load = playerLoads[playerDoc.id] || 0;

          if (todayWellness || load > 0) {
            const wData = todayWellness ? todayWellness.data() : { pain: 1, sleepHours: 8, fatigue: 1 };
            playersData.push({
              id: playerDoc.id,
              name: `${pd.firstName || ""} ${pd.lastName || ""}`.trim() || "Unknown Player",
              image: pd.photoUrl || `https://ui-avatars.com/api/?name=${pd.firstName || "Player"}&background=random`,
              muscleSoreness: wData.pain || 1,
              sleepQuality: wData.sleepHours || 8,
              fatigue: wData.fatigue || 1,
              recentLoad: load,
              hasData: !!todayWellness
            });
          }
        }

        if (isSubscribed) {
          setWellnessPlayers(playersData);
        }
      } catch (error) {
        console.error("Error fetching wellness:", error);
      } finally {
        if (isSubscribed) setLoading(false);
      }
    };

    fetchWellness();

    return () => {
      isSubscribed = false;
    };
  }, [academyId, filterTeam]);

  const [selectedInjured, setSelectedInjured] = useState<InjuredPlayer | null>(
    null,
  );
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Wellness Form State
  const [sleepHours, setSleepHours] = useState(8);
  const [hydrationCount, setHydrationCount] = useState(4);
  const [sorenessLevel, setSorenessLevel] = useState<
    "fresh" | "slightly_sore" | "heavy_sore"
  >("fresh");

  // Status computation for Wellness
  const getWellnessRisk = (p: WellnessPlayer) => {
    if (!p.hasData) return "gray";
    // High risk: sleep < 6 or soreness >= 4 or fatigue >= 4
    if (p.sleepQuality < 6 || p.muscleSoreness >= 4 || p.fatigue >= 4)
      return "red";
    // Warning: sleep <= 7 or soreness >= 3 or fatigue >= 3
    if (p.sleepQuality <= 7 || p.muscleSoreness >= 3 || p.fatigue >= 3)
      return "yellow";
    return "green";
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "red":
        return "bg-rose-50 border-rose-200";
      case "yellow":
        return "bg-amber-50 border-amber-200";
      case "gray":
        return "bg-slate-50 border-slate-200 opacity-80";
      default:
        return "bg-white border-slate-100 hover:bg-slate-50";
    }
  };

  const handleUpdateStatus = (
    id: string,
    newStatus: "Injured" | "Rehab" | "Cleared",
    notes: string,
  ) => {
    if (newStatus === "Cleared") {
      setInjuredPlayers(injuredPlayers.filter((p) => p.id !== id));
    } else {
      setInjuredPlayers(
        injuredPlayers.map((p) =>
          p.id === id ? { ...p, status: newStatus, notes } : p,
        ),
      );
    }
    setIsUpdateModalOpen(false);
    setSelectedInjured(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  if (injuredPlayers.length === 0 && wellnessPlayers.length === 0) {
    return (
      <div className="flex flex-col min-h-fit animate-in fade-in duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-200 bg-white rounded-xl transition-colors shadow-sm text-slate-600 border border-slate-200"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <HeartPulse className="text-rose-500" /> Recovery & Medical
                <button onClick={() => {
                  alert("กำลังเริ่มสร้างข้อมูลจำลอง... (Academy ID: " + academyId + ")");
                  if (academyId) {
                    injectMockData(academyId).then(() => console.log("Done")).catch(e => alert("Error: " + e.message));
                  }
                }} className="ml-4 text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded-md transition-colors shadow-sm font-bold uppercase tracking-wider">
                  Generate Mock Data
                </button>
              </h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-1">
                U19 Elite Squad • Player Health Status
              </p>
            </div>
          </div>
        </div>
        <EmptyState
          icon={HeartPulse}
          title="No Health Records"
          description="There are currently no injured players or wellness logs in the system."
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-fit animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-200 bg-white rounded-xl transition-colors shadow-sm text-slate-600 border border-slate-200"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <HeartPulse className="text-rose-500" /> Recovery & Medical
              <button onClick={() => {
                alert("กำลังเริ่มสร้างข้อมูลจำลอง... (Academy ID: " + academyId + ")");
                if (academyId) {
                  injectMockData(academyId).then(() => console.log("Done")).catch(e => alert("Error: " + e.message));
                }
              }} className="ml-4 text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-600 px-2 py-1 rounded-md transition-colors shadow-sm font-bold uppercase tracking-wider">
                Generate Mock Data
              </button>
            </h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest mt-1">
              Injury Management & Daily Wellness
            </p>
          </div>
        </div>

        <select
          value={filterTeam}
          onChange={(e) => setFilterTeam(e.target.value)}
          className="bg-white border border-slate-300 text-slate-700 font-bold rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          <option value="U-17 National Prospects">
            U-17 National Prospects
          </option>
          <option value="U-15 Development">U-15 Development</option>
          <option value="T1 Senior Squad">T1 Senior Squad</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 shrink-0">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-between">
          <div>
            <div className="text-emerald-500 font-bold text-sm tracking-wide uppercase mb-1 flex items-center gap-1.5">
              <CheckCircle2 size={16} /> Fit & Ready
            </div>
            <div className="text-4xl font-black text-slate-800">
              85<span className="text-lg text-slate-500 font-medium">%</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-100 flex items-center justify-between">
          <div>
            <div className="text-amber-500 font-bold text-sm tracking-wide uppercase mb-1 flex items-center gap-1.5">
              <Activity size={16} /> In Rehab
            </div>
            <div className="text-4xl font-black text-slate-800">
              {injuredPlayers.filter((p) => p.status === "Rehab").length}{" "}
              <span className="text-lg text-slate-500 font-medium">
                Players
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-rose-100 flex items-center justify-between">
          <div>
            <div className="text-rose-500 font-bold text-sm tracking-wide uppercase mb-1 flex items-center gap-1.5">
              <AlertCircle size={16} /> Injured
            </div>
            <div className="text-4xl font-black text-slate-800">
              {injuredPlayers.filter((p) => p.status === "Injured").length}{" "}
              <span className="text-lg text-slate-500 font-medium">
                Players
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-fit">
        {/* Injury Ward */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-fit">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
            <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              Injury Ward
            </h2>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-sky-50 text-sky-600 hover:bg-sky-100 font-bold text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Plus size={16} /> Log Injury
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-3 flex-1">
            {injuredPlayers.length === 0 ? (
              <div className="text-center py-10 text-slate-400 font-medium border-2 border-dashed border-slate-100 rounded-xl">
                No injured players currently.
              </div>
            ) : (
              injuredPlayers.map((player) => (
                <div
                  key={player.id}
                  onClick={() => {
                    setSelectedInjured(player);
                    setIsUpdateModalOpen(true);
                  }}
                  className="p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:shadow-md transition-all cursor-pointer group bg-white"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                        <img
                          src={
                            player.image ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`
                          }
                          alt={player.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 leading-tight">
                          {player.name}
                        </h3>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                          {player.injury}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        player.status === "Injured"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {player.status}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs mt-4 pt-3 border-t border-slate-100">
                    <div className="flex-1">
                      <span className="text-slate-400 font-medium block mb-0.5 text-[10px] uppercase">
                        Injured On
                      </span>
                      <span className="font-bold text-slate-700">
                        {player.startDate}
                      </span>
                    </div>
                    <div className="flex-1">
                      <span className="text-slate-400 font-medium block mb-0.5 text-[10px] uppercase">
                        Exp. Return
                      </span>
                      <span className="font-bold text-slate-700">
                        {player.expectedReturn}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Daily Wellness Check */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-fit">
          <div className="p-5 border-b border-slate-100 shrink-0">
            <h2 className="font-bold text-slate-800 text-lg">
              Daily Wellness Check
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Pre-training fatigue & soreness assessment
            </p>
          </div>
          <div className="p-5 overflow-y-auto space-y-4 flex-1">
            {wellnessPlayers.length === 0 ? (
              <div className="text-center py-10 text-slate-400 font-medium border-2 border-dashed border-slate-100 rounded-xl">
                ยังไม่มีข้อมูลการรายงานสภาพร่างกายในวันนี้
              </div>
            ) : (
              wellnessPlayers.map((player) => {
                const risk = getWellnessRisk(player);
                const colorClass = getRiskColor(risk);
                return (
                  <div
                    key={player.id}
                    className={`p-4 rounded-xl border flex items-center justify-between ${colorClass} transition-colors`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={player.image}
                        alt={player.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm bg-white"
                      />
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">
                          {player.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 text-xs font-bold text-slate-500">
                          {player.hasData ? (
                            <>
                              <span className="flex items-center gap-1">
                                <Moon size={12} className={player.sleepQuality < 6 ? "text-rose-500" : ""} /> {player.sleepQuality}h
                              </span>
                              <span className="flex items-center gap-1">
                                <Battery size={12} className={player.fatigue >= 4 ? "text-amber-500" : ""} /> ล้า {player.fatigue}/5
                              </span>
                              <span className="flex items-center gap-1">
                                <Activity size={12} className={player.muscleSoreness >= 4 ? "text-rose-500" : ""} /> ปวด {player.muscleSoreness}/5
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400 italic">No daily report</span>
                          )}
                          <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 ml-1">
                            <Flame size={12} className={player.recentLoad > 500 ? "text-rose-500" : "text-slate-400"} /> Load {player.recentLoad}
                          </span>
                        </div>
                      </div>
                    </div>
                    {risk === "red" && (
                      <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                        <AlertCircle size={16} />
                      </div>
                    )}
                    {risk === "yellow" && (
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                        <AlertCircle size={16} />
                      </div>
                    )}
                    {risk === "green" && (
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Injury Update Modal */}
      {isUpdateModalOpen && selectedInjured && (
        <UpdateStatusModal
          player={selectedInjured}
          onClose={() => setIsUpdateModalOpen(false)}
          onUpdate={handleUpdateStatus}
        />
      )}

      {/* Add Injury Modal */}
      {isAddModalOpen && (
        <LogInjuryModal
          onClose={() => setIsAddModalOpen(false)}
          onSave={(newObj) => {
            setInjuredPlayers((prev) => [newObj, ...prev]);
            setIsAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function UpdateStatusModal({
  player,
  onClose,
  onUpdate,
}: {
  player: InjuredPlayer;
  onClose: () => void;
  onUpdate: (id: string, s: "Injured" | "Rehab" | "Cleared", n: string) => void;
}) {
  const [status, setStatus] = useState<"Injured" | "Rehab" | "Cleared">(
    player.status as any,
  );
  const [notes, setNotes] = useState(player.notes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">
            อัปเดตสถานะ (Update Status)
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <img
              src={
                player.image ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`
              }
              alt={player.name}
              className="w-12 h-12 rounded-full border border-slate-300"
            />
            <div>
              <div className="font-bold text-slate-800">{player.name}</div>
              <div className="text-xs text-rose-600 font-bold">
                {player.injury}
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">
                Status
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus("Injured")}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors ${status === "Injured" ? "bg-rose-50 border-rose-500 text-rose-700" : "border-slate-200 text-slate-500"}`}
                >
                  🔴 Injured
                </button>
                <button
                  onClick={() => setStatus("Rehab")}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors ${status === "Rehab" ? "bg-amber-50 border-amber-500 text-amber-700" : "border-slate-200 text-slate-500"}`}
                >
                  🟡 Rehab
                </button>
                <button
                  onClick={() => setStatus("Cleared")}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-colors ${status === "Cleared" ? "bg-emerald-50 border-emerald-500 text-emerald-700" : "border-slate-200 text-slate-500"}`}
                >
                  🟢 Cleared
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">
                Medical Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500 transition-colors resize-none"
              ></textarea>
            </div>
          </div>

          <button
            onClick={() => onUpdate(player.id, status, notes)}
            className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors shadow-sm"
          >
            Save Update
          </button>
        </div>
      </div>
    </div>
  );
}

function LogInjuryModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (i: InjuredPlayer) => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    injury: "",
    startDate: new Date().toISOString().split("T")[0],
    expectedReturn: "",
    notes: "",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      ></div>
      <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-full">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">
            เพิ่มรายการบาดเจ็บ (Log Injury)
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                Player Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                placeholder="e.g. Suphanat Mueanta"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                Injury Type
              </label>
              <input
                type="text"
                value={formData.injury}
                onChange={(e) =>
                  setFormData({ ...formData, injury: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-sky-500"
                placeholder="e.g. Broken Toe"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  Date Injured
                </label>
                <ThaiDatePicker
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-within:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                  Expected Return
                </label>
                <ThaiDatePicker
                  value={formData.expectedReturn}
                  onChange={(e) =>
                    setFormData({ ...formData, expectedReturn: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus-within:border-sky-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">
                Medical Notes
              </label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-500 resize-none"
              ></textarea>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave({
                id: "new_" + Date.now(),
                name: formData.name || "Unknown",
                image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}&backgroundColor=f87171`,
                injury: formData.injury || "Unknown Injury",
                startDate: formData.startDate,
                expectedReturn: formData.expectedReturn,
                notes: formData.notes,
                status: "Injured",
              });
            }}
            className="flex-1 py-2.5 rounded-xl font-bold bg-sky-600 hover:bg-sky-700 text-white transition-colors text-sm shadow-sm"
          >
            Save Injury
          </button>
        </div>
      </div>
    </div>
  );
}
