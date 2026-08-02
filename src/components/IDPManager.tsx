import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useAcademy } from "../contexts/AcademyContext";
import { db } from "../lib/firebase";
import { onSnapshot, addDoc, doc, updateDoc, deleteDoc, collection, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useActivityLogger } from "../hooks/useActivityLogger";
import {
  Target, Calendar, FileText, Activity, CheckCircle, Plus, Edit, Trash2, X, Search, Users, Flame, Clock, ShieldAlert, Star, Trophy, MessageSquare
} from "lucide-react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import notificationService from "../services/notificationService";

interface IDP {
  id?: string;
  playerId: string;
  playerName: string;
  playerRequest: string;
  parentRequest: string;
  goal: string;
  startDate: string;
  endDate: string;
  process: string;
  applicationNote: string;
  evaluation: string;
  status: "Draft" | "Active" | "Completed";
  createdAt?: string;
  sourceGoalId?: string;
}

export default function IDPManager({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { currentUser, hasPermission } = useAuth();
  const { getAcademyCollection, academyId, activeSeason, settings } = useAcademy();
  const { logActivity } = useActivityLogger();
  
  const [players, setPlayers] = useState<any[]>([]);
  const [idps, setIdps] = useState<IDP[]>([]);
  const [playerGoals, setPlayerGoals] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<IDP>({
    playerId: "",
    playerName: "",
    playerRequest: "",
    parentRequest: "",
    goal: "",
    startDate: "",
    endDate: "",
    process: "",
    applicationNote: "",
    evaluation: "",
    status: "Draft"
  });

  useEffect(() => {
    if (!academyId) return;
    
    // Fetch active players
    const unsubPlayers = onSnapshot(getAcademyCollection("players"), (snap) => {
      const p: any[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        const isSeasonActive = data.seasonHistory?.[activeSeason]?.active 
          || (!data.seasonHistory && activeSeason === (settings.currentSeason || "2026"));
        if (isSeasonActive) {
          p.push({ id: doc.id, ...data });
        }
      });
      setPlayers(p.sort((a, b) => (a.firstName || "").localeCompare(b.firstName || "")));
    });

    // Fetch IDPs
    const unsubIDPs = onSnapshot(getAcademyCollection("idps"), (snap) => {
      const data: IDP[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() } as IDP);
      });
      setIdps(data.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    });

    // Fetch Matches
    const unsubMatches = onSnapshot(getAcademyCollection("matches"), (snap) => {
      const data: any[] = [];
      snap.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setMatches(data.sort((a, b) => (b.matchDate || "").localeCompare(a.matchDate || "")));
    });

    return () => {
      unsubPlayers();
      unsubIDPs();
      unsubMatches();
    };
  }, [academyId, activeSeason, settings.currentSeason]);

  useEffect(() => {
    if (!academyId || !selectedPlayer?.id) {
      setPlayerGoals([]);
      return;
    }
    const goalsRef = collection(db, `academies/${academyId}/players/${selectedPlayer.id}/goals`);
    const qGoals = query(goalsRef, orderBy("createdAt", "desc"));
    const unsubGoals = onSnapshot(qGoals, (snap) => {
      setPlayerGoals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubGoals();
  }, [academyId, selectedPlayer?.id]);

  const [reviewingGoal, setReviewingGoal] = useState<{
    goal: any;
    approvalStatus: "APPROVED" | "NEEDS_REVISION" | "REJECTED";
  } | null>(null);

  const [reviewFeedback, setReviewFeedback] = useState<{
    coachFeedback: string;
    revisionReason: string;
    revisionSuggestedTitle: string;
    revisionOption: "OPTION_A" | "OPTION_B" | "OPTION_C";
  }>({
    coachFeedback: "",
    revisionReason: "",
    revisionSuggestedTitle: "",
    revisionOption: "OPTION_A"
  });

  const handleGoalApproval = async (
    goalId: string,
    approvalStatus: "APPROVED" | "NEEDS_REVISION" | "REJECTED",
    feedbackData?: {
      coachFeedback?: string;
      revisionReason?: string;
      revisionSuggestedTitle?: string;
      revisionOption?: "OPTION_A" | "OPTION_B" | "OPTION_C";
    }
  ) => {
    if (!academyId || !selectedPlayer?.id || !goalId) {
      console.error("Missing required IDs for handleGoalApproval", { academyId, playerId: selectedPlayer?.id, goalId });
      alert("ไม่สามารถบันทึกข้อมูลได้: ข้อมูล ID ไม่ครบถ้วน (academyId, playerId, หรือ goalId หายไป)");
      return;
    }
    try {
      const goalRef = doc(db, `academies/${academyId}/players/${selectedPlayer.id}/goals`, goalId);
      const updateData: any = {
        approvalStatus,
        coachFeedbackType: approvalStatus,
        coachFeedback: feedbackData?.coachFeedback || "",
        revisionReason: feedbackData?.revisionReason || "",
        revisionSuggestedTitle: feedbackData?.revisionSuggestedTitle || "",
        revisionOption: feedbackData?.revisionOption || "OPTION_A",
        reviewedBy: currentUser?.id || currentUser?.uid || "Coach",
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (approvalStatus === "APPROVED") {
        updateData.status = "IN_PROGRESS";
        
        const goalSnap = playerGoals.find(g => g.id === goalId);
        if (goalSnap && !goalSnap.idpId && !goalSnap.convertedToIdp) {
          const idpRef = await addDoc(getAcademyCollection("idps"), {
            playerId: selectedPlayer.id,
            playerName: `${selectedPlayer.firstName} ${selectedPlayer.lastName}`,
            playerRequest: goalSnap.title,
            parentRequest: "",
            goal: goalSnap.title,
            startDate: new Date().toISOString().split("T")[0],
            endDate: "",
            process: `กระบวนการพัฒนาทักษะ: ${goalSnap.title} (${goalSnap.category})`,
            applicationNote: "นำทักษะไปฝึกซ้อมในสนามจริงและลงบันทึก Daily Reflection",
            evaluation: "เป้าหมายได้รับการอนุมัติจากโค้ช อยู่ระหว่างกระบวนการฝึกซ้อม",
            status: "Active",
            sourceGoalId: goalId,
            createdAt: new Date().toISOString()
          });

          updateData.idpId = idpRef.id;
          updateData.convertedToIdp = true;
          updateData.sourceIdpId = idpRef.id;
        }
      }
      await updateDoc(goalRef, updateData);

      // Send notification using central service
      const targetUserIds = [selectedPlayer.linkedUserId, selectedPlayer.userId];
      
      if (approvalStatus === "NEEDS_REVISION") {
        const reason = feedbackData?.revisionReason || feedbackData?.coachFeedback || 'กรุณาตรวจสอบรายละเอียด';
        await notificationService.notifyGoalNeedsRevision(targetUserIds, reason, goalId, academyId);
      } else if (approvalStatus === "APPROVED") {
        const idpId = updateData.sourceIdpId;
        await notificationService.notifyGoalApproved(targetUserIds, goalId, idpId, academyId);
      } else if (approvalStatus === "REJECTED") {
        const reason = feedbackData?.coachFeedback;
        await notificationService.notifyGoalRejected(targetUserIds, reason, goalId, academyId);
      }
    } catch (err: any) {
      console.error("Error updating goal approval:", err);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + (err.message || String(err)));
    }
  };

  const handleGoalComplete = async (goalId: string) => {
    if (!academyId || !selectedPlayer?.id || !goalId) return;
    try {
      const goalRef = doc(db, `academies/${academyId}/players/${selectedPlayer.id}/goals`, goalId);
      await updateDoc(goalRef, {
        status: "ACHIEVED",
        dateCompleted: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error marking goal completed:", err);
    }
  };

  const handleCreateIDPFromGoal = (goal: any) => {
    if (!selectedPlayer) return;
    setForm({
      playerId: selectedPlayer.id,
      playerName: `${selectedPlayer.firstName} ${selectedPlayer.lastName}`,
      playerRequest: goal.title,
      parentRequest: "",
      goal: goal.title,
      startDate: new Date().toISOString().split("T")[0],
      endDate: "",
      process: "",
      applicationNote: "",
      evaluation: "",
      status: "Active",
      sourceGoalId: goal.id
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.playerId || !academyId) return;

    try {
      let savedIdpId = form.id;
      if (form.id) {
        await updateDoc(doc(db, "academies", academyId, "idps", form.id), {
          ...form,
          updatedAt: new Date().toISOString()
        });
      } else {
        const idpRef = await addDoc(getAcademyCollection("idps"), {
          ...form,
          createdAt: new Date().toISOString()
        });
        savedIdpId = idpRef.id;

        // If this IDP was created from a Player Goal, update that Goal
        if (form.sourceGoalId && form.playerId) {
          const goalRef = doc(db, `academies/${academyId}/players/${form.playerId}/goals`, form.sourceGoalId);
          await updateDoc(goalRef, {
            idpId: savedIdpId,
            convertedToIdp: true,
            sourceIdpId: savedIdpId,
            approvalStatus: "APPROVED",
            status: "IN_PROGRESS",
            updatedAt: serverTimestamp()
          });
        }
      }
      
      const p = players.find(x => x.id === form.playerId);
      const pName = p ? `${p.firstName} ${p.lastName}` : form.playerId;
      await logActivity(form.id ? `อัปเดต IDP: ${pName}` : `สร้าง IDP ใหม่: ${pName}`);
      
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving IDP:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!academyId) return;
    if (confirm("ต้องการลบแผน IDP นี้ใช่หรือไม่?")) {
      try {
        await deleteDoc(doc(db, "academies", academyId, "idps", id));
      } catch (err) {
        console.error("Error deleting IDP:", err);
      }
    }
  };

  const getPlayerMatchInsights = (playerId: string) => {
    if (!playerId) return [];
    
    const playerMatches = matches.filter(m => 
      m.playersData?.[playerId] || m.players?.some((p:any) => p.id === playerId)
    ).sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());

    const recommendations = playerMatches
      .map(m => {
        const pData = m.playersData?.[playerId] || m.players?.find((p:any) => p.id === playerId) || {};
        return {
          date: m.matchDate,
          opponent: m.opponentName || m.opponent || "Opponent",
          recommendation: pData.trainingRecommendation || pData.metrics?.trainingRecommendation
        };
      })
      .filter(x => x.recommendation);

    return recommendations.slice(0, 3);
  };

  const openForm = (idp?: IDP, playerInfo?: any) => {
    if (idp) {
      setForm(idp);
    } else if (playerInfo) {
      setForm({
        playerId: playerInfo.id,
        playerName: `${playerInfo.firstName || ""} ${playerInfo.lastName || ""}`.trim(),
        playerRequest: "",
        parentRequest: "",
        goal: "",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        process: "",
        applicationNote: "",
        evaluation: "",
        status: "Draft"
      });
    }
    setIsModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-emerald-100 text-emerald-700";
      case "Completed": return "bg-blue-100 text-blue-700";
      default: return "bg-slate-100 text-slate-600";
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:to-emerald-400 tracking-tight flex items-center gap-2 dark:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
            <Target className="text-indigo-600 dark:text-indigo-400" />
            Individual Development Plan (IDP)
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
            วางแผนการฝึกซ้อมรายบุคคล 5 ขั้นตอน
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Player List */}
        <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden flex flex-col h-[700px] backdrop-blur-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/80">
            <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Users size={16} /> นักกีฬา
            </h2>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
              <input 
                type="text" 
                placeholder="ค้นหานักกีฬา..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {players.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(p)}
                className={`w-full text-left p-3 rounded-xl mb-1 flex items-center gap-3 transition-colors ${selectedPlayer?.id === p.id ? 'bg-indigo-50 dark:bg-indigo-500/20 border border-indigo-100 dark:border-indigo-500/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent'}`}
              >
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.firstName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-sm">
                      {p.firstName?.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold truncate ${selectedPlayer?.id === p.id ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-300'}`}>
                    {p.firstName} {p.lastName}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-500">{p.position || 'ไม่ระบุตำแหน่ง'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right: IDPs for selected player */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 overflow-hidden flex flex-col h-[700px] backdrop-blur-sm">
          {selectedPlayer ? (
            <>
              <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 shadow-sm border border-white dark:border-slate-600">
                    {selectedPlayer.avatar ? (
                      <img src={selectedPlayer.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-lg">
                        {selectedPlayer.firstName?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800 dark:text-slate-200">
                      {selectedPlayer.firstName} {selectedPlayer.lastName}
                    </h2>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">แผนพัฒนารายบุคคล (IDP)</div>
                  </div>
                </div>
                {hasPermission(["ADMIN", "COACH", "SUPERADMIN"]) && (
                  <button 
                    onClick={() => openForm(undefined, selectedPlayer)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                  >
                    <Plus size={16} /> สร้างแผนใหม่
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {idps.filter(i => i.playerId === selectedPlayer.id).length > 0 ? (
                  idps.filter(i => i.playerId === selectedPlayer.id).map(idp => (
                    <div key={idp.id} className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-700/50 flex items-start justify-between bg-slate-50/50 dark:bg-slate-900/30">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusColor(idp.status)}`}>
                              {idp.status}
                            </span>
                            <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                              {idp.startDate} - {idp.endDate || 'ยังไม่กำหนด'}
                            </span>
                          </div>
                          <h3 className="text-base font-black text-indigo-900 dark:text-indigo-400">{idp.goal || 'ไม่ได้ระบุเป้าหมาย'}</h3>
                        </div>
                        {hasPermission(["ADMIN", "COACH", "SUPERADMIN"]) && (
                          <div className="flex gap-2">
                            <button onClick={() => openForm(idp)} className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-500/50 transition-colors cursor-pointer">
                              <Edit size={14} />
                            </button>
                            <button onClick={() => handleDelete(idp.id!)} className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-500/50 transition-colors cursor-pointer">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Users size={10}/> ความต้องการนักกีฬา</div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 border border-transparent dark:border-slate-700/50 p-2 rounded-lg min-h-[40px]">{idp.playerRequest || '-'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Users size={10}/> สิ่งที่ผู้ปกครองคาดหวัง</div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 border border-transparent dark:border-slate-700/50 p-2 rounded-lg min-h-[40px]">{idp.parentRequest || '-'}</div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Activity size={10}/> กระบวนการฝึกซ้อม</div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-50 dark:border-indigo-500/20 p-2 rounded-lg min-h-[40px] whitespace-pre-wrap">{idp.process || '-'}</div>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle size={10}/> นำไปใช้จริง / การประเมินผล</div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-50 dark:border-emerald-500/20 p-2 rounded-lg min-h-[40px] whitespace-pre-wrap">{idp.applicationNote || '-'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-center opacity-60">
                    <Target size={36} className="text-slate-300 dark:text-slate-600 mb-2" />
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-400">ยังไม่มีแผน IDP</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">คลิก "สร้างแผนใหม่" เพื่อเริ่มกระบวนการฝึกซ้อมสำหรับนักกีฬานี้</p>
                  </div>
                )}

                {/* Player Proposed Goals Section */}
                {playerGoals.filter(goal => !goal.convertedToIdp && !goal.idpId && !goal.sourceIdpId).length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-sm font-black text-slate-800 dark:text-cyan-400 mb-3 flex items-center gap-2">
                      <Flame size={16} className="text-amber-500" />
                      เป้าหมายพัฒนาตนเองของนักกีฬา (Player Proposed Goals)
                    </h4>
                    <div className="space-y-3">
                      {playerGoals.filter(goal => !goal.convertedToIdp && !goal.idpId && !goal.sourceIdpId).map((goal) => {
                        const isPending = goal.approvalStatus === "PROPOSED";
                        const isNeedsRev = goal.approvalStatus === "NEEDS_REVISION";
                        const isApproved = goal.approvalStatus === "APPROVED" || !goal.approvalStatus;
                        const isRejected = goal.approvalStatus === "REJECTED";

                        return (
                          <div key={goal.id} className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${goal.type === 'SHORT_TERM' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {goal.type?.replace("_", " ")}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {goal.category}
                                </span>
                                {isPending && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                    <Clock size={10} /> รอโค้ชพิจารณา
                                  </span>
                                )}
                                {isNeedsRev && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 border border-orange-300 flex items-center gap-1">
                                    <ShieldAlert size={10} /> ต้องแก้ไข
                                  </span>
                                )}
                                {isApproved && goal.status !== 'ACHIEVED' && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                    <CheckCircle size={10} /> อนุมัติแล้ว (กำลังซ้อม)
                                  </span>
                                )}
                                {goal.status === 'ACHIEVED' && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1">
                                    <Trophy size={10} className="text-amber-500" /> ผ่านการฝึกซ้อมแล้ว (Achieved)
                                  </span>
                                )}
                                {isRejected && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                    <X size={10} /> ไม่อนุมัติ
                                  </span>
                                )}
                              </div>
                              <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{goal.title}</div>
                              {goal.coachFeedback && (
                                <div className="mt-2 text-xs bg-indigo-50/80 dark:bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40 text-indigo-900 dark:text-indigo-200">
                                  <span className="font-bold flex items-center gap-1 text-indigo-700 dark:text-indigo-400">
                                    <MessageSquare size={12} /> ข้อคิดเห็นจากโค้ช ({goal.coachFeedbackType || goal.approvalStatus}):
                                  </span>
                                  <p className="mt-0.5">{goal.coachFeedback}</p>
                                  {goal.revisionReason && (
                                    <p className="text-orange-700 dark:text-orange-400 mt-1"><strong>เหตุผลที่ต้องแก้ไข:</strong> {goal.revisionReason}</p>
                                  )}
                                  {goal.revisionSuggestedTitle && (
                                    <p className="text-blue-700 dark:text-blue-400 mt-1"><strong>หัวข้อแนะนำ:</strong> {goal.revisionSuggestedTitle}</p>
                                  )}
                                </div>
                              )}
                            </div>

                            {hasPermission(["ADMIN", "COACH", "SUPERADMIN"]) && (
                              <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
                                <button
                                  onClick={() => handleCreateIDPFromGoal(goal)}
                                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                                  title="นำเป้าหมายนี้ไปสร้างแผน IDP"
                                >
                                  <Target size={12} /> สร้าง IDP
                                </button>
                                {isApproved && goal.status !== "ACHIEVED" && (
                                  <button
                                    onClick={() => handleGoalComplete(goal.id)}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                                    title="ประเมินผ่านการฝึกซ้อมแล้ว"
                                  >
                                    <Trophy size={14} className="text-amber-300" /> ผ่านการฝึกซ้อมแล้ว
                                  </button>
                                )}
                                {goal.approvalStatus !== "APPROVED" && (
                                  <button
                                    onClick={() => {
                                      setReviewFeedback({
                                        coachFeedback: goal.coachFeedback || "",
                                        revisionReason: goal.revisionReason || "",
                                        revisionSuggestedTitle: goal.revisionSuggestedTitle || "",
                                      });
                                      setReviewingGoal({ goal, approvalStatus: "APPROVED" });
                                    }}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                    title="อนุมัติเป้าหมายนี้พร้อมใส่ข้อคิดเห็น"
                                  >
                                    <CheckCircle size={12} /> อนุมัติ
                                  </button>
                                )}
                                {goal.approvalStatus !== "NEEDS_REVISION" && goal.status !== "ACHIEVED" && (
                                  <button
                                    onClick={() => {
                                      setReviewFeedback({
                                        coachFeedback: goal.coachFeedback || "",
                                        revisionReason: goal.revisionReason || "",
                                        revisionSuggestedTitle: goal.revisionSuggestedTitle || "",
                                      });
                                      setReviewingGoal({ goal, approvalStatus: "NEEDS_REVISION" });
                                    }}
                                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                    title="ส่งกลับให้นักเรียนแก้ไข"
                                  >
                                    <Edit size={12} /> ต้องแก้ไข
                                  </button>
                                )}
                                {goal.approvalStatus !== "REJECTED" && goal.status !== "ACHIEVED" && (
                                  <button
                                    onClick={() => {
                                      setReviewFeedback({
                                        coachFeedback: goal.coachFeedback || "",
                                        revisionReason: goal.revisionReason || "",
                                        revisionSuggestedTitle: goal.revisionSuggestedTitle || "",
                                      });
                                      setReviewingGoal({ goal, approvalStatus: "REJECTED" });
                                    }}
                                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                                    title="ไม่อนุมัติเป้าหมายนี้"
                                  >
                                    <X size={12} /> ไม่อนุมัติ
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-60">
              <Users size={48} className="text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-400">เลือกนักกีฬา</h3>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">กรุณาเลือกนักกีฬาจากรายชื่อด้านซ้ายเพื่อจัดการ IDP</p>
            </div>
          )}
        </div>
      </div>

      {/* IDP Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700/50 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-base font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Target size={18} className="text-indigo-600 dark:text-indigo-400" />
                {form.id ? "แก้ไขแผน IDP" : "สร้างแผน IDP ใหม่"} - {form.playerName}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer"><X size={18} /></button>
            </div>
            
            <form id="idp-form" onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* Match Insights */}
              {form.playerId && getPlayerMatchInsights(form.playerId).length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 p-4 rounded-xl">
                  <h3 className="text-xs font-bold text-amber-800 dark:text-amber-500 mb-2 flex items-center gap-1">
                    <Flame size={14} /> Match Insights (คำแนะนำจากแมตช์ล่าสุด)
                  </h3>
                  <ul className="space-y-2">
                    {getPlayerMatchInsights(form.playerId).map((insight, idx) => (
                      <li key={idx} className="text-sm text-amber-900 dark:text-amber-400 bg-white/50 dark:bg-amber-900/40 p-2.5 rounded-lg border border-amber-100 dark:border-amber-500/20">
                        <span className="font-bold opacity-75 mr-2">[{insight.date}]</span> 
                        {insight.recommendation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Step 1 & 2 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700/50 pb-2">1. รวบรวมข้อมูล & เป้าหมาย (Goal)</h3>
                  {playerGoals.filter(g => !g.convertedToIdp).length > 0 && (
                    <div className="bg-amber-50/70 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 p-2.5 rounded-lg space-y-1.5">
                      <div className="text-[11px] font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                        <Flame size={12} /> คลิกเพื่อดึงเป้าหมายที่นักเตะเสนอมาใส่ฟอร์ม:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {playerGoals.filter(g => !g.convertedToIdp).map(g => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, playerRequest: g.title, goal: f.goal || g.title, sourceGoalId: g.id }))}
                            className="text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 border border-amber-200 dark:border-amber-500/40 px-2 py-1 rounded-md transition-colors text-left"
                            title="คลิกเพื่อเติมเป้าหมายนี้ลงในฟอร์ม"
                          >
                            + {g.title} ({g.category})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">ความต้องการนักกีฬา</label>
                    <textarea value={form.playerRequest} onChange={e => setForm({...form, playerRequest: e.target.value})} className="w-full text-sm p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500" rows={2} placeholder="เช่น อยากเลี้ยงหลบ 1v1 ให้เก่งขึ้น"></textarea>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">สิ่งที่ผู้ปกครองคาดหวัง</label>
                    <textarea value={form.parentRequest} onChange={e => setForm({...form, parentRequest: e.target.value})} className="w-full text-sm p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500" rows={2} placeholder="เช่น อยากให้น้องเล่นเป็นทีมมากขึ้น"></textarea>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">สรุปเป้าหมายการฝึกซ้อม *</label>
                    <input required type="text" value={form.goal} onChange={e => setForm({...form, goal: e.target.value})} className="w-full text-sm p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/80 bg-indigo-50/30 dark:bg-indigo-900/20 text-slate-700 dark:text-slate-200 placeholder:text-indigo-300 dark:placeholder:text-indigo-700" placeholder="เช่น พัฒนาความมั่นใจในการเลี้ยงบอล 1v1" />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700/50 pb-2">2. ระยะเวลา (Duration) & สถานะ</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">วันที่เริ่ม *</label>
                      <ThaiDatePicker required value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="w-full text-sm p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 dark:focus-within:border-indigo-500/50 text-slate-700 dark:text-slate-200 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">วันสิ้นสุดเป้าหมาย</label>
                      <ThaiDatePicker value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="w-full text-sm p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 dark:focus-within:border-indigo-500/50 text-slate-700 dark:text-slate-200 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">สถานะปัจจุบัน</label>
                    <select value={form.status} onChange={e => setForm({...form, status: e.target.value as any})} className="w-full text-sm p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200">
                      <option value="Draft">Draft (กำลังวางแผน)</option>
                      <option value="Active">Active (กำลังฝึกซ้อม)</option>
                      <option value="Completed">Completed (จบกระบวนการแล้ว)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">3. กระบวนการฝึกซ้อม (Training Process)</h3>
                <textarea 
                  value={form.process} 
                  onChange={e => setForm({...form, process: e.target.value})} 
                  className="w-full text-sm p-3 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500" 
                  rows={4} 
                  placeholder="ระบุแบบฝึกซ้อม, ความถี่, หรือขั้นตอนการฝึก เช่น:
- ฝึกเลี้ยงบอลหลบกรวย 15 นาที ทุกวันอังคาร
- ดวล 1v1 กับเพื่อนที่ตัวใหญ่กว่าในวันพฤหัสบดี"
                ></textarea>
              </div>

              {/* Step 4 & 5 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">4. นำไปใช้จริง (Real-world Application)</h3>
                  <textarea 
                    value={form.applicationNote} 
                    onChange={e => setForm({...form, applicationNote: e.target.value})} 
                    className="w-full text-sm p-3 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500" 
                    rows={3} 
                    placeholder="บันทึกการสังเกตการณ์ในแมตช์จริง เช่น น้องกล้าเลี้ยงหลบมากขึ้นในแมตช์วันเสาร์ที่ผ่านมา"
                  ></textarea>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">5. จบกระบวนการ (End Process / Evaluation)</h3>
                  <textarea 
                    value={form.evaluation} 
                    onChange={e => setForm({...form, evaluation: e.target.value})} 
                    className="w-full text-sm p-3 rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500" 
                    rows={3} 
                    placeholder="ประเมินผลลัพธ์ เช่น บรรลุเป้าหมาย, ควรเพิ่มความเข้มข้นในแผนต่อไป"
                  ></textarea>
                </div>
              </div>
            </form>

            <div className="p-4 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/50 transition-colors cursor-pointer">
                ยกเลิก
              </button>
              <button type="submit" form="idp-form" className="px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors shadow-sm cursor-pointer">
                บันทึกแผน IDP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coach Feedback Review Modal */}
      {reviewingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-800 dark:text-cyan-400 flex items-center gap-2">
                <ShieldAlert size={20} className={reviewingGoal.approvalStatus === "NEEDS_REVISION" ? "text-amber-500" : "text-indigo-600 dark:text-indigo-400"} />
                {reviewingGoal.approvalStatus === "NEEDS_REVISION"
                  ? "ส่งเป้าหมายกลับเพื่อปรับปรุง"
                  : "การประเมินและข้อคิดเห็นจากโค้ช (Coach Goal Review)"}
              </h3>
              <button
                onClick={() => setReviewingGoal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Original Goal Section */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-1">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">เป้าหมายเดิม</span>
              <div className="text-base font-black text-slate-800 dark:text-slate-100">{reviewingGoal.goal.title}</div>
              <div className="flex items-center gap-2 pt-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                  {reviewingGoal.goal.type}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                  {reviewingGoal.goal.category}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  reviewingGoal.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                  reviewingGoal.approvalStatus === 'NEEDS_REVISION' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {reviewingGoal.approvalStatus === 'NEEDS_REVISION' ? 'ส่งกลับแก้ไข (Needs Revision)' : `สถานะ: ${reviewingGoal.approvalStatus}`}
                </span>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {reviewingGoal.approvalStatus === "NEEDS_REVISION" ? (
                <>
                  {/* Option Selection A/B/C */}
                  <div>
                    <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                      🎯 เลือกทิศทางการปรับแก้ไข (Coach Direction Option) <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <div
                        onClick={() => setReviewFeedback({ ...reviewFeedback, revisionOption: "OPTION_A" })}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          reviewFeedback.revisionOption === "OPTION_A"
                            ? "bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-500 text-indigo-950 dark:text-indigo-200 ring-2 ring-indigo-500/20"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <input
                            type="radio"
                            checked={reviewFeedback.revisionOption === "OPTION_A"}
                            onChange={() => setReviewFeedback({ ...reviewFeedback, revisionOption: "OPTION_A" })}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Option A — ให้แก้หัวข้อ Goal</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 pl-5">
                          ให้นักกีฬาปรับแก้หัวข้อเป้าหมายเดิมให้ชัดเจนยิ่งขึ้น
                        </p>
                      </div>

                      <div
                        onClick={() => setReviewFeedback({ ...reviewFeedback, revisionOption: "OPTION_B" })}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          reviewFeedback.revisionOption === "OPTION_B"
                            ? "bg-amber-50/90 dark:bg-amber-950/40 border-amber-500 text-amber-950 dark:text-amber-200 ring-2 ring-amber-500/20"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <input
                            type="radio"
                            checked={reviewFeedback.revisionOption === "OPTION_B"}
                            onChange={() => setReviewFeedback({ ...reviewFeedback, revisionOption: "OPTION_B" })}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                          <span>Option B — ให้ปรับ Goal ไปยังเรื่องที่สำคัญกว่า (Pivot Focus)</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 pl-5">
                          เสนอให้ปรับทิศทางเป้าหมายไปยังทักษะที่เป็นพื้นฐานสำคัญกว่า
                        </p>
                      </div>

                      <div
                        onClick={() => setReviewFeedback({ ...reviewFeedback, revisionOption: "OPTION_C" })}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          reviewFeedback.revisionOption === "OPTION_C"
                            ? "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-500/20"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <input
                            type="radio"
                            checked={reviewFeedback.revisionOption === "OPTION_C"}
                            onChange={() => setReviewFeedback({ ...reviewFeedback, revisionOption: "OPTION_C" })}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Option C — ให้แก้เฉพาะชื่อ Goal โดยไม่ต้องให้นักกีฬาเขียน Training Process เอง</span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 pl-5">
                          โค้ชแก้ชื่อเป้าหมายให้โดยตรง นักกีฬาไม่จำเป็นต้องเขียนกระบวนการฝึกซ้อมใหม่
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* เหตุผลที่ต้องปรับปรุง * */}
                  <div>
                    <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs mb-1">
                      เหตุผลที่ต้องปรับปรุง <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      value={reviewFeedback.revisionReason}
                      onChange={(e) => setReviewFeedback({ ...reviewFeedback, revisionReason: e.target.value })}
                      placeholder="ระบุเหตุผลที่ต้องการให้นักกีฬาแก้ไขหรือปรับปรุงเป้าหมาย..."
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                      rows={3}
                      required
                    />
                  </div>

                  {/* คำแนะนำจากโค้ช */}
                  <div>
                    <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs mb-1">
                      คำแนะนำจากโค้ช
                    </label>
                    <textarea
                      value={reviewFeedback.coachFeedback}
                      onChange={(e) => setReviewFeedback({ ...reviewFeedback, coachFeedback: e.target.value })}
                      placeholder="ข้อแนะนำหรือแนวทางการฝึกซ้อมเพื่อช่วยให้นักกีฬาปรับแก้เป้าหมายได้ดีขึ้น..."
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                      rows={2}
                    />
                  </div>

                  {/* ชื่อเป้าหมายที่แนะนำ (Optional) */}
                  <div>
                    <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs mb-1">
                      ชื่อเป้าหมายที่แนะนำ (Optional)
                    </label>
                    <input
                      type="text"
                      value={reviewFeedback.revisionSuggestedTitle}
                      onChange={(e) => setReviewFeedback({ ...reviewFeedback, revisionSuggestedTitle: e.target.value })}
                      placeholder="เช่น พัฒนาการวางเท้าหลักและการยิงด้วยเท้าซ้าย"
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    💬 ข้อคิดเห็น / คำแนะนำจากโค้ช (coachFeedback)
                  </label>
                  <textarea
                    value={reviewFeedback.coachFeedback}
                    onChange={(e) => setReviewFeedback({ ...reviewFeedback, coachFeedback: e.target.value })}
                    placeholder="ใส่คำแนะนำ คำชม หรือแนวทางการฝึกเพิ่มเติมสำหรับนักกีฬา..."
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    rows={3}
                  />
                </div>
              )}
            </div>

            {/* Actions: [ยกเลิก] [ส่งคำแนะนำ] */}
            <div className="flex justify-end items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReviewingGoal(null)}
                className="px-5 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (reviewingGoal.approvalStatus === "NEEDS_REVISION" && !reviewFeedback.revisionReason?.trim()) {
                    alert("กรุณาระบุ 'เหตุผลที่ต้องปรับปรุง' เพื่อให้นักเรียนเข้าใจเหตุผลและทิศทางการพัฒนาที่ถูกต้อง");
                    return;
                  }
                  await handleGoalApproval(reviewingGoal.goal.id, reviewingGoal.approvalStatus, reviewFeedback);
                  setReviewingGoal(null);
                  setReviewFeedback({ coachFeedback: "", revisionReason: "", revisionSuggestedTitle: "", revisionOption: "OPTION_A" });
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {reviewingGoal.approvalStatus === "NEEDS_REVISION" ? "ส่งคำแนะนำ" : "บันทึกการพิจารณา"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
