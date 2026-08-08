import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, onSnapshot, doc, getDoc, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, collectionGroup, increment, setDoc, writeBatch } from "firebase/firestore";
import { Award, Activity, Heart, ChevronRight, UserCircle, Calendar, Utensils, Sun, Moon, Droplet, Bed, XCircle, Info, X, MessageCircle, Send, Target, Dumbbell, Zap, Brain, Shield, Swords, BookOpen, Droplets, Trophy } from "lucide-react";
import PeerVotingModal from "./PeerVotingModal";
import YouthPlayerCV from "./YouthPlayerCV";
import PlayerPortalHome from "./player-portal/PlayerPortalHome";
import MyGoals from "./player-portal/MyGoals";
import DailyReflection from "./player-portal/DailyReflection";
import DailyWellness from "./player-portal/DailyWellness";
import { EmptyState } from "./common/EmptyState";
import { useCareerStats } from "../hooks/useCareerStats";
import { ThaiDatePicker, formatThaiDate } from "./ThaiDatePicker";
import { linkedPlayerLookupForUser } from "../lib/nonStaffPlayerAccess";

interface Teammate {
  id: string;
  name: string;
  position: string;
  avatar: string;
}

export default function PlayerDashboard({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { currentUser } = useAuth();

  const [linkedProfiles, setLinkedProfiles] = useState<any[]>([]);
  const [activeProfileIndex, setActiveProfileIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isClaimingNewPlayer, setIsClaimingNewPlayer] = useState(false);
  const playerProfile = linkedProfiles[activeProfileIndex] || null;
  const [loading, setLoading] = useState(true);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  
  // Claim state
  const [claimStatus, setClaimStatus] = useState<"IDLE" | "SEARCHING" | "PENDING">("IDLE");
  const [claimForm, setClaimForm] = useState({ futId: "", firstName: "", lastName: "", dob: "" });
  const [foundPlayers, setFoundPlayers] = useState<any[]>([]);
  const [selectedPlayerToClaim, setSelectedPlayerToClaim] = useState<any | null>(null);
  const [claimError, setClaimError] = useState("");

  const [showVotingModal, setShowVotingModal] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  // Nutrition & Lifestyle states
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [isAddingDailyLog, setIsAddingDailyLog] = useState(false);
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [selectedLogDate, setSelectedLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [showNutritionGuide, setShowNutritionGuide] = useState(false);
  const [newDailyLog, setNewDailyLog] = useState({
    id: "",
    date: new Date().toISOString().split("T")[0],
    isMatchDay: false,
    breakfast: "",
    breakfastNutrients: [] as string[],
    lunch: "",
    lunchNutrients: [] as string[],
    dinner: "",
    dinnerNutrients: [] as string[],
    snacks: "",
    snacksNutrients: [] as string[],
    hydration: 0,
    sleep: 8,
  });

  const handleNutrientChange = (meal: 'breakfast' | 'lunch' | 'dinner' | 'snacks', nutrient: string, checked: boolean) => {
    setNewDailyLog(prev => {
      const key = `${meal}Nutrients` as keyof typeof prev;
      const current = prev[key] as string[];
      if (checked) {
        return { ...prev, [key]: [...current, nutrient] };
      } else {
        return { ...prev, [key]: current.filter(n => n !== nutrient) };
      }
    });
  };
  
  const currentDailyLog = dailyLogs.find(log => log.date === selectedLogDate) || null;

  // Messaging state
  const [isMessagingCoach, setIsMessagingCoach] = useState(false);
  const [coachMessage, setCoachMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  // Attendance state
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [trainingWeek, setTrainingWeek] = useState<any>(null);
  const [showWeeklyPlan, setShowWeeklyPlan] = useState(false);

  // Career Stats
  const { stats, loading: statsLoading } = useCareerStats(playerProfile?.academyId, playerProfile?.id);

  // Link Coach Evaluation -> Goal state
  const [selectedEvaluationForGoal, setSelectedEvaluationForGoal] = useState<{ evaluationId: string; category?: string } | null>(null);

  const handleCreateGoalFromEval = (evalData: { evaluationId: string; category?: string }) => {
    setSelectedEvaluationForGoal(evalData);
    setActiveTab("goals");
  };

  useEffect(() => {
    if (!currentUser?.id) return;
    let isSubscribed = true;

    const fetchAllLinkedProfiles = async () => {
      try {
        const lookup = linkedPlayerLookupForUser(currentUser);
        const profiles: any[] = [];

        if (lookup.kind === "PLAYER_QUERY") {
          const q = query(
            collection(db, `academies/${lookup.academyId}/players`),
            where("linkedUserId", "==", lookup.uid),
          );
          const snap = await getDocs(q);
          snap.docs.forEach(doc => {
            profiles.push({ id: doc.id, academyId: lookup.academyId, ...doc.data() });
          });
        } else if (lookup.kind === "PARENT_DOCUMENT") {
          const playerSnapshot = await getDoc(doc(
            db,
            `academies/${lookup.academyId}/players`,
            lookup.playerId,
          ));
          if (playerSnapshot.exists()) {
            profiles.push({
              id: playerSnapshot.id,
              academyId: lookup.academyId,
              ...playerSnapshot.data(),
            });
          }
        }

        if (isSubscribed) {
          setLinkedProfiles(profiles);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching player profiles:", error);
        if (isSubscribed) setLoading(false);
      }
    };
    fetchAllLinkedProfiles();

    // Also check if they have a pending claim
    const claimQ = query(collection(db, "profile_claims"), where("userId", "==", currentUser.id), where("status", "==", "PENDING"));
    const claimUnsub = onSnapshot(claimQ, (snap) => {
      if (!snap.empty) {
        setClaimStatus("PENDING");
      }
    }, (error) => {
      console.error("Error fetching profile claims:", error);
    });

    return () => {
      isSubscribed = false;
      claimUnsub();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!playerProfile?.id) return;
    
    let isSubscribed = true;
    const accId = playerProfile.academyId;
    const pId = playerProfile.id;

    // Subscribe to daily logs
    const logsRef = collection(db, `academies/${accId}/players/${pId}/daily_logs`);
    const logsUnsub = onSnapshot(logsRef, (logSnap) => {
      const logs = logSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (isSubscribed) setDailyLogs(sortedLogs);
    });

    // Subscribe to today's attendance
    const today = new Date().toISOString().split("T")[0];
    const attendanceRef = doc(db, `academies/${accId}/players/${pId}/attendance`, today);
    const attUnsub = onSnapshot(attendanceRef, (attSnap) => {
      if (isSubscribed) setTodayAttendance(attSnap.exists() ? { id: attSnap.id, ...attSnap.data() } : null);
    });

    // Academy-wide events, weekly plans and rosters do not carry an owner link.
    // Keep them unavailable rather than treating a legacy academy pointer as authorization.
    setEvents([]);
    setTrainingWeek(null);
    setTeammates([]);

    return () => {
      isSubscribed = false;
      logsUnsub();
      attUnsub();
    };
  }, [playerProfile?.id, playerProfile?.academyId]);

  const normalizeStr = (str: string) => (str || "").trim().toLowerCase().replace(/\s+/g, " ");

  const handleClaimProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimError("");
    setClaimStatus("SEARCHING");
    setFoundPlayers([]);
    setSelectedPlayerToClaim(null);

    try {
      const cleanFutId = normalizeStr(claimForm.futId);
      const cleanFirst = normalizeStr(claimForm.firstName);
      const cleanLast = normalizeStr(claimForm.lastName);
      const inputDob = claimForm.dob;

      // Validate inputs
      if (!cleanFutId && (!cleanFirst || !cleanLast || !inputDob)) {
        setClaimError("กรุณากรอก FUT ID หรือกรอก ชื่อ นามสกุล และ วันเกิด ให้ครบถ้วนเพื่อทำการค้นหา");
        setClaimStatus("IDLE");
        return;
      }

      // Owner-scoped Player rules cannot safely authorize discovery by FUT ID or PII.
      // Keep unlinked account recovery fail-closed until a server-mediated claim flow exists.
      setClaimError("ไม่สามารถค้นหาโปรไฟล์นักเตะแบบสาธารณะได้ กรุณาติดต่อผู้ดูแล Academy เพื่อเชื่อมโยงบัญชีอย่างปลอดภัย");
      setClaimStatus("IDLE");
    } catch (error) {
      console.error(error);
      setClaimError("เกิดข้อผิดพลาดในการค้นหา");
      setClaimStatus("IDLE");
    }
  };

  const handleConfirmClaim = async () => {
    if (!selectedPlayerToClaim || !currentUser?.id) return;
    setClaimStatus("SEARCHING");
    try {
      await addDoc(collection(db, "profile_claims"), {
        playerId: selectedPlayerToClaim.id,
        academyId: selectedPlayerToClaim.academyId,
        futId: selectedPlayerToClaim.futId || "N/A",
        userId: currentUser.id,
        userEmail: currentUser.email || "",
        playerName: `${selectedPlayerToClaim.firstName} ${selectedPlayerToClaim.lastName}`,
        status: "PENDING",
        requestedAt: serverTimestamp(),
      });
      setClaimStatus("PENDING");
      setSelectedPlayerToClaim(null);
      setFoundPlayers([]);
    } catch (error) {
      console.error("Error confirming claim:", error);
      setClaimError("เกิดข้อผิดพลาดในการส่งคำขอเชื่อมโยง");
      setClaimStatus("IDLE");
    }
  };

  const handleSaveDailyLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerProfile?.id || !playerProfile?.academyId) return;
    try {
      setIsSavingLog(true);
      const logData = {
        date: newDailyLog.date,
        isMatchDay: newDailyLog.isMatchDay,
        breakfast: newDailyLog.breakfast,
        breakfastNutrients: newDailyLog.breakfastNutrients,
        lunch: newDailyLog.lunch,
        lunchNutrients: newDailyLog.lunchNutrients,
        dinner: newDailyLog.dinner,
        dinnerNutrients: newDailyLog.dinnerNutrients,
        snacks: newDailyLog.snacks,
        snacksNutrients: newDailyLog.snacksNutrients,
        hydration: Number(newDailyLog.hydration),
        sleep: Number(newDailyLog.sleep),
      };

      if (newDailyLog.id) {
        const logDocRef = doc(db, `academies/${playerProfile.academyId}/players/${playerProfile.id}/daily_logs`, newDailyLog.id);
        await updateDoc(logDocRef, {
          ...logData,
          updatedAt: new Date().toISOString()
        });
      } else {
        const logsRef = collection(db, `academies/${playerProfile.academyId}/players/${playerProfile.id}/daily_logs`);
        await addDoc(logsRef, {
          ...logData,
          createdAt: new Date().toISOString()
        });
      }
      setIsAddingDailyLog(false);
      setNewDailyLog({
        id: "",
        date: new Date().toISOString().split("T")[0],
        isMatchDay: false,
        breakfast: "", breakfastNutrients: [],
        lunch: "", lunchNutrients: [],
        dinner: "", dinnerNutrients: [],
        snacks: "", snacksNutrients: [],
        hydration: 0, sleep: 8,
      });
    } catch (error) {
      console.error("Error saving daily log:", error);
    } finally {
      setIsSavingLog(false);
    }
  };

  const handleDeleteDailyLog = async (logId: string) => {
    if (!playerProfile?.id || !playerProfile?.academyId) return;
    if (!window.confirm("คุณต้องการลบข้อมูลโภชนาการของวันนี้ใช่หรือไม่?")) return;
    try {
      const logDocRef = doc(db, `academies/${playerProfile.academyId}/players/${playerProfile.id}/daily_logs`, logId);
      await deleteDoc(logDocRef);
    } catch (error) {
      console.error("Error deleting daily log:", error);
    }
  };

  const handleVotingClose = () => {
    setShowVotingModal(false);
    setHasVoted(true);
  };

  const handleVoteSubmit = async (votes: {playerId: string, badgeId: string}[]) => {
    if (!playerProfile?.academyId || !currentUser?.id || votes.length === 0) return;
    try {
      const batch = writeBatch(db);
      
      votes.forEach(vote => {
        // 1. Add endorsement record
        const endorsementRef = doc(collection(db, `academies/${playerProfile.academyId}/endorsements`));
        batch.set(endorsementRef, {
          receiverId: vote.playerId,
          voterId: currentUser.id,
          voterName: `${playerProfile.firstName || ""} ${playerProfile.lastName || ""}`.trim(),
          badgeType: vote.badgeId,
          createdAt: serverTimestamp()
        });

        // 2. Increment stats on the voted player's profile
        const playerRef = doc(db, `academies/${playerProfile.academyId}/players`, vote.playerId);
        batch.update(playerRef, {
          [`endorsementStats.${vote.badgeId}`]: increment(1)
        });
      });

      await batch.commit();
      
    } catch (error) {
      console.error("Error submitting votes:", error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!playerProfile || isClaimingNewPlayer) {
    if (claimStatus === "PENDING") {
      return (
        <div className="w-full max-w-md mx-auto mt-20">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 text-center">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-800 mb-2">คำขออยู่ระหว่างรออนุมัติ</h2>
            <p className="text-slate-500 text-sm mb-6">
              ระบบได้ส่งคำขอไปยังผู้ดูแลระบบและโค้ชแล้ว กรุณารอการอนุมัติเพื่อเข้าถึงโปรไฟล์ของคุณ
            </p>
            {linkedProfiles.length > 0 && (
              <button 
                onClick={() => setIsClaimingNewPlayer(false)}
                className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                กลับไปหน้าโปรไฟล์
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-md mx-auto mt-10">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 relative">
          {linkedProfiles.length > 0 && (
            <button 
              onClick={() => setIsClaimingNewPlayer(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2"
            >
              <X size={24} />
            </button>
          )}

          {/* 1. Single Selected Candidate Confirmation View */}
          {selectedPlayerToClaim ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserCircle size={32} />
              </div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">ยืนยันโปรไฟล์ของคุณ</h2>
              <p className="text-slate-500 mt-1 text-sm mb-6">พบโปรไฟล์นักกีฬาที่ตรงกับข้อมูลของคุณ กรุณายืนยันความถูกต้อง</p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 text-left space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">ชื่อ-นามสกุล</p>
                    <p className="text-lg font-bold text-slate-800">{selectedPlayerToClaim.firstName} {selectedPlayerToClaim.lastName}</p>
                  </div>
                  <span className="px-3 py-1 bg-indigo-100 text-indigo-700 font-mono font-bold text-xs rounded-full">
                    {selectedPlayerToClaim.futId || "N/A"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">อคาเดมี่ / สโมสร</p>
                    <p className="font-semibold text-slate-700">{selectedPlayerToClaim.academyName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">วันเกิด</p>
                    <p className="font-semibold text-slate-700">{formatThaiDate(selectedPlayerToClaim.dob) || selectedPlayerToClaim.dob || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">ตำแหน่ง / รุ่นอายุ</p>
                    <p className="font-semibold text-slate-700">{selectedPlayerToClaim.position || "-"} ({selectedPlayerToClaim.ageGroup || "-"})</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">สถานะ</p>
                    <p className="font-semibold text-emerald-600">พร้อมเชื่อมโยง</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirmClaim}
                disabled={claimStatus === "SEARCHING"}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition-colors shadow-sm mb-3"
              >
                {claimStatus === "SEARCHING" ? "กำลังส่งคำขอ..." : "✓ นี่คือโปรไฟล์ของฉัน (ยืนยัน)"}
              </button>

              <button
                onClick={() => { setSelectedPlayerToClaim(null); setFoundPlayers([]); }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                ← ค้นหาใหม่
              </button>
            </div>
          ) : foundPlayers.length > 1 ? (
            /* 2. Multiple Candidates Selection List */
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight text-center mb-2">พบโปรไฟล์ {foundPlayers.length} รายการ</h2>
              <p className="text-slate-500 text-sm text-center mb-6">กรุณาเลือกโปรไฟล์ที่เป็นของคุณเพื่อดำเนินการต่อ</p>

              <div className="space-y-3 mb-6 max-h-80 overflow-y-auto pr-1">
                {foundPlayers.map((player) => (
                  <div key={`${player.academyId}-${player.id}`} className="border border-slate-200 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-300 transition-colors">
                    <div>
                      <p className="font-bold text-slate-800">{player.firstName} {player.lastName}</p>
                      <p className="text-xs text-slate-500">สโมสร: {player.academyName} | FUT ID: {player.futId || "N/A"}</p>
                      <p className="text-xs text-slate-400">วันเกิด: {formatThaiDate(player.dob) || player.dob}</p>
                    </div>
                    <button
                      onClick={() => setSelectedPlayerToClaim(player)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors shrink-0"
                    >
                      เลือกโปรไฟล์นี้
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => { setFoundPlayers([]); setSelectedPlayerToClaim(null); }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                ← ค้นหาใหม่
              </button>
            </div>
          ) : (
            /* 3. Main Search Form (FUT ID Priority + Name/DOB Alternative) */
            <div>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UserCircle size={32} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">เชื่อมโยงโปรไฟล์นักกีฬา</h2>
                <p className="text-slate-500 mt-2 text-sm">ค้นหาด้วยรหัส FUT ID หรือระบุชื่อ-นามสกุลและวันเกิด</p>
              </div>

              <form onSubmit={handleClaimProfile} className="space-y-4">
                {claimError && (
                  <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100">
                    {claimError}
                  </div>
                )}

                {/* Priority 1: FUT ID Input */}
                <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100">
                  <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1">
                    วิธีที่ 1: รหัส FUT ID (แนะนำสำหรับความถูกต้อง 100%)
                  </label>
                  <input
                    type="text"
                    value={claimForm.futId}
                    onChange={e => setClaimForm({...claimForm, futId: e.target.value})}
                    className="w-full px-4 py-3 bg-white text-slate-900 placeholder:text-slate-400 border border-indigo-200 rounded-xl font-mono uppercase font-bold text-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                    placeholder="เช่น FUT-26-PEA7A7"
                  />
                  <p className="text-[11px] text-indigo-600/80 mt-1">
                    *หากทราบ FUT ID สามารถกรอกช่องนี้เพียงช่องเดียวและกดค้นหาได้เลย
                  </p>
                </div>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-xs font-bold text-slate-400 uppercase tracking-wider">หรือ ค้นหาด้วยชื่อและวันเกิด</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                {/* Priority 2: Name + DOB Alternative */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อ (ภาษาที่โค้ชบันทึก)</label>
                  <input
                    type="text"
                    value={claimForm.firstName}
                    onChange={e => setClaimForm({...claimForm, firstName: e.target.value})}
                    className="w-full px-4 py-3 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                    placeholder="เช่น เจตน์สฤษฎ์"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">นามสกุล</label>
                  <input
                    type="text"
                    value={claimForm.lastName}
                    onChange={e => setClaimForm({...claimForm, lastName: e.target.value})}
                    className="w-full px-4 py-3 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a', backgroundColor: '#ffffff', opacity: 1 }}
                    placeholder="เช่น ทิวัตถ์ธรรม"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">วันเกิด</label>
                  <ThaiDatePicker
                    value={claimForm.dob}
                    onChange={e => setClaimForm({...claimForm, dob: e.target.value})}
                    className="w-full px-4 py-3 bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={claimStatus === "SEARCHING"}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors mt-6 shadow-sm"
                >
                  {claimStatus === "SEARCHING" ? "กำลังค้นหา..." : "🔍 ค้นหาโปรไฟล์นักกีฬา"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coachMessage.trim() || !playerProfile?.academyId) return;

    // Academy messages are staff-only under the canonical tenant Rules.
    // Keep this fail-closed until a recipient-bound Player messaging schema exists.
    alert("ยังไม่สามารถส่งข้อความจากบัญชีนักกีฬาได้ กรุณาติดต่อผู้ดูแล Academy โดยตรง");
  };

  const handleCheckIn = async () => {
    if (!playerProfile?.academyId || !currentUser?.id) return;
    setIsCheckingIn(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const attendanceRef = doc(db, `academies/${playerProfile.academyId}/players/${playerProfile.id}/attendance`, today);
      await setDoc(attendanceRef, {
        status: "PRESENT",
        checkedInAt: serverTimestamp(),
        checkedInBy: currentUser.id,
        checkedInByName: currentUser.name || "Parent",
        date: today
      }, { merge: true });
    } catch (error) {
      console.error("Error checking in:", error);
    } finally {
      setIsCheckingIn(false);
    }
  };
  
  const renderActiveTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <PlayerPortalHome playerProfile={playerProfile} events={events} onNavigateTab={setActiveTab} onOpenMessageCoach={() => setIsMessagingCoach(true)} />;
      case "profile":
        return <YouthPlayerCV player={playerProfile} academyIdOverride={playerProfile.academyId} isSelfView={true} onCreateGoalFromEval={handleCreateGoalFromEval} />;
      case "goals":
        return <MyGoals academyId={playerProfile.academyId} playerId={playerProfile.id} initialEvaluation={selectedEvaluationForGoal} onGoalCreated={() => setSelectedEvaluationForGoal(null)} />;
      case "reflection":
        return <DailyReflection academyId={playerProfile.academyId} playerId={playerProfile.id} />;
      case "wellness":
        return <DailyWellness academyId={playerProfile.academyId} playerId={playerProfile.id} todayAttendance={todayAttendance} />;
      default:
        return <PlayerPortalHome playerProfile={playerProfile} events={events} onNavigateTab={setActiveTab} onOpenMessageCoach={() => setIsMessagingCoach(true)} />;
    }
  };

  return (
    <div className="w-full h-full pb-20 md:pb-0">
      {/* Switch Player Tabs */}
      {linkedProfiles.length > 1 && (
        <div className="w-full max-w-4xl mx-auto mb-6 px-2 sm:px-0">
          <div className="flex items-center gap-2 flex-wrap pb-2">
            {linkedProfiles.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setActiveProfileIndex(idx)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all border ${
                  activeProfileIndex === idx 
                    ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-md" 
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 font-medium"
                }`}
              >
                <div className={`w-6 h-6 rounded-full overflow-hidden shrink-0 ${activeProfileIndex === idx ? 'ring-2 ring-white/50' : 'bg-slate-200'}`}>
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle size={24} className="text-slate-400" />
                  )}
                </div>
                {p.firstName}
              </button>
            ))}
            <button
              onClick={() => setIsClaimingNewPlayer(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors font-medium ml-2"
            >
              <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                +
              </div>
              เพิ่มผู้เล่น
            </button>
          </div>
        </div>
      )}
      
      {/* Internal Navigation Tabs */}
      <div className="w-full max-w-7xl mx-auto mb-6 px-2 sm:px-0">
        <div className="flex flex-wrap items-center gap-2 pb-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
          <button 
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === 'profile' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            My Profile
          </button>
          <button 
            onClick={() => setActiveTab("goals")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === 'goals' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            My Goals
          </button>
          <button 
            onClick={() => setActiveTab("reflection")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === 'reflection' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Daily Reflection
          </button>
          <button 
            onClick={() => setActiveTab("wellness")}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeTab === 'wellness' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Daily Wellness
          </button>
        </div>
      </div>

      {/* Render Active Module */}
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-0 mb-24 pb-12">
        {renderActiveTabContent()}
      </div>

      {/* Send Message to Coach Modal */}
      {isMessagingCoach && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                  💬
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">ส่งข้อความถึงโค้ช</h3>
                  <p className="text-xs text-slate-500 font-medium">ส่งข้อความหาโค้ชผู้ดูแลทีม U-{playerProfile?.ageGroup || "?"}</p>
                </div>
              </div>
              <button onClick={() => setIsMessagingCoach(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSendMessage} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 pl-1">ข้อความถึงโค้ช</label>
                <textarea
                  required
                  rows={4}
                  value={coachMessage}
                  onChange={(e) => setCoachMessage(e.target.value)}
                  placeholder="พิมพ์ข้อความที่ต้องการแจ้งโค้ช เช่น ลากิจ/ลาป่วย หรือสอบถามเรื่องการซ้อม..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMessagingCoach(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSendingMessage || !coachMessage.trim()}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md transition-all text-sm flex items-center gap-2"
                >
                  {isSendingMessage ? "กำลังส่ง..." : "ส่งข้อความ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
