import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Search,
  Activity,
  Star,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { PlayCircle } from "lucide-react";
import { PerformanceBadge } from "./common/PerformanceBadge";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { getBMICategory } from "../lib/utils";
import { useCareerStats } from "../hooks/useCareerStats";
import { Trophy } from "lucide-react";
import CVIDPLogTab from "./player-cv/CVIDPLogTab";

interface GrowthStats {
  current: number;
  previous: number;
  unit: string;
}

const mockGrowthData = {
  height: { current: 165, previous: 163, unit: "cm" },
  weight: { current: 55, previous: 54, unit: "kg" },
};

export default function YouthDevelopmentReport({
  onBack,
  player,
}: {
  onBack: () => void;
  player?: any;
}) {
  const { currentUser } = useAuth();
  const isParent = currentUser?.role === "PARENT";
  
  const [linkedPlayerData, setLinkedPlayerData] = useState<any>(null);
  const [isLoadingLinked, setIsLoadingLinked] = useState(false);

  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [criteriaMapping, setCriteriaMapping] = useState<Record<string, string>>({});
  const [expandedEvals, setExpandedEvals] = useState<Set<string>>(new Set());
  const [growthHistory, setGrowthHistory] = useState<any[]>([]);
  const [idpsList, setIdpsList] = useState<any[]>([]);
  const [playerGoals, setPlayerGoals] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);
  const [trainingLogs, setTrainingLogs] = useState<any[]>([]);

  const targetPlayerId = isParent && linkedPlayerData ? linkedPlayerData.id : player?.id;
  const targetAcademyId = currentUser?.academyId || player?.academyId || linkedPlayerData?.academyId;
  const { stats: careerStats, loading: careerStatsLoading } = useCareerStats(targetAcademyId, targetPlayerId);

  const toggleEvalExpand = (id: string) => {
    const newExpanded = new Set(expandedEvals);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedEvals(newExpanded);
  };

  // Check pending claim status & fetch linked player and evaluations
  useEffect(() => {
    let isSubscribed = true;

    const loadData = async () => {
      let currentDisplayPlayer = player;
      let currentAcademyId = null;

      // 1. Fetch linked player if parent
      if (isParent && !player) {
        setIsLoadingLinked(true);
        try {
          const accSnap = await getDocs(collection(db, "academies"));
          for (const acc of accSnap.docs) {
            // First check if the player doc is explicitly linked via linkedUserId
            const q = query(collection(db, `academies/${acc.id}/players`), where("linkedUserId", "==", currentUser.id));
            const snap = await getDocs(q);
            if (!snap.empty) {
              currentDisplayPlayer = { id: snap.docs[0].id, ...snap.docs[0].data() };
              currentAcademyId = acc.id;
              break;
            }
            
            // Fallback: check by linkedPlayerId if the previous query didn't find anything
            if (!currentDisplayPlayer && currentUser?.linkedPlayerId) {
              const pDoc = await getDoc(doc(db, `academies/${acc.id}/players`, currentUser.linkedPlayerId));
              if (pDoc.exists()) {
                currentDisplayPlayer = { id: pDoc.id, ...pDoc.data() };
                currentAcademyId = acc.id;
                break;
              }
            }
          }
          if (isSubscribed && currentDisplayPlayer) {
            setLinkedPlayerData(currentDisplayPlayer);
          }
        } catch (error) {
          console.error("Error fetching linked player:", error);
        } finally {
          if (isSubscribed) setIsLoadingLinked(false);
        }
      }

      // 2. Fetch evaluations for the player
      if (currentDisplayPlayer?.id) {
        try {
          let evals: any[] = [];
          if (currentAcademyId) {
             // We know the academy, just fetch directly
             const evalQ = query(collection(db, `academies/${currentAcademyId}/player_evaluations`), where("player_id", "==", currentDisplayPlayer.id));
             const evalSnap = await getDocs(evalQ);
             evals = evalSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          } else {
             // We don't know the academy (e.g. passed from props, or fallback), search all academies
             const accSnap = await getDocs(collection(db, "academies"));
             for (const acc of accSnap.docs) {
               const evalQ = query(collection(db, `academies/${acc.id}/player_evaluations`), where("player_id", "==", currentDisplayPlayer.id));
               const evalSnap = await getDocs(evalQ);
               if (!evalSnap.empty) {
                 evals = evalSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                 break;
               }
             }
          }

          if (isSubscribed) {
            // Sort evals by date descending
            evals.sort((a, b) => new Date(b.evaluation_date || b.date).getTime() - new Date(a.evaluation_date || a.date).getTime());
            
            // Fetch coach names
            const evalsWithCoachNames = await Promise.all(evals.map(async (ev) => {
              if (ev.coach_id) {
                const coachDoc = await getDoc(doc(db, "users", ev.coach_id));
                if (coachDoc.exists()) {
                  return { ...ev, coach_name: coachDoc.data().name || "Coach" };
                }
              }
              return { ...ev, coach_name: "Coach" };
            }));

            setEvaluations(evalsWithCoachNames);

            // Calculate Radar Data
            if (evalsWithCoachNames.length > 0) {
              // Fetch criteria to know which criteria goes to which category
              const criteriaSnap = await getDocs(collection(db, `academies/${currentAcademyId || "superadmin_system"}/evaluation_criteria`));
              let criteriaList = criteriaSnap.docs.map(doc => doc.data());

              // Also fetch global criteria if not superadmin_system
              if (currentAcademyId && currentAcademyId !== "superadmin_system") {
                try {
                  const globalSnap = await getDocs(collection(db, "academies", "superadmin_system", "evaluation_criteria"));
                  const globalData = globalSnap.docs.map(doc => doc.data());
                  const existingNames = new Set(criteriaList.map(c => c.criteria_name));
                  globalData.forEach(g => {
                    if (!existingNames.has(g.criteria_name)) criteriaList.push(g);
                  });
                } catch (e) {
                  console.warn("Failed to fetch global criteria");
                }
              }

              const criteriaToCategory: Record<string, string> = {};
              criteriaList.forEach(c => {
                criteriaToCategory[c.criteria_name] = c.category;
              });
              setCriteriaMapping(criteriaToCategory);
              
              // By default expand the latest evaluation
              if (evalsWithCoachNames.length > 0) {
                setExpandedEvals(new Set([evalsWithCoachNames[0].id]));
              }
            }
          }
        } catch (error) {
          console.error("Error fetching evaluations:", error);
        }

        // 3. Fetch growth history, IDPs, Goals, and Journals
        if (currentAcademyId && currentDisplayPlayer?.id) {
          try {
            const growthSnap = await getDocs(collection(db, `academies/${currentAcademyId}/players/${currentDisplayPlayer.id}/growth_history`));
            const history = growthSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            if (isSubscribed) setGrowthHistory(sortedHistory);

            // Fetch IDPs
            const idpSnap = await getDocs(query(collection(db, `academies/${currentAcademyId}/idps`), where("playerId", "==", currentDisplayPlayer.id)));
            const idps = idpSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            idps.sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
            if (isSubscribed) setIdpsList(idps);

            // Fetch Goals
            const goalsSnap = await getDocs(collection(db, `academies/${currentAcademyId}/players/${currentDisplayPlayer.id}/goals`));
            const gls = goalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isSubscribed) setPlayerGoals(gls);

            // Fetch Journals
            const journalsSnap = await getDocs(collection(db, `academies/${currentAcademyId}/players/${currentDisplayPlayer.id}/journals`));
            const jrnls = journalsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isSubscribed) setJournals(jrnls);

            // Fetch Training Logs
            const logsSnap = await getDocs(collection(db, `academies/${currentAcademyId}/players/${currentDisplayPlayer.id}/training_logs`));
            const logs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (isSubscribed) setTrainingLogs(logs);
          } catch (e) {
            console.error("Error fetching growth/IDP history:", e);
          }
        }
      }
    };

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, [currentUser, isParent, player]);

  // Decide what player to display
  let displayPlayer = player;
  if (!player) {
    if (isParent && linkedPlayerData) {
      displayPlayer = linkedPlayerData;
    } else {
      displayPlayer = null;
    }
  }

  const GrowthStat = ({
    label,
    data,
  }: {
    label: string;
    data: GrowthStats;
  }) => {
    const diff = data.current - data.previous;
    const isPositive = diff > 0;
    const isNegative = diff < 0;

    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          {label}
        </span>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xl font-black text-slate-800">
            {data.current}
          </span>
          <span className="text-sm font-bold text-slate-500">{data.unit}</span>
        </div>
        <div className="flex items-center gap-1 mt-auto">
          {isPositive ? (
            <div className="flex items-center text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-xs font-bold">
              <ArrowUp size={12} className="mr-0.5" />
              {Math.abs(diff)}
              {data.unit}
            </div>
          ) : isNegative ? (
            <div className="flex items-center text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded text-xs font-bold">
              <ArrowDown size={12} className="mr-0.5" />
              {Math.abs(diff)}
              {data.unit}
            </div>
          ) : (
            <div className="text-slate-400 text-xs font-bold">No change</div>
          )}
          <span className="text-[10px] text-slate-400 font-medium">
            vs last month
          </span>
        </div>
      </div>
    );
  };

  if (isParent && !displayPlayer && !isLoadingLinked) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Search className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">ยังไม่ได้เชื่อมโยงข้อมูล</h2>
          <p className="text-slate-500 mb-8 font-medium">กรุณาไปที่เมนู <strong>Dashboard</strong> เพื่อทำการค้นหาและเชื่อมโยงโปรไฟล์นักกีฬา หรือรอการตรวจสอบจากโค้ช</p>
        </div>
      </div>
    );
  }

  if (isLoadingLinked || !displayPlayer) {
    return <div className="p-8 text-center text-slate-500">Loading player data...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6 relative">
        <button
          onClick={onBack}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors absolute sm:relative -left-2 sm:left-0 z-10"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 text-center sm:text-left pl-8 sm:pl-0">
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
            Youth Development Report
          </h1>
          <p className="text-sm font-medium text-slate-500">
            Monthly Progress & Evaluation
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Player Profile & Growth */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-3xl p-6 text-white shadow-md relative overflow-hidden md:col-span-1 flex flex-col items-center text-center">
              {/* Background decorative pattern */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-white opacity-10"></div>
              <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-24 h-24 rounded-full bg-white opacity-10"></div>

              <div className="w-20 h-20 rounded-full bg-white/20 p-1 mb-4 backdrop-blur-sm relative z-10">
                <img
                  src={
                    displayPlayer.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayPlayer.firstName}`
                  }
                  alt="Avatar"
                  className="w-full h-full object-cover rounded-full bg-white"
                />
              </div>
              <div className="relative z-10">
                <h2 className="text-lg font-black tracking-tight">
                  {displayPlayer.firstName} {displayPlayer.lastName}
                </h2>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="bg-white/20 px-2 py-0.5 rounded-md text-xs font-bold uppercase backdrop-blur-sm">
                    {displayPlayer.position || "N/A"}
                  </span>
                  <span className="bg-white/20 px-2 py-0.5 rounded-md text-xs font-bold uppercase backdrop-blur-sm">
                    {displayPlayer.ageGroup || "N/A"}
                  </span>
                </div>
                {displayPlayer.futId ? (
                  <div className="mt-3 inline-block px-3 py-1 bg-white/10 text-white font-mono text-xs tracking-wider rounded-lg border border-white/20 backdrop-blur-sm shadow-sm">
                    {displayPlayer.futId}
                  </div>
                ) : (
                  <div className="mt-3 inline-block px-3 py-1 bg-black/20 text-white/50 font-mono text-xs tracking-wider rounded-lg border border-black/10 backdrop-blur-sm shadow-sm">
                    ไม่มีข้อมูล FUTID
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2">
              {(() => {
                const latest = growthHistory.length > 0 ? growthHistory[growthHistory.length - 1] : null;
                if (!latest || !latest.bmi) {
                  return (
                    <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-8 flex flex-col items-center justify-center text-center h-full">
                      <Activity className="text-slate-300 mb-2" size={32} />
                      <div className="text-sm font-bold text-slate-500">ไม่มีประวัติการวัดส่วนสูง/น้ำหนัก</div>
                    </div>
                  );
                }

                const cat = getBMICategory(latest.bmi);
                if (!cat) return null;
                
                const textColor = cat.color.split(' ')[0];
                const borderColor = cat.color.split(' ')[2];

                return (
                  <div className="flex flex-col md:flex-row items-center justify-between bg-white border border-slate-200 p-5 rounded-2xl shadow-sm gap-4 relative overflow-hidden h-full">
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${cat.color.split(' ')[1].replace('50', '400')}`}></div>
                    <div className="flex items-center gap-4 z-10 w-full md:w-auto">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 shadow-sm bg-white ${borderColor} ${textColor}`}>
                        <Activity size={24} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                          สถานะปัจจุบัน (ล่าสุด: {latest.date})
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-2xl font-black text-slate-800">
                            BMI: {latest.bmi}
                          </div>
                          <div className={`px-3 py-1 rounded-full text-sm font-bold border shadow-sm ${cat.color}`}>
                            {cat.label}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 w-full md:w-auto justify-end">
                      <div className="bg-slate-50 px-5 py-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">ส่วนสูง</div>
                        <div className="font-black text-slate-700 text-lg leading-none">{latest.height} <span className="text-xs font-bold text-slate-500">cm</span></div>
                      </div>
                      <div className="bg-slate-50 px-5 py-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">น้ำหนัก</div>
                        <div className="font-black text-slate-700 text-lg leading-none">{latest.weight} <span className="text-xs font-bold text-slate-500">kg</span></div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* Section 1.5: Match Performance & Statistics */}
        <section>
          <div className="flex items-center gap-3 mb-6 mt-8">
            <Trophy className="text-amber-500" size={28} />
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Match Performance & Statistics</h2>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
            {careerStatsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">Loading match statistics...</div>
            ) : careerStats && careerStats.totalMatches > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Matches</span>
                  <span className="text-3xl font-black text-indigo-600">{careerStats.totalMatches}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Goals</span>
                  <span className="text-3xl font-black text-emerald-600">{careerStats.totalGoals}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Assists</span>
                  <span className="text-3xl font-black text-sky-600">{careerStats.totalAssists}</span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Avg Rating</span>
                  <span className="text-3xl font-black text-amber-500">{careerStats.averageRating > 0 ? careerStats.averageRating : "-"}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Trophy size={32} className="text-slate-200 mb-2" />
                <span className="text-sm font-bold">ไม่มีข้อมูลสถิติการแข่งขัน</span>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-6 mt-8">
            <Activity className="text-indigo-600" size={28} />
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Evaluation History</h2>
          </div>

          {evaluations.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                <Activity size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-1">ยังไม่มีประวัติการประเมิน</h3>
              <p className="text-slate-500 font-medium">โค้ชยังไม่ได้ทำการประเมินทักษะสำหรับนักกีฬาคนนี้</p>
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
                  <div key={evaluation.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-slate-50/50 px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="bg-white shadow-sm border border-slate-100 text-indigo-600 p-3 rounded-2xl">
                          <Star size={24} className="fill-indigo-100" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Evaluation Date</span>
                            <span className="text-[10px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${evaluation.coach_name}`} alt="Coach" className="w-3 h-3 rounded-full bg-slate-200" />
                              {evaluation.coach_name}
                            </span>
                          </div>
                          <div className="text-lg font-black text-slate-800">
                            {evaluation.evaluation_date ? new Date(evaluation.evaluation_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => toggleEvalExpand(evaluation.id)}
                          className="px-4 py-2 flex items-center gap-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                        >
                          {isExpanded ? (
                            <><ChevronUp size={16} /> ซ่อนรายละเอียด</>
                          ) : (
                            <><ChevronDown size={16} /> ดูผลประเมิน ({Object.keys(scores).length})</>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="p-6 md:p-8 animate-in slide-in-from-top-4 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                          {Object.entries(categoryTotals).map(([category, { sum, count }]) => {
                            const avg = count > 0 ? (sum / count) : 0;
                            const percentage = (avg / 5) * 100;
                            
                            let colorClass = "bg-indigo-500";
                            if (avg >= 4) colorClass = "bg-emerald-500";
                            else if (avg >= 3) colorClass = "bg-blue-500";
                            else if (avg < 2) colorClass = "bg-rose-500";
                            else colorClass = "bg-amber-500";
                            
                            return (
                              <div key={category} className="space-y-3">
                                <div className="flex justify-between items-end mb-2">
                                  <span className="text-sm font-black text-slate-700">{category}</span>
                                  <div className="flex items-center gap-3">
                                    <PerformanceBadge score={avg} />
                                    <span className="text-xl font-black text-slate-800 tracking-tight">{avg.toFixed(1)} <span className="text-sm text-slate-400 font-medium">/ 5</span></span>
                                  </div>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden shadow-inner">
                                  <div 
                                    className={`h-3 rounded-full transition-all duration-1000 ease-out ${colorClass}`}
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                                
                                {categoryScores[category] && (
                                  <div className="pt-4 pb-2 space-y-2.5">
                                    {Object.entries(categoryScores[category]).map(([crit, cScore]) => (
                                      <div key={crit} className="flex items-center justify-between text-xs">
                                        <span className="text-slate-600 font-medium">{crit}</span>
                                        <div className="flex items-center gap-1">
                                          {[1, 2, 3, 4, 5].map(star => (
                                            <Star 
                                              key={star} 
                                              size={12} 
                                              className={star <= Number(cScore) ? "fill-amber-400 text-amber-400 drop-shadow-sm" : "fill-slate-100 text-slate-200"} 
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 4: Individual Development Plan (IDP) & Daily Reflections Log */}
        <section className="mt-8">
          <CVIDPLogTab idpsList={idpsList} playerGoals={playerGoals} journals={journals} trainingLogs={trainingLogs} />
        </section>
      </div>
    </div>
  );
}
