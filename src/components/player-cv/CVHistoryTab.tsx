import React from "react";
import {
  Activity, Star, ChevronUp, ChevronDown, Edit2, Trash2
} from "lucide-react";
import { PerformanceBadge } from "../common/PerformanceBadge";

interface CVHistoryTabProps {
  evaluations: any[];
  criteriaMapping: Record<string, string>;
  expandedEvals: Set<string>;
  toggleEvalExpand: (id: string) => void;
  openEditEval: (evaluation: any) => void;
  handleDeleteEval: (id: string) => void;
  onCreateGoalFromEval?: (evalData: { evaluationId: string; category?: string }) => void;
}

const determineTargetCategory = (evaluation: any, criteriaMapping: Record<string, string>): string | undefined => {
  if (!evaluation?.scores) return undefined;
  const scores = evaluation.scores;
  const catTotals: Record<string, { sum: number; count: number }> = {};
  
  Object.entries(scores).forEach(([critName, score]) => {
    const category = criteriaMapping[critName];
    if (category) {
      if (!catTotals[category]) catTotals[category] = { sum: 0, count: 0 };
      catTotals[category].sum += Number(score);
      catTotals[category].count += 1;
    }
  });

  let lowestAvg = 999;
  let lowestCat: string | undefined = undefined;
  Object.entries(catTotals).forEach(([cat, { sum, count }]) => {
    if (count > 0) {
      const avg = sum / count;
      if (avg < lowestAvg) {
        lowestAvg = avg;
        lowestCat = cat;
      }
    }
  });

  if (!lowestCat) return undefined;
  if (lowestCat.includes("Attacking") || lowestCat.includes("Defending")) return "TECHNICAL";
  if (lowestCat.includes("Tactical")) return "TACTICAL";
  if (lowestCat.includes("Physical")) return "PHYSICAL";
  if (lowestCat.includes("Mental") || lowestCat.includes("Social")) return "MENTAL";
  return "TECHNICAL";
};

function CVHistoryTab(props: CVHistoryTabProps) {
  const {
    evaluations, criteriaMapping, expandedEvals, toggleEvalExpand,
    openEditEval, handleDeleteEval, onCreateGoalFromEval
  } = props;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={28} />
        <h2 className="text-2xl font-black text-slate-800 tracking-tight dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">Evaluation History</h2>
      </div>
      
      {evaluations.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Activity size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-1">No Evaluations Yet</h3>
          <p className="text-slate-500 dark:text-slate-400">This player hasn't received any formal evaluations.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {evaluations.map((evaluation) => {
            const scores = evaluation.scores || {};
            const categoryTotals: Record<string, { sum: number, count: number }> = {};
            const categoryScores: Record<string, Record<string, number>> = {};
            
            Object.entries(scores).forEach(([critName, score]) => {
              const category = criteriaMapping[critName] || "Uncategorized";
              if (!categoryTotals[category]) {
                categoryTotals[category] = { sum: 0, count: 0 };
                categoryScores[category] = {};
              }
              categoryTotals[category].sum += Number(score);
              categoryTotals[category].count += 1;
              categoryScores[category][critName] = Number(score);
            });
            
            const isExpanded = expandedEvals.has(evaluation.id);
            
            return (
              <div key={evaluation.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 dark:bg-cyan-900/30 text-indigo-600 dark:text-cyan-400 p-2 rounded-xl dark:border dark:border-cyan-800 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.3)]">
                      <Star size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">Evaluation Date</div>
                      <div className="text-lg font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">{new Date(evaluation.evaluation_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onCreateGoalFromEval && (
                      <button
                        onClick={() => onCreateGoalFromEval({
                          evaluationId: evaluation.id,
                          category: determineTargetCategory(evaluation, criteriaMapping)
                        })}
                        className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-cyan-300 bg-indigo-50 dark:bg-cyan-950/50 border border-indigo-200 dark:border-cyan-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-cyan-900/50 transition-colors shadow-sm"
                      >
                        🎯 Create Development Goal
                      </button>
                    )}
                    <button 
                      onClick={() => toggleEvalExpand(evaluation.id)}
                      className="px-3 py-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {isExpanded ? (
                        <><ChevronUp size={16} /> Hide Details</>
                      ) : (
                        <><ChevronDown size={16} /> View Details</>
                      )}
                    </button>
                    <button 
                      onClick={() => openEditEval(evaluation)}
                      className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-cyan-400 hover:bg-indigo-50 dark:hover:bg-cyan-900/30 rounded-lg transition-colors"
                      title="Edit Evaluation"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDeleteEval(evaluation.id)}
                      className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                      title="Delete Evaluation"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {Object.entries(categoryTotals).map(([category, { sum, count }]) => {
                      const avg = count > 0 ? (sum / count) : 0;
                      const percentage = (avg / 5) * 100;
                      
                      let colorClass = "bg-indigo-500 dark:bg-cyan-500 dark:[box-shadow:0_0_10px_#06b6d4]";
                      if (avg >= 4) colorClass = "bg-emerald-500 dark:bg-emerald-500 dark:[box-shadow:0_0_10px_#10b981]";
                      else if (avg >= 3) colorClass = "bg-blue-500 dark:bg-blue-500 dark:[box-shadow:0_0_10px_#3b82f6]";
                      else if (avg < 2) colorClass = "bg-rose-500 dark:bg-rose-500 dark:[box-shadow:0_0_10px_#f43f5e]";
                      else colorClass = "bg-amber-500 dark:bg-amber-500 dark:[box-shadow:0_0_10px_#f59e0b]";
                      
                      return (
                        <div key={category} className="space-y-2">
                          <div className="flex justify-between items-end">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{category}</span>
                            <div className="flex items-center gap-3">
                              <PerformanceBadge score={avg} />
                              <span className="text-lg font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">{avg.toFixed(1)} <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">/ 5</span></span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className={`h-2.5 rounded-full transition-all duration-1000 ease-out ${colorClass}`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          
                          {isExpanded && categoryScores[category] && (
                            <div className="pt-3 pb-1 space-y-2 animate-in slide-in-from-top-2 duration-200">
                              {Object.entries(categoryScores[category]).map(([crit, cScore]) => (
                                <div key={crit} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-500 dark:text-slate-400">{crit}</span>
                                  <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map(star => (
                                      <Star 
                                        key={star} 
                                        size={10} 
                                        className={star <= cScore ? "fill-amber-400 text-amber-400 dark:[filter:drop-shadow(0_0_3px_#fbbf24)]" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"} 
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default React.memo(CVHistoryTab);
