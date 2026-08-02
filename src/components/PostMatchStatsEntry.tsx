import React, { useState, useEffect, useMemo } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import {
  Save,
  MessageSquare,
  Calendar,
  Trophy,
  ChevronLeft,
  CheckCircle2,
  TrendingUp,
  ChevronDown,
  Award,
  Star,
  Zap,
  Shield,
  X,
  Users,
  Upload,
  Edit2,
  Trash2,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, addDoc, where, documentId, getDocs } from "firebase/firestore";
import { getTournaments, getTournamentSquad } from "../lib/tournamentApi";
import { Tournament } from "../types/Tournament";
import { EmptyState } from "./common/EmptyState";
import { useAcademy } from "../contexts/AcademyContext";
import CoachObservationSummary from "../modules/parent-observation/components/CoachObservationSummary";
import { ResponsiveDataTable, Column } from "./common/ResponsiveDataTable";
import { AddGuestPlayerModal } from "./AddGuestPlayerModal";

interface PlayerStat {
  id: string;
  name: string;
  position: string;
  metrics: Record<string, string>;
  rating: string;
  note: string;
  showNote: boolean;
  isGuest?: boolean;
  originalAgeGroup?: string;
}

interface CustomMetric {
  id: string;
  name: string;
  target: string;
}

interface CoachAward {
  id: string;
  playerId: string;
  badgeId: string;
}

const BADGES = [
  {
    id: "coach_mvp",
    name: "Coach's MVP",
    icon: Star,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
  },
  {
    id: "tactical_master",
    name: "Tactical Master",
    icon: Trophy,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
  },
  {
    id: "defensive_wall",
    name: "Defensive Wall",
    icon: Shield,
    color: "text-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  {
    id: "game_changer",
    name: "Game Changer",
    icon: Zap,
    color: "text-rose-500",
    bg: "bg-rose-50",
    border: "border-rose-200",
  },
];

const DEFAULT_METRICS: CustomMetric[] = [
  { id: "passAccuracy", name: "Passing (%)", target: "80" },
  { id: "shotsOnTarget", name: "Shots on Target", target: "1" },
  { id: "duelsWon", name: "Duels Won (%)", target: "50" },
];

export default function PostMatchStatsEntry({
  onBack,
  matchId,
}: {
  onBack: () => void;
  matchId?: string;
}) {
  const { hasPermission } = useAuth();
  const { settings, updateSettings, getAcademyCollection, activeSeason } = useAcademy();
  const isCoachOrAdmin = hasPermission(["COACH", "ADMIN", "SUPERADMIN"]);
  
  const [matchDetails, setMatchDetails] = useState({
    opponentName: "Academy FC",
    opponentLogo: "",
    ourScore: "0",
    opponentScore: "0",
    ageGroup: settings?.squads?.[0] || "U17",
    matchDate: new Date().toISOString().split("T")[0],
    matchType: "OFFICIAL MATCH",
    tournamentId: "",
    tournament: "",
  });

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const { academyId } = useAcademy();

  useEffect(() => {
    if (academyId) {
      getTournaments(academyId).then(setTournaments).catch(console.error);
    }
  }, [academyId]);

  const [teamStats, setTeamStats] = useState({
    possession: "",
    totalShots: "",
    corners: "",
    fouls: "",
  });

  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachAwards, setCoachAwards] = useState<CoachAward[]>([]);
  const [selectedPlayerForAward, setSelectedPlayerForAward] = useState("");
  const [selectedBadgeForAward, setSelectedBadgeForAward] = useState("");
  const customMetrics = settings?.performanceMetrics || DEFAULT_METRICS;
  const [isAddingMetric, setIsAddingMetric] = useState(false);
  const [editingMetric, setEditingMetric] = useState<CustomMetric | null>(null);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricTarget, setNewMetricTarget] = useState("");
  const [guestPlayers, setGuestPlayers] = useState<PlayerStat[]>([]);
  const [isAddGuestModalOpen, setIsAddGuestModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!matchDetails.ageGroup) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const fetchPlayers = async () => {
      let validPlayerIds: string[] | null = null;
      if (matchDetails.tournamentId && academyId) {
        try {
          const squad = await getTournamentSquad(academyId, matchDetails.tournamentId);
          if (squad) {
            validPlayerIds = squad.playerIds;
          } else {
            validPlayerIds = [];
          }
        } catch (e) {
          console.error(e);
          validPlayerIds = [];
        }
      }

      const playersRef = getAcademyCollection("players");
      const q = query(playersRef);
      // We still use onSnapshot for realtime updates of player profiles, but filter locally.
      // With a normal academy size (e.g. <200 players), local filtering is efficient.
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedPlayers = snapshot.docs
          .map(doc => {
            const data = doc.data();
            const pSquad = data.seasonHistory?.[activeSeason]?.squad || data.ageGroup;
            const pActive = data.seasonHistory?.[activeSeason]?.active ?? (data.status === "ACTIVE");
            return {
              id: doc.id,
              ...data,
              activeSquad: pSquad,
              isActive: pActive
            };
          })
          .filter((p: any) => {
            if (validPlayerIds !== null) {
              // Tournament overrides Age Group
              return validPlayerIds.includes(p.id) && p.isActive;
            } else {
              // Legacy Logic
              return p.activeSquad === matchDetails.ageGroup && p.isActive;
            }
          })
          .map((p: any) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          position: p.position || "",
          metrics: {},
          rating: "7",
          note: "",
          showNote: false,
        }));
        setPlayers(fetchedPlayers);
        setLoading(false);
      });

      return unsubscribe;
    };

    const unsubPromise = fetchPlayers();
    return () => {
      unsubPromise.then(unsub => unsub && unsub());
    };
  }, [matchDetails.ageGroup, matchDetails.tournamentId, getAcademyCollection, activeSeason, academyId]);

  const handleMatchDetailsChange = (field: string, value: string) => {
    setMatchDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleMatchDetailsChange("opponentLogo", reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAssignAward = () => {
    if (!selectedPlayerForAward || !selectedBadgeForAward) return;
    const newAward: CoachAward = {
      id: Math.random().toString(36).substr(2, 9),
      playerId: selectedPlayerForAward,
      badgeId: selectedBadgeForAward,
    };
    setCoachAwards((prev) => [...prev, newAward]);
    setSelectedPlayerForAward("");
    setSelectedBadgeForAward("");
  };

  const handleRemoveAward = (id: string) => {
    setCoachAwards((prev) => prev.filter((a) => a.id !== id));
  };

  const handleRemovePlayer = (id: string, isGuest: boolean) => {
    if (isGuest) {
      setGuestPlayers(prev => prev.filter(p => p.id !== id));
    } else {
      setPlayers(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleSaveMatchReport = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Convert players and guestPlayers arrays into the new playersData map
      const playersData: Record<string, any> = {};
      const playerIds: string[] = [];
      const guestPlayerIds: string[] = [];

      players.forEach(p => {
        playerIds.push(p.id);
        playersData[p.id] = {
          playerId: p.id,
          isGuest: false,
          starter: true, // Default to true, can be updated via UI later
          position: p.position,
          availability: "AVAILABLE",
          minutesPlayed: parseInt(p.metrics?.minutes || "0") || 90,
          goals: parseInt(p.metrics?.goals || "0") || 0,
          assists: parseInt(p.metrics?.assists || "0") || 0,
          yellowCards: 0,
          redCards: 0,
          saves: 0,
          shots: parseInt(p.metrics?.shotsOnTarget || "0") || 0,
          shotsOnTarget: parseInt(p.metrics?.shotsOnTarget || "0") || 0,
          passes: 0,
          passAccuracy: parseInt(p.metrics?.passAccuracy || "0") || 0,
          dribbles: 0,
          crosses: 0,
          tackles: 0,
          interceptions: 0,
          clearances: 0,
          blocks: 0,
          rating: parseFloat(p.rating) || 7,
          playerVisibleNote: p.note || "",
          privateCoachNote: "",
          parentVisibleNote: "",
          trainingRecommendation: "",
          evaluationCompleted: true
        };
      });

      guestPlayers.forEach(p => {
        guestPlayerIds.push(p.id);
        playersData[p.id] = {
          playerId: p.id,
          isGuest: true,
          originalAgeGroup: p.originalAgeGroup || "Unknown",
          starter: false, // Guests usually start on bench
          position: p.position,
          availability: "AVAILABLE",
          minutesPlayed: parseInt(p.metrics?.minutes || "0") || 45,
          goals: parseInt(p.metrics?.goals || "0") || 0,
          assists: parseInt(p.metrics?.assists || "0") || 0,
          yellowCards: 0,
          redCards: 0,
          saves: 0,
          shots: parseInt(p.metrics?.shotsOnTarget || "0") || 0,
          shotsOnTarget: parseInt(p.metrics?.shotsOnTarget || "0") || 0,
          passes: 0,
          passAccuracy: parseInt(p.metrics?.passAccuracy || "0") || 0,
          dribbles: 0,
          crosses: 0,
          tackles: 0,
          interceptions: 0,
          clearances: 0,
          blocks: 0,
          rating: parseFloat(p.rating) || 7,
          playerVisibleNote: p.note || "",
          privateCoachNote: "",
          parentVisibleNote: "",
          trainingRecommendation: "",
          evaluationCompleted: true
        };
      });

      const matchData = {
        ...matchDetails,
        competitionType: "LEAGUE", // Default for now
        status: "COMPLETED",
        teamStats,
        playerIds,
        guestPlayerIds,
        matchSquad: {
          startingPlayers: playerIds,
          benchPlayers: guestPlayerIds,
          guestPlayers: guestPlayerIds,
          unavailablePlayers: []
        },
        playersData,
        coachAwards,
        createdAt: new Date().toISOString(),
      };
      
      const matchesRef = getAcademyCollection("matches");
      await addDoc(matchesRef, matchData);
      
      onBack();
    } catch (err) {
      console.error("Error saving match report:", err);
      alert("Failed to save match report. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlayerChange = (
    id: string,
    field: keyof PlayerStat,
    value: string | boolean,
  ) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
    setGuestPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  const handleMetricChange = (playerId: string, metricId: string, value: string) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, metrics: { ...p.metrics, [metricId]: value } }
          : p
      )
    );
    setGuestPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, metrics: { ...p.metrics, [metricId]: value } }
          : p
      )
    );
  };

  const handleAddMetric = async () => {
    if (!newMetricName) return;
    const newId = newMetricName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const newMetrics = [
      ...customMetrics,
      { id: newId, name: newMetricName, target: newMetricTarget || "0" }
    ];
    await updateSettings({ performanceMetrics: newMetrics });
    setIsAddingMetric(false);
    setNewMetricName("");
    setNewMetricTarget("");
  };

  const handleUpdateMetric = async () => {
    if (!editingMetric) return;
    const newMetrics = customMetrics.map((m) =>
      m.id === editingMetric.id ? editingMetric : m
    );
    await updateSettings({ performanceMetrics: newMetrics });
    setEditingMetric(null);
  };

  const handleDeleteMetric = async (metricId: string) => {
    if (window.confirm("คุณต้องการลบหัวข้อนี้ใช่หรือไม่?")) {
      const newMetrics = customMetrics.filter((m) => m.id !== metricId);
      await updateSettings({ performanceMetrics: newMetrics });
    }
  };

  const toggleNote = (id: string) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, showNote: !p.showNote } : p)),
    );
    setGuestPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, showNote: !p.showNote } : p)),
    );
  };

  const getEvaluationColor = (value: string, target: number) => {
    if (value === "") return "bg-slate-50 border-slate-200 text-slate-800";
    const num = parseFloat(value);
    if (isNaN(num)) return "bg-slate-50 border-slate-200 text-slate-800";
    return num >= target
      ? "bg-emerald-50 border-emerald-300 text-emerald-800 focus:ring-emerald-500"
      : "bg-rose-50 border-rose-300 text-rose-800 focus:ring-rose-500";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const allPlayers = [...players, ...guestPlayers];

  if (allPlayers.length === 0) {
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
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Trophy className="text-amber-500" /> Post-Match Entry
            </h1>
          </div>
        </div>
        <EmptyState
          icon={Users}
          title="No Players Found"
          description="You need to add players to your academy before you can log post-match stats."
          primaryActionLabel="Go Back"
          onPrimaryAction={onBack}
        />
        
        <div className="mt-8 flex justify-center">
          <button 
            onClick={() => setIsAddGuestModalOpen(true)}
            className="text-sm font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors border border-transparent dark:border-indigo-500/30 cursor-pointer flex items-center gap-1.5"
          >
            + Add Guest Player
          </button>
        </div>
        
        <AddGuestPlayerModal 
          isOpen={isAddGuestModalOpen} 
          onClose={() => setIsAddGuestModalOpen(false)}
          currentAgeGroup={matchDetails.ageGroup}
          onAddGuest={(player) => {
            if (!guestPlayers.some(p => p.id === player.id) && !players.some(p => p.id === player.id)) {
              setGuestPlayers(prev => [...prev, {
                id: player.id,
                name: `${player.firstName} ${player.lastName}`,
                position: player.position || "",
                metrics: {},
                rating: "7",
                note: "",
                showNote: false,
                isGuest: true,
                originalAgeGroup: player.activeSquad
              }]);
            }
          }}
        />
      </div>
    );
  }

  const tableColumns: Column<any>[] = [
    {
      key: "player",
      header: "Player",
      sticky: true,
      className: "min-w-[200px] w-1/4",
      render: (player) => (
        <>
          <div className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
            {player.name}
          </div>
          <div className="text-xs font-medium flex items-center gap-2 mt-0.5">
            <span className="text-slate-400 dark:text-slate-500">{player.position || "-"}</span>
            {player.isGuest && (
              <>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                  Guest • {player.originalAgeGroup}
                </span>
              </>
            )}
          </div>
        </>
      )
    },
    ...customMetrics.map((metric, idx) => ({
      key: metric.id,
      header: (
        <div className="flex items-start justify-between group relative">
          <div>{metric.name}</div>
          <div className="hidden group-hover:flex items-center gap-1.5 ml-2 absolute right-0 top-0 bg-slate-50 dark:bg-slate-800/90 pl-2">
            <button 
              onClick={() => setEditingMetric(metric)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
              title="Edit Metric"
            >
              <Edit2 size={12} />
            </button>
            <button 
              onClick={() => handleDeleteMetric(metric.id)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
              title="Delete Metric"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      ),
      className: "align-top",
      render: (player: any) => (
        <input
          type="number"
          tabIndex={idx + 1}
          value={player.metrics[metric.id] || ""}
          onChange={(e) =>
            handleMetricChange(
              player.id,
              metric.id,
              e.target.value,
            )
          }
          className={`w-20 px-3 py-2 mt-1 rounded-lg border text-base font-bold text-center focus:outline-none focus:ring-2 transition-colors dark:bg-slate-900/50 dark:border-slate-700/50 dark:text-slate-200 ${getEvaluationColor(player.metrics[metric.id] || "", parseFloat(metric.target))}`}
          placeholder="-"
        />
      )
    })),
    {
      key: "rating",
      header: "Rating",
      render: (player) => (
        <div className="relative w-[80px]">
          <select
            tabIndex={4}
            value={player.rating}
            onChange={(e) =>
              handlePlayerChange(
                player.id,
                "rating",
                e.target.value,
              )
            }
            className="w-[80px] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-lg px-3 py-2 text-base font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50 appearance-none cursor-pointer"
          >
            {[...Array(10)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            size={14}
          />
        </div>
      )
    },
    {
      key: "idp_note",
      header: <div className="text-center">IDP Note</div>,
      className: "text-center",
      render: (player) => (
        <button
          onClick={() => toggleNote(player.id)}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${player.showNote || player.note ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300"}`}
          title="Add IDP Note"
        >
          <MessageSquare size={18} />
        </button>
      )
    },
    {
      key: "actions",
      header: "",
      className: "w-12 text-center",
      render: (player) => (
        <button 
          onClick={() => handleRemovePlayer(player.id, !!player.isGuest)}
          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors cursor-pointer"
          title="Remove player"
        >
          <Trash2 size={16} />
        </button>
      )
    }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-3 cursor-pointer"
          >
            <ChevronLeft size={16} /> Back to Dashboard
          </button>
          <div className="flex items-center gap-2 mb-2">
            <div className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-md focus-within:ring-2 focus-within:ring-amber-400">
              <input 
                type="text" 
                value={matchDetails.matchType} 
                onChange={(e) => handleMatchDetailsChange("matchType", e.target.value)}
                className="bg-transparent border-none outline-none text-amber-700 dark:text-amber-400 font-black p-0 uppercase tracking-widest w-32"
              />
            </div>
            <div className="text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 focus-within:text-indigo-600 dark:focus-within:text-indigo-400 transition-colors">
              <Calendar size={14} /> 
              <ThaiDatePicker 
                value={matchDetails.matchDate}
                onChange={(e) => handleMatchDetailsChange("matchDate", e.target.value)}
                className="bg-transparent border-none outline-none font-bold p-0 text-slate-600 dark:text-slate-300 cursor-pointer"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={matchDetails.tournamentId || ""}
              onChange={(e) => {
                const selectedId = e.target.value;
                const t = tournaments.find(x => x.id === selectedId);
                setMatchDetails(prev => ({ ...prev, tournamentId: selectedId, tournament: t ? t.name : "" }));
              }}
              className="text-lg font-black text-slate-800 dark:text-slate-200 tracking-tight bg-transparent border-none outline-none hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer focus:ring-2 focus:ring-indigo-500 py-1"
            >
              <option value="">-- No Tournament --</option>
              {tournaments.filter(t => t.status !== "ARCHIVED").map(t => (
                <option key={t.id} value={t.id} className="text-base font-medium">{t.name}</option>
              ))}
            </select>
            
            <select
              value={matchDetails.ageGroup}
              onChange={(e) => handleMatchDetailsChange("ageGroup", e.target.value)}
              disabled={!!matchDetails.tournamentId}
              className={`text-3xl font-black text-slate-800 dark:text-slate-200 tracking-tight bg-transparent border-none outline-none hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer focus:ring-2 focus:ring-indigo-500 py-1 ${matchDetails.tournamentId ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {(settings?.squads && settings.squads.length > 0) ? (
                settings.squads.map(squad => (
                  <option key={squad} value={squad} className="text-base font-medium">{squad}</option>
                ))
              ) : (
                <option value="U11" className="text-base font-medium">U11</option>
              )}
            </select>
            <span className="text-3xl font-black text-slate-400 dark:text-slate-600">vs</span> 
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 px-3 py-1.5 rounded-xl shadow-sm focus-within:border-indigo-500 dark:focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200 transition-all backdrop-blur-sm">
              <div className="relative group cursor-pointer w-8 h-8 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                {matchDetails.opponentLogo ? (
                  <img src={matchDetails.opponentLogo} alt="Opponent Logo" className="w-full h-full object-cover" />
                ) : (
                  <Shield size={16} className="text-slate-400 dark:text-slate-500" />
                )}
                <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center transition-all">
                  <Upload size={12} className="text-white" />
                </div>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
              <input 
                type="text" 
                value={matchDetails.opponentName}
                onChange={(e) => handleMatchDetailsChange("opponentName", e.target.value)}
                className="text-2xl font-black text-slate-800 dark:text-slate-200 bg-transparent border-none outline-none p-0 w-48 sm:w-64 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                placeholder="Opponent Name"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-slate-900 dark:bg-black/40 p-4 rounded-2xl shrink-0 shadow-lg border border-slate-800 dark:border-slate-700/50 backdrop-blur-md">
          <div className="text-center px-4 border-r border-slate-700 dark:border-slate-800">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">
              Our Score
            </div>
            <input 
              type="number" 
              value={matchDetails.ourScore}
              onChange={(e) => handleMatchDetailsChange("ourScore", e.target.value)}
              className="text-4xl font-black text-emerald-400 bg-transparent border-none outline-none w-16 text-center focus:ring-2 focus:ring-emerald-500/50 rounded-lg p-0"
              min="0"
            />
          </div>
          <div className="text-center px-4">
            <div className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">
              Opponent
            </div>
            <input 
              type="number" 
              value={matchDetails.opponentScore}
              onChange={(e) => handleMatchDetailsChange("opponentScore", e.target.value)}
              className="text-4xl font-black text-rose-400 bg-transparent border-none outline-none w-16 text-center focus:ring-2 focus:ring-rose-500/50 rounded-lg p-0"
              min="0"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Team Stats */}
        <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-700/50 pb-4">
            <Trophy className="text-indigo-500 dark:text-indigo-400" size={24} />
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">
              Team Statistics
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Possession (%)
              </label>
              <input
                type="number"
                value={teamStats.possession}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, possession: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-lg font-black text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50 transition-colors"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Total Shots
              </label>
              <input
                type="number"
                value={teamStats.totalShots}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, totalShots: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-lg font-black text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50 transition-colors"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Corners
              </label>
              <input
                type="number"
                value={teamStats.corners}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, corners: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-lg font-black text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50 transition-colors"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Fouls
              </label>
              <input
                type="number"
                value={teamStats.fouls}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, fouls: e.target.value })
                }
                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-lg font-black text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50 transition-colors"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Player Stats */}
        <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-emerald-500 dark:text-emerald-400" size={24} />
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">
                Player Performance Grid
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <button 
                onClick={() => setIsAddGuestModalOpen(true)}
                className="text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors border border-transparent dark:border-indigo-500/30 cursor-pointer flex items-center gap-1.5"
              >
                + Add Player to Match
              </button>
              <button 
                onClick={() => setIsAddingMetric(true)}
                className="text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors border border-transparent dark:border-indigo-500/30 cursor-pointer"
              >
                + Add Metric
              </button>
              <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 dark:bg-emerald-500"></div>{" "}
                  Target Met
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-400 dark:bg-rose-500"></div> Below
                  Target
                </span>
              </div>
            </div>
          </div>
          
          {isAddingMetric && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-500/20 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-1">Metric Name</label>
                <input 
                  type="text" 
                  value={newMetricName} 
                  onChange={e => setNewMetricName(e.target.value)} 
                  className="w-48 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/50 border border-indigo-200 dark:border-indigo-500/30 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder="e.g. Tackles Won"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-widest mb-1">Target Value</label>
                <input 
                  type="text" 
                  value={newMetricTarget} 
                  onChange={e => setNewMetricTarget(e.target.value)} 
                  className="w-32 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/50 border border-indigo-200 dark:border-indigo-500/30 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  placeholder="e.g. 5"
                />
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleAddMetric}
                  className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg text-sm font-bold transition-all shadow-sm cursor-pointer"
                >
                  Add
                </button>
                <button 
                  onClick={() => setIsAddingMetric(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-all shadow-sm cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editingMetric && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-500/20 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-widest mb-1">Edit Metric Name</label>
                <input 
                  type="text" 
                  value={editingMetric.name} 
                  onChange={e => setEditingMetric({...editingMetric, name: e.target.value})} 
                  className="w-48 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/50 border border-amber-200 dark:border-amber-500/30 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-widest mb-1">Target Value</label>
                <input 
                  type="text" 
                  value={editingMetric.target} 
                  onChange={e => setEditingMetric({...editingMetric, target: e.target.value})} 
                  className="w-32 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/50 border border-amber-200 dark:border-amber-500/30 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-500/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleUpdateMetric}
                  className="px-4 py-2 bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-700 text-white rounded-lg text-sm font-bold transition-all shadow-sm cursor-pointer"
                >
                  Save
                </button>
                <button 
                  onClick={() => setEditingMetric(null)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold transition-all shadow-sm cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ResponsiveDataTable 
            columns={tableColumns}
            data={allPlayers}
            keyExtractor={(p) => p.id}
            isExpanded={(p) => !!p.showNote}
            renderExpandedRow={(player) => (
              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="mt-2.5 text-indigo-400">
                    <MessageSquare size={16} />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider mb-1">
                      Development Note (Syncs to IDP)
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={player.note}
                      onChange={(e) =>
                        handlePlayerChange(
                          player.id,
                          "note",
                          e.target.value,
                        )
                      }
                      className="w-full bg-white dark:bg-slate-900/50 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50 focus:border-indigo-400 dark:focus:border-indigo-400 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="e.g., Needs to improve positioning during defensive transitions..."
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => toggleNote(player.id)}
                      className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white rounded-lg text-sm font-bold transition-all shadow-sm cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
                
                <div className="mt-4">
                  <CoachObservationSummary matchId={matchId || "match_1"} playerId={player.id} />
                </div>
              </div>
            )}
          />
        </div>

        {/* Section 3: Coach's Awards */}
        {isCoachOrAdmin && (
          <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-700/50 pb-4">
              <Award className="text-yellow-500 dark:text-yellow-400" size={24} />
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">
                Coach's Awards
              </h2>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                  Select Player
                </label>
                <select
                  value={selectedPlayerForAward}
                  onChange={(e) => setSelectedPlayerForAward(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50"
                >
                  <option value="">-- Choose a player --</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                  Select Badge
                </label>
                <select
                  value={selectedBadgeForAward}
                  onChange={(e) => setSelectedBadgeForAward(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-500/50"
                >
                  <option value="">-- Choose an award --</option>
                  {BADGES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAssignAward}
                  disabled={!selectedPlayerForAward || !selectedBadgeForAward}
                  className="w-full md:w-auto px-6 py-3 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-bold transition-colors shadow-sm cursor-pointer disabled:cursor-not-allowed"
                >
                  Assign Award
                </button>
              </div>
            </div>

            {coachAwards.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coachAwards.map((award) => {
                  const player = players.find((p) => p.id === award.playerId);
                  const badge = BADGES.find((b) => b.id === award.badgeId);
                  if (!player || !badge) return null;
                  return (
                    <div
                      key={award.id}
                      className={`flex items-center justify-between p-4 rounded-xl border ${badge.border} ${badge.bg}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 ${badge.color} shadow-sm`}
                        >
                          <badge.icon size={20} />
                        </div>
                        <div>
                          <div
                            className={`text-xs font-bold ${badge.color} uppercase tracking-wider`}
                          >
                            {badge.name}
                          </div>
                          <div className="text-sm font-black text-slate-800">
                            {player.name}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAward(award.id)}
                        className="p-1.5 rounded-full text-slate-400 hover:text-rose-500 hover:bg-white/50 transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center p-6 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700/50 border-dashed">
                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  No awards assigned yet.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-4 pb-12">
          <button 
            onClick={handleSaveMatchReport}
            disabled={isSaving}
            className={`flex items-center gap-2 text-white px-8 py-4 rounded-xl font-black text-sm transition-all shadow-lg shadow-indigo-900/20 dark:shadow-indigo-900/40 group ${isSaving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 cursor-pointer'}`}
          >
            {isSaving ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <CheckCircle2
                size={20}
                className="group-hover:scale-110 transition-transform"
              />
            )}
            {isSaving ? "SAVING..." : "SAVE MATCH REPORT"}
          </button>
        </div>
      </div>
      
      <AddGuestPlayerModal 
        isOpen={isAddGuestModalOpen} 
        onClose={() => setIsAddGuestModalOpen(false)}
        currentAgeGroup={matchDetails.ageGroup}
        onAddGuest={(player) => {
          if (!guestPlayers.some(p => p.id === player.id) && !players.some(p => p.id === player.id)) {
            setGuestPlayers(prev => [...prev, {
              id: player.id,
              name: `${player.firstName} ${player.lastName}`,
              position: player.position || "",
              metrics: {},
              rating: "7",
              note: "",
              showNote: false,
              isGuest: true,
              originalAgeGroup: player.activeSquad
            }]);
          }
        }}
      />
    </div>
  );
}
