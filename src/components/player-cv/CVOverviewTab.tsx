import React from "react";
import {
  Activity, Target, Flame, Star, Shield, Zap, Video, Edit2, Check, Trash2
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { getBMICategory } from "../../lib/utils";

interface CVOverviewTabProps {
  player: any;
  localPlayer: any;
  academyId: string;
  evaluations: any[];
  criteriaMapping: Record<string, string>;
  growthHistory: any[];
  dailyLogs: any[];
  playerMatches: any[];
  idpsList: any[];
  idpStats: any;
  isSaving: boolean;
  dashboardWidgets?: React.ReactNode;
  isEditingVideo: boolean;
  setIsEditingVideo: (val: boolean) => void;
  videoUrlInput: string;
  setVideoUrlInput: (val: string) => void;
  handleSaveVideo: () => void;
  setIsAddingGrowth: (val: boolean) => void;
  handleDeleteGrowth: (id: string) => void;
  getEmbedUrl: (url: string) => string;
}

function CVOverviewTab(props: CVOverviewTabProps) {
  const {
    player, localPlayer, evaluations, criteriaMapping, growthHistory,
    dailyLogs, playerMatches, idpsList, idpStats, isSaving, dashboardWidgets,
    isEditingVideo, setIsEditingVideo, videoUrlInput, setVideoUrlInput,
    handleSaveVideo, setIsAddingGrowth, handleDeleteGrowth, getEmbedUrl
  } = props;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {dashboardWidgets}
      
      {/* Top Row: Chart & IDP target */}
      {/* --- New Development Report Layout --- */}
      {(() => {
        const latestEval = evaluations.length > 0 ? evaluations[0] : null;
        const previousEval = evaluations.length > 1 ? evaluations[1] : null;

        const calculateCategoryAverages = (evalData: any) => {
          if (!evalData) return {};
          const catTotals: Record<string, { sum: number; count: number }> = {};
          const scores = evalData.scores || {};
          Object.entries(scores).forEach(([critName, score]) => {
            const category = criteriaMapping[critName];
            if (category) {
              if (!catTotals[category]) catTotals[category] = { sum: 0, count: 0 };
              catTotals[category].sum += Number(score);
              catTotals[category].count += 1;
            }
          });
          const averages: Record<string, number> = {};
          Object.entries(catTotals).forEach(([cat, { sum, count }]) => {
            averages[cat] = count > 0 ? sum / count : 0;
          });
          return averages;
        };

        const latestCatScores = calculateCategoryAverages(latestEval);
        const previousCatScores = calculateCategoryAverages(previousEval);

        const CATEGORY_KEYS = [
          { key: "Attacking Techniques", label: "Attacking" },
          { key: "Defending Techniques", label: "Defending" },
          { key: "Tactical Awareness", label: "Tactical" },
          { key: "Physical Attributes", label: "Physical" },
          { key: "Mental Attributes", label: "Mental" },
          { key: "Social Skills", label: "Social" },
        ];

        let strongestArea = "N/A";
        let weakestArea = "N/A";
        let overallAverage = 0;
        
        if (latestEval) {
          let max = -1;
          let min = 6;
          let totalSum = 0;
          let totalCount = 0;
          Object.entries(latestCatScores).forEach(([cat, score]) => {
            if (score > max) { max = score; strongestArea = cat.split(" ")[0]; }
            if (score < min && score > 0) { min = score; weakestArea = cat.split(" ")[0]; }
            totalSum += score;
            totalCount++;
          });
          if (totalCount > 0) overallAverage = totalSum / totalCount;
        }

        const getBadgeFromScore = (score: number) => {
          if (score === 0) return { label: "N/A", emoji: "⚪", color: "text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700", bar: "bg-slate-300 dark:bg-slate-600" };
          if (score >= 4.5) return { label: "Excellent", emoji: "🟢", color: "text-emerald-700 bg-emerald-100 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-800", bar: "bg-emerald-500" };
          if (score >= 3.5) return { label: "Good", emoji: "🟡", color: "text-yellow-700 bg-yellow-100 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-800", bar: "bg-yellow-500" };
          if (score >= 2.5) return { label: "Developing", emoji: "🟠", color: "text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-800", bar: "bg-orange-500" };
          return { label: "Needs Improvement", emoji: "🔴", color: "text-rose-700 bg-rose-100 border-rose-200 dark:text-rose-400 dark:bg-rose-900/30 dark:border-rose-800", bar: "bg-rose-500" };
        };

        const overallBadge = getBadgeFromScore(overallAverage);
        const overallPercentage = Math.round((overallAverage / 5) * 100);

        const activeIDP = idpsList.find((idp: any) => idp.status === "Active" || idp.status === "Draft") || idpsList[0];
        const recentIDPs = idpsList.slice(0, 3);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Summary & Potential Assessment */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Section 4: Player Development Summary */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row gap-6 items-center justify-between">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-800/50">
                    <span className="text-2xl font-black text-indigo-600 dark:text-cyan-400 dark:[text-shadow:0_0_10px_rgba(34,211,238,0.6)]">{overallPercentage}%</span>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Current Level</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_8px_rgba(255,255,255,0.5)]">{overallBadge.label}</span>
                      <span className="text-lg leading-none">{overallBadge.emoji}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-6 w-full sm:w-auto sm:justify-end">
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Strongest</div>
                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400 dark:[text-shadow:0_0_10px_rgba(52,211,153,0.6)]">{strongestArea}</div>
                  </div>
                  <div className="w-px bg-slate-100 dark:bg-slate-800 shrink-0 hidden sm:block"></div>
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Weakest</div>
                    <div className="text-base font-black text-rose-600 dark:text-rose-400 dark:[text-shadow:0_0_10px_rgba(251,113,133,0.6)]">{weakestArea}</div>
                  </div>
                </div>
              </div>

              {/* Section 1: Potential Assessment */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex-1">
                <div className="flex items-center gap-2 mb-8">
                  <Target className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                    Potential Assessment
                  </h3>
                </div>
                
                {!latestEval ? (
                  <div className="py-12 text-center text-slate-400 dark:text-slate-500 font-medium">No evaluation data available.</div>
                ) : (
                  <div className="space-y-6">
                    {CATEGORY_KEYS.map((cat) => {
                      const score = latestCatScores[cat.key] || 0;
                      const prevScore = previousCatScores[cat.key] || 0;
                      const diff = score - prevScore;
                      const badge = getBadgeFromScore(score);
                      const percentage = (score / 5) * 100;

                      return (
                        <div key={cat.key}>
                          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-2 gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-200 min-w-[90px]">{cat.label}</span>
                              {prevScore > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  diff > 0 ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
                                  diff < 0 ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                                }`}>
                                  {diff > 0 ? `↑ +${diff.toFixed(1)}` : diff < 0 ? `↓ ${Math.abs(diff).toFixed(1)}` : `→ 0.0`}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.color}`}>
                                {badge.emoji} {badge.label}
                              </span>
                              <span className="text-lg font-black text-slate-800 dark:text-white tabular-nums dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
                                {score > 0 ? score.toFixed(1) : "0.0"} <span className="text-xs text-slate-400 dark:text-slate-500">/ 5</span>
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${badge.bar} dark:[box-shadow:0_0_10px_currentColor]`} style={{ width: `${percentage}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Pipeline */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              {/* Section 2: Player Progress Pipeline (Match -> IDP -> Training) */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col">
                <div className="flex items-center gap-2 mb-6">
                  <Activity className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={20} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                    Player Progress Pipeline
                  </h3>
                </div>

                <div className="flex-1 flex flex-col gap-6 relative ml-2">
                  {/* Pipeline Connection Line */}
                  <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-700/50 z-0"></div>

                  {/* 1. Match Insights */}
                  <div className="relative z-10 flex gap-3">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-500">
                      <Flame size={14} />
                    </div>
                    <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 mt-1">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">1. Match Insights</h4>
                      {playerMatches.length > 0 ? (
                        <div className="space-y-2">
                          {playerMatches.slice(0, 2).map((m, idx) => {
                            const pData = m.playersData?.[player.id] || m.players?.find((p:any) => p.id === player.id) || {};
                            return (
                              <div key={idx} className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                <span className="font-bold opacity-75 mr-1">[{m.matchDate}]</span>
                                {pData.trainingRecommendation || pData.metrics?.trainingRecommendation || "ไม่มีคำแนะนำพิเศษ"}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">ยังไม่มีข้อมูลจากแมตช์</div>
                      )}
                    </div>
                  </div>

                  {/* 2. Active IDP Goal */}
                  <div className="relative z-10 flex gap-3">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center text-indigo-500">
                      <Target size={14} />
                    </div>
                    <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 mt-1">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2 flex-wrap">
                        2. Active IDP Goal 
                        {activeIDP && (
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${activeIDP.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>
                            {activeIDP.status}
                          </span>
                        )}
                      </h4>
                      {activeIDP ? (
                        <div>
                          <div className="font-black text-indigo-900 dark:text-indigo-400 text-sm mb-1.5 leading-tight">{activeIDP.goal || "ไม่ได้ระบุเป้าหมาย"}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            <span className="font-bold">Process:</span> {activeIDP.process || "ไม่มีกระบวนการ"}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400">ยังไม่มีแผนพัฒนาส่วนบุคคล</div>
                      )}
                    </div>
                  </div>

                  {/* 3. Training Progress */}
                  <div className="relative z-10 flex gap-3">
                    <div className="w-8 h-8 shrink-0 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-500">
                      <Activity size={14} />
                    </div>
                    <div className="flex-1 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 mt-1">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">3. Training Translation</h4>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                          <div className="text-[9px] font-bold text-slate-400 uppercase">Training Sessions</div>
                          <div className="text-lg font-black text-slate-700 dark:text-slate-300">{dailyLogs.length}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700/50">
                          <div className="text-[9px] font-bold text-slate-400 uppercase">IDPs Completed</div>
                          <div className="text-lg font-black text-slate-700 dark:text-slate-300">{idpStats.completed}/{idpStats.total}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Section 3: Recent IDP Activities */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 mb-5 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
                  Recent IDP Activities
                </h3>
                {recentIDPs.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs font-medium">No recent activities found.</div>
                ) : (
                  <div className="space-y-3">
                    {recentIDPs.map((idp: any, idx: number) => {
                      const isCompleted = idp.status === "Completed";
                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors">
                          <div className="text-center w-12 shrink-0 border-r border-slate-200 dark:border-slate-700 pr-3">
                            <div className="text-xs font-black text-slate-700 dark:text-slate-300 leading-tight">
                              {idp.createdAt ? new Date(idp.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short'}) : "N/A"}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{idp.title}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                              {idp.targetValue} {idp.unit}
                            </div>
                          </div>
                          <div className="shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md border ${isCompleted ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'}`}>
                              {idp.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}
      {/* --- End New Layout --- */}

    {/* Physical Growth Section */}
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="text-emerald-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
          Physical Growth
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Metric 1 */}
        <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            VO2 Max
          </div>
          <div className="flex items-end justify-between mb-3">
            <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
              54.2
            </div>
            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md dark:border dark:border-emerald-800">
              +2.1 from last test
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 dark:[box-shadow:0_0_10px_#10b981]"
              style={{ width: "75%" }}
            ></div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            30m Sprint
          </div>
          <div className="flex items-end justify-between mb-3">
            <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
              4.12{" "}
              <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">
                sec
              </span>
            </div>
            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md dark:border dark:border-emerald-800">
              -0.05 from last test
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 dark:bg-cyan-500 dark:[box-shadow:0_0_10px_#06b6d4]"
              style={{ width: "80%" }}
            ></div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Vertical Jump
          </div>
          <div className="flex items-end justify-between mb-3">
            <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
              58{" "}
              <span className="text-sm text-slate-400 dark:text-slate-500 font-medium">
                cm
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-md">
              Stable
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-500 dark:bg-slate-400"
              style={{ width: "60%" }}
            ></div>
          </div>
        </div>
      </div>
    </div>

    {/* Growth Tracking Section */}
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Activity className="text-indigo-600 dark:text-cyan-400 dark:[filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" size={24} />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-cyan-400 dark:[text-shadow:0_0_8px_rgba(34,211,238,0.6)]">
            ความเติบโตทางร่างกาย (Growth Tracking)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setIsAddingGrowth(true)}
          className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 dark:bg-cyan-600 dark:hover:bg-cyan-500 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.5)] transition-colors shadow-sm self-start sm:self-auto"
        >
          + บันทึกส่วนสูง/น้ำหนัก
        </button>
      </div>

      {growthHistory.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          ไม่มีบันทึกประวัติการเติบโต กดปุ่มเพื่อบันทึกครั้งแรก
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Latest Status Banner */}
          {(() => {
            const latest = growthHistory[growthHistory.length - 1];
            if (!latest || !latest.bmi) return null;
            const cat = getBMICategory(latest.bmi);
            if (!cat) return null;
            
            const textColor = cat.color.split(' ')[0];
            const borderColor = cat.color.split(' ')[2];
            
            let darkBorder = "";
            let darkText = "";
            let darkBg = "";
            if (textColor.includes("emerald")) { darkBorder = "dark:border-emerald-800"; darkText = "dark:text-emerald-400"; darkBg = "dark:bg-emerald-900/30"; }
            if (textColor.includes("yellow")) { darkBorder = "dark:border-yellow-800"; darkText = "dark:text-yellow-400"; darkBg = "dark:bg-yellow-900/30"; }
            if (textColor.includes("orange")) { darkBorder = "dark:border-orange-800"; darkText = "dark:text-orange-400"; darkBg = "dark:bg-orange-900/30"; }
            if (textColor.includes("rose")) { darkBorder = "dark:border-rose-800"; darkText = "dark:text-rose-400"; darkBg = "dark:bg-rose-900/30"; }

            return (
              <div className="mb-6 flex flex-col md:flex-row items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-sm gap-4 relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cat.color.split(' ')[1].replace('50', '400')}`}></div>
                <div className="flex items-center gap-4 z-10 w-full md:w-auto">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 shadow-sm bg-white dark:bg-slate-800 ${borderColor} ${darkBorder} ${textColor} ${darkText}`}>
                    <Activity size={24} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                      สถานะปัจจุบัน (ล่าสุด: {latest.date})
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-black text-slate-800 dark:text-white dark:[text-shadow:0_0_5px_rgba(255,255,255,0.4)]">
                        BMI: {latest.bmi}
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-bold border shadow-sm ${cat.color} ${darkBg} ${darkText} ${darkBorder}`}>
                        {cat.label}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 w-full md:w-auto justify-end">
                  <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">ส่วนสูง</div>
                    <div className="font-black text-slate-700 dark:text-slate-200 text-lg leading-none">{latest.height} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">cm</span></div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">น้ำหนัก</div>
                    <div className="font-black text-slate-700 dark:text-slate-200 text-lg leading-none">{latest.weight} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">kg</span></div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Chart */}
            <div className="lg:col-span-2">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#2dd4bf" }} label={{ value: 'ส่วนสูง (cm)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#2dd4bf', fontSize: 10, fontWeight: 'bold' } }} domain={['dataMin - 5', 'dataMax + 5']} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#0ea5e9" }} label={{ value: 'น้ำหนัก (kg)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#0ea5e9', fontSize: 10, fontWeight: 'bold' } }} domain={['dataMin - 5', 'dataMax + 5']} />
                  <Tooltip contentStyle={{ borderRadius: '12px', borderColor: '#334155', backgroundColor: '#0B1120', color: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Line yAxisId="left" type="monotone" dataKey="height" name="ส่วนสูง (cm)" stroke="#2dd4bf" strokeWidth={3} activeDot={{ r: 8 }} />
                  <Line yAxisId="right" type="monotone" dataKey="weight" name="น้ำหนัก (kg)" stroke="#0ea5e9" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* History List */}
          <div className="lg:col-span-1 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 flex flex-col max-h-[250px]">
            <div className="p-3 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200/60 dark:border-slate-700/60 font-bold text-xs text-slate-700 dark:text-slate-300 tracking-wider uppercase">
              ประวัติการชั่งน้ำหนักย้อนหลัง
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {[...growthHistory].reverse().map((entry) => (
                <div key={entry.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div>
                    <div className="font-bold text-slate-700 dark:text-slate-200">{entry.date}</div>
                    <div className="text-slate-400 dark:text-slate-500 font-medium mt-0.5 flex flex-wrap items-center gap-1">
                      {entry.height} cm / {entry.weight} kg 
                      {entry.bmi && (
                        <span className="ml-1 inline-flex items-center">
                          (BMI: {entry.bmi})
                          {(() => {
                            const cat = getBMICategory(entry.bmi);
                            if (!cat) return null;
                            
                            const textColor = cat.color.split(' ')[0];
                            let darkBorder = "";
                            let darkText = "";
                            let darkBg = "";
                            if (textColor.includes("emerald")) { darkBorder = "dark:border-emerald-800"; darkText = "dark:text-emerald-400"; darkBg = "dark:bg-emerald-900/30"; }
                            if (textColor.includes("yellow")) { darkBorder = "dark:border-yellow-800"; darkText = "dark:text-yellow-400"; darkBg = "dark:bg-yellow-900/30"; }
                            if (textColor.includes("orange")) { darkBorder = "dark:border-orange-800"; darkText = "dark:text-orange-400"; darkBg = "dark:bg-orange-900/30"; }
                            if (textColor.includes("rose")) { darkBorder = "dark:border-rose-800"; darkText = "dark:text-rose-400"; darkBg = "dark:bg-rose-900/30"; }

                            return (
                              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${cat.color} ${darkBg} ${darkText} ${darkBorder}`}>
                                {cat.label}
                              </span>
                            );
                          })()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteGrowth(entry.id)}
                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Gamified Teammate Endorsements & Video Highlights */}
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Teammate Endorsements */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm xl:col-span-1">
        <div className="flex items-center gap-2 mb-6">
          <Star className="text-yellow-500 dark:text-yellow-400 dark:[filter:drop-shadow(0_0_8px_rgba(250,204,21,0.8))]" size={24} />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-yellow-400 dark:[text-shadow:0_0_8px_rgba(250,204,21,0.6)]">
            Teammate Endorsements
          </h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/30 text-yellow-500 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
                <Star size={20} />
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                MVP
              </div>
            </div>
            <div className="flex items-center gap-1 font-black text-lg text-slate-800 dark:text-yellow-400 dark:[text-shadow:0_0_5px_rgba(250,204,21,0.6)]">
              {player.endorsementStats?.mvp || 0}{" "}
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">
                times
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                <Shield size={20} />
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                Best Defender
              </div>
            </div>
            <div className="flex items-center gap-1 font-black text-lg text-slate-800 dark:text-blue-400 dark:[text-shadow:0_0_5px_rgba(96,165,250,0.6)]">
              {player.endorsementStats?.defender || 0}{" "}
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">
                times
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <Zap size={20} />
              </div>
              <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                Hard Worker
              </div>
            </div>
            <div className="flex items-center gap-1 font-black text-lg text-slate-800 dark:text-amber-400 dark:[text-shadow:0_0_5px_rgba(251,191,36,0.6)]">
              {player.endorsementStats?.hardworker || 0}{" "}
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium ml-1">
                times
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Video Highlights */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm xl:col-span-2">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Video className="text-rose-500 dark:text-rose-400 dark:[filter:drop-shadow(0_0_8px_rgba(244,63,94,0.8))]" size={24} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-rose-400 dark:[text-shadow:0_0_8px_rgba(244,63,94,0.6)]">
              Video Highlights
            </h3>
          </div>
          <button
            onClick={() => setIsEditingVideo(!isEditingVideo)}
            className="text-xs font-bold text-indigo-600 dark:text-cyan-400 hover:text-indigo-500 dark:hover:text-cyan-300 dark:[text-shadow:0_0_5px_rgba(34,211,238,0.5)] transition-colors uppercase tracking-wider flex items-center gap-1"
          >
            <Edit2 size={12} /> {isEditingVideo ? 'ยกเลิก' : 'แก้ไข'}
          </button>
        </div>

        {isEditingVideo && (
          <div className="mb-4 flex gap-2">
            <input 
              type="text" 
              placeholder="วางลิงก์ YouTube ที่นี่..."
              className="flex-1 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 focus:outline-none focus:border-indigo-500 dark:focus:border-cyan-500 dark:focus:ring-1 dark:focus:ring-cyan-500"
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
            />
            <button 
              onClick={handleSaveVideo}
              disabled={isSaving}
              className="px-4 py-2 bg-indigo-600 dark:bg-cyan-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 dark:hover:bg-cyan-500 transition-colors disabled:opacity-50 flex items-center gap-2 dark:[box-shadow:0_0_10px_rgba(6,182,212,0.5)]"
            >
              {isSaving ? "กำลังบันทึก..." : <><Check size={16} /> บันทึก</>}
            </button>
          </div>
        )}

        <div className="w-full aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm relative dark:[box-shadow:0_0_15px_rgba(244,63,94,0.2)]">
          <iframe
            width="100%"
            height="100%"
            src={getEmbedUrl(localPlayer.videoHighlightsUrl || "")}
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          ></iframe>
        </div>
      </div>
    </div>
    </div>
  );
}

export default React.memo(CVOverviewTab);
