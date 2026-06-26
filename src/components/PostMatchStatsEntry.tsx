import React, { useState } from "react";
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
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface PlayerStat {
  id: string;
  name: string;
  position: string;
  passAccuracy: string;
  shotsOnTarget: string;
  duelsWon: string;
  rating: string;
  note: string;
  showNote: boolean;
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

const INITIAL_PLAYERS: PlayerStat[] = [
  {
    id: "1",
    name: "Suphanat Mueanta",
    position: "FW",
    passAccuracy: "",
    shotsOnTarget: "",
    duelsWon: "",
    rating: "7",
    note: "",
    showNote: false,
  },
  {
    id: "2",
    name: "Supachok Sarachat",
    position: "CAM",
    passAccuracy: "",
    shotsOnTarget: "",
    duelsWon: "",
    rating: "7",
    note: "",
    showNote: false,
  },
  {
    id: "3",
    name: "Theerathon Bunmathan",
    position: "LB",
    passAccuracy: "",
    shotsOnTarget: "",
    duelsWon: "",
    rating: "7",
    note: "",
    showNote: false,
  },
  {
    id: "4",
    name: "Pansa Hemviboon",
    position: "CB",
    passAccuracy: "",
    shotsOnTarget: "",
    duelsWon: "",
    rating: "7",
    note: "",
    showNote: false,
  },
  {
    id: "5",
    name: "Nicholas Mickelson",
    position: "RB",
    passAccuracy: "",
    shotsOnTarget: "",
    duelsWon: "",
    rating: "7",
    note: "",
    showNote: false,
  },
  {
    id: "6",
    name: "Chanathip Songkrasin",
    position: "CM",
    passAccuracy: "",
    shotsOnTarget: "",
    duelsWon: "",
    rating: "7",
    note: "",
    showNote: false,
  },
  {
    id: "7",
    name: "Teerasil Dangda",
    position: "ST",
    passAccuracy: "",
    shotsOnTarget: "",
    duelsWon: "",
    rating: "7",
    note: "",
    showNote: false,
  },
];

const TARGETS = {
  passAccuracy: 80, // Target %
  shotsOnTarget: 1, // Target count
  duelsWon: 50, // Target %
};

export default function PostMatchStatsEntry({
  onBack,
}: {
  onBack: () => void;
}) {
  const { hasPermission } = useAuth();
  const isCoachOrAdmin = hasPermission(["COACH", "ADMIN", "SUPERADMIN"]);
  const [teamStats, setTeamStats] = useState({
    possession: "",
    totalShots: "",
    corners: "",
    fouls: "",
  });

  const [players, setPlayers] = useState<PlayerStat[]>(INITIAL_PLAYERS);
  const [coachAwards, setCoachAwards] = useState<CoachAward[]>([]);
  const [selectedPlayerForAward, setSelectedPlayerForAward] = useState("");
  const [selectedBadgeForAward, setSelectedBadgeForAward] = useState("");

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

  const handlePlayerChange = (
    id: string,
    field: keyof PlayerStat,
    value: string | boolean,
  ) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  const toggleNote = (id: string) => {
    setPlayers((prev) =>
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

  return (
    <div className="w-full max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors mb-3"
          >
            <ChevronLeft size={16} /> Back to Dashboard
          </button>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-md">
              Official Match
            </span>
            <span className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
              <Calendar size={14} /> Oct 24, 2026
            </span>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            U17 <span className="text-slate-400">vs</span> Academy FC
          </h1>
        </div>
        <div className="flex items-center gap-4 bg-slate-900 p-4 rounded-2xl shrink-0">
          <div className="text-center px-4 border-r border-slate-700">
            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
              Our Score
            </div>
            <div className="text-3xl font-black text-emerald-400">3</div>
          </div>
          <div className="text-center px-4">
            <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
              Opponent
            </div>
            <div className="text-3xl font-black text-rose-400">1</div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Team Stats */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
            <Trophy className="text-indigo-500" size={24} />
            <h2 className="text-lg font-black text-slate-800">
              Team Statistics
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Possession (%)
              </label>
              <input
                type="number"
                value={teamStats.possession}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, possession: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Total Shots
              </label>
              <input
                type="number"
                value={teamStats.totalShots}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, totalShots: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Corners
              </label>
              <input
                type="number"
                value={teamStats.corners}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, corners: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                Fouls
              </label>
              <input
                type="number"
                value={teamStats.fouls}
                onChange={(e) =>
                  setTeamStats({ ...teamStats, fouls: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Player Stats */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-emerald-500" size={24} />
              <h2 className="text-lg font-black text-slate-800">
                Player Performance Grid
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>{" "}
                Target Met
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-400"></div> Below
                Target
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 w-1/4">
                    Player
                  </th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                    Passing (%)
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">
                      Target: {TARGETS.passAccuracy}%
                    </span>
                  </th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                    Shots on Target
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">
                      Target: {TARGETS.shotsOnTarget}
                    </span>
                  </th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                    Duels Won (%)
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">
                      Target: {TARGETS.duelsWon}%
                    </span>
                  </th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                    Rating
                  </th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 text-center">
                    IDP Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {players.map((player) => (
                  <React.Fragment key={player.id}>
                    <tr className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-sm">
                          {player.name}
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                          {player.position}
                        </div>
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          tabIndex={1}
                          value={player.passAccuracy}
                          onChange={(e) =>
                            handlePlayerChange(
                              player.id,
                              "passAccuracy",
                              e.target.value,
                            )
                          }
                          className={`w-20 px-3 py-2 rounded-lg border text-base font-bold focus:outline-none focus:ring-2 transition-colors ${getEvaluationColor(player.passAccuracy, TARGETS.passAccuracy)}`}
                          placeholder="-"
                        />
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          tabIndex={2}
                          value={player.shotsOnTarget}
                          onChange={(e) =>
                            handlePlayerChange(
                              player.id,
                              "shotsOnTarget",
                              e.target.value,
                            )
                          }
                          className={`w-20 px-3 py-2 rounded-lg border text-base font-bold focus:outline-none focus:ring-2 transition-colors ${getEvaluationColor(player.shotsOnTarget, TARGETS.shotsOnTarget)}`}
                          placeholder="-"
                        />
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          tabIndex={3}
                          value={player.duelsWon}
                          onChange={(e) =>
                            handlePlayerChange(
                              player.id,
                              "duelsWon",
                              e.target.value,
                            )
                          }
                          className={`w-20 px-3 py-2 rounded-lg border text-base font-bold focus:outline-none focus:ring-2 transition-colors ${getEvaluationColor(player.duelsWon, TARGETS.duelsWon)}`}
                          placeholder="-"
                        />
                      </td>
                      <td className="p-4">
                        <div className="relative">
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
                            className="w-[80px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
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
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => toggleNote(player.id)}
                          className={`p-2 rounded-lg transition-colors ${player.showNote || player.note ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"}`}
                          title="Add IDP Note"
                        >
                          <MessageSquare size={18} />
                        </button>
                      </td>
                    </tr>
                    {player.showNote && (
                      <tr className="bg-indigo-50/30">
                        <td
                          colSpan={6}
                          className="px-4 py-3 border-t border-indigo-100"
                        >
                          <div className="flex gap-3">
                            <div className="mt-2.5 text-indigo-400">
                              <MessageSquare size={16} />
                            </div>
                            <div className="flex-1">
                              <label className="block text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-1">
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
                                className="w-full bg-white border border-indigo-200 rounded-lg px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors"
                                placeholder="e.g., Needs to improve positioning during defensive transitions..."
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                onClick={() => toggleNote(player.id)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-all shadow-sm"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Coach's Awards */}
        {isCoachOrAdmin && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <Award className="text-yellow-500" size={24} />
              <h2 className="text-lg font-black text-slate-800">
                Coach's Awards
              </h2>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Select Player
                </label>
                <select
                  value={selectedPlayerForAward}
                  onChange={(e) => setSelectedPlayerForAward(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Select Badge
                </label>
                <select
                  value={selectedBadgeForAward}
                  onChange={(e) => setSelectedBadgeForAward(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                  className="w-full md:w-auto px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors shadow-sm"
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
              <div className="text-center p-6 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                <p className="text-sm text-slate-500 font-medium">
                  No awards assigned yet.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-4 pb-12">
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-black text-sm transition-all shadow-lg shadow-indigo-900/20 group">
            <CheckCircle2
              size={20}
              className="group-hover:scale-110 transition-transform"
            />
            SAVE MATCH REPORT
          </button>
        </div>
      </div>
    </div>
  );
}
