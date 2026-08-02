import React from "react";
import {
  Trophy, Edit2, Trash2, MessageSquare, History, MapPin, Award
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

interface CVCareerTabProps {
  player: any;
  localPlayer: any;
  careerStatsLoading: boolean;
  careerStats: any;
  playedUpMatches: any[];
  hasPermission: (roles: string[]) => boolean;
  handleEditScore: (matchId: string, ourScore: string, opponentScore: string) => void;
  handleDeleteMatch: (matchId: string) => void;
  settings: any;
  setIsAddingAcademy: (val: boolean) => void;
  setIsAddingAward: (val: boolean) => void;
}

function CVCareerTab(props: CVCareerTabProps) {
  const {
    player, localPlayer, careerStatsLoading, careerStats, playedUpMatches,
    hasPermission, handleEditScore, handleDeleteMatch, settings,
    setIsAddingAcademy, setIsAddingAward
  } = props;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={28} />
        <h2 className="text-2xl font-black text-slate-800 tracking-tight dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">Career Profile</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Played Up History */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Trophy className="text-amber-500" size={24} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400">Match History & Played Up</h3>
          </div>
          
          <div className="space-y-4">
            {careerStatsLoading ? (
              <div className="flex items-center justify-center py-6 text-slate-400">Loading match statistics...</div>
            ) : careerStats && careerStats.totalMatches > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Matches</span>
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{careerStats.totalMatches}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Goals</span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{careerStats.totalGoals}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Assists</span>
                  <span className="text-2xl font-black text-sky-600 dark:text-sky-400">{careerStats.totalAssists}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 text-center">
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider block mb-1">Avg Rating</span>
                  <span className="text-2xl font-black text-amber-500">{careerStats.averageRating > 0 ? careerStats.averageRating : "-"}</span>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Played Up Matches</span>
                <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">{playedUpMatches.length}</span>
              </div>
            )}
            
            {playedUpMatches.length > 0 ? (
              <div className="space-y-4 mt-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {playedUpMatches.map(m => {
                  const matchPlayer = (m.playersData && m.playersData[player.id]) 
                    || m.players?.find((p: any) => p.id === player.id) 
                    || m.guestPlayers?.find((gp: any) => gp.id === player.id);
                  
                  // Compatibility mapping for V3 vs old format
                  const rating = matchPlayer?.rating || "0";
                  const note = matchPlayer?.playerVisibleNote || matchPlayer?.note || "";
                  const goals = matchPlayer?.goals || matchPlayer?.metrics?.goals || "0";
                  const assists = matchPlayer?.assists || matchPlayer?.metrics?.assists || "0";
                  const minutes = matchPlayer?.minutesPlayed || matchPlayer?.metrics?.minutes || "0";
                  const isGuest = matchPlayer?.isGuest || m.guestPlayers?.some((gp: any) => gp.id === player.id);
                  
                  // Convert V3 flat stats to metrics for UI compatibility
                  const displayMetrics = matchPlayer?.metrics || {
                    goals, assists, minutes,
                    shotsOnTarget: matchPlayer?.shotsOnTarget || "0",
                    passAccuracy: matchPlayer?.passAccuracy || "0",
                    saves: matchPlayer?.saves || "0"
                  };
                  return (
                  <div key={m.id} className="flex flex-col p-4 border border-slate-100 dark:border-slate-700/50 rounded-xl bg-white dark:bg-slate-800/30 hover:border-indigo-200 transition-colors">
                     <div className="flex justify-between items-start">
                       <div>
                         <div className="font-bold text-slate-800 dark:text-slate-200 text-sm flex flex-wrap items-center gap-2">
                           {m.matchType || 'Match'} vs {m.opponentName || 'Opponent'}
                           <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                             Played in {m.ageGroup}
                           </span>
                         </div>
                         <div className="text-xs text-slate-500 mt-1">{m.matchDate}</div>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
                           {m.ourScore || "0"} - {m.opponentScore || "0"}
                         </div>
                         {(hasPermission(["COACH", "ADMIN", "SUPERADMIN"])) && (
                           <div className="flex items-center gap-1">
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleEditScore(m.id, m.ourScore, m.opponentScore);
                               }}
                               className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                               title="Edit Score"
                             >
                               <Edit2 size={16} />
                             </button>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleDeleteMatch(m.id);
                               }}
                               className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                               title="Delete Match Record"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                         )}
                       </div>
                     </div>
                     
                     {matchPlayer && (
                       <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                         <div className="flex justify-between items-center mb-2">
                           <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Coach Rating</span>
                           <span className="text-base font-black text-indigo-600 dark:text-indigo-400">{rating || '-'}</span>
                         </div>
                         {displayMetrics && Object.keys(displayMetrics).length > 0 && (
                           <div className="grid grid-cols-2 gap-2 mt-2">
                              {Object.entries(displayMetrics).map(([key, val]) => {
                                const metricDef = settings?.performanceMetrics?.find((sm: any) => sm.id === key);
                                const metricName = metricDef ? metricDef.name : key;
                                return (
                                  <div key={key} className="text-xs flex justify-between bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                    <span className="text-slate-500 dark:text-slate-400 truncate max-w-[100px]">{metricName}</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{val as React.ReactNode}</span>
                                  </div>
                                );
                              })}
                           </div>
                         )}
                         {note && (
                           <div className="mt-3 text-xs bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 p-2.5 rounded-lg flex gap-2">
                              <MessageSquare size={14} className="shrink-0 mt-0.5 opacity-70" />
                              <span className="leading-relaxed">{note}</span>
                           </div>
                         )}
                       </div>
                     )}
                  </div>
                )})}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">No played up history found.</div>
            )}
          </div>
        </div>

        {/* Academy History */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <History className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">Academy History</h3>
            </div>
            <button 
              onClick={() => setIsAddingAcademy(true)}
              className="text-xs font-bold bg-indigo-50 dark:bg-cyan-900/30 text-indigo-600 dark:text-cyan-400 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-cyan-900/50 transition-colors dark:border dark:border-cyan-800"
            >
              + Add
            </button>
          </div>
          
          {localPlayer.academy_history && localPlayer.academy_history.length > 0 ? (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-700 before:to-transparent">
              {localPlayer.academy_history.map((academy: any, index: number) => (
                <div key={academy.id || index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white dark:border-slate-900 bg-indigo-600 dark:bg-cyan-600 text-slate-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.5)]">
                    <MapPin size={16} />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm z-10">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{academy.name}</h4>
                      <span className="text-xs font-bold text-indigo-600 dark:text-cyan-400 bg-indigo-50 dark:bg-cyan-900/30 px-2 py-0.5 rounded-full">{academy.startYear} - {academy.endYear || "Present"}</span>
                    </div>
                    {academy.achievements && (
                      <p className="text-slate-500 dark:text-slate-400 text-xs">{academy.achievements}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">No academy history added yet.</div>
          )}
        </div>

        {/* Achievements */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Award className="text-indigo-600 dark:text-amber-400 dark:[filter:drop-shadow(0_0_8px_rgba(251,191,36,0.8))]" size={24} />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-amber-400 dark:[text-shadow:0_0_8px_rgba(251,191,36,0.6)]">Achievements & Awards</h3>
            </div>
            <button 
              onClick={() => setIsAddingAward(true)}
              className="text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors dark:border dark:border-amber-800"
            >
              + Add
            </button>
          </div>
          
          {localPlayer.personal_awards && localPlayer.personal_awards.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {localPlayer.personal_awards.map((award: any, index: number) => (
                <div key={award.id || index} className="flex items-start gap-4 p-4 rounded-xl border border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10">
                  <div className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 p-3 rounded-full shrink-0 dark:border dark:border-amber-800 dark:[box-shadow:0_0_10px_rgba(251,191,36,0.3)]">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{award.title}</h4>
                    <div className="text-xs text-amber-600 dark:text-amber-500 font-medium mb-1">{award.year} {award.tournament && `• ${award.tournament}`}</div>
                    {award.description && (
                      <p className="text-slate-500 dark:text-slate-400 text-xs">{award.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">No awards added yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(CVCareerTab);
