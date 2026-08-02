import { useState, useEffect, useMemo } from "react";
import { ThaiDatePicker } from "./ThaiDatePicker";
import {
  Calendar,
  Users,
  Shield,
  Star,
  UserCheck,
  Heart,
  ClipboardList,
  Search,
  Activity,
  Settings,
  Plus,
  AlertTriangle,
  Info,
  Clock,
  TrendingUp,
  BarChart2,
  FileText,
  CheckCircle,
  FileClock,
  BrainCircuit,
  ArrowRight,
  Edit,
  Trash2,
  MessageCircle,
  CheckCheck,
  UserCircle,
  Target,
  LineChart,
  ShieldCheck,
  HardDrive,
  Folder,
  Image,
  Package,
  Download,
  BookOpen
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth, UserRole } from "../contexts/AuthContext";
import { useAcademy } from "../contexts/AcademyContext";
import { db } from "../lib/firebase";
import { collection, onSnapshot, query, where, addDoc, doc, updateDoc, deleteDoc, orderBy, limit } from "firebase/firestore";

interface AcademyEvent {
  id: string;
  title: string;
  desc: string;
  date: string;
  time: string;
  location: string;
  createdAt: string;
}

interface ActivityLog {
  id: string;
  userName: string;
  userId: string;
  action: string;
  avatarSeed: string;
  createdAt: any;
}

import PeerVotingModal from "./PeerVotingModal";
import DashboardQuickIDPModal from "./DashboardQuickIDPModal";
import { useActivityLogger } from "../hooks/useActivityLogger";

export interface ParentMessage {
  id: string;
  senderId: string;
  senderName: string;
  playerId: string;
  targetSquad: string;
  message: string;
  isRead: boolean;
  createdAt: any;
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { t } = useLanguage();
  const { currentUser, hasPermission } = useAuth();
  const { getAcademyCollection, activeSeason, settings, academyId } = useAcademy();
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [showQuickIDPModal, setShowQuickIDPModal] = useState(false);

  const [parentMessages, setParentMessages] = useState<ParentMessage[]>([]);
  const [myTeams, setMyTeams] = useState<string[]>([]);

  const [drillCount, setDrillCount] = useState<number | string>("...");
  const [youthCount, setYouthCount] = useState<number | string>("...");
  const [injuredCount, setInjuredCount] = useState<number | string>("...");
  const [coachCount, setCoachCount] = useState<number | string>("...");
  const [scoutCount, setScoutCount] = useState<number | string>("...");
  const [overdueIDPsCount, setOverdueIDPsCount] = useState(0);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [overview, setOverview] = useState({
    theme: "ไม่มีการฝึก",
    time: "-",
    attended: 0,
    absent: 0,
    completedSessions: 0,
    totalSessions: 0
  });

  const [events, setEvents] = useState<AcademyEvent[]>([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [newEventForm, setNewEventForm] = useState({
    title: "", desc: "", date: "", time: "", location: ""
  });

  const { logActivity } = useActivityLogger();

  useEffect(() => {
    if (!academyId) return;

    // Drills count
    const unsubDrills = onSnapshot(collection(db, "drills"), (snap) => {
      let visible = 0;
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.created_by === currentUser?.id || d.is_shared) {
          visible++;
        }
      });
      setDrillCount(visible);
    });
    
    // Players (Youth) and injured count
    const unsubPlayers = onSnapshot(getAcademyCollection("players"), (snap) => {
      let active = 0;
      let injured = 0;
      snap.docs.forEach(doc => {
        const p = doc.data();
        const isSeasonActive = p.seasonHistory?.[activeSeason]?.active 
          || (!p.seasonHistory && activeSeason === (settings.currentSeason || "2026"));
        if (isSeasonActive) {
          active++;
          if (p.fitness_status === "Injured" || p.fitness_status === "Rehab") injured++;
        }
      });
      setYouthCount(active);
      setInjuredCount(injured);
    });

    // Coaches count and myTeams fetch
    const unsubCoaches = onSnapshot(getAcademyCollection("coaches"), (snap) => {
      setCoachCount(snap.size);
      if (currentUser?.email) {
        const myCoachDoc = snap.docs.find(d => d.data().email === currentUser.email);
        if (myCoachDoc) {
          setMyTeams(myCoachDoc.data().teams || []);
        }
      }
    });

    // Parent messages fetch (sort locally to avoid pending serverTimestamp index issues)
    const unsubMessages = onSnapshot(getAcademyCollection("messages"), (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ParentMessage));
      msgs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : Date.now();
        return timeB - timeA;
      });
      setParentMessages(msgs);
    });

    // Scout / Pro players count
    const unsubPro = onSnapshot(getAcademyCollection("proPlayers"), (snap) => setScoutCount(snap.size));

    // Events fetch
    const unsubEvents = onSnapshot(getAcademyCollection("events"), (snap) => {
      const today = new Date().toISOString().split("T")[0];
      const fetchedEvents: AcademyEvent[] = [];
      snap.forEach((doc) => {
        const data = doc.data() as AcademyEvent;
        // Filter out past events
        if (data.date >= today) {
          fetchedEvents.push({ ...data, id: doc.id });
        }
      });
      // Sort chronologically by date and time
      fetchedEvents.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });
      setEvents(fetchedEvents);
    });

    // IDPs overdue fetch
    const unsubIDPs = onSnapshot(getAcademyCollection("idps"), (snap) => {
      let overdue = 0;
      const today = new Date().toISOString().split("T")[0];
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.status === "Active" && data.endDate && data.endDate < today) {
          overdue++;
        }
      });
      setOverdueIDPsCount(overdue);
    });

    // Activities fetch
    const activitiesQ = query(
      getAcademyCollection("activity_logs"),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const unsubActivities = onSnapshot(activitiesQ, (snap) => {
      const logs: ActivityLog[] = [];
      snap.forEach(doc => {
        logs.push({ id: doc.id, ...doc.data() } as ActivityLog);
      });
      setActivities(logs);
    });

    // Overview fetch
    const selectedDate = new Date();
    const dayOfWeekStr = selectedDate.getDay();
    const diffToMonday = selectedDate.getDate() - dayOfWeekStr + (dayOfWeekStr === 0 ? -6 : 1);
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(diffToMonday);
    const startYear = startOfWeek.getFullYear();
    const startMonth = String(startOfWeek.getMonth() + 1).padStart(2, '0');
    const startDate = String(startOfWeek.getDate()).padStart(2, '0');
    const startStr = `${startYear}-${startMonth}-${startDate}`;
    
    const monthsArr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const formattedToday = `${monthsArr[selectedDate.getMonth()]} ${selectedDate.getDate()}`;

    const unsubOverview = onSnapshot(doc(getAcademyCollection("training_weeks"), startStr), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const days = data.days || [];
        const attendanceDB = data.attendanceDB || {};
        
        let completed = 0;
        let total = 0;
        let todayTheme = "ไม่มีการฝึก";
        let todayTime = "-";
        let attCount = 0;
        let absCount = 0;

        days.forEach((d: any) => {
          if (d.theme && d.theme !== "Rest") {
            total++;
            const dayIndex = parseInt(d.id.split("-")[1] || "0");
            const currentDayIndex = dayOfWeekStr === 0 ? 7 : dayOfWeekStr;
            if (dayIndex < currentDayIndex) {
              completed++;
            }
          }
        });

        const todayDay = days.find((d: any) => d.date === formattedToday);
        if (todayDay && todayDay.theme !== "Rest") {
          todayTheme = todayDay.theme || "การฝึกซ้อมประจำวัน";
          if (attendanceDB[todayDay.id]) {
            const att = attendanceDB[todayDay.id];
            Object.values(att).forEach((status) => {
              if (status === "Present" || status === "Late") attCount++;
              else if (status === "Absent" || status === "Sick" || status === "Injured") absCount++;
            });
          }
        }

        setOverview({
          theme: todayTheme,
          time: todayTime,
          attended: attCount,
          absent: absCount,
          completedSessions: completed,
          totalSessions: total
        });
      } else {
        setOverview({
          theme: "ไม่มีการฝึก",
          time: "-",
          attended: 0,
          absent: 0,
          completedSessions: 0,
          totalSessions: 0
        });
      }
    });

    return () => {
      unsubDrills();
      unsubPlayers();
      unsubCoaches();
      unsubMessages();
      unsubPro();
      unsubEvents();
      unsubIDPs();
      unsubActivities();
      unsubOverview();
    };
  }, [academyId, activeSeason, settings.currentSeason]);

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventForm.title || !newEventForm.date || !newEventForm.time || !academyId) return;
    try {
      if (editingEventId) {
        await updateDoc(doc(db, "academies", academyId, "events", editingEventId), {
          ...newEventForm,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(getAcademyCollection("events"), {
          ...newEventForm,
          createdAt: new Date().toISOString()
        });
      }
      setIsEventModalOpen(false);
      setEditingEventId(null);
      setNewEventForm({ title: "", desc: "", date: "", time: "", location: "" });
      
      await logActivity(editingEventId ? `แก้ไขกิจกรรม: ${newEventForm.title}` : `สร้างกิจกรรม: ${newEventForm.title}`);
    } catch (err) {
      console.error("Error saving event:", err);
    }
  };

  const handleEditEvent = (ev: AcademyEvent) => {
    setNewEventForm({
      title: ev.title, desc: ev.desc || "", date: ev.date, time: ev.time, location: ev.location || ""
    });
    setEditingEventId(ev.id);
    setIsEventModalOpen(true);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!academyId) return;
    if (confirm("คุณต้องการลบกิจกรรมนี้ใช่หรือไม่?")) {
      try {
        await deleteDoc(doc(db, "academies", academyId, "events", id));
        await logActivity("ลบกิจกรรม");
      } catch (err) {
        console.error("Error deleting event:", err);
      }
    }
  };

  const visibleMessages = parentMessages.filter(msg => {
    if (currentUser?.role === "SUPERADMIN") return true;
    if (currentUser?.role === "ADMIN" && myTeams.length === 0) return true;
    return myTeams.includes(msg.targetSquad);
  });
  
  const handleMarkMessageAsRead = async (msgId: string) => {
    if (!academyId) return;
    try {
      await updateDoc(doc(db, "academies", academyId, "messages", msgId), {
        isRead: true
      });
    } catch (err) {
      console.error("Error marking message as read:", err);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto pb-10 space-y-6">
      {/* Header Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
          Command Center
        </h1>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
          Manage your academy operations and player development
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Section (Spans 2 columns) */}
        <div className="xl:col-span-2 space-y-8">
          
          {/* 1. Today's Command Center */}
          <div className="space-y-4">
            <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Today's Command Center
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button onClick={() => onNavigate("periodization")} className="bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 flex flex-col items-start gap-3 transition-all duration-300 group text-left backdrop-blur-md">
                <div className="bg-white dark:bg-emerald-950/80 p-2 rounded-lg text-emerald-600 dark:text-emerald-400 shadow-sm dark:shadow-[0_0_15px_rgba(16,185,129,0.2)] group-hover:scale-105 transition-transform border border-transparent dark:border-emerald-500/30">
                  <Calendar size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Start Training</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-500 font-medium">บันทึกการฝึกซ้อม</div>
                </div>
              </button>
              
              <button onClick={() => onNavigate("daily_attendance_summary")} className="bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 p-4 rounded-2xl border border-blue-100 dark:border-blue-500/20 flex flex-col items-start gap-3 transition-all duration-300 group text-left backdrop-blur-md">
                <div className="bg-white dark:bg-blue-950/80 p-2 rounded-lg text-blue-600 dark:text-blue-400 shadow-sm dark:shadow-[0_0_15px_rgba(59,130,246,0.2)] group-hover:scale-105 transition-transform border border-transparent dark:border-blue-500/30">
                  <UserCheck size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-sm font-bold text-blue-900 dark:text-blue-100">Attendance</div>
                  <div className="text-[10px] text-blue-600 dark:text-blue-500 font-medium">เช็คชื่อผู้เล่น</div>
                </div>
              </button>

              <button onClick={() => onNavigate("/coach/match-evaluation")} className="bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 p-4 rounded-2xl border border-purple-100 dark:border-purple-500/20 flex flex-col items-start gap-3 transition-all duration-300 group text-left backdrop-blur-md">
                <div className="bg-white dark:bg-purple-950/80 p-2 rounded-lg text-purple-600 dark:text-purple-400 shadow-sm dark:shadow-[0_0_15px_rgba(168,85,247,0.2)] group-hover:scale-105 transition-transform border border-transparent dark:border-purple-500/30">
                  <Activity size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-sm font-bold text-purple-900 dark:text-purple-100">Match Eval</div>
                  <div className="text-[10px] text-purple-600 dark:text-purple-500 font-medium">บันทึกสถิติหลังเกม</div>
                </div>
              </button>

              <button onClick={() => onNavigate("match_scheduler")} className="bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 p-4 rounded-2xl border border-rose-100 dark:border-rose-500/20 flex flex-col items-start gap-3 transition-all duration-300 group text-left backdrop-blur-md">
                <div className="bg-white dark:bg-rose-950/80 p-2 rounded-lg text-rose-600 dark:text-rose-400 shadow-sm dark:shadow-[0_0_15px_rgba(244,63,94,0.2)] group-hover:scale-105 transition-transform border border-transparent dark:border-rose-500/30">
                  <Calendar size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-sm font-bold text-rose-900 dark:text-rose-100">Match Schedule</div>
                  <div className="text-[10px] text-rose-600 dark:text-rose-500 font-medium">จัดการตารางแข่งขัน</div>
                </div>
              </button>

              <button onClick={() => onNavigate("youth")} className="bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 p-4 rounded-2xl border border-amber-100 dark:border-amber-500/20 flex flex-col items-start gap-3 transition-all duration-300 group text-left backdrop-blur-md">
                <div className="bg-white dark:bg-amber-950/80 p-2 rounded-lg text-amber-600 dark:text-amber-400 shadow-sm dark:shadow-[0_0_15px_rgba(245,158,11,0.2)] group-hover:scale-105 transition-transform border border-transparent dark:border-amber-500/30">
                  <Search size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-900 dark:text-amber-100">Player Search</div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">ค้นหานักกีฬา</div>
                </div>
              </button>
              <button onClick={() => setShowQuickIDPModal(true)} className="bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 flex flex-col items-start gap-3 transition-all duration-300 group text-left backdrop-blur-md">
                <div className="bg-white dark:bg-indigo-950/80 p-2 rounded-lg text-indigo-600 dark:text-indigo-400 shadow-sm dark:shadow-[0_0_15px_rgba(79,70,229,0.2)] group-hover:scale-105 transition-transform border border-transparent dark:border-indigo-500/30">
                  <BookOpen size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-sm font-bold text-indigo-900 dark:text-indigo-100">Quick IDP Training</div>
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-500 font-medium">บันทึกซ้อมพิเศษรายบุคคล</div>
                </div>
              </button>
            </div>

            {/* Alerts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <button onClick={() => onNavigate("recovery")} className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-orange-200 dark:border-orange-500/20 flex items-center justify-between hover:shadow-md dark:hover:shadow-orange-900/20 transition-all duration-300 group backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 p-1.5 rounded-lg border border-transparent dark:border-orange-500/30">
                    <AlertTriangle size={18} strokeWidth={2.5} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{injuredCount} ผู้เล่นบาดเจ็บ</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">ต้องติดตามอาการ</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-400 dark:text-slate-500 group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors" />
              </button>
              
              <button onClick={() => onNavigate("idp_manager")} className={`bg-white dark:bg-slate-800/40 p-3 rounded-xl border ${overdueIDPsCount > 0 ? 'border-blue-200 dark:border-blue-500/20 hover:shadow-md dark:hover:shadow-blue-900/20' : 'border-slate-200 dark:border-slate-700/50'} flex items-center justify-between transition-all duration-300 group cursor-pointer backdrop-blur-sm`}>
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg border ${overdueIDPsCount > 0 ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-transparent dark:border-blue-500/30' : 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-transparent dark:border-slate-700/50'}`}>
                    <Info size={18} strokeWidth={2.5} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{overdueIDPsCount} ผู้เล่นต้องประเมิน IDP</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{overdueIDPsCount > 0 ? "เกินกำหนดแล้ว" : "เยี่ยมมาก! ประเมินครบถ้วน"}</div>
                  </div>
                </div>
                <ChevronRight size={16} className={`transition-colors ${overdueIDPsCount > 0 ? 'text-slate-400 group-hover:text-blue-500' : 'text-slate-300'}`} />
              </button>
              
              <button className="bg-white dark:bg-slate-800/40 p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-between hover:shadow-md dark:hover:shadow-emerald-900/20 transition-all duration-300 group backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 p-1.5 rounded-lg border border-transparent dark:border-emerald-500/30">
                    <CheckCircle size={18} strokeWidth={2.5} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">3 รายการเอกสาร</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">รอการอนุมัติ</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            {/* Column 1 */}
            <div className="space-y-6">
              {/* 3. Coach Operations */}
              <div>
                <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                  Coach Operations
                </h2>
                <div className="space-y-3">
                  <ModuleCard icon={Calendar} color="bg-indigo-500 text-white" title="Weekly Periodization" desc="แผนการฝึกประจำสัปดาห์ (Microcycle)" onClick={() => onNavigate("periodization")} />
                  <ModuleCard icon={Shield} color="bg-emerald-500 text-white" title="Starting XI & Tactics" desc="แผนการเล่น & จัดตัวผู้เล่น" onClick={() => onNavigate("starting_xi")} />
                </div>
              </div>

              {/* 4. Player Development */}
              <div>
                <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                  Player Development
                </h2>
                <div className="space-y-3">
                  <ModuleCard icon={Users} color="bg-blue-500 text-white" title="Youth Academy Roster" desc="จัดการนักกีฬาเยาวชน" onClick={() => onNavigate("youth")} extra={`${youthCount} คน`} />
                  <ModuleCard icon={Target} color="bg-indigo-500 text-white" title="IDP Manager" desc="แผนพัฒนารายบุคคล" onClick={() => onNavigate("idp_manager")} />
                  <ModuleCard icon={Star} color="bg-amber-500 text-white" title="Player Evaluation" desc="ประเมินผลนักกีฬา" onClick={() => onNavigate("player_evaluation")} />
                  <ModuleCard icon={Settings} color="bg-slate-600 text-white" title="Evaluation Criteria" desc="เกณฑ์การประเมิน" onClick={() => onNavigate("criteria_manager")} />
                  <ModuleCard icon={LineChart} color="bg-teal-500 text-white" title="Development Report" desc="รายงานพัฒนาการ" onClick={() => onNavigate("/report")} />
                  <ModuleCard icon={Heart} color="bg-rose-500 text-white" title="Recovery & Medical" desc="สุขภาพ & การฟื้นฟู" onClick={() => onNavigate("recovery")} extra={`${injuredCount} คน`} />
                  <ModuleCard icon={Activity} color="bg-orange-500 text-white" title="Performance Benchmarks" desc="ผลการทดสอบ & เปรียบเทียบ" onClick={() => onNavigate("fitness")} />
                </div>
              </div>

              {/* 5. Analytics */}
              <div>
                <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                  Analytics
                </h2>
                <div className="space-y-3">
                  <ModuleCard icon={BarChart2} color="bg-blue-600 text-white" title="Analytics Dashboard" desc="ภาพรวมข้อมูล & วิเคราะห์" onClick={() => {}} extra={<Activity size={16} className="text-blue-400"/>} />
                  <ModuleCard icon={TrendingUp} color="bg-indigo-600 text-white" title="Player Development" desc="พัฒนาการนักกีฬา" onClick={() => {}} extra={<TrendingUp size={16} className="text-indigo-400"/>} />
                  <ModuleCard icon={FileText} color="bg-teal-500 text-white" title="Reports Center" desc="รายงานต่างๆ" onClick={() => {}} extra={<FileText size={16} className="text-teal-400"/>} />
                  <ModuleCard icon={BrainCircuit} color="bg-emerald-600 text-white" title="AI Insights" desc="AI วิเคราะห์ & แนะนำ" onClick={() => {}} extra={<span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] font-bold">ใหม่</span>} />
                </div>
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-6">
              {/* 6. Resources */}
              <div>
                <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                  Resources
                </h2>
                <div className="space-y-3">
                  <ModuleCard icon={ClipboardList} color="bg-cyan-500 text-white" title="Drill Library" desc="คลังแบบฝึกซ้อม" onClick={() => onNavigate("drills")} extra={`${drillCount} Drill`} />
                  {hasPermission(["ADMIN", "SCOUT", "SUPERADMIN"]) && (
                    <ModuleCard icon={Search} color="bg-amber-500 text-white" title="Scouting Portal" desc="ค้นหานักเตะ & แมวมอง" onClick={() => onNavigate("scout")} extra={`${scoutCount} คน`} />
                  )}
                  <ModuleCard icon={Folder} color="bg-amber-500 text-white" title="Documents" desc="เอกสารสโมสร" onClick={() => onNavigate("documents")} />
                  <ModuleCard icon={Image} color="bg-pink-500 text-white" title="Media" desc="รูปภาพ & วิดีโอ" onClick={() => onNavigate("media")} />
                  <ModuleCard icon={Package} color="bg-indigo-500 text-white" title="Assets" desc="คลังอุปกรณ์" onClick={() => onNavigate("assets")} />
                  <ModuleCard icon={Download} color="bg-teal-500 text-white" title="Downloads" desc="ดาวน์โหลดทรัพยากร" onClick={() => onNavigate("downloads")} />
                </div>
              </div>

              {/* 7. Academy Management */}
              <div>
                <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                  Academy Management
                </h2>
                <div className="space-y-3">
                  <ModuleCard icon={Settings} color="bg-slate-600 text-white" title="Academy Settings" desc="ตั้งค่าสโมสร" onClick={() => onNavigate("settings:academy")} />
                  {hasPermission(["ADMIN", "SUPERADMIN"]) && (
                    <ModuleCard icon={UserCheck} color="bg-purple-500 text-white" title="Coach Management" desc="ข้อมูลโค้ช & ผู้ฝึกสอน" onClick={() => onNavigate("coaches")} extra={`${coachCount} คน`} />
                  )}
                  <ModuleCard icon={Calendar} color="bg-indigo-500 text-white" title="Season Management" desc="จัดการฤดูกาล" onClick={() => onNavigate("settings:season")} />
                  <ModuleCard icon={ShieldCheck} color="bg-rose-500 text-white" title="Roles & Permissions" desc="สิทธิ์การใช้งาน" onClick={() => onNavigate("settings:roles")} />
                  <ModuleCard icon={Users} color="bg-blue-500 text-white" title="Age Groups" desc="จัดการรุ่นอายุ" onClick={() => onNavigate("settings:age_groups")} />
                  <ModuleCard icon={HardDrive} color="bg-cyan-600 text-white" title="System Settings" desc="ตั้งค่าระบบ" onClick={() => onNavigate("settings:system")} />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Right Section (Spans 1 column) */}
        <div className="space-y-8">
          
          {/* 2. Today's Status Wrapper */}
          <div>
            <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
              Today's Status
            </h2>
            <div className="space-y-6">
              
              {/* Today's Overview */}
              <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-5 space-y-5 shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100 p-3 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                  <div className="bg-white dark:bg-emerald-950/80 p-2 rounded-lg shadow-sm text-emerald-600 dark:text-emerald-400 border border-transparent dark:border-emerald-500/30">
                    <Users size={20} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase">การฝึกวันนี้</div>
                    <div className="text-sm font-black">{overview.theme}</div>
                    <div className="text-xs font-medium opacity-80">{overview.time}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-700/50">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">ผู้เล่นทั้งหมด</div>
                    <div className="text-xl font-black text-slate-800 dark:text-slate-200">{youthCount}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">คน</div>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-500/20">
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-500 font-bold">มาแล้ว</div>
                    <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">{overview.attended}</div>
                    <div className="text-[10px] text-emerald-500 dark:text-emerald-600/80 font-medium">คน</div>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3 text-center border border-rose-100 dark:border-rose-500/20">
                    <div className="text-[10px] text-rose-600 dark:text-rose-500 font-bold">ขาด</div>
                    <div className="text-xl font-black text-rose-700 dark:text-rose-400">{overview.absent}</div>
                    <div className="text-[10px] text-rose-500 dark:text-rose-600/80 font-medium">คน</div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-2">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">ความคืบหน้าการฝึกสัปดาห์นี้</div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-200">{overview.completedSessions} / {overview.totalSessions} Sessions</div>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                      style={{ width: overview.totalSessions > 0 ? `${(overview.completedSessions / overview.totalSessions) * 100}%` : '0%' }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Upcoming Events */}
              <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                  <span>Upcoming Events</span>
                  {hasPermission(["ADMIN", "COACH", "SUPERADMIN"]) && (
                    <button 
                      onClick={() => {
                        setEditingEventId(null);
                        setNewEventForm({ title: "", desc: "", date: "", time: "", location: "" });
                        setIsEventModalOpen(true);
                      }}
                      className="flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md font-bold transition-colors cursor-pointer"
                    >
                      <Plus size={12} /> Add Event
                    </button>
                  )}
                </h3>
                <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4 space-y-4 shadow-sm relative overflow-hidden backdrop-blur-md">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-slate-100/50 dark:from-slate-700/20 to-transparent rounded-bl-full pointer-events-none"></div>
                  <div className="relative z-10 space-y-3">
                    {events.length > 0 ? events.slice(0, 5).map((ev, index) => {
                      const eventColors = [
                        { border: "border-rose-200 dark:border-rose-500/20", bg: "bg-rose-50 dark:bg-rose-900/20", text: "text-rose-800 dark:text-rose-200", month: "text-rose-600 dark:text-rose-400", desc: "text-rose-600/80 dark:text-rose-400/80", time: "text-rose-700 dark:text-rose-300" },
                        { border: "border-blue-200 dark:border-blue-500/20", bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-800 dark:text-blue-200", month: "text-blue-600 dark:text-blue-400", desc: "text-blue-600/80 dark:text-blue-400/80", time: "text-blue-700 dark:text-blue-300" },
                        { border: "border-emerald-200 dark:border-emerald-500/20", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-800 dark:text-emerald-200", month: "text-emerald-600 dark:text-emerald-400", desc: "text-emerald-600/80 dark:text-emerald-400/80", time: "text-emerald-700 dark:text-emerald-300" },
                        { border: "border-amber-200 dark:border-amber-500/20", bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-800 dark:text-amber-200", month: "text-amber-600 dark:text-amber-400", desc: "text-amber-700/80 dark:text-amber-400/80", time: "text-amber-700 dark:text-amber-300" },
                        { border: "border-purple-200 dark:border-purple-500/20", bg: "bg-purple-50 dark:bg-purple-900/20", text: "text-purple-800 dark:text-purple-200", month: "text-purple-600 dark:text-purple-400", desc: "text-purple-600/80 dark:text-purple-400/80", time: "text-purple-700 dark:text-purple-300" },
                      ];
                      const d = new Date(ev.date);
                      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
                      return (
                        <div key={ev.id}>
                          {index > 0 && <div className="h-px w-full bg-slate-100/50 dark:bg-slate-700/30 mb-2"></div>}
                          <EventItem 
                            colorTheme={eventColors[index % eventColors.length]}
                            day={d.getDate().toString()} 
                            month={months[d.getMonth()]} 
                            title={ev.title} 
                            desc={ev.desc} 
                            time={ev.time} 
                            location={ev.location} 
                            onEdit={hasPermission(["ADMIN", "COACH", "SUPERADMIN"]) ? () => handleEditEvent(ev) : undefined}
                            onDelete={hasPermission(["ADMIN", "COACH", "SUPERADMIN"]) ? () => handleDeleteEvent(ev.id) : undefined}
                          />
                        </div>
                      );
                    }) : (
                      <div className="text-center py-6 text-sm text-indigo-400 dark:text-indigo-500 font-medium bg-white/50 dark:bg-slate-800/40 rounded-xl border border-indigo-50 dark:border-slate-700/50 border-dashed backdrop-blur-sm">
                        ไม่มีกิจกรรมที่กำลังจะมาถึง
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages from Parents */}
              <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><MessageCircle size={14} className="text-indigo-400" /> ข้อความจากผู้ปกครอง</span>
                  {visibleMessages.length > 0 && (
                    <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full text-[10px] font-bold border border-transparent dark:border-indigo-500/30">
                      {visibleMessages.filter(m => !m.isRead).length} ใหม่
                    </span>
                  )}
                </h3>
                <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-0 shadow-sm overflow-hidden backdrop-blur-sm">
                  {visibleMessages.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[300px] overflow-y-auto custom-scrollbar">
                      {visibleMessages.map(msg => (
                        <div key={msg.id} className={`p-4 transition-colors ${msg.isRead ? 'bg-white dark:bg-transparent' : 'bg-indigo-50/30 dark:bg-indigo-900/20'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <UserCircle size={16} className="text-slate-400 dark:text-slate-500" />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{msg.senderName}</div>
                                <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">ทีม: {msg.targetSquad}</div>
                              </div>
                            </div>
                            {!msg.isRead && (
                              <button 
                                onClick={() => handleMarkMessageAsRead(msg.id)}
                                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2 py-1 rounded-md transition-colors border border-transparent dark:border-indigo-500/30"
                              >
                                ทำเครื่องหมายว่าอ่านแล้ว
                              </button>
                            )}
                          </div>
                          <div className="text-sm text-slate-700 dark:text-slate-300 mt-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50">
                            {msg.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
                        <MessageCircle size={20} className="text-slate-300" />
                      </div>
                      <div className="text-sm font-bold text-slate-500">ไม่มีข้อความใหม่</div>
                      <div className="text-xs text-slate-400 mt-1">ข้อความจากผู้ปกครองจะแสดงที่นี่</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activities */}
              <div>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                  <span>Recent Activities</span>
                  <button className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline">ดูทั้งหมด →</button>
                </h3>
                <div className="bg-white dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4 space-y-4 backdrop-blur-sm">
                  {activities.length > 0 ? activities.map(act => {
                    const getRelativeTime = (timestamp: any) => {
                      if (!timestamp) return "";
                      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                      const diff = Math.floor((new Date().getTime() - date.getTime()) / 1000);
                      if (diff < 60) return "เมื่อสักครู่";
                      const min = Math.floor(diff / 60);
                      if (min < 60) return `${min} นาทีที่แล้ว`;
                      const hr = Math.floor(min / 60);
                      if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
                      const d = Math.floor(hr / 24);
                      return `${d} วันที่แล้ว`;
                    };
                    return (
                      <ActivityItem 
                        key={act.id} 
                        name={act.userName} 
                        action={act.action} 
                        time={getRelativeTime(act.createdAt)} 
                        avatar={`https://api.dicebear.com/7.x/avataaars/svg?seed=${act.avatarSeed}`} 
                      />
                    );
                  }) : (
                    <div className="text-center py-4 text-xs text-slate-500 dark:text-slate-400">
                      ไม่มีกิจกรรมล่าสุด
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 dark:bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-transparent dark:border-slate-700">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50">
              <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Calendar size={16} className="text-indigo-600 dark:text-indigo-400" />
                {editingEventId ? "แก้ไขกิจกรรม (Edit Event)" : "สร้างกิจกรรมใหม่ (Add Event)"}
              </h2>
              <button onClick={() => setIsEventModalOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 p-1 cursor-pointer transition-colors">✕</button>
            </div>
            <form onSubmit={handleSaveEvent} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">ชื่อกิจกรรม *</label>
                <input required type="text" value={newEventForm.title} onChange={e => setNewEventForm({...newEventForm, title: e.target.value})} className="w-full text-sm p-2 rounded-lg bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600" placeholder="e.g. Friendly Match vs ABC" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">รายละเอียดเพิ่มเติม</label>
                <input type="text" value={newEventForm.desc} onChange={e => setNewEventForm({...newEventForm, desc: e.target.value})} className="w-full text-sm p-2 rounded-lg bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600" placeholder="e.g. แข่งกระชับมิตร รุ่น U11" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">วันที่ *</label>
                  <ThaiDatePicker required value={newEventForm.date} onChange={e => setNewEventForm({...newEventForm, date: e.target.value})} className="w-full text-sm p-2 rounded-lg bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">เวลา *</label>
                  <input required type="time" value={newEventForm.time} onChange={e => setNewEventForm({...newEventForm, time: e.target.value})} className="w-full text-sm p-2 rounded-lg bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors [color-scheme:light] dark:[color-scheme:dark]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">สถานที่</label>
                <input type="text" value={newEventForm.location} onChange={e => setNewEventForm({...newEventForm, location: e.target.value})} className="w-full text-sm p-2 rounded-lg bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600" placeholder="e.g. สนาม 1" />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 text-white font-bold text-sm py-2.5 rounded-xl transition-colors shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.3)] cursor-pointer">
                  บันทึกกิจกรรม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQuickIDPModal && academyId && (
        <DashboardQuickIDPModal
          academyId={academyId}
          onClose={() => setShowQuickIDPModal(false)}
        />
      )}
    </div>
  );
}

// ---------------- Helper Components ----------------

function ChevronRight({ size, className }: { size: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}

function ModuleCard({ icon: Icon, color, title, desc, onClick, extra }: any) {
  return (
    <button onClick={onClick} className="w-full bg-white dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md dark:hover:shadow-indigo-900/20 cursor-pointer flex items-center gap-4 transition-all duration-300 text-left group backdrop-blur-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color} shadow-sm group-hover:scale-110 transition-transform`}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors truncate">{title}</div>
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">{desc}</div>
      </div>
      {extra && (
        <div className="text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">
          {extra}
        </div>
      )}
    </button>
  );
}

function EventItem({ day, month, title, desc, time, location, colorTheme, onEdit, onDelete }: any) {
  const c = colorTheme || { border: "border-slate-200 dark:border-slate-700", bg: "bg-white dark:bg-slate-800/40", text: "text-slate-800 dark:text-slate-200", month: "text-red-500 dark:text-red-400", desc: "text-slate-500 dark:text-slate-400", time: "text-slate-700 dark:text-slate-300" };
  return (
    <div className={`flex items-start gap-3 group/event p-3 rounded-xl border ${c.border} ${c.bg} transition-colors backdrop-blur-sm`}>
      <div className={`flex flex-col items-center justify-center w-11 h-11 rounded-lg bg-white dark:bg-slate-800 shadow-sm border ${c.border} shrink-0`}>
        <span className={`text-xs font-black ${c.text} leading-none`}>{day}</span>
        <span className={`text-[9px] font-bold ${c.month} mt-0.5 uppercase`}>{month}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-bold ${c.text} truncate`}>{title}</div>
        <div className={`text-xs font-medium ${c.desc} truncate`}>{desc}</div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <div className="text-right">
          <div className={`text-xs font-bold ${c.time}`}>{time}</div>
          <div className={`text-[10px] font-medium ${c.desc}`}>{location}</div>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover/event:opacity-100 transition-opacity">
            {onEdit && <button onClick={onEdit} className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer transition-colors"><Edit size={12} /></button>}
            {onDelete && <button onClick={onDelete} className="text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer transition-colors"><Trash2 size={12} /></button>}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ name, action, time, avatar }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{name}</div>
        <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">{action}</div>
      </div>
      <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 shrink-0">
        {time}
      </div>
    </div>
  );
}
