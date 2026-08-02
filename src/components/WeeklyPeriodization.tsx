import React, { useState, useMemo, useEffect } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Droplets,
  Target,
  Trophy,
  Dumbbell,
  Activity,
  Calendar,
  X,
  CheckCircle,
  Clock,
  UserMinus,
  Thermometer,
  AlertCircle,
  ClipboardList,
  Users,
  BatteryCharging,
  Apple,
  Share2,
  Edit2,
  Trash2,
  FileText,
  Info,
  Zap,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, orderBy, doc, getDoc, setDoc, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { EmptyState } from "./common/EmptyState";
import { useAcademy } from "../contexts/AcademyContext";
import { useDrillDatabase } from "../hooks/useDrillDatabase";
import MonthlyPeriodization from "./MonthlyPeriodization";

type PeriodizationView = "Weekly" | "Monthly";


type ThemeType = "Recovery" | "Physical" | "Technical" | "Technique" | "Tactical" | "Match" | null;
type IntensityType = "Low" | "Medium" | "High" | null;

interface Drill {
  id: string;
  name: string;
  duration?: number;
}

interface TrainingDay {
  id: string;
  dayOfWeek: string;
  date: string;
  theme: ThemeType;
  intensity: IntensityType;
  objective: string;
  drills: Drill[];
}

type AttendanceStatus = "Present" | "Late" | "Absent" | "Sick" | "Injured";

interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  avatar: string;
  seasonHistory?: Record<string, { squad: string; active: boolean; jerseyNumber?: string }>;
}

const mockWeekData: TrainingDay[] = [
  { id: "1", dayOfWeek: "Mon", date: "", theme: null, intensity: null, objective: "", drills: [] },
  { id: "2", dayOfWeek: "Tue", date: "", theme: null, intensity: null, objective: "", drills: [] },
  { id: "3", dayOfWeek: "Wed", date: "", theme: null, intensity: null, objective: "", drills: [] },
  { id: "4", dayOfWeek: "Thu", date: "", theme: null, intensity: null, objective: "", drills: [] },
  { id: "5", dayOfWeek: "Fri", date: "", theme: null, intensity: null, objective: "", drills: [] },
  { id: "6", dayOfWeek: "Sat", date: "", theme: null, intensity: null, objective: "", drills: [] },
  { id: "7", dayOfWeek: "Sun", date: "", theme: null, intensity: null, objective: "", drills: [] },
];

const getThemeColor = (theme: ThemeType) => {
  switch (theme) {
    case "Recovery":
      return {
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        text: "text-emerald-700",
        icon: <Droplets size={16} />,
      };
    case "Physical":
      return {
        bg: "bg-rose-50",
        border: "border-rose-200",
        text: "text-rose-700",
        icon: <Dumbbell size={16} />,
      };
    case "Tactical":
      return {
        bg: "bg-sky-50",
        border: "border-sky-200",
        text: "text-sky-700",
        icon: <Target size={16} />,
      };
    case "Technical":
    case "Technique":
      return {
        bg: "bg-purple-50",
        border: "border-purple-200",
        text: "text-purple-700",
        icon: <Zap size={16} />,
      };
    case "Match":
      return {
        bg: "bg-amber-50",
        border: "border-amber-200",
        text: "text-amber-700",
        icon: <Trophy size={16} />,
      };
    default:
      return {
        bg: "bg-slate-50",
        border: "border-slate-200",
        text: "text-slate-500",
        icon: <Calendar size={16} />,
      };
  }
};

const formatDateToYYYYMMDD = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getIntensityColor = (intensity: IntensityType) => {
  switch (intensity) {
    case "Low":
      return "bg-emerald-500";
    case "Medium":
      return "bg-amber-500";
    case "High":
      return "bg-rose-500";
    default:
      return "bg-slate-200";
  }
};

const getIntensityWidth = (intensity: IntensityType) => {
  switch (intensity) {
    case "Low":
      return "33%";
    case "Medium":
      return "66%";
    case "High":
      return "100%";
    default:
      return "0%";
  }
};

const MOCK_DRILL_LIBRARY = [
  {
    id: "lib1",
    category: "Warm-up",
    icon: "🏃‍♂️",
    name: "Dynamic Stretching",
    duration: 15,
  },
  {
    id: "lib2",
    category: "Technical",
    icon: "⚽",
    name: "Passing Triangle",
    duration: 20,
  },
  {
    id: "lib3",
    category: "Tactical",
    icon: "🧠",
    name: "Rondo 4v2",
    duration: 15,
  },
  {
    id: "lib4",
    category: "Tactical",
    icon: "🧠",
    name: "Attacking Phase",
    duration: 30,
  },
];

const MOCK_PLAYERS: Player[] = [
  {
    id: "p1",
    firstName: "Suphanat",
    lastName: "Mueanta",
    position: "Striker",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Suphanat",
  },
];

export default function WeeklyPeriodization({
  onBack,
  onNavigate,
  defaultView,
}: {
  onBack: () => void;
  onNavigate?: (page: string) => void;
  defaultView?: string;
}) {
  const { currentUser, hasPermission } = useAuth();
  const hasEditPermission = hasPermission(["ADMIN", "COACH", "SUPERADMIN"]);
  const [activeView, setActiveView] = useState<PeriodizationView>("Weekly");
  const { getAcademyCollection, academyId, settings, activeSeason } = useAcademy();
  const { myDrills, academyDrills, saveDrill, updateDrill, deleteDrill } = useDrillDatabase();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [weekDays, setWeekDays] = useState<TrainingDay[]>([]);
  const [weekStartStr, setWeekStartStr] = useState("");
  const [selectedDay, setSelectedDay] = useState<TrainingDay | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [currentAttendance, setCurrentAttendance] = useState<
    Record<string, AttendanceStatus>
  >({});
  const [attendanceDB, setAttendanceDB] = useState<
    Record<string, Record<string, AttendanceStatus>>
  >({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isNutritionModalOpen, setIsNutritionModalOpen] = useState(false);

  // Date Picker State
  const [currentDateStr, setCurrentDateStr] = useState("2024-10-14");
  const [weekDateRange, setWeekDateRange] = useState("Oct 14 - Oct 20");

  // Library Modal State
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [addingToDayId, setAddingToDayId] = useState<string | null>(null);
  
  const [isCreatingDrill, setIsCreatingDrill] = useState(false);
  const [editingDrillId, setEditingDrillId] = useState<string | null>(null);
  const [drillForm, setDrillForm] = useState({ title: "", category: "Technical", duration: "15" });

  const [editingSessionDrillId, setEditingSessionDrillId] = useState<string | null>(null);
  const [sessionDrillEditForm, setSessionDrillEditForm] = useState({ name: "", duration: "" });

  const combinedLibrary = [...myDrills, ...academyDrills, ...MOCK_DRILL_LIBRARY].filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Warm-up": return "🏃‍♂️";
      case "Technical": return "⚽";
      case "Tactical": return "🧠";
      case "Physical": return "💪";
      default: return "📋";
    }
  };

  const handleSaveCustomDrill = async () => {
    if (!drillForm.title) return;
    if (editingDrillId) {
      await updateDrill(editingDrillId, {
        title: drillForm.title,
        category: drillForm.category,
        duration: drillForm.duration
      });
    } else {
      await saveDrill({
        title: drillForm.title,
        category: drillForm.category,
        duration: drillForm.duration,
        is_shared: false,
        canvas_data: { elements: [], lines: [], fieldType: "half" }
      });
    }
    setIsCreatingDrill(false);
    setEditingDrillId(null);
    setDrillForm({ title: "", category: "Technical", duration: "15" });
  };

  const handleRemoveSessionDrill = (dayId: string, drillId: string) => {
    const newDays = weekDays.map(d => {
      if (d.id === dayId) {
        return { ...d, drills: (d.drills || []).filter((drill: any) => drill.id !== drillId) };
      }
      return d;
    });
    setWeekDays(newDays);
    saveWeekData(newDays, attendanceDB);
  };

  const handleSaveSessionDrill = (dayId: string, drillId: string) => {
    const newDays = weekDays.map(d => {
      if (d.id === dayId) {
        return {
          ...d,
          drills: (d.drills || []).map(drill => {
            if (drill.id === drillId) {
              return {
                ...drill,
                name: sessionDrillEditForm.name,
                duration: parseInt(sessionDrillEditForm.duration) || drill.duration
              };
            }
            return drill;
          })
        };
      }
      return d;
    });
    setWeekDays(newDays);
    saveWeekData(newDays, attendanceDB);
    setEditingSessionDrillId(null);
  };

  const [editForm, setEditForm] = useState<{
    theme: ThemeType;
    intensity: IntensityType;
    objective: string;
  }>({
    theme: null,
    intensity: null,
    objective: "",
  });

  const saveWeekData = async (newDays: TrainingDay[], newAttendance: Record<string, Record<string, AttendanceStatus>>) => {
    if (!academyId || !weekStartStr) return;
    try {
      const docRef = doc(getAcademyCollection("training_weeks"), `${weekStartStr}`);
      await setDoc(docRef, {
        academyId: academyId,
        weekStartStr,
        days: newDays,
        attendanceDB: newAttendance,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Error saving week data", e);
    }
  };

  useEffect(() => {
    if (!academyId) return;
    
    const playersRef = collection(db, "academies", academyId, "players");
    const unsubscribe = onSnapshot(playersRef, (snapshot) => {
      const playersData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Player[];
      
      const filteredPlayers = playersData.filter(p => {
        const isSeasonActive = p.seasonHistory?.[activeSeason]?.active 
          || (!p.seasonHistory && activeSeason === (settings.currentSeason || "2026"));
        return isSeasonActive;
      });

      console.log(`[WeeklyPeriodization] Fetched ${filteredPlayers.length} players for academy: ${academyId}`);
      setPlayers(filteredPlayers);
    });
    
    return () => unsubscribe();
  }, [academyId, activeSeason, settings.currentSeason]);

  useEffect(() => {
    if (!academyId || !weekStartStr) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    const fetchWeekData = async () => {
      setLoading(true);
      try {
        const docRef = doc(getAcademyCollection("training_weeks"), `${weekStartStr}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (isMounted) {
            setWeekDays((data.days || [])
              .filter((day: any) => ["1", "2", "3", "4", "5", "6", "7"].includes(day.id))
              .map((day: any) => ({
                ...day,
                drills: day.drills || []
              })));
            setAttendanceDB(data.attendanceDB || {});
          }
        } else {
          // Initialize empty week data
          const monthsArr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const daysArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const initialDays = mockWeekData.map((d, index) => {
             const dateAtIdx = new Date(weekStartStr);
             dateAtIdx.setDate(dateAtIdx.getDate() + index);
             return {
               ...d,
               dayOfWeek: daysArr[dateAtIdx.getDay()],
               date: `${monthsArr[dateAtIdx.getMonth()]} ${dateAtIdx.getDate()}`,
               theme: null,
               intensity: null,
               objective: "",
               drills: []
             };
          });
          if (isMounted) {
            setWeekDays(initialDays);
            setAttendanceDB({});
          }
        }
      } catch (e) {
        console.error("Error fetching week data", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchWeekData();
    return () => { isMounted = false; };
  }, [academyId, weekStartStr]);

  // Handle auto-opening attendance modal
  useEffect(() => {
    if (defaultView === "attendance" && weekDays.length > 0 && !loading) {
      const today = new Date().toISOString().split("T")[0];
      const todayDate = new Date(today);
      const monthsArr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const formattedToday = `${monthsArr[todayDate.getMonth()]} ${todayDate.getDate()}`;
      
      const todayDay = weekDays.find(d => d.date === formattedToday);
      if (todayDay && !isAttendanceModalOpen) {
        setSelectedDay(todayDay);
        let initial = { ...attendanceDB[todayDay.id] };
        
        // Auto initialize missing players
        let hasChanges = false;
        players.forEach((p) => {
          if (!initial[p.id]) {
            initial[p.id] = "Present";
            hasChanges = true;
          }
        });
        
        setCurrentAttendance(initial);
        setIsAttendanceModalOpen(true);
      }
    }
  }, [defaultView, weekDays, loading, players, attendanceDB]);


  const handleDateChange = (dateString: string) => {
    if (!dateString) return;
    setCurrentDateStr(dateString);

    let selectedDate = new Date(dateString);
    if (isNaN(selectedDate.getTime())) return;

    // Calculate week start (Monday)
    const day = selectedDate.getDay();
    const diff = selectedDate.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(diff);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);

    const monthsArr = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const daysArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    setWeekDateRange(
      `${monthsArr[startOfWeek.getMonth()]} ${startOfWeek.getDate()} - ${monthsArr[endOfWeek.getMonth()]} ${endOfWeek.getDate()}`,
    );

    const startStr = formatDateToYYYYMMDD(startOfWeek);
    if (weekStartStr !== startStr) {
      // Immediately create the 7 day cards so UI is never empty
      const initialDays = mockWeekData.map((d, index) => {
        const dateAtIdx = new Date(startOfWeek);
        dateAtIdx.setDate(dateAtIdx.getDate() + index);
        return {
          ...d,
          dayOfWeek: daysArr[dateAtIdx.getDay()],
          date: `${monthsArr[dateAtIdx.getMonth()]} ${dateAtIdx.getDate()}`,
          theme: null,
          intensity: null,
          objective: "",
          drills: []
        };
      });
      setWeekDays(initialDays);
      setWeekStartStr(startStr);
    }
  };

  useEffect(() => {
    const today = formatDateToYYYYMMDD(new Date());
    handleDateChange(today);
  }, []);

  const handlePrevWeek = () => {
    const current = new Date(currentDateStr);
    current.setDate(current.getDate() - 7);
    handleDateChange(formatDateToYYYYMMDD(current));
  };

  const handleNextWeek = () => {
    const current = new Date(currentDateStr);
    current.setDate(current.getDate() + 7);
    handleDateChange(formatDateToYYYYMMDD(current));
  };

  const openLibraryForDay = (dayId: string) => {
    if (!hasEditPermission) return;
    setAddingToDayId(dayId);
    setIsLibraryOpen(true);
  };

  const handleAddDrill = (libDrill: any) => {
    if (!addingToDayId) return;
    const newDays = weekDays.map((d) => {
      if (d.id === addingToDayId) {
        return {
          ...d,
          drills: [
            ...(d.drills || []),
            {
              id: Date.now().toString() + Math.random(),
              name: libDrill.title || libDrill.name,
              duration: parseInt(libDrill.duration) || 15,
            },
          ],
        };
      }
      return d;
    });
    setWeekDays(newDays);
    saveWeekData(newDays, attendanceDB);
    
    const dayName = newDays.find((d) => d.id === addingToDayId)?.dayOfWeek;
    setToastMessage(`Added ${libDrill.title || libDrill.name} to ${dayName}`);
    setTimeout(() => setToastMessage(null), 3000);
    setIsLibraryOpen(false);
  };

  const handleEditClick = (day: TrainingDay) => {
    if (!hasEditPermission) return;
    setSelectedDay(day);
    setEditForm({
      theme: day.theme,
      intensity: day.intensity,
      objective: day.objective || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (selectedDay) {
      const newDays = weekDays.map((d) => (d.id === selectedDay.id ? { ...d, ...editForm } : d));
      setWeekDays(newDays);
      saveWeekData(newDays, attendanceDB);
    }
    setIsModalOpen(false);
    setSelectedDay(null);
  };

  const handleOpenAttendance = () => {
    if (!hasEditPermission) return;
    let initial = { ...attendanceDB[selectedDay!.id] };
    if (Object.keys(initial).length === 0) {
      players.forEach((p) => (initial[p.id] = "Present"));
    }
    setCurrentAttendance(initial);
    setIsAttendanceModalOpen(true);
  };

  const handleSaveAttendance = async () => {
    if (!hasEditPermission || !selectedDay || !academyId || !weekStartStr) return;
    const newAttendanceDB = {
      ...attendanceDB,
      [selectedDay.id]: currentAttendance,
    };
    setAttendanceDB(newAttendanceDB);
    saveWeekData(weekDays, newAttendanceDB);
    
    // Sync attendance to each player's attendance and daily_logs subcollections
    try {
      const dayIndex = weekDays.findIndex((d) => d.id === selectedDay.id);
      const idx = dayIndex >= 0 ? dayIndex : 0;
      
      // Timezone-safe YYYY-MM-DD calculation using Date.UTC
      const [year, month, day] = weekStartStr.split("-").map(Number);
      const targetDateObj = new Date(Date.UTC(year, month - 1, day + idx));
      const targetDateStr = targetDateObj.toISOString().split("T")[0];

      const batch = writeBatch(db);

      Object.entries(currentAttendance).forEach(([pId, status]) => {
        if (!pId) return;

        const normalizedStatus = 
          status === "Present" ? "PRESENT" :
          status === "Late" ? "LATE" :
          status === "Sick" ? "SICK" :
          status === "Injured" ? "INJURED" : "ABSENT";

        // 1. Player Attendance subcollection
        const attRef = doc(db, `academies/${academyId}/players/${pId}/attendance`, targetDateStr);
        batch.set(
          attRef,
          {
            status: normalizedStatus,
            attendanceStatus: status,
            date: targetDateStr,
            dayOfWeek: selectedDay.dayOfWeek,
            checkedInAt: serverTimestamp(),
            checkedInBy: currentUser?.id || "COACH",
            source: "PERIODIZATION",
          },
          { merge: true }
        );

        // 2. Player Training Log subcollection
        const logRef = doc(db, `academies/${academyId}/players/${pId}/daily_logs`, targetDateStr);
        batch.set(
          logRef,
          {
            id: targetDateStr,
            date: targetDateStr,
            dayOfWeek: selectedDay.dayOfWeek,
            theme: selectedDay.theme || "General Training",
            intensity: selectedDay.intensity || "Medium",
            objective: selectedDay.objective || "",
            attendanceStatus: status,
            isAttended: status === "Present" || status === "Late",
            drillsCount: selectedDay.drills?.length || 0,
            updatedAt: serverTimestamp(),
            source: "PERIODIZATION",
          },
          { merge: true }
        );
      });

      await batch.commit();
      console.log(`[WeeklyPeriodization] Successfully synced attendance & training logs for date: ${targetDateStr}`);
    } catch (err) {
      console.error("Error syncing attendance to player logs:", err);
    }

    setIsAttendanceModalOpen(false);
    setToastMessage(
      `บันทึกการเช็กชื่อของวัน ${selectedDay?.dayOfWeek} เรียบร้อยแล้ว`,
    );
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMarkAllPresent = () => {
    if (!hasEditPermission) return;
    const updated: Record<string, AttendanceStatus> = {};
    players.forEach((p) => (updated[p.id] = "Present"));
    setCurrentAttendance(updated);
  };

  const handleOpenAttendanceFromCard = (
    e: React.MouseEvent,
    day: TrainingDay,
  ) => {
    e.stopPropagation();
    if (!hasEditPermission) return;
    setSelectedDay(day);
    let initial = { ...attendanceDB[day.id] };
    if (Object.keys(initial).length === 0) {
      players.forEach((p) => (initial[p.id] = "Present"));
    }
    setCurrentAttendance(initial);
    setIsAttendanceModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }


  return (
    <div className="w-full flex-1 flex flex-col bg-slate-50 lg:h-[calc(100vh-4rem)] p-4 md:p-6 overflow-y-auto lg:overflow-hidden relative pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
          <CheckCircle className="text-emerald-400" size={18} />
          <span className="text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 shrink-0 gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Activity className="text-indigo-600" /> 
              {activeView === "Weekly" ? "Weekly Periodization (Microcycle)" : "Monthly Periodization (Mesocycle)"}
            </h1>
            <div className="hidden sm:flex bg-slate-200/50 p-1 rounded-xl">
              <button 
                onClick={() => setActiveView("Weekly")}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${activeView === "Weekly" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Weekly
              </button>
              <button 
                onClick={() => setActiveView("Monthly")}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${activeView === "Monthly" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Monthly
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            {activeView === "Weekly" ? "Plan and monitor training load across the week" : "Plan and monitor training phases across the month"}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200 w-full md:w-auto justify-between md:justify-start">
          <button
            onClick={handlePrevWeek}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <label className="text-sm font-bold text-slate-800 w-36 text-center cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 rounded-lg py-1.5 relative transition-colors">
            {weekDateRange}
            <ThaiDatePicker
              value={currentDateStr}
              onChange={(e) => handleDateChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </label>
          <button
            onClick={handleNextWeek}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Grid Layout or Monthly View */}
      {activeView === "Weekly" ? (
      <div className="flex-1 overflow-auto pb-2">
        <div className="flex flex-col xl:flex-row gap-4 h-full xl:min-w-fit pr-1 pb-4">
          {weekDays.map((day) => {
            const themeSettings = getThemeColor(day.theme);
            const isRestDay = !day.theme && (day.drills || []).length === 0;

            return (
              <div
                key={day.id}
                onClick={() => handleEditClick(day)}
                className={`flex-1 xl:w-[280px] min-h-[160px] flex flex-col rounded-2xl border-2 p-4 ${hasEditPermission ? "cursor-pointer hover:shadow-md" : ""} transition-all group overflow-hidden relative break-inside-avoid ${
                  isRestDay
                    ? "bg-emerald-50 border-dashed border-emerald-200 justify-center items-center"
                    : `bg-white ${day.theme ? themeSettings.border : "border-dashed border-slate-200"}`
                }`}
              >
                {isRestDay ? (
                  <>
                    <div className="absolute top-4 left-4">
                      <div className="text-xs font-black uppercase text-emerald-600/60 tracking-widest">
                        {day.dayOfWeek}
                      </div>
                      <div className="text-lg font-bold text-emerald-800/80">
                        {day.date}
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center text-center mt-6">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm text-emerald-500">
                        <BatteryCharging size={24} />
                      </div>
                      <h3 className="font-black text-emerald-800 tracking-tight text-lg">
                        REST DAY
                      </h3>
                      <p className="text-xs font-bold text-emerald-600/70 mt-1 uppercase tracking-wider">
                        Recovery & Regeneration
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Day Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-xs font-black uppercase text-slate-400 tracking-widest">
                          {day.dayOfWeek}
                        </div>
                        <div className="text-lg font-bold text-slate-800">
                          {day.date}
                        </div>
                      </div>
                      {day.theme && (
                        <div
                          className={`px-2.5 py-1 ${themeSettings.bg} ${themeSettings.text} text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5`}
                        >
                          {themeSettings.icon} {day.theme}
                        </div>
                      )}
                    </div>

                    {/* Training Load Indicator */}
                    {day.intensity && (
                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Training Load
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider ${
                              day.intensity === "Low"
                                ? "text-emerald-600"
                                : day.intensity === "Medium"
                                  ? "text-amber-600"
                                  : "text-rose-600"
                            }`}
                          >
                            {day.intensity}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getIntensityColor(day.intensity)} transition-all`}
                            style={{ width: getIntensityWidth(day.intensity) }}
                          ></div>
                        </div>
                      </div>
                    )}

                    {/* Objective */}
                    {day.objective ? (
                      <p className="text-sm font-medium text-slate-700 leading-snug mb-4 line-clamp-2">
                        "{day.objective}"
                      </p>
                    ) : hasEditPermission ? (
                      <div className="flex-1 flex items-center justify-center text-sm font-medium text-slate-400 mb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        + Tap to add plan
                      </div>
                    ) : (
                      <div className="flex-1 mb-4"></div>
                    )}

                    {/* Drills Preview */}
                    <div className="mt-auto space-y-1.5 pt-2">
                      {(day.drills || []).map((drill: any, idx: number) => (
                        <div
                          key={drill.id}
                          className="text-xs font-bold text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 flex justify-between items-center"
                        >
                          <span className="truncate">
                            {idx + 1}. {drill.name}
                          </span>
                          {drill.duration && (
                            <span className="text-[10px] text-slate-500 font-bold shrink-0 ml-2 bg-slate-200/50 px-1.5 py-0.5 rounded">
                              {drill.duration}'
                            </span>
                          )}
                        </div>
                      ))}
                      {hasEditPermission && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openLibraryForDay(day.id);
                          }}
                          className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 border border-dashed border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 rounded-lg py-1.5 flex items-center justify-center gap-1 transition-colors mt-1 mb-1"
                        >
                          <Plus size={14} /> Add Drill
                        </button>
                      )}
                      {(day.drills || []).length > 0 && (
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-1.5 border-t border-slate-100 flex justify-between items-center mt-1">
                          <span>Total Session</span>
                          <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                            {(day.drills || []).reduce(
                              (sum: number, d: any) => sum + (d.duration || 0),
                              0,
                            )}{" "}
                            MIN
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Match Day Special Treatment */}
                    {day.theme === "Match" && (
                      <div className="mt-auto flex flex-col gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 mb-1.5 overflow-hidden">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-white border border-amber-200 rounded-full flex items-center justify-center shrink-0">
                            <Trophy size={14} className="text-amber-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                              Game Day
                            </div>
                            <div className="text-xs font-bold text-amber-700 truncate">
                              {day.objective || "Official Fixture"}
                            </div>
                          </div>
                        </div>
                        {onNavigate && hasEditPermission && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate("post_match");
                            }}
                            className="w-full px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold text-center shadow-sm transition-colors mt-1"
                          >
                            Enter Stats
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsNutritionModalOpen(true);
                          }}
                          className="w-full px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-orange-200"
                        >
                          <Apple size={14} />
                          Matchday Diet Guide
                        </button>
                      </div>
                    )}

                    {/* Attendance Summary */}
                    {day.theme && (
                      <div className="mt-auto pt-3 border-t border-slate-100 flex-shrink-0">
                        {(() => {
                          const dayAttendance = attendanceDB[day.id];
                          const total = players.length;
                          if (!dayAttendance) {
                            // Pending
                            return (
                              <button
                                onClick={(e) =>
                                  handleOpenAttendanceFromCard(e, day)
                                }
                                className="w-full py-2 flex justify-center items-center gap-1.5 border-2 border-slate-200 border-dashed text-slate-500 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors text-xs font-bold"
                              >
                                <ClipboardList size={14} /> 📋 เช็กชื่อ (Take
                                Attendance)
                              </button>
                            );
                          } else {
                            // Completed
                            const presentCount = Object.values(
                              dayAttendance,
                            ).filter((status) => status === "Present").length;
                            const attendRatio = presentCount / total;
                            const badgeColor =
                              attendRatio < 0.8
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-emerald-100 text-emerald-700 border-emerald-200";
                            return (
                              <button
                                onClick={(e) =>
                                  handleOpenAttendanceFromCard(e, day)
                                }
                                className={`w-full py-2 flex justify-center items-center gap-1.5 border rounded-xl transition-all text-xs font-bold shadow-sm hover:brightness-95 ${badgeColor}`}
                              >
                                <Users size={14} /> 👥 {presentCount}/{total}{" "}
                                Present
                              </button>
                            );
                          }
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      ) : (
        <MonthlyPeriodization />
      )}

      {/* Edit Modal */}
      {isModalOpen && selectedDay && !isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-full">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-title font-bold text-slate-800 text-lg">
                  Edit Training Day
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedDay.dayOfWeek}, {selectedDay.date}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="space-y-5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Theme / Focus
                  </label>
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                    {(
                      [
                        "Recovery",
                        "Physical",
                        "Technique",
                        "Tactical",
                        "Match",
                      ] as ThemeType[]
                    ).map((t) => (
                      <button
                        key={t || "none"}
                        onClick={() =>
                          setEditForm((prev) => ({ ...prev, theme: t }))
                        }
                        className={`py-2 px-1 rounded-xl text-[11px] sm:text-xs font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                          editForm.theme === t
                            ? t === "Recovery"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : t === "Physical"
                                ? "border-rose-500 bg-rose-50 text-rose-700"
                                : t === "Technique" || t === "Technical"
                                  ? "border-purple-500 bg-purple-50 text-purple-700"
                                  : t === "Tactical"
                                    ? "border-sky-500 bg-sky-50 text-sky-700"
                                    : "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
                        }`}
                      >
                        {t === "Recovery" && <Droplets size={16} />}
                        {t === "Physical" && <Dumbbell size={16} />}
                        {(t === "Technique" || t === "Technical") && <Zap size={16} />}
                        {t === "Tactical" && <Target size={16} />}
                        {t === "Match" && <Trophy size={16} />}
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Training Load / Intensity
                  </label>
                  <div className="flex gap-2">
                    {(["Low", "Medium", "High"] as IntensityType[]).map(
                      (int) => (
                        <button
                          key={int || "none"}
                          onClick={() =>
                            setEditForm((prev) => ({ ...prev, intensity: int }))
                          }
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                            editForm.intensity === int
                              ? int === "Low"
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                : int === "Medium"
                                  ? "border-amber-500 bg-amber-50 text-amber-700"
                                  : "border-rose-500 bg-rose-50 text-rose-700"
                              : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
                          }`}
                        >
                          {int}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                    Session Objective
                  </label>
                  <textarea
                    value={editForm.objective}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        objective: e.target.value,
                      }))
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 font-medium resize-none min-h-[80px]"
                    placeholder="e.g. Build-up play under pressure..."
                  />
                </div>

                <div>
                  <div className="flex justify-between items-end mb-2">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Session Drills
                    </label>
                    <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                      {(weekDays.find((d) => d.id === selectedDay.id)?.drills || []).length || 0}{" "}
                      Drills
                    </span>
                  </div>
                  <div className="space-y-2 mb-3 max-h-[150px] overflow-y-auto pr-1">
                    {(weekDays
                      .find((d) => d.id === selectedDay.id)
                      ?.drills || []).map((drill, idx) => (
                        <div
                          key={drill.id}
                          className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5 group"
                        >
                          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </div>
                          
                          {editingSessionDrillId === drill.id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input 
                                type="text"
                                value={sessionDrillEditForm.name}
                                onChange={(e) => setSessionDrillEditForm(prev => ({...prev, name: e.target.value}))}
                                className="flex-1 text-sm border border-slate-200 rounded p-1 outline-none focus:border-indigo-500"
                                placeholder="Drill name"
                              />
                              <input 
                                type="number"
                                value={sessionDrillEditForm.duration}
                                onChange={(e) => setSessionDrillEditForm(prev => ({...prev, duration: e.target.value}))}
                                className="w-16 text-sm border border-slate-200 rounded p-1 outline-none focus:border-indigo-500"
                                placeholder="Min"
                              />
                              <button onClick={() => handleSaveSessionDrill(selectedDay.id, drill.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                                <CheckCircle size={14} />
                              </button>
                              <button onClick={() => setEditingSessionDrillId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="text-sm font-bold text-slate-700 truncate flex-1">
                                {drill.name}
                              </div>
                              {drill.duration && (
                                <div className="text-xs font-bold text-slate-400 shrink-0">
                                  {drill.duration}'
                                </div>
                              )}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    setSessionDrillEditForm({ name: drill.name, duration: drill.duration?.toString() || "" });
                                    setEditingSessionDrillId(drill.id);
                                  }}
                                  className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-colors"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleRemoveSessionDrill(selectedDay.id, drill.id)}
                                  className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    {(weekDays.find((d) => d.id === selectedDay.id)?.drills || [])
                      .length === 0 && (
                      <div className="text-sm text-slate-400 text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl font-medium">
                        No drills scheduled
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      openLibraryForDay(selectedDay.id);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 rounded-xl font-bold text-sm transition-colors mt-2"
                  >
                    <Plus size={16} /> Add Drill
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={handleOpenAttendance}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold text-sm transition-colors shadow-sm"
                  >
                    <CheckCircle size={18} /> ✅ เช็กชื่อนักกีฬา (Take
                    Attendance)
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <button
                onClick={() => {
                  setWeekDays((prev) =>
                    prev.map((d) =>
                      d.id === selectedDay.id
                        ? { ...d, theme: null, intensity: null, objective: "", drills: [] }
                        : d,
                    ),
                  );
                  setIsModalOpen(false);
                  setSelectedDay(null);
                }}
                className="px-4 py-2 text-sm font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors border border-emerald-200 flex items-center gap-1.5"
              >
                <BatteryCharging size={16} /> Set as Rest Day
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Modal */}
      {isAttendanceModalOpen && selectedDay && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-sm flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-slate-50 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh] transform transition-all">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Calendar size={20} className="text-emerald-600" />
                  Attendance Checklist ({players.length} players)
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {selectedDay.dayOfWeek}, {selectedDay.date}
                </p>
              </div>
              <button
                onClick={() => setIsAttendanceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-white shrink-0">
              <button
                onClick={handleMarkAllPresent}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
              >
                <CheckCircle size={18} /> Mark All as Present
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 hide-scrollbar">
              {players.map((player) => {
                const status = currentAttendance[player.id];
                return (
                  <div
                    key={player.id}
                    className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition-all ${
                      status === "Present"
                        ? "border-emerald-200 bg-emerald-50/30"
                        : status === "Late"
                          ? "border-amber-200 bg-amber-50/30"
                          : status === "Absent"
                            ? "border-rose-200 bg-rose-50/30"
                            : status === "Sick"
                              ? "border-blue-200 bg-blue-50/30"
                              : "border-orange-200 bg-orange-50/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {player.avatar ? (
                          <img
                            src={player.avatar}
                            alt={player.firstName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-slate-400 font-bold">
                            {player.firstName ? player.firstName[0] : "?"}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 text-sm truncate">
                          {player.firstName} {player.lastName}
                        </h4>
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          {player.position}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      <button
                        onClick={() =>
                          setCurrentAttendance((prev) => {
                            const newAtt = { ...prev };
                            if (newAtt[player.id] === "Present") delete newAtt[player.id];
                            else newAtt[player.id] = "Present";
                            return newAtt;
                          })
                        }
                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                          status === "Present"
                            ? "bg-emerald-500 border-emerald-600 text-white shadow-md"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <CheckCircle size={18} />
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                          มา
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setCurrentAttendance((prev) => {
                            const newAtt = { ...prev };
                            if (newAtt[player.id] === "Late") delete newAtt[player.id];
                            else newAtt[player.id] = "Late";
                            return newAtt;
                          })
                        }
                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                          status === "Late"
                            ? "bg-amber-500 border-amber-600 text-white shadow-md"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <Clock size={18} />
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                          สาย
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setCurrentAttendance((prev) => {
                            const newAtt = { ...prev };
                            if (newAtt[player.id] === "Absent") delete newAtt[player.id];
                            else newAtt[player.id] = "Absent";
                            return newAtt;
                          })
                        }
                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                          status === "Absent"
                            ? "bg-rose-500 border-rose-600 text-white shadow-md"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <UserMinus size={18} />
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                          ขาด
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setCurrentAttendance((prev) => {
                            const newAtt = { ...prev };
                            if (newAtt[player.id] === "Sick") delete newAtt[player.id];
                            else newAtt[player.id] = "Sick";
                            return newAtt;
                          })
                        }
                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                          status === "Sick"
                            ? "bg-blue-500 border-blue-600 text-white shadow-md"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <Thermometer size={18} />
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                          ป่วย
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setCurrentAttendance((prev) => {
                            const newAtt = { ...prev };
                            if (newAtt[player.id] === "Injured") delete newAtt[player.id];
                            else newAtt[player.id] = "Injured";
                            return newAtt;
                          })
                        }
                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                          status === "Injured"
                            ? "bg-orange-500 border-orange-600 text-white shadow-md"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <AlertCircle size={18} />
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">
                          เจ็บ
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 bg-white shrink-0 pb-safe">
              <button
                onClick={handleSaveAttendance}
                className="w-full py-4 text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl transition-colors shadow-lg"
              >
                บันทึกการเช็กชื่อ (Save Attendance)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nutrition Guide Modal */}
      {isNutritionModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="p-6 bg-orange-50 border-b border-orange-100 flex items-start justify-between shrink-0 relative overflow-hidden">
              {/* Decorative background element */}
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Apple size={100} />
              </div>

              <div className="relative z-10">
                <div className="flex justify-center items-center w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl mb-4 shadow-sm border border-orange-200">
                  <Apple size={24} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                  Matchday Nutrition
                </h2>
                <p className="text-sm font-bold text-orange-600 mt-1 uppercase tracking-wider">
                  Optimal Fueling Strategy
                </p>
              </div>
              <button
                onClick={() => setIsNutritionModalOpen(false)}
                className="bg-white/50 hover:bg-white text-slate-500 hover:text-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors relative z-10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 space-y-6">
              {/* Pre-Match */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-400"></div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0 border border-orange-100">
                    <span className="text-xl">🍞</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">
                      Pre-Match Fuel
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mb-2">
                      3-4 Hours Before Kickoff
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                      Focus on high carbohydrates & easy digestion. Low fat and
                      low fiber to prevent stomach discomfort.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Pasta
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Toast
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Banana
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* During Match */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-sky-400"></div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center shrink-0 border border-sky-100">
                    <span className="text-xl">💧</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">
                      Half-Time Hydration
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mb-2">
                      During the Match
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                      Top up hydration and electrolytes. Small sips are better
                      than large gulps. Quick energy if needed.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Water
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Sports Drink
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Gels
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Post-Match */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-400"></div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100">
                    <span className="text-xl">🍗</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">
                      Post-Match Recovery
                    </h3>
                    <p className="text-xs font-bold text-slate-400 mb-2">
                      Within 30 Mins After Game
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                      The critical window for glycogen replenishment and muscle
                      repair. Mix protein and carbs.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Chocolate Milk
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Chicken Rice
                      </span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">
                        Fruit Smoothies
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 bg-white shrink-0 flex gap-3">
              <button
                onClick={() => setIsNutritionModalOpen(false)}
                className="px-6 py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
              <button
                className="flex-1 py-4 text-base font-bold text-white bg-green-500 hover:bg-green-600 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
                onClick={() => {
                  setToastMessage(
                    "Nutrition guide image shared to Line group successfully!",
                  );
                  setTimeout(() => setToastMessage(null), 3000);
                }}
              >
                <Share2 size={18} />
                Share to Parents
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drill Library Modal */}
      {isLibraryOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh] sm:max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <ClipboardList size={20} className="text-indigo-600" /> Drill
                  Library
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Select a drill to add to the session
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsCreatingDrill(true);
                    setEditingDrillId(null);
                    setDrillForm({ title: "", category: "Technical", duration: "15" });
                  }}
                  className="text-xs font-bold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1"
                >
                  <Plus size={14} /> สร้างแบบฝึก
                </button>
                <button
                  onClick={() => setIsLibraryOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 space-y-6">
              {isCreatingDrill && (
                <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm mb-4 animate-in slide-in-from-top-2">
                  <h4 className="text-sm font-bold text-slate-800 mb-3">{editingDrillId ? 'แก้ไขแบบฝึกซ้อม' : 'สร้างแบบฝึกซ้อมใหม่'}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">ชื่อแบบฝึกซ้อม (Title)</label>
                      <input type="text" value={drillForm.title} onChange={e => setDrillForm({...drillForm, title: e.target.value})} className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500 border outline-none" placeholder="เช่น Rondo 4v2" />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">หมวดหมู่ (Category)</label>
                        <select value={drillForm.category} onChange={e => setDrillForm({...drillForm, category: e.target.value})} className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500 border outline-none">
                          <option value="Warm-up">Warm-up</option>
                          <option value="Technical">Technical</option>
                          <option value="Tactical">Tactical</option>
                          <option value="Physical">Physical</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 mb-1">เวลา (นาที)</label>
                        <input type="number" value={drillForm.duration} onChange={e => setDrillForm({...drillForm, duration: e.target.value})} className="w-full text-sm border-slate-200 rounded-lg p-2 focus:ring-indigo-500 focus:border-indigo-500 border outline-none" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4 pt-2">
                      <button onClick={() => { setIsCreatingDrill(false); setEditingDrillId(null); }} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">ยกเลิก</button>
                      <button onClick={handleSaveCustomDrill} disabled={!drillForm.title} className="px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50">บันทึก</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Group by category */}
              {["Warm-up", "Technical", "Tactical", "Physical"].map(
                (category) => {
                  const categoryDrills = combinedLibrary.filter(
                    (d) => d.category === category,
                  );
                  if (categoryDrills.length === 0) return null;
                  return (
                    <div key={category}>
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
                        {category}
                      </h4>
                      <div className="space-y-3">
                        {categoryDrills.map((drill: any) => (
                          <div
                            key={drill.id}
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-slate-50 text-xl border border-slate-100 flex items-center justify-center shrink-0">
                                {drill.icon || getCategoryIcon(drill.category)}
                              </div>
                              <div className="min-w-0">
                                <h5 className="font-bold text-slate-800 text-sm truncate">
                                  {drill.title || drill.name}
                                </h5>
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                                  {drill.duration} MIN
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {drill.created_by === currentUser?.id && (
                                <>
                                  <button
                                    onClick={() => {
                                      setDrillForm({
                                        title: drill.title || drill.name,
                                        category: drill.category,
                                        duration: drill.duration || "15",
                                      });
                                      setEditingDrillId(drill.id);
                                      setIsCreatingDrill(true);
                                    }}
                                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => deleteDrill(drill.id)}
                                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleAddDrill(drill)}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-bold rounded-lg transition-colors border border-indigo-200 hover:border-indigo-600 flex items-center gap-1"
                              >
                                <Plus size={14} /> Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
