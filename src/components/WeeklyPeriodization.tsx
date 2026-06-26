import React, { useState } from "react";
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
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

type ThemeType = "Recovery" | "Physical" | "Tactical" | "Match" | null;
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

const mockPlayers = [
  {
    id: "1",
    name: "Supachai Jaided",
    position: "ST",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Supachai",
  },
  {
    id: "2",
    name: "Suphanat Mueanta",
    position: "RW",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Suphanat",
  },
  {
    id: "3",
    name: "Airfan Doloh",
    position: "CM",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Airfan",
  },
  {
    id: "4",
    name: "Sarayut Sompim",
    position: "CB",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarayut",
  },
  {
    id: "5",
    name: "Channarong Promsrikaew",
    position: "CAM",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Channarong",
  },
];

const mockWeekData: TrainingDay[] = [
  {
    id: "1",
    dayOfWeek: "Mon",
    date: "Oct 14",
    theme: "Recovery",
    intensity: "Low",
    objective: "Active recovery and mobility",
    drills: [
      { id: "d1", name: "Pool Session", duration: 30 },
      { id: "d2", name: "Light Stretching", duration: 15 },
    ],
  },
  {
    id: "2",
    dayOfWeek: "Tue",
    date: "Oct 15",
    theme: "Tactical",
    intensity: "Medium",
    objective: "Build-up play under pressure",
    drills: [
      { id: "d3", name: "Rondo 4v2", duration: 15 },
      { id: "d4", name: "Phase of Play 8v6", duration: 30 },
    ],
  },
  {
    id: "3",
    dayOfWeek: "Wed",
    date: "Oct 16",
    theme: "Physical",
    intensity: "High",
    objective: "Max aerobic speed & repeated sprints",
    drills: [
      { id: "d5", name: "15v15 Small Sided", duration: 25 },
      { id: "d6", name: "Sprint Repeats", duration: 20 },
    ],
  },
  {
    id: "4",
    dayOfWeek: "Thu",
    date: "Oct 17",
    theme: "Tactical",
    intensity: "Medium",
    objective: "Defensive organization in mid-block",
    drills: [
      { id: "d7", name: "Shadow Play", duration: 20 },
      { id: "d8", name: "11v11 Walkthrough", duration: 40 },
    ],
  },
  {
    id: "5",
    dayOfWeek: "Fri",
    date: "Oct 18",
    theme: "Recovery",
    intensity: "Low",
    objective: "Pre-match activation",
    drills: [
      { id: "d9", name: "Rondo", duration: 15 },
      { id: "d10", name: "Set Pieces", duration: 20 },
    ],
  },
  {
    id: "6",
    dayOfWeek: "Sat",
    date: "Oct 19",
    theme: "Match",
    intensity: "High",
    objective: "League Fixture vs Rivals FC",
    drills: [],
  },
  {
    id: "7",
    dayOfWeek: "Sun",
    date: "Oct 20",
    theme: null,
    intensity: null,
    objective: "",
    drills: [],
  },
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

export default function WeeklyPeriodization({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate?: (page: string) => void;
}) {
  const { hasPermission } = useAuth();
  const hasEditPermission = hasPermission(["ADMIN", "COACH"]);

  const [weekDays, setWeekDays] = useState<TrainingDay[]>(mockWeekData);
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

  const [editForm, setEditForm] = useState<{
    theme: ThemeType;
    intensity: IntensityType;
    objective: string;
  }>({
    theme: null,
    intensity: null,
    objective: "",
  });

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

    setWeekDays((prev) =>
      prev.map((d, index) => {
        const dateAtIdx = new Date(startOfWeek);
        dateAtIdx.setDate(dateAtIdx.getDate() + index);
        return {
          ...d,
          dayOfWeek: daysArr[dateAtIdx.getDay()],
          date: `${monthsArr[dateAtIdx.getMonth()]} ${dateAtIdx.getDate()}`,
        };
      }),
    );
  };

  const handlePrevWeek = () => {
    const current = new Date(currentDateStr);
    current.setDate(current.getDate() - 7);
    handleDateChange(current.toISOString().split("T")[0]);
  };

  const handleNextWeek = () => {
    const current = new Date(currentDateStr);
    current.setDate(current.getDate() + 7);
    handleDateChange(current.toISOString().split("T")[0]);
  };

  const openLibraryForDay = (dayId: string) => {
    if (!hasEditPermission) return;
    setAddingToDayId(dayId);
    setIsLibraryOpen(true);
  };

  const handleAddDrill = (libDrill: (typeof MOCK_DRILL_LIBRARY)[0]) => {
    if (!addingToDayId) return;
    setWeekDays((prev) =>
      prev.map((d) => {
        if (d.id === addingToDayId) {
          return {
            ...d,
            drills: [
              ...d.drills,
              {
                id: Date.now().toString() + Math.random(),
                name: libDrill.name,
                duration: libDrill.duration,
              },
            ],
          };
        }
        return d;
      }),
    );
    const dayName = weekDays.find((d) => d.id === addingToDayId)?.dayOfWeek;
    setToastMessage(`Added ${libDrill.name} to ${dayName}`);
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
      setWeekDays((prev) =>
        prev.map((d) => (d.id === selectedDay.id ? { ...d, ...editForm } : d)),
      );
    }
    setIsModalOpen(false);
    setSelectedDay(null);
  };

  const handleOpenAttendance = () => {
    if (!hasEditPermission) return;
    let initial = { ...attendanceDB[selectedDay!.id] };
    if (Object.keys(initial).length === 0) {
      mockPlayers.forEach((p) => (initial[p.id] = "Present"));
    }
    setCurrentAttendance(initial);
    setIsAttendanceModalOpen(true);
  };

  const handleSaveAttendance = () => {
    if (!hasEditPermission) return;
    setAttendanceDB((prev) => ({
      ...prev,
      [selectedDay!.id]: currentAttendance,
    }));
    setIsAttendanceModalOpen(false);
    setToastMessage(
      `บันทึกการเช็กชื่อของวัน ${selectedDay?.dayOfWeek} เรียบร้อยแล้ว`,
    );
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMarkAllPresent = () => {
    if (!hasEditPermission) return;
    const updated: Record<string, AttendanceStatus> = {};
    mockPlayers.forEach((p) => (updated[p.id] = "Present"));
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
      mockPlayers.forEach((p) => (initial[p.id] = "Present"));
    }
    setCurrentAttendance(initial);
    setIsAttendanceModalOpen(true);
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-slate-50 h-[calc(100vh-4rem)] p-4 md:p-6 overflow-hidden relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
          <CheckCircle className="text-emerald-400" size={18} />
          <span className="text-sm font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 shrink-0 gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 mb-2"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Activity className="text-indigo-600" /> Weekly Periodization
            (Microcycle)
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Plan and monitor training load across the week
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={handlePrevWeek}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <label className="text-sm font-bold text-slate-800 w-36 text-center cursor-pointer hover:bg-indigo-50 hover:text-indigo-600 rounded-lg py-1.5 relative transition-colors">
            {weekDateRange}
            <input
              type="date"
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

      {/* Grid Layout */}
      <div className="flex-1 overflow-y-auto sm:overflow-x-auto hide-scrollbar">
        <div className="flex flex-col xl:flex-row gap-4 h-full xl:min-w-fit pr-1 pb-4">
          {weekDays.map((day) => {
            const themeSettings = getThemeColor(day.theme);
            const isRestDay = !day.theme && day.drills.length === 0;

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
                      {day.drills.map((drill, idx) => (
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
                      {day.drills.length > 0 && (
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-1.5 border-t border-slate-100 flex justify-between items-center mt-1">
                          <span>Total Session</span>
                          <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                            {day.drills.reduce(
                              (sum, d) => sum + (d.duration || 0),
                              0,
                            )}{" "}
                            MIN
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Match Day Special Treatment */}
                    {day.theme === "Match" && day.drills.length === 0 && (
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
                        {onNavigate && (
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
                          const total = mockPlayers.length;
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        "Recovery",
                        "Physical",
                        "Tactical",
                        "Match",
                      ] as ThemeType[]
                    ).map((t) => (
                      <button
                        key={t || "none"}
                        onClick={() =>
                          setEditForm((prev) => ({ ...prev, theme: t }))
                        }
                        className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                          editForm.theme === t
                            ? t === "Recovery"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : t === "Physical"
                                ? "border-rose-500 bg-rose-50 text-rose-700"
                                : t === "Tactical"
                                  ? "border-sky-500 bg-sky-50 text-sky-700"
                                  : "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200"
                        }`}
                      >
                        {t === "Recovery" && <Droplets size={16} />}
                        {t === "Physical" && <Dumbbell size={16} />}
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
                      {weekDays.find((d) => d.id === selectedDay.id)?.drills
                        .length || 0}{" "}
                      Drills
                    </span>
                  </div>
                  <div className="space-y-2 mb-3 max-h-[150px] overflow-y-auto pr-1">
                    {weekDays
                      .find((d) => d.id === selectedDay.id)
                      ?.drills.map((drill, idx) => (
                        <div
                          key={drill.id}
                          className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5"
                        >
                          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div className="text-sm font-bold text-slate-700 truncate">
                            {drill.name}
                          </div>
                          {drill.duration && (
                            <div className="text-xs font-bold text-slate-400 shrink-0">
                              {drill.duration}'
                            </div>
                          )}
                        </div>
                      ))}
                    {weekDays.find((d) => d.id === selectedDay.id)?.drills
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

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
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
      )}

      {/* Attendance Modal */}
      {isAttendanceModalOpen && selectedDay && (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-sm flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-slate-50 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh] transform transition-all">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
              <div>
                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                  <Calendar size={20} className="text-emerald-600" />
                  Attendance Checklist
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
              {mockPlayers.map((player) => {
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
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                        <img
                          src={
                            player.avatar ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.name}`
                          }
                          alt={player.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 text-sm truncate">
                          {player.name}
                        </h4>
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          {player.position}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      <button
                        onClick={() =>
                          setCurrentAttendance((prev) => ({
                            ...prev,
                            [player.id]: "Present",
                          }))
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
                          setCurrentAttendance((prev) => ({
                            ...prev,
                            [player.id]: "Late",
                          }))
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
                          setCurrentAttendance((prev) => ({
                            ...prev,
                            [player.id]: "Absent",
                          }))
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
                          setCurrentAttendance((prev) => ({
                            ...prev,
                            [player.id]: "Sick",
                          }))
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
                          setCurrentAttendance((prev) => ({
                            ...prev,
                            [player.id]: "Injured",
                          }))
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
              <button
                onClick={() => setIsLibraryOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 space-y-6">
              {/* Group by category */}
              {["Warm-up", "Technical", "Tactical", "Physical"].map(
                (category) => {
                  const categoryDrills = MOCK_DRILL_LIBRARY.filter(
                    (d) => d.category === category,
                  );
                  if (categoryDrills.length === 0) return null;
                  return (
                    <div key={category}>
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
                        {category}
                      </h4>
                      <div className="space-y-3">
                        {categoryDrills.map((drill) => (
                          <div
                            key={drill.id}
                            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-slate-50 text-xl border border-slate-100 flex items-center justify-center shrink-0">
                                {drill.icon}
                              </div>
                              <div className="min-w-0">
                                <h5 className="font-bold text-slate-800 text-sm truncate">
                                  {drill.name}
                                </h5>
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">
                                  {drill.duration} MIN
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleAddDrill(drill)}
                              className="shrink-0 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white text-xs font-bold rounded-lg transition-colors border border-indigo-200 hover:border-indigo-600 flex items-center gap-1"
                            >
                              <Plus size={14} /> Add
                            </button>
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
