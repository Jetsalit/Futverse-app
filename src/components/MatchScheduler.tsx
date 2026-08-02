import React, { useState, useEffect, useMemo } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import { ChevronLeft, Plus, Calendar, MapPin, Edit2, Trash2 } from "lucide-react";
import { Match } from "../types/Match";
import { getMatches, addMatch, updateMatch, deleteMatch } from "../lib/matchApi";
import { getTournaments } from "../lib/tournamentApi";
import { Tournament } from "../types/Tournament";
import { useAcademy } from "../contexts/AcademyContext";
import { useAuth } from "../contexts/AuthContext";

export default function MatchScheduler({ onBack, onEvaluate }: { onBack: () => void, onEvaluate?: (match: Match) => void }) {
  const { academyId, settings } = useAcademy();
  const { currentUser, hasPermission } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const defaultForm: Partial<Match> = {
    opponent: "",
    matchDate: new Date().toISOString().split('T')[0],
    kickoff: "16:00",
    competitionType: "LEAGUE",
    competition: "",
    tournamentId: "",
    tournament: "",
    venue: "",
    location: "HOME",
    status: "SCHEDULED",
    ageGroup: (settings?.squads && settings.squads.length > 0) ? settings.squads[0] : "U11",
    gender: "Boys",
    season: settings?.currentSeason || "2026",
    ourScore: 0,
    opponentScore: 0,
    playerIds: [],
    guestPlayerIds: [],
    matchSquad: {
      startingPlayers: [],
      benchPlayers: [],
      guestPlayers: [],
      unavailablePlayers: [],
    },
    playersData: {}
  };

  const [formData, setFormData] = useState<Partial<Match>>(defaultForm);

  useEffect(() => {
    fetchMatches();
    if (academyId) {
      getTournaments(academyId).then(setTournaments).catch(console.error);
    }
  }, [academyId]);

  const fetchMatches = async () => {
    if (!academyId) return;
    setIsLoading(true);
    try {
      const data = await getMatches(academyId);
      // In-memory sort by matchDate descending
      data.sort((a, b) => new Date(b.matchDate || "1970-01-01").getTime() - new Date(a.matchDate || "1970-01-01").getTime());
      setMatches(data);
    } catch (err) {
      console.error("Error fetching matches", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!academyId) return;

    try {
      if (editingId) {
        await updateMatch(academyId, editingId, formData);
      } else {
        await addMatch(academyId, {
          ...formData,
          coachId: currentUser?.uid || "unknown"
        } as Omit<Match, "id" | "createdAt" | "updatedAt">);
      }
      setIsModalOpen(false);
      fetchMatches();
    } catch (err) {
      console.error("Error saving match", err);
    }
  };

  const handleEdit = (match: Match) => {
    setFormData({ ...match });
    setEditingId(match.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!academyId) return;
    if (confirm("คุณต้องการลบแมตช์นี้ใช่หรือไม่?")) {
      try {
        await deleteMatch(academyId, id);
        fetchMatches();
      } catch (err) {
        console.error("Error deleting match", err);
      }
    }
  };

  const openNewModal = () => {
    setFormData({ ...defaultForm, ageGroup: (settings?.squads && settings.squads.length > 0) ? settings.squads[0] : "U11" });
    setEditingId(null);
    setIsModalOpen(true);
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-10 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors mb-2"
          >
            <ChevronLeft size={16} className="mr-1" /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Calendar className="text-indigo-600 dark:text-indigo-400" />
            Match Scheduler
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage upcoming fixtures and record results
          </p>
        </div>
        {(hasPermission(["COACH", "ADMIN", "SUPERADMIN"])) && (
          <button 
            onClick={openNewModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-95"
          >
            <Plus size={18} /> Schedule Match
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">Loading matches...</div>
        ) : matches.length === 0 ? (
          <div className="p-10 text-center">
            <div className="bg-slate-50 dark:bg-slate-700/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar size={24} className="text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No Matches Scheduled</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Click "Schedule Match" to add your first fixture.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Match</th>
                  <th className="px-6 py-4">Squad</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 text-sm">
                {matches.map(match => (
                  <tr key={match.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => onEvaluate && onEvaluate(match)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-bold text-slate-800 dark:text-slate-200">{match.matchDate || match.date}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar size={12} /> {match.kickoff || match.time || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">vs</span>
                        {match.opponent}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                        <MapPin size={12} /> {match.location} - {match.venue || "TBD"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                        {match.ageGroup || match.squadId}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        {match.competitionType || match.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                        match.status === "COMPLETED" 
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : match.status === "CANCELLED"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}>
                        {match.status || "SCHEDULED"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {(hasPermission(["COACH", "ADMIN", "SUPERADMIN"])) && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(match); }}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-2 transition-colors"
                            title="Edit Details"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(match.id); }}
                            className="text-slate-400 hover:text-red-500 p-2 transition-colors ml-1"
                            title="Delete Match"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Calendar className="text-indigo-500" />
                {editingId ? "Edit Match" : "Schedule Match"}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Squad</label>
                <select 
                  required
                  value={formData.ageGroup || "U11"}
                  onChange={e => setFormData({...formData, ageGroup: e.target.value})}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                >
                  {(settings?.squads && settings.squads.length > 0) ? (
                    settings.squads.map(squad => (
                      <option key={squad} value={squad}>{squad}</option>
                    ))
                  ) : (
                    <option value="U11">U11 (Default)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Tournament (Optional)</label>
                <select 
                  value={formData.tournamentId || ""}
                  onChange={e => {
                    const selectedId = e.target.value;
                    const selectedTourney = tournaments.find(t => t.id === selectedId);
                    setFormData({...formData, tournamentId: selectedId, tournament: selectedTourney ? selectedTourney.name : ""});
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                >
                  <option value="">-- No Tournament --</option>
                  {tournaments.filter(t => t.status !== "ARCHIVED").map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Opponent</label>
                <input 
                  type="text" 
                  required
                  value={formData.opponent || ""}
                  onChange={e => setFormData({...formData, opponent: e.target.value})}
                  placeholder="e.g. FC Barcelona Youth"
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Date</label>
                  <ThaiDatePicker
                    value={formData.matchDate || formData.date || ""}
                    onChange={(e) => setFormData({...formData, matchDate: e.target.value})}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Kickoff Time</label>
                  <input 
                    type="time" 
                    required
                    value={formData.kickoff || formData.time || ""}
                    onChange={e => setFormData({...formData, kickoff: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Competition Type</label>
                  <select 
                    value={formData.competitionType || "LEAGUE"}
                    onChange={e => setFormData({...formData, competitionType: e.target.value as any})}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  >
                    <option value="LEAGUE">League</option>
                    <option value="CUP">Cup</option>
                    <option value="FRIENDLY">Friendly</option>
                    <option value="TOURNAMENT">Tournament</option>
                    <option value="FESTIVAL">Festival</option>
                    <option value="TRAINING_MATCH">Training Match</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Location</label>
                  <select 
                    value={formData.location || "HOME"}
                    onChange={e => setFormData({...formData, location: e.target.value as any})}
                    className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                  >
                    <option value="HOME">Home</option>
                    <option value="AWAY">Away</option>
                    <option value="NEUTRAL">Neutral</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select 
                  value={formData.status || "SCHEDULED"}
                  onChange={e => setFormData({...formData, status: e.target.value as any})}
                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none"
                >
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

            </form>
            
            <div className="p-5 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-sm active:scale-95"
              >
                {editingId ? "Save Changes" : "Schedule Match"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
