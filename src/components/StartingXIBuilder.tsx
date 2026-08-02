import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  CheckCircle2,
  Search,
  X,
  Users,
  User,
  Save,
  FolderOpen,
} from "lucide-react";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, addDoc } from "firebase/firestore";
import { EmptyState } from "./common/EmptyState";
import TeamTacticsPanel from "./tactics/TeamTacticsPanel";
import PlayerRoleModal from "./tactics/PlayerRoleModal";
import SaveMatchPlanModal from "./tactics/SaveMatchPlanModal";
import LoadMatchPlanModal from "./tactics/LoadMatchPlanModal";
import { TeamTactics, PlayerInstruction, DEFAULT_TEAM_TACTICS } from "./tactics/types";

interface Position {
  x: number;
  y: number;
  label: string;
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  avatar: string;
  jerseyNumber?: number;
}

const FORMATIONS: Record<string, Position[]> = {
  "4-4-2": [
    { x: 10, y: 50, label: "GK" },
    { x: 30, y: 15, label: "LB" },
    { x: 30, y: 35, label: "CB" },
    { x: 30, y: 65, label: "CB" },
    { x: 30, y: 85, label: "RB" },
    { x: 55, y: 15, label: "LM" },
    { x: 55, y: 35, label: "CM" },
    { x: 55, y: 65, label: "CM" },
    { x: 55, y: 85, label: "RM" },
    { x: 80, y: 35, label: "ST" },
    { x: 80, y: 65, label: "ST" },
  ],
  "4-3-3": [
    { x: 10, y: 50, label: "GK" },
    { x: 30, y: 15, label: "LB" },
    { x: 30, y: 35, label: "CB" },
    { x: 30, y: 65, label: "CB" },
    { x: 30, y: 85, label: "RB" },
    { x: 50, y: 30, label: "CM" },
    { x: 45, y: 50, label: "CDM" },
    { x: 50, y: 70, label: "CM" },
    { x: 75, y: 20, label: "LW" },
    { x: 80, y: 50, label: "ST" },
    { x: 75, y: 80, label: "RW" },
  ],
  "3-5-2": [
    { x: 10, y: 50, label: "GK" },
    { x: 25, y: 25, label: "CB" },
    { x: 30, y: 50, label: "CB" },
    { x: 25, y: 75, label: "CB" },
    { x: 55, y: 15, label: "LWB" },
    { x: 50, y: 35, label: "CM" },
    { x: 60, y: 50, label: "CAM" },
    { x: 50, y: 65, label: "CM" },
    { x: 55, y: 85, label: "RWB" },
    { x: 80, y: 35, label: "ST" },
    { x: 80, y: 65, label: "ST" },
  ],
  "4-2-3-1": [
    { x: 10, y: 50, label: "GK" },
    { x: 30, y: 15, label: "LB" },
    { x: 30, y: 35, label: "CB" },
    { x: 30, y: 65, label: "CB" },
    { x: 30, y: 85, label: "RB" },
    { x: 45, y: 35, label: "CDM" },
    { x: 45, y: 65, label: "CDM" },
    { x: 65, y: 20, label: "LAM" },
    { x: 65, y: 50, label: "CAM" },
    { x: 65, y: 80, label: "RAM" },
    { x: 85, y: 50, label: "ST" },
  ],
  "3-4-3": [
    { x: 10, y: 50, label: "GK" },
    { x: 25, y: 25, label: "CB" },
    { x: 30, y: 50, label: "CB" },
    { x: 25, y: 75, label: "CB" },
    { x: 50, y: 15, label: "LM" },
    { x: 50, y: 35, label: "CM" },
    { x: 50, y: 65, label: "CM" },
    { x: 50, y: 85, label: "RM" },
    { x: 75, y: 25, label: "LW" },
    { x: 80, y: 50, label: "ST" },
    { x: 75, y: 75, label: "RW" },
  ],
  "5-3-2": [
    { x: 10, y: 50, label: "GK" },
    { x: 35, y: 15, label: "LWB" },
    { x: 25, y: 30, label: "CB" },
    { x: 25, y: 50, label: "CB" },
    { x: 25, y: 70, label: "CB" },
    { x: 35, y: 85, label: "RWB" },
    { x: 55, y: 30, label: "CM" },
    { x: 55, y: 50, label: "CM" },
    { x: 55, y: 70, label: "CM" },
    { x: 80, y: 35, label: "ST" },
    { x: 80, y: 65, label: "ST" },
  ],
  "2-3-1 (7v7)": [
    { x: 10, y: 50, label: "GK" },
    { x: 30, y: 35, label: "CB" },
    { x: 30, y: 65, label: "CB" },
    { x: 55, y: 20, label: "LM" },
    { x: 50, y: 50, label: "CM" },
    { x: 55, y: 80, label: "RM" },
    { x: 80, y: 50, label: "ST" },
  ],
  "3-2-1 (7v7)": [
    { x: 10, y: 50, label: "GK" },
    { x: 30, y: 20, label: "LB" },
    { x: 30, y: 50, label: "CB" },
    { x: 30, y: 80, label: "RB" },
    { x: 55, y: 35, label: "CM" },
    { x: 55, y: 65, label: "CM" },
    { x: 80, y: 50, label: "ST" },
  ],
  "1-3-2 (7v7)": [
    { x: 10, y: 50, label: "GK" },
    { x: 30, y: 50, label: "CB" },
    { x: 55, y: 20, label: "LM" },
    { x: 50, y: 50, label: "CM" },
    { x: 55, y: 80, label: "RM" },
    { x: 80, y: 35, label: "ST" },
    { x: 80, y: 65, label: "ST" },
  ],
  "2-2-2 (7v7)": [
    { x: 10, y: 50, label: "GK" },
    { x: 30, y: 35, label: "CB" },
    { x: 30, y: 65, label: "CB" },
    { x: 55, y: 35, label: "CM" },
    { x: 55, y: 65, label: "CM" },
    { x: 80, y: 35, label: "ST" },
    { x: 80, y: 65, label: "ST" },
  ],
};

const MOCK_PLAYERS: Player[] = [];

import { useAcademy } from "../contexts/AcademyContext";
import { useAuth } from "../contexts/AuthContext";

export default function StartingXIBuilder({ onBack }: { onBack: () => void }) {
  const { settings, getAcademyCollection, activeSeason } = useAcademy();
  const { hasPermission } = useAuth();
  const isCoachOrAdmin = hasPermission(["ADMIN", "COACH", "SUPERADMIN"]);

  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterAge, setFilterAge] = useState<string>("All");

  const [formation, setFormation] = useState<string>(() => {
    const draft = localStorage.getItem("draft_match_plan");
    return draft ? JSON.parse(draft).formation : "4-3-3";
  });
  const [lineup, setLineup] = useState<Record<number, string | null>>(() => {
    const draft = localStorage.getItem("draft_match_plan");
    return draft ? JSON.parse(draft).lineup : {};
  });
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState<"Lineup" | "Tactics">("Lineup");
  const [teamTactics, setTeamTactics] = useState<TeamTactics>(() => {
    const draft = localStorage.getItem("draft_match_plan");
    return draft ? JSON.parse(draft).teamTactics : DEFAULT_TEAM_TACTICS;
  });
  const [playerInstructions, setPlayerInstructions] = useState<Record<number, PlayerInstruction>>(() => {
    const draft = localStorage.getItem("draft_match_plan");
    return draft ? JSON.parse(draft).playerInstructions : {};
  });
  
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedRoleSlot, setSelectedRoleSlot] = useState<number | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  const currentFormation = FORMATIONS[formation];

  // Auto-save draft to localStorage (only for coach/admin)
  useEffect(() => {
    if (!isCoachOrAdmin) return;
    localStorage.setItem(
      "draft_match_plan",
      JSON.stringify({
        formation,
        lineup,
        teamTactics,
        playerInstructions,
      })
    );
  }, [formation, lineup, teamTactics, playerInstructions, isCoachOrAdmin]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(getAcademyCollection("players"), (snapshot) => {
      const playersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setPlayers(playersData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleFormationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!isCoachOrAdmin) return;
    setFormation(e.target.value);
  };

  const handleSlotClick = (idx: number) => {
    if (!isCoachOrAdmin) return;
    if (lineup[idx]) {
      setSelectedRoleSlot(idx);
      setRoleModalOpen(true);
      setActiveSlot(null);
    } else {
      setActiveSlot(activeSlot === idx ? null : idx);
    }
  };

  const handleSaveMatchPlan = () => {
    if (!isCoachOrAdmin) return;
    setSaveModalOpen(true);
  };

  const assignPlayer = (playerId: string) => {
    if (!isCoachOrAdmin || activeSlot === null) return;

    setLineup((prev) => ({
      ...prev,
      [activeSlot]: playerId,
    }));
    setActiveSlot(null);
  };

  const removePlayer = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    if (!isCoachOrAdmin) return;
    const newLineup = { ...lineup };
    delete newLineup[idx];
    setLineup(newLineup);
    if (activeSlot === idx) {
      setActiveSlot(null);
    }
  };

  const selectedPlayerIds = Object.values(lineup).filter(Boolean) as string[];
  const selectedCount = selectedPlayerIds.length;

  const filteredPlayers = players.filter((p) => {
    const isSeasonActive = p.seasonHistory?.[activeSeason]?.active 
      || (!p.seasonHistory && activeSeason === (settings.currentSeason || "2026"));
    if (!isSeasonActive) return false;

    const activeSquad = p.seasonHistory?.[activeSeason]?.squad || p.ageGroup;
    const matchAge = filterAge === "All" || activeSquad === filterAge;
    const matchName = `${p.firstName} ${p.lastName}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchAge && matchName;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="w-full max-w-6xl mx-auto pb-10 flex flex-col h-[calc(100vh-4rem)]">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4 shrink-0">
          <div>
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-3"
            >
              <ChevronLeft size={16} /> Back to Dashboard
            </button>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
              Starting XI & Tactics
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Design your match setup and player assignments
            </p>
          </div>
        </div>
        <EmptyState
          icon={Users}
          title="No Players Available"
          description="Add players to your squad to build your Starting XI."
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-50 lg:h-[calc(100vh-4rem)] p-4 md:p-6 overflow-y-auto lg:overflow-hidden pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 shrink-0 gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2"
          >
            <ChevronLeft size={16} /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Starting XI & Tactics
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Design your match setup and player assignments
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Formation
            </span>
            <select
              disabled={!isCoachOrAdmin}
              value={formation}
              onChange={handleFormationChange}
              className={`bg-transparent border-none text-sm font-black text-indigo-700 focus:ring-0 outline-none ml-2 ${
                !isCoachOrAdmin ? "cursor-not-allowed opacity-80" : "cursor-pointer"
              }`}
            >
              {Object.keys(FORMATIONS).map((form) => (
                <option key={form} value={form}>
                  {form}
                </option>
              ))}
            </select>
          </div>
          
          {isCoachOrAdmin && (
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => setLoadModalOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 px-5 py-2.5 rounded-xl text-sm font-black transition-colors shadow-sm shrink-0"
              >
                <FolderOpen size={16} />
                Load
              </button>
              <button
                onClick={handleSaveMatchPlan}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-black transition-colors shadow-sm shrink-0"
              >
                <Save size={16} />
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:h-full min-h-0">
        {/* Left: Pitch */}
        <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 p-2 md:p-4 flex flex-col relative overflow-hidden min-h-[500px] lg:min-h-0 shrink-0">
          <div className="w-full flex-1 bg-[#0e8f4b] rounded-2xl relative border-4 border-white shadow-inner overflow-hidden flex items-center justify-center">
            {/* Field Markings */}
            <div className="absolute inset-2 border-2 border-white/40"></div>
            <div className="absolute top-2 bottom-2 left-1/2 -translate-x-1/2 border-l-2 border-white/40"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 md:w-48 md:h-48 rounded-full border-2 border-white/40"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/60 rounded-full"></div>
            <div className="absolute top-1/2 left-2 -translate-y-1/2 w-24 h-48 md:w-40 md:h-80 border-2 border-white/40 border-l-0"></div>
            <div className="absolute top-1/2 right-2 -translate-y-1/2 w-24 h-48 md:w-40 md:h-80 border-2 border-white/40 border-r-0"></div>
            <div className="absolute top-1/2 left-2 -translate-y-1/2 w-10 h-20 md:w-16 md:h-32 border-2 border-white/40 border-l-0"></div>
            <div className="absolute top-1/2 right-2 -translate-y-1/2 w-10 h-20 md:w-16 md:h-32 border-2 border-white/40 border-r-0"></div>
            <div className="absolute top-1/2 left-20 md:left-32 -translate-y-1/2 -translate-x-1/2 w-16 h-16 md:w-24 md:h-24 rounded-full border-2 border-white/40 clip-right"></div>
            <div className="absolute top-1/2 right-20 md:right-32 -translate-y-1/2 translate-x-1/2 w-16 h-16 md:w-24 md:h-24 rounded-full border-2 border-white/40 clip-left"></div>

            {/* Players */}
            {currentFormation.map((pos, idx) => {
              const isSelected = activeSlot === idx;
              const assignedPlayerId = lineup[idx];
              const player = players.find((p) => p.id === assignedPlayerId);

              return (
                <div
                  key={idx}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-500 ease-in-out"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div className="relative">
                    <button
                      disabled={!isCoachOrAdmin}
                      onClick={() => handleSlotClick(idx)}
                      className={`w-8 h-8 md:w-12 md:h-12 rounded-full border-2 flex items-center justify-center font-black text-sm md:text-lg transition-transform overflow-hidden ${
                        isSelected
                          ? "ring-4 ring-amber-400 scale-110 shadow-lg"
                          : isCoachOrAdmin ? "hover:scale-110 shadow-md" : "shadow-md cursor-default"
                      } ${
                        player
                          ? "bg-white text-indigo-800 border-indigo-200"
                          : "bg-black/30 border-white/50 text-white border-dashed"
                      }`}
                    >
                      {player ? (
                        player.avatar ? (
                          <img src={player.avatar} alt={player.firstName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] md:text-sm text-emerald-500">{pos.label}</span>
                        )
                      ) : (
                        "+"
                      )}
                    </button>
                    {player && playerInstructions[idx]?.duty === "Attack" && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 text-emerald-500 bg-white rounded-full flex items-center justify-center shadow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                      </div>
                    )}
                    {player && playerInstructions[idx]?.duty === "Defend" && (
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-4 h-4 text-rose-500 bg-white rounded-full flex items-center justify-center shadow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                      </div>
                    )}
                    {player && isCoachOrAdmin && (
                      <button
                        onClick={(e) => removePlayer(e, idx)}
                        className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-white text-rose-500 rounded-full flex items-center justify-center shadow-md hover:bg-rose-50 border border-rose-100 transition-colors"
                      >
                        <X
                          size={10}
                          strokeWidth={3}
                          className="md:w-3 md:h-3"
                        />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 px-2 py-1 md:px-4 md:py-2 bg-black/70 backdrop-blur-sm text-white text-[10px] md:text-sm font-bold rounded min-w-[60px] md:min-w-[80px] text-center whitespace-nowrap shadow-sm">
                    {player ? player.firstName : pos.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Panel */}
        <div className="w-full lg:w-1/3 h-[600px] lg:h-full flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
          
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("Lineup")}
              className={`flex-1 py-3 text-sm font-black text-center ${
                activeTab === "Lineup" 
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              Lineup
            </button>
            <button
              onClick={() => setActiveTab("Tactics")}
              className={`flex-1 py-3 text-sm font-black text-center ${
                activeTab === "Tactics" 
                  ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              Team Tactics
            </button>
          </div>

          {activeTab === "Lineup" ? (
            <>
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-800 text-lg">Squad Roster</h2>
              <div
                className={`text-xs font-bold px-3 py-1 rounded-full ${selectedCount === 11 ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
              >
                {selectedCount} / 11 Selected
              </div>
            </div>
            {settings?.squads?.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Squad:
                </span>
                <select
                  value={filterAge}
                  onChange={(e) => setFilterAge(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm font-bold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-full"
                >
                  <option value="All">All Squads</option>
                  {settings.squads.map((sq: string) => (
                    <option key={sq} value={sq}>
                      {sq}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {activeSlot !== null && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between animate-pulse">
                <span className="text-xs font-bold text-indigo-800">
                  Select a player for this position
                </span>
                <button
                  onClick={() => setActiveSlot(null)}
                  className="text-indigo-400 hover:text-indigo-600"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {filteredPlayers.map((player) => {
              const isAssigned = Object.values(lineup).includes(player.id);
              return (
                <button
                  key={player.id}
                  onClick={() => assignPlayer(player.id)}
                  disabled={isAssigned || activeSlot === null}
                  className={`w-full flex items-center justify-between p-3 mb-1.5 rounded-xl border transition-all text-left group ${
                    isAssigned
                      ? "bg-slate-50 border-transparent opacity-60 cursor-not-allowed"
                      : activeSlot !== null
                        ? "bg-white border-slate-200 hover:border-indigo-400 hover:shadow-sm cursor-pointer"
                        : "bg-white border-transparent cursor-default"
                  }`}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm transition-colors overflow-hidden shrink-0 ${
                        isAssigned
                          ? "bg-slate-200 text-slate-500"
                          : "bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white"
                      }`}
                    >
                      {player.avatar ? (
                        <img
                          src={player.avatar}
                          alt={player.firstName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        player.jerseyNumber || <User size={16} />
                      )}
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <div className="flex flex-col text-left">
                        <span className="text-sm font-bold text-slate-800">
                          {player.firstName} {player.lastName}
                        </span>
                        <span className="text-xs font-bold text-slate-400">
                          {player.position}
                        </span>
                      </div>
                      {isAssigned && (
                        <CheckCircle2 size={16} className="text-emerald-500" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
            </>
          ) : (
            <TeamTacticsPanel tactics={teamTactics} onChange={setTeamTactics} />
          )}
        </div>
      </div>

      {/* Modals */}
      <SaveMatchPlanModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        squads={settings?.squads || []}
        initialSquad={filterAge}
        onSaveSuccess={() => {
          alert("Match plan saved successfully!");
        }}
        planData={{
          formation,
          lineup,
          teamTactics,
          playerInstructions,
        }}
      />
      <LoadMatchPlanModal
        isOpen={loadModalOpen}
        onClose={() => setLoadModalOpen(false)}
        onLoad={(plan) => {
          if (plan.formation && FORMATIONS[plan.formation]) {
            setFormation(plan.formation);
          }
          if (plan.lineup) setLineup(plan.lineup);
          if (plan.teamTactics) setTeamTactics(plan.teamTactics);
          if (plan.playerInstructions) setPlayerInstructions(plan.playerInstructions);
          if (plan.squad) setFilterAge(plan.squad);
        }}
      />
      {selectedRoleSlot !== null && lineup[selectedRoleSlot] && (
        <PlayerRoleModal
          isOpen={roleModalOpen}
          onClose={() => setRoleModalOpen(false)}
          playerName={players.find(p => p.id === lineup[selectedRoleSlot])?.firstName || ""}
          positionLabel={currentFormation[selectedRoleSlot].label}
          initialInstruction={playerInstructions[selectedRoleSlot]}
          onSave={(instruction) => {
            setPlayerInstructions(prev => ({
              ...prev,
              [selectedRoleSlot]: instruction
            }));
          }}
        />
      )}
    </div>
  );
}
