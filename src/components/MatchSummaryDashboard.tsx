import React, { useState, useEffect } from "react";
import { ChevronLeft, Calendar, MapPin, Trophy, Shield, Zap, Activity } from "lucide-react";
import { Match, MatchEvent } from "../types/Match";
import { useAcademy } from "../contexts/AcademyContext";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import MatchTimeline from "./MatchTimeline";

export default function MatchSummaryDashboard({
  match,
  onBack,
  onEdit
}: {
  match: Match;
  onBack: () => void;
  onEdit?: (match: Match) => void;
}) {
  const { academyId, getAcademyCollection } = useAcademy();
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, [match.id, academyId]);

  const fetchEvents = async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const eventsRef = collection(db, "academies", academyId, "matches", match.id, "events");
      const q = query(eventsRef, orderBy("minute", "asc"));
      const snapshot = await getDocs(q);
      const fetchedEvents = snapshot.docs.map(doc => ({ ...doc.data(), eventId: doc.id } as MatchEvent));
      setEvents(fetchedEvents);
    } catch (err) {
      console.error("Error fetching match events:", err);
    } finally {
      setLoading(false);
    }
  };

  const starters = Object.values(match.playersData || {}).filter(p => p.starter);
  const subs = Object.values(match.playersData || {}).filter(p => !p.starter && p.availability === "AVAILABLE");

  return (
    <div className="w-full max-w-7xl mx-auto pb-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors mb-2"
          >
            <ChevronLeft size={16} className="mr-1" /> Back to Schedule
          </button>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            Match Summary
          </h1>
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm mt-2">
            <span className="flex items-center gap-1"><Calendar size={14} /> {match.matchDate}</span>
            <span className="flex items-center gap-1"><MapPin size={14} /> {match.location} - {match.venue || "TBD"}</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-xs font-bold">{match.competitionType}</span>
          </div>
        </div>
        
        {onEdit && (
          <button 
            onClick={() => onEdit(match)}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 px-4 py-2 rounded-xl font-bold transition-colors"
          >
            Edit Match Stats
          </button>
        )}
      </div>

      {/* Score Board */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-900 rounded-3xl overflow-hidden shadow-xl border border-indigo-500/20 relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
        <div className="relative p-8 sm:p-12">
          <div className="flex justify-between items-center max-w-3xl mx-auto">
            <div className="text-center flex-1">
              <h2 className="text-xl sm:text-3xl font-black text-white mb-2">Our Team</h2>
              <span className="px-3 py-1 bg-white/10 rounded-full text-indigo-200 text-xs font-bold uppercase tracking-wider">{match.ageGroup}</span>
            </div>
            
            <div className="px-6 flex flex-col items-center">
              <div className="flex items-center gap-4 text-4xl sm:text-7xl font-black text-white">
                <span>{match.ourScore || 0}</span>
                <span className="text-indigo-400/50">-</span>
                <span>{match.opponentScore || 0}</span>
              </div>
              <span className={`mt-4 px-4 py-1 rounded-full text-xs font-bold ${
                match.status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              }`}>
                {match.status}
              </span>
            </div>

            <div className="text-center flex-1">
              <h2 className="text-xl sm:text-3xl font-black text-white mb-2">{match.opponent || "Opponent"}</h2>
              <span className="px-3 py-1 bg-white/10 rounded-full text-indigo-200 text-xs font-bold uppercase tracking-wider">Away</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Team Stats & Squad */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="text-indigo-500" size={20} /> Team Stats
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <span className="text-slate-600 dark:text-slate-400 font-medium text-sm">Possession</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{match.teamStats?.possession || "50"}%</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <span className="text-slate-600 dark:text-slate-400 font-medium text-sm">Total Shots</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{match.teamStats?.totalShots || "0"}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <span className="text-slate-600 dark:text-slate-400 font-medium text-sm">Corners</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{match.teamStats?.corners || "0"}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <span className="text-slate-600 dark:text-slate-400 font-medium text-sm">Fouls</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{match.teamStats?.fouls || "0"}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Shield className="text-indigo-500" size={20} /> Match Squad
            </h3>
            
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Starting XI ({starters.length})</h4>
                <div className="space-y-2">
                  {starters.map(p => (
                    <div key={p.playerId} className="flex justify-between items-center text-sm p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                      <span className="font-medium text-slate-700 dark:text-slate-300">Player ID: {p.playerId.substring(0,6)}...</span>
                      <span className="text-xs font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">{p.position}</span>
                    </div>
                  ))}
                  {starters.length === 0 && <div className="text-sm text-slate-400 italic">No starters selected</div>}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Substitutes ({subs.length})</h4>
                <div className="space-y-2">
                  {subs.map(p => (
                    <div key={p.playerId} className="flex justify-between items-center text-sm p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50">
                      <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        Player ID: {p.playerId.substring(0,6)}...
                        {p.isGuest && <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-bold">GUEST</span>}
                      </span>
                      <span className="text-xs font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-600">{p.position}</span>
                    </div>
                  ))}
                  {subs.length === 0 && <div className="text-sm text-slate-400 italic">No substitutes</div>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Timeline & Events */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 h-full">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
              <Zap className="text-amber-500" size={20} /> Match Timeline
            </h3>
            
            {loading ? (
              <div className="text-center py-10 text-slate-500">Loading timeline...</div>
            ) : (
              <MatchTimeline events={events} matchId={match.id} academyId={academyId!} onEventsChange={fetchEvents} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
