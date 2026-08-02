import React, { useState, useEffect, useMemo } from "react";
import { Plus, Edit2, Trash2, Users, ChevronLeft, Save } from "lucide-react";
import { useAcademy } from "../contexts/AcademyContext";
import { getTournaments, addTournament, updateTournament, deleteTournament, getTournamentSquad, updateTournamentSquad } from "../lib/tournamentApi";
import { Tournament, TournamentSquad } from "../types/Tournament";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function TournamentManager({ onBack }: { onBack: () => void }) {
  const { academyId, settings } = useAcademy();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSquadModalOpen, setIsSquadModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [currentSquad, setCurrentSquad] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<Partial<Tournament>>({
    name: "",
    season: settings?.currentSeason || "2026",
    eligibleAgeGroups: [],
    eligibleGenderRules: [],
    status: "ACTIVE"
  });

  useEffect(() => {
    if (academyId) {
      loadTournaments();
      // Pre-load all players for squad selection
      const unsub = onSnapshot(collection(db, "academies", academyId, "players"), (snap) => {
        setAllPlayers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsub();
    }
  }, [academyId]);

  const loadTournaments = async () => {
    if (!academyId) return;
    setIsLoading(true);
    try {
      const data = await getTournaments(academyId);
      setTournaments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!academyId) return;
    try {
      if (editingId) {
        await updateTournament(academyId, editingId, formData);
      } else {
        await addTournament(academyId, formData as Omit<Tournament, "id" | "createdAt" | "updatedAt">);
      }
      setIsModalOpen(false);
      loadTournaments();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (!academyId) return;
    if (window.confirm("Are you sure you want to delete this tournament?")) {
      try {
        await deleteTournament(academyId, id);
        loadTournaments();
      } catch (err) {
        console.error("Failed to delete tournament", err);
      }
    }
  };

  const handleManageSquad = async (tournament: Tournament) => {
    if (!academyId) return;
    setEditingId(tournament.id);
    try {
      const squad = await getTournamentSquad(academyId, tournament.id);
      setCurrentSquad(squad ? squad.playerIds : []);
      setIsSquadModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSquad = async () => {
    if (!academyId || !editingId) return;
    try {
      await updateTournamentSquad(academyId, editingId, currentSquad);
      setIsSquadModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const togglePlayerInSquad = (playerId: string) => {
    setCurrentSquad(prev => 
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-10 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Users className="text-indigo-600 dark:text-indigo-400" />
            Tournament Manager
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Manage tournaments and define master squad lists.
          </p>
        </div>
        <button 
          onClick={() => {
            setFormData({ name: "", season: settings?.currentSeason || "2026", eligibleAgeGroups: [], eligibleGenderRules: [], status: "ACTIVE" });
            setEditingId(null);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-95"
        >
          <Plus size={18} /> New Tournament
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-500">Loading...</div>
        ) : tournaments.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No tournaments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <th className="p-4 font-bold">Tournament</th>
                  <th className="p-4 font-bold">Season</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {tournaments.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{t.name}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400">{t.season}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${t.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => handleManageSquad(t)}
                        className="text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors mr-2"
                      >
                        Manage Squad
                      </button>
                      <button 
                        onClick={() => {
                          setFormData(t);
                          setEditingId(t.id);
                          setIsModalOpen(true);
                        }}
                        className="text-slate-400 hover:text-indigo-600 p-2 transition-colors inline-block"
                        title="Edit Tournament"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteTournament(t.id)}
                        className="text-slate-400 hover:text-rose-600 p-2 transition-colors inline-block"
                        title="Delete Tournament"
                      >
                        <Trash2 size={18} />
                      </button>
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">{editingId ? "Edit Tournament" : "New Tournament"}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleSaveTournament} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-bold mb-1">Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-xl px-4 py-2" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Season</label>
                <input required type="text" value={formData.season} onChange={e => setFormData({...formData, season: e.target.value})} className="w-full border rounded-xl px-4 py-2" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Status</label>
                <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full border rounded-xl px-4 py-2">
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl">Save Tournament</button>
            </form>
          </div>
        </div>
      )}

      {isSquadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">Manage Tournament Squad</h2>
              <button onClick={() => setIsSquadModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
              <p className="text-sm text-slate-500 mb-4">Select players to register for this tournament (Master Roster). Selected: {currentSquad.length}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allPlayers.map(p => {
                  const isSelected = currentSquad.includes(p.id);
                  return (
                    <div 
                      key={p.id} 
                      onClick={() => togglePlayerInSquad(p.id)}
                      className={`p-3 rounded-xl border cursor-pointer flex items-center gap-3 transition-colors ${isSelected ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20' : 'bg-white border-slate-200'}`}
                    >
                      <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 rounded text-indigo-600" />
                      <div>
                        <div className="font-bold text-sm">{p.firstName} {p.lastName}</div>
                        <div className="text-xs text-slate-500">{p.ageGroup} • {p.position}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={handleSaveSquad} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl">Save Squad List</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
