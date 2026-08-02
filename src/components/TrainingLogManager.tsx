import React, { useState, useEffect, useMemo } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import { Trophy, ChevronLeft, ChevronRight, Activity, Save, History, Search, Filter, AlertCircle, BookOpen, X, CheckCircle2, FileText, Target } from "lucide-react";
import IDPTrainingModal from "./common/IDPTrainingModal";
import { collection, doc, onSnapshot, getDoc, setDoc, query, where, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAcademy } from "../contexts/AcademyContext";
import { useActivityLogger } from "../hooks/useActivityLogger";
import PlayerTrainingDashboard from "./PlayerTrainingDashboard";
import { ResponsiveDataTable, Column } from "./common/ResponsiveDataTable";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position?: string;
  avatar?: string;
  seasonHistory?: any;
}

import { IDPTraining } from "../hooks/useTrainingLog";
import { Plus } from "lucide-react";

type AttendanceStatus = "Present" | "Late" | "Absent" | "Sick" | "Injured";

interface TrainingLog {
  rpe: number;
  minutes: number;
  notes: string;
  idpTraining?: IDPTraining;
}

export default function TrainingLogManager({
  onBack,
  onNavigate
}: {
  onBack: () => void;
  onNavigate: (page: string) => void;
}) {
  const { getAcademyCollection, academyId, settings, activeSeason } = useAcademy();
  const { logActivity } = useActivityLogger();
  const [players, setPlayers] = useState<Player[]>([]);
  const [idps, setIdps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [trainingLogs, setTrainingLogs] = useState<Record<string, TrainingLog>>({});
  
  const [todayTheme, setTodayTheme] = useState<string>("ไม่มีการฝึกซ้อม");
  const [dayId, setDayId] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  
  const [viewMode, setViewMode] = useState<"dashboard" | "entry">("dashboard");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [idpModalPlayer, setIdpModalPlayer] = useState<Player | null>(null);

  const parseDateLocal = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const getWeekStartStr = (dateStr: string) => {
    const d = parseDateLocal(dateStr);
    const dayOfWeekStr = d.getDay();
    const diffToMonday = d.getDate() - dayOfWeekStr + (dayOfWeekStr === 0 ? -6 : 1);
    const startOfWeek = new Date(d);
    startOfWeek.setDate(diffToMonday);
    const startYear = startOfWeek.getFullYear();
    const startMonth = String(startOfWeek.getMonth() + 1).padStart(2, '0');
    const startDate = String(startOfWeek.getDate()).padStart(2, '0');
    return `${startYear}-${startMonth}-${startDate}`;
  };

  const getFormattedDateShort = (dateStr: string) => {
    const d = parseDateLocal(dateStr);
    const monthsArr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${monthsArr[d.getMonth()]} ${d.getDate()}`;
  };

  useEffect(() => {
    if (!academyId) return;

    // Fetch players
    const playersRef = collection(db, "academies", academyId, "players");
    const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
      const playersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Player[];
      
      const filteredPlayers = playersData.filter(p => {
        const isSeasonActive = p.seasonHistory?.[activeSeason]?.active 
          || (!p.seasonHistory && activeSeason === (settings.currentSeason || "2026"));
        return isSeasonActive;
      });

      setPlayers(filteredPlayers);
    });

    const idpRef = collection(db, "academies", academyId, "idps");
    const unsubscribeIDPs = onSnapshot(idpRef, (snapshot) => {
      setIdps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribePlayers();
      unsubscribeIDPs();
    };
  }, [academyId, activeSeason, settings.currentSeason]);

  useEffect(() => {
    if (!academyId || !selectedDate) return;
    
    let isMounted = true;
    const fetchAttendanceAndLogs = async () => {
      setIsLoading(true);
      try {
        const weekStartStr = getWeekStartStr(selectedDate);
        const formattedShort = getFormattedDateShort(selectedDate);
        
        const docRef = doc(getAcademyCollection("training_weeks"), weekStartStr);
        const docSnap = await getDoc(docRef);
        
        let finalTheme = "ไม่มีข้อมูลในสัปดาห์นี้";
        let currentDayId = null;
        let newAttendance: Record<string, AttendanceStatus> = {};
        let newLogs: Record<string, TrainingLog> = {};

        if (docSnap.exists()) {
          const data = docSnap.data();
          const days = data.days || [];
          const attendanceDB = data.attendanceDB || {};
          const trainingLogsDB = data.trainingLogsDB || {};
          
          const currentDay = days.find((d: any) => d.date === formattedShort);
          if (currentDay) {
            if (currentDay.theme === "Rest") {
              finalTheme = "วันพักผ่อน (Rest Day)";
            } else {
              finalTheme = currentDay.theme || "การฝึกซ้อมประจำวัน";
              currentDayId = currentDay.id;
              newAttendance = attendanceDB[currentDay.id] || {};
              newLogs = trainingLogsDB[currentDay.id] || {};
            }
          } else {
            finalTheme = "ไม่มีข้อมูลการฝึกซ้อม";
          }
        }

        // Query Matches for today
        const matchesRef = collection(db, "academies", academyId, "matches");
        const matchQuery = query(matchesRef, where("matchDate", "==", selectedDate));
        const matchSnap = await getDocs(matchQuery);
        
        if (!matchSnap.empty) {
          const m = matchSnap.docs[0].data();
          finalTheme = m.opponentName ? `Match vs ${m.opponentName}` : "Official Match Day";
          
          const mergeAttendance = { ...newAttendance };
          if (m.playersData) {
            Object.keys(m.playersData).forEach(pid => {
              if (!mergeAttendance[pid]) mergeAttendance[pid] = "Present";
            });
          }
          if (m.players) {
            m.players.forEach((p: any) => { if (!mergeAttendance[p.id]) mergeAttendance[p.id] = "Present"; });
          }
          if (m.guestPlayers) {
            m.guestPlayers.forEach((p: any) => { if (!mergeAttendance[p.id]) mergeAttendance[p.id] = "Present"; });
          }
          newAttendance = mergeAttendance;
          
          if (!currentDayId) {
            currentDayId = `match_${selectedDate}`;
          }
        }

        if (isMounted) {
          setTodayTheme(finalTheme);
          setDayId(currentDayId);
          setAttendance(newAttendance);
          setTrainingLogs(newLogs);
        }
      } catch (err) {
        console.error("Error fetching attendance/logs:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAttendanceAndLogs();

    return () => { isMounted = false; };
  }, [selectedDate, academyId]);

  const handleAttendanceChange = (playerId: string, status: AttendanceStatus) => {
    setAttendance(prev => ({
      ...prev,
      [playerId]: status
    }));
  };

  const handleLogChange = (playerId: string, field: keyof TrainingLog, value: any) => {
    setTrainingLogs(prev => {
      const current = prev[playerId] || { rpe: 0, minutes: 0, notes: "" };
      return {
        ...prev,
        [playerId]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  const handleSave = async () => {
    if (!dayId || !academyId) {
      alert("กรุณาเลือกวันที่มีการฝึกซ้อมก่อนบันทึก");
      return;
    }

    try {
      setIsSaving(true);
      const weekStartStr = getWeekStartStr(selectedDate);
      const docRef = doc(getAcademyCollection("training_weeks"), weekStartStr);
      
      const docSnap = await getDoc(docRef);
      let data = docSnap.exists() ? docSnap.data() : { 
        id: weekStartStr, 
        days: [], 
        attendanceDB: {}, 
        trainingLogsDB: {} 
      };

      const newAttendanceDB = data.attendanceDB || {};
      const newTrainingLogsDB = data.trainingLogsDB || {};
      const newDays = data.days || [];

      newAttendanceDB[dayId] = attendance;
      newTrainingLogsDB[dayId] = trainingLogs;

      if (!newDays.find((d: any) => d.id === dayId)) {
        newDays.push({
          id: dayId,
          date: getFormattedDateShort(selectedDate),
          dayOfWeek: parseDateLocal(selectedDate).toLocaleDateString("en-US", { weekday: 'short' }),
          theme: todayTheme,
          intensity: "Medium"
        });
      }

      await setDoc(docRef, {
        ...data,
        days: newDays,
        attendanceDB: newAttendanceDB,
        trainingLogsDB: newTrainingLogsDB,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Sync attendance to each player's attendance and daily_logs subcollections
      try {
        const batch = writeBatch(db);
        const dayData = newDays.find((d: any) => d.id === dayId);
        Object.entries(attendance).forEach(([pId, status]) => {
          if (!pId) return;
          const normalizedStatus = 
            status === "Present" ? "PRESENT" :
            status === "Late" ? "LATE" :
            status === "Sick" ? "SICK" :
            status === "Injured" ? "INJURED" : "ABSENT";

          const attRef = doc(db, `academies/${academyId}/players/${pId}/attendance`, selectedDate);
          batch.set(attRef, {
            status: normalizedStatus,
            attendanceStatus: status,
            date: selectedDate,
            dayOfWeek: dayData?.dayOfWeek || parseDateLocal(selectedDate).toLocaleDateString("en-US", { weekday: 'short' }),
            checkedInAt: serverTimestamp(),
            source: "TRAINING_LOG",
          }, { merge: true });

          const logRef = doc(db, `academies/${academyId}/players/${pId}/daily_logs`, selectedDate);
          batch.set(logRef, {
            id: selectedDate,
            date: selectedDate,
            dayOfWeek: dayData?.dayOfWeek || parseDateLocal(selectedDate).toLocaleDateString("en-US", { weekday: 'short' }),
            theme: todayTheme || "General Training",
            intensity: dayData?.intensity || "Medium",
            attendanceStatus: status,
            isAttended: status === "Present" || status === "Late",
            rpe: trainingLogs[pId]?.rpe || 0,
            minutes: trainingLogs[pId]?.minutes || 0,
            updatedAt: serverTimestamp(),
            source: "TRAINING_LOG",
          }, { merge: true });
        });
        await batch.commit();
        console.log(`[TrainingLogManager] Synced attendance & logs for date: ${selectedDate}`);
      } catch (syncErr) {
        console.error("Error syncing to player subcollections:", syncErr);
      }

      await logActivity(`บันทึกข้อมูลการเข้าซ้อมและล็อก (${getFormattedDateShort(selectedDate)})`);
      alert("บันทึกข้อมูลสำเร็จ!");
    } catch (err) {
      console.error("Error saving data:", err);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPlayers = players.filter(p => 
    (p.firstName?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    (p.lastName?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  const tableColumns: Column<Player>[] = [
    {
      key: "player",
      header: "นักกีฬา",
      sticky: true,
      className: "min-w-[250px]",
      render: (p) => {
        const activeIDP = idps.find(i => i.playerId === p.id && (i.status === "Active" || i.status === "In Progress"));
        return (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
              {p.avatar ? (
                <img src={p.avatar} alt={p.firstName} className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-slate-400 dark:text-slate-500 font-bold text-xs">{p.firstName?.[0]}</span>
              )}
            </div>
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-200">{p.firstName} {p.lastName}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">{p.position || "Player"}</div>
                {activeIDP && (
                  <div className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-500/30 flex items-center gap-1 cursor-help" title={`IDP Goal: ${activeIDP.goal || 'ไม่มีเป้าหมาย'}`}>
                    <Target size={10} /> Focus
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      key: "attendance",
      header: "เช็คชื่อ",
      className: "min-w-[150px]",
      render: (p) => {
        const pStatus = attendance[p.id] || "";
        return (
          <select 
            value={pStatus}
            onChange={(e) => handleAttendanceChange(p.id, e.target.value as AttendanceStatus)}
            className={`text-xs font-bold rounded-xl px-3 py-1.5 outline-none border transition-colors cursor-pointer ${
              pStatus === "Present" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30" :
              pStatus === "Late" ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30" :
              pStatus === "Absent" ? "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30" :
              pStatus === "Sick" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30" :
              pStatus === "Injured" ? "bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/30" :
              "bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/50"
            }`}
          >
            <option value="" disabled>-- เลือกสถานะ --</option>
            <option value="Present">มาซ้อม (Present)</option>
            <option value="Late">สาย (Late)</option>
            <option value="Absent">ขาดซ้อม (Absent)</option>
            <option value="Sick">ป่วย (Sick)</option>
            <option value="Injured">บาดเจ็บ (Injured)</option>
          </select>
        );
      }
    },
    {
      key: "rpe",
      header: "RPE (1-10)",
      render: (p) => {
        const pLog = trainingLogs[p.id] || { rpe: 0, minutes: 0, notes: "" };
        return (
          <input 
            type="number" 
            min="0" max="10"
            value={pLog.rpe || ""}
            onChange={(e) => handleLogChange(p.id, "rpe", Number(e.target.value))}
            placeholder="0-10"
            className="w-16 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20"
          />
        );
      }
    },
    {
      key: "minutes",
      header: "เวลาซ้อม (นาที)",
      render: (p) => {
        const pLog = trainingLogs[p.id] || { rpe: 0, minutes: 0, notes: "" };
        return (
          <input 
            type="number" 
            min="0"
            value={pLog.minutes || ""}
            onChange={(e) => handleLogChange(p.id, "minutes", Number(e.target.value))}
            placeholder="Min"
            className="w-20 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20"
          />
        );
      }
    },
    {
      key: "notes",
      header: "บันทึกจากโค้ช",
      width: "33%",
      render: (p) => {
        const pLog = trainingLogs[p.id] || { rpe: 0, minutes: 0, notes: "" };
        return (
          <div className="flex items-center relative w-full min-w-[200px]">
            <FileText size={14} className="absolute left-3 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              value={pLog.notes || ""}
              onChange={(e) => handleLogChange(p.id, "notes", e.target.value)}
              placeholder="พิมพ์บันทึกย่อจากโค้ช..."
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20"
            />
          </div>
        );
      }
    },
    {
      key: "idpTraining",
      header: "IDP Extra Training",
      render: (p) => {
        const pLog = trainingLogs[p.id];
        const hasIdpTraining = !!pLog?.idpTraining?.activity;
        return (
          <button
            onClick={() => setIdpModalPlayer(p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              hasIdpTraining
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                : "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
            }`}
          >
            {hasIdpTraining ? (
              <>
                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span className="truncate max-w-[130px]">{pLog.idpTraining?.activity}</span>
              </>
            ) : (
              <>
                <Plus size={13} />
                <span>+ IDP Training</span>
              </>
            )}
          </button>
        );
      }
    }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 bg-white dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full border border-slate-200 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors shadow-sm cursor-pointer"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-indigo-400 dark:to-emerald-400 tracking-tight dark:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">Training Log & Attendance</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium">บันทึกรายละเอียดการซ้อมและเช็คชื่อ</p>
          </div>
        </div>
        
        <div className="flex bg-slate-100 dark:bg-slate-800/40 border border-transparent dark:border-slate-700/50 p-1 rounded-xl backdrop-blur-sm">
          <button
            onClick={() => setViewMode("dashboard")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
              viewMode === "dashboard" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setViewMode("entry")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
              viewMode === "entry" ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            }`}
          >
            Daily Entry
          </button>
        </div>

        {viewMode === "entry" && (
          <button
            onClick={handleSave}
            disabled={isSaving || !dayId}
            className="bg-indigo-600 dark:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 transition-colors shadow-sm text-sm flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isSaving ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span> : <Save size={18} />}
            บันทึกข้อมูล
          </button>
        )}
      </div>

      {viewMode === "dashboard" ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm backdrop-blur-sm">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">เลือกนักกีฬา (Select Player)</label>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full md:w-1/2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-3 text-slate-700 dark:text-slate-200 font-bold outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20"
            >
              <option value="" disabled>-- เลือกนักกีฬาเพื่อดูสถิติ --</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
          </div>

          {selectedPlayerId ? (
            <PlayerTrainingDashboard playerId={selectedPlayerId} />
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-12 text-center flex flex-col items-center justify-center backdrop-blur-sm">
              <h3 className="text-slate-500 dark:text-slate-400 font-bold text-lg mb-2">ยังไม่ได้เลือกนักกีฬา</h3>
              <p className="text-slate-400 dark:text-slate-500 text-sm">กรุณาเลือกนักกีฬาจากเมนูด้านบนเพื่อดูสถิติการฝึกซ้อม</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center justify-between backdrop-blur-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">วันที่ (Date)</label>
            <ThaiDatePicker 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2 text-slate-700 dark:text-slate-200 font-medium outline-none focus-within:border-indigo-500 dark:focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">หัวข้อการฝึก (Theme)</label>
            <div className={`px-4 py-2 rounded-xl font-bold ${dayId ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-transparent dark:border-indigo-500/30' : 'bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-slate-700/50'}`}>
              {todayTheme}
            </div>
          </div>
        </div>
        
        <div className="relative w-full md:w-64">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input 
            type="text"
            placeholder="ค้นหานักกีฬา..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-indigo-500 dark:focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {!dayId ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-3 backdrop-blur-sm">
          <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center">
            <AlertCircle size={24} className="text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-amber-800 dark:text-amber-300 font-bold text-lg">ไม่สามารถบันทึกข้อมูลได้</h3>
          <p className="text-amber-600 dark:text-amber-400/80 max-w-md text-sm">วันที่คุณเลือกยังไม่มีการสร้างตารางฝึกซ้อม หรือถูกกำหนดให้เป็นวันพัก กรุณาไปที่เมนู Periodization เพื่อสร้างตารางฝึกซ้อมก่อน</p>
        </div>
      ) : isLoading ? (
        <div className="p-12 text-center text-slate-500 font-bold flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          กำลังโหลดข้อมูล...
        </div>
      ) : (
        <ResponsiveDataTable 
          columns={tableColumns}
          data={filteredPlayers}
          keyExtractor={(p) => p.id}
          emptyMessage="ไม่พบข้อมูลนักกีฬา"
        />
      )}
        </>
      )}

      {idpModalPlayer && (
        <IDPTrainingModal
          player={idpModalPlayer}
          academyId={academyId}
          idps={idps}
          initialData={trainingLogs[idpModalPlayer.id]?.idpTraining}
          onSave={(idpTraining) => {
            setTrainingLogs(prev => {
              const current = prev[idpModalPlayer.id] || { rpe: 0, minutes: 0, notes: "" };
              return {
                ...prev,
                [idpModalPlayer.id]: {
                  ...current,
                  idpTraining: idpTraining
                }
              };
            });
            setIdpModalPlayer(null);
          }}
          onClose={() => setIdpModalPlayer(null)}
        />
      )}
    </div>
  );
}
