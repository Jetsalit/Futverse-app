import React, { useState, useEffect } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import { ChevronLeft, UserCheck, UserX, AlertTriangle, Activity, Calendar } from "lucide-react";
import { collection, doc, onSnapshot, getDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAcademy } from "../contexts/AcademyContext";
interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position?: string;
  avatar?: string;
  seasonHistory?: any;
}

type AttendanceStatus = "Present" | "Late" | "Absent" | "Sick" | "Injured";

export default function DailyAttendanceSummary({ 
  onBack,
  onNavigate
}: { 
  onBack: () => void;
  onNavigate: (page: string) => void;
}) {
  const { getAcademyCollection, academyId, settings, activeSeason } = useAcademy();
  const [players, setPlayers] = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [todayTheme, setTodayTheme] = useState<string>("ไม่มีการฝึกซ้อม");
  
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const selectedDate = (() => {
    const [y, m, d] = selectedDateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  })();
  const formattedDate = selectedDate.toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  useEffect(() => {
    if (!academyId) return;
    setIsLoading(true);

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

    // Fetch selected date's attendance
    const fetchAttendance = async () => {
      try {
        const dayOfWeekStr = selectedDate.getDay();
        const diffToMonday = selectedDate.getDate() - dayOfWeekStr + (dayOfWeekStr === 0 ? -6 : 1);
        const startOfWeek = new Date(selectedDate);
        startOfWeek.setDate(diffToMonday);
        const startYear = startOfWeek.getFullYear();
        const startMonth = String(startOfWeek.getMonth() + 1).padStart(2, '0');
        const startDate = String(startOfWeek.getDate()).padStart(2, '0');
        const startStr = `${startYear}-${startMonth}-${startDate}`;
        
        const monthsArr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const formattedDateShort = `${monthsArr[selectedDate.getMonth()]} ${selectedDate.getDate()}`;
        
        let docRef = doc(getAcademyCollection("training_weeks"), startStr);
        let docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
          // Fallback to -1 day if document was saved with timezone shift
          const altDate = new Date(startOfWeek);
          altDate.setDate(altDate.getDate() - 1);
          const altYear = altDate.getFullYear();
          const altMonth = String(altDate.getMonth() + 1).padStart(2, '0');
          const altDay = String(altDate.getDate()).padStart(2, '0');
          const altStr = `${altYear}-${altMonth}-${altDay}`;
          const altSnap = await getDoc(doc(getAcademyCollection("training_weeks"), altStr));
          if (altSnap.exists()) {
            docSnap = altSnap;
          }
        }
        
        let finalTheme = "ไม่มีการฝึกซ้อม";
        let newAttendance: Record<string, AttendanceStatus> = {};

        if (docSnap.exists()) {
          const data = docSnap.data();
          const days = data.days || [];
          const attendanceDB = data.attendanceDB || {};
          
          const currentDay = days.find((d: any) => d.date === formattedDateShort);
          if (currentDay) {
            if (currentDay.theme === "Rest") {
              finalTheme = "วันพักผ่อน (Rest Day)";
            } else {
              finalTheme = currentDay.theme || "การฝึกซ้อมประจำวัน";
            }
            if (attendanceDB[currentDay.id]) {
              newAttendance = attendanceDB[currentDay.id];
            }
          }
        }

        // Query Matches for today
        const matchesRef = collection(db, "academies", academyId, "matches");
        const matchQuery = query(matchesRef, where("matchDate", "==", selectedDateStr));
        const matchSnap = await getDocs(matchQuery);
        
        if (!matchSnap.empty) {
          const m = matchSnap.docs[0].data();
          finalTheme = m.opponentName ? `Match vs ${m.opponentName}` : "Official Match Day";
          
          const mergeAttendance = { ...newAttendance };
          if (m.playersData) {
            Object.keys(m.playersData).forEach(pid => {
              mergeAttendance[pid] = "Present";
            });
          }
          if (m.players) {
            m.players.forEach((p: any) => { mergeAttendance[p.id] = "Present"; });
          }
          if (m.guestPlayers) {
            m.guestPlayers.forEach((p: any) => { mergeAttendance[p.id] = "Present"; });
          }
          newAttendance = mergeAttendance;
        }

        setTodayTheme(finalTheme);
        setAttendance(newAttendance);
      } catch (error) {
        console.error("Error fetching attendance:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAttendance();

    return () => {
      unsubscribePlayers();
    };
  }, [academyId, activeSeason, settings.currentSeason, selectedDateStr]);

  const presentPlayers = players.filter(p => attendance[p.id] === "Present" || attendance[p.id] === "Late");
  const absentPlayers = players.filter(p => attendance[p.id] === "Absent" || attendance[p.id] === "Sick" || attendance[p.id] === "Injured");
  const unmarkedPlayers = players.filter(p => !attendance[p.id]);

  const totalExpected = players.length;
  const attendanceRate = totalExpected > 0 ? Math.round((presentPlayers.length / totalExpected) * 100) : 0;

  if (isLoading) return <div className="p-8 text-center text-slate-500 font-bold">กำลังโหลดข้อมูล...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 -ml-2 bg-white text-slate-400 hover:text-indigo-600 rounded-full border border-slate-200 hover:border-indigo-200 transition-colors shadow-sm"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              Attendance Summary
              <ThaiDatePicker 
                value={selectedDateStr}
                onChange={(e) => setSelectedDateStr(e.target.value)}
                className="text-sm font-medium bg-slate-100 text-slate-600 border border-slate-200 outline-none rounded-lg px-2 py-1 cursor-pointer focus-within:ring-2 focus-within:ring-indigo-100"
              />
            </h1>
            <p className="text-slate-500 font-medium">{formattedDate}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate("training_log")}
            className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-sm text-sm"
          >
            View Detailed Log
          </button>
          <button
            onClick={() => onNavigate("attendance")}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm text-sm"
          >
            Take Attendance
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-500 uppercase">Training Theme</div>
            <div className="text-lg font-black text-slate-800 mt-1">{todayTheme}</div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
            <Calendar size={24} />
          </div>
        </div>

        <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-indigo-600 uppercase">Present</div>
            <div className="text-3xl font-black text-indigo-900 mt-1">
              {presentPlayers.length} <span className="text-lg text-indigo-400 font-bold">/ {totalExpected}</span>
            </div>
          </div>
          <div className="p-3 bg-white text-indigo-500 rounded-xl shadow-sm">
            <UserCheck size={24} />
          </div>
        </div>

        <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-emerald-600 uppercase">Attendance Rate</div>
            <div className="text-3xl font-black text-emerald-900 mt-1">{attendanceRate}%</div>
          </div>
          <div className="p-3 bg-white text-emerald-500 rounded-xl shadow-sm">
            <Activity size={24} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-emerald-50/50 flex items-center justify-between">
            <h2 className="font-black text-emerald-800 flex items-center gap-2">
              <UserCheck size={18} className="text-emerald-500" /> 
              Present / Late ({presentPlayers.length})
            </h2>
          </div>
          <div className="p-2 divide-y divide-slate-50 flex-1">
            {presentPlayers.length > 0 ? presentPlayers.map(p => (
              <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <img src={p.avatar} alt={p.firstName} className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm" />
                  <div>
                    <div className="font-bold text-slate-800">{p.firstName} {p.lastName}</div>
                    <div className="text-xs text-slate-500">{p.position || "Player"}</div>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                  attendance[p.id] === "Late" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                }`}>
                  {attendance[p.id]}
                </span>
              </div>
            )) : (
              <div className="p-8 text-center text-slate-400 font-medium">ไม่มีผู้เล่นในกลุ่มนี้</div>
            )}
          </div>
        </div>

        <div className="space-y-6 flex flex-col">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex-1">
            <div className="p-4 border-b border-slate-100 bg-rose-50/50 flex items-center justify-between">
              <h2 className="font-black text-rose-800 flex items-center gap-2">
                <UserX size={18} className="text-rose-500" /> 
                Absent / Sick / Injured ({absentPlayers.length})
              </h2>
            </div>
            <div className="p-2 divide-y divide-slate-50">
              {absentPlayers.length > 0 ? absentPlayers.map(p => (
                <div key={p.id} className="p-3 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors">
                  <div className="flex items-center gap-3">
                    <img src={p.avatar} alt={p.firstName} className="w-10 h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm" />
                    <div>
                      <div className="font-bold text-slate-800">{p.firstName} {p.lastName}</div>
                      <div className="text-xs text-slate-500">{p.position || "Player"}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    attendance[p.id] === "Sick" || attendance[p.id] === "Injured" ? "bg-orange-100 text-orange-700" : "bg-rose-100 text-rose-700"
                  }`}>
                    {attendance[p.id]}
                  </span>
                </div>
              )) : (
                <div className="p-8 text-center text-slate-400 font-medium">ไม่มีผู้เล่นในกลุ่มนี้</div>
              )}
            </div>
          </div>

          {unmarkedPlayers.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
                <h2 className="font-black text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500" /> 
                  Not Marked Yet ({unmarkedPlayers.length})
                </h2>
              </div>
              <div className="p-2 divide-y divide-slate-50 max-h-48 overflow-y-auto">
                {unmarkedPlayers.map(p => (
                  <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-slate-50 rounded-xl transition-colors opacity-75">
                    <img src={p.avatar} alt={p.firstName} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200" />
                    <div className="font-bold text-slate-600 text-sm">{p.firstName} {p.lastName}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
