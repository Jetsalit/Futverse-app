import { useState, useEffect } from "react";
import {
  Menu,
  X,
  WifiOff,
  Wifi,
  ChevronDown,
  Award,
  Users,
  LineChart,
  LayoutDashboard,
  Bell,
  Star,
  Trophy,
  CreditCard,
  Shield,
  Settings as SettingsIcon,
  Calendar,
  Target,
  FileText,
  Sun,
  Moon,
  FileSpreadsheet,
  BookOpen,
} from "lucide-react";
import Dashboard from "./components/Dashboard";
import PlayerDashboard from "./components/PlayerDashboard";
import FitnessTesting from "./components/FitnessTesting";
import CoachManagement from "./components/CoachManagement";
import TacticBoard from "./components/TacticBoard";
import DrillLibrary from "./components/DrillLibrary";
import YouthPlayerManager from "./components/YouthPlayerManager";
import YouthPlayerCV from "./components/YouthPlayerCV";
import YouthDevelopmentReport from "./components/YouthDevelopmentReport";
import ScoutDashboard from "./components/ScoutDashboard";
import ProPlayerManager from "./components/ProPlayerManager";
import ProPlayerCV from "./components/ProPlayerCV";
import RecoveryDashboard from "./components/RecoveryDashboard";
import IDPManager from "./components/IDPManager";
import IDPDashboard from "./components/IDPDashboard";
import WeeklyPeriodization from "./components/WeeklyPeriodization";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { ProPlayer } from "./types/ProPlayer";
import Settings from "./components/Settings";
import NotificationDrawer from "./components/NotificationDrawer";
import { useLanguage } from "./contexts/LanguageContext";
import PostMatchStatsEntry from "./components/PostMatchStatsEntry";
import TrainingLogManager from "./components/TrainingLogManager";
import StartingXIBuilder from "./components/StartingXIBuilder";
import DailyAttendanceSummary from "./components/DailyAttendanceSummary";
import { useAuth } from "./contexts/AuthContext";
import { useAcademy } from "./contexts/AcademyContext";
import { useTheme } from "./contexts/ThemeContext";
import PendingApproval from "./components/PendingApproval";
import JoinAcademy from "./components/JoinAcademy";
import AccessDenied from "./components/AccessDenied";
import Login from "./components/Login";
import SuperadminPortal from "./components/SuperadminPortal";
import MobileBottomNav from "./components/MobileBottomNav";
import SubscriptionPaywall from "./components/SubscriptionPaywall";
import ConciergeDashboard from "./components/ConciergeDashboard";
import EvaluationCriteriaManager from "./components/EvaluationCriteriaManager";
import PlayerEvaluationForm from "./components/PlayerEvaluationForm";
import PDPAConsentModal from "./components/PDPAConsentModal";
import ParentMatchCenter from "./modules/parent-observation/components/ParentMatchCenter";
import ParentMatchObservation from "./modules/parent-observation/components/ParentMatchObservation";
import MatchScheduler from "./components/MatchScheduler";
import TournamentManager from "./components/TournamentManager";
import MatchSummaryDashboard from "./components/MatchSummaryDashboard";
import { Match } from "./types/Match";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "./lib/firebase";
import { AppNotification } from "./lib/notifications";

export default function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<string[]>([]);
  const { isOnline, toggleSimulation } = useNetworkStatus();
  const { language, setLanguage, t } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const {
    hasPermission,
    currentUser,
    logout,
    isImpersonating,
    revertImpersonation,
  } = useAuth();
  const {
    academyId,
    settings: academySettings,
    activeSeason,
    setActiveSeason
  } = useAcademy();
  const [pendingSyncs, setPendingSyncs] = useState(0);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    const userId = (currentUser as any).uid || (currentUser as any).id;
    if (!userId) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: AppNotification[] = [];
      snapshot.forEach((doc) => {
        notifs.push({ id: doc.id, ...doc.data() } as AppNotification);
      });
      notifs.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : Date.now());
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : Date.now());
        return timeB - timeA;
      });
      setNotifications(notifs);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const unreadNotificationsCount = notifications.filter((n) => !n.isRead).length;

  // Global State / Context for Academy Squads
  const academySquads = academySettings.squads || [
    "U-17 National Prospects",
    "U-15 Development",
    "U-13 Grassroots",
  ];
  const [activeTeam, setActiveTeam] = useState(academySquads[0]);

  const [selectedProPlayer, setSelectedProPlayer] = useState<ProPlayer | null>(
    null,
  );
  const [selectedYouthPlayer, setSelectedYouthPlayer] = useState<any>(null);
  
  // State for Parent Match Observation module
  const [parentObservationMatchId, setParentObservationMatchId] = useState<string>("");
  const [parentObservationPlayerId, setParentObservationPlayerId] = useState<string>("");
  const [parentObservationPlayerPosition, setParentObservationPlayerPosition] = useState<string>("");
  const [parentObservationAcademyId, setParentObservationAcademyId] = useState<string>("");
  
  // State for Match Summary
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Simulate Next.js usePathname feature for Route-based Conditional Rendering
  const pathname = currentPage.startsWith("/")
    ? currentPage
    : `/${currentPage}`;
  const isGlobalRoute =
    pathname.startsWith("/superadmin") || pathname.startsWith("/settings");

  // Simulate auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingSyncs > 0) {
      const syncTimer = setTimeout(() => {
        setPendingSyncs(0);
      }, 1500); // Faking sync delay
      return () => clearTimeout(syncTimer);
    }
  }, [isOnline, pendingSyncs]);
  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      roles: ["SUPERADMIN", "ADMIN", "COACH", "SCOUT", "USER", "DATA_ADMIN", "PLAYER", "PARENT"],
    },
    {
      id: "players_group",
      label: "Players",
      icon: Users,
      roles: ["SUPERADMIN", "ADMIN", "COACH", "SCOUT", "PLAYER", "PARENT"],
      subItems: [
        { id: "youth", label: "Youth Roster", roles: ["SUPERADMIN", "ADMIN", "COACH", "SCOUT"] },
        { id: "pro", label: "Pro Management", roles: ["SUPERADMIN", "ADMIN"] }
      ]
    },
    {
      id: "training_group",
      label: "Training",
      icon: Calendar,
      roles: ["SUPERADMIN", "ADMIN", "COACH", "DATA_ADMIN"],
      subItems: [
        { id: "periodization", label: "Weekly Periodization", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "daily_attendance_summary", label: "Attendance Summary", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "training_log", label: "Training Logs", roles: ["SUPERADMIN", "ADMIN", "COACH", "DATA_ADMIN"] }
      ]
    },
    {
      id: "matches_group",
      label: "Matches",
      icon: Trophy,
      roles: ["SUPERADMIN", "ADMIN", "COACH", "PARENT"],
      subItems: [
        { id: "tournament_manager", label: "Tournaments", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "match_summary", label: "Match Summary", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "match_scheduler", label: "Match Calendar", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "parent-match-center", label: "Parent Observation", roles: ["PARENT"] }
      ]
    },
    {
      id: "evaluation_group",
      label: "Evaluation",
      icon: FileSpreadsheet,
      roles: ["SUPERADMIN", "ADMIN", "COACH", "PLAYER", "PARENT"],
      subItems: [
        { id: "player_evaluation", label: "Performance Evaluation", roles: ["SUPERADMIN", "ADMIN", "COACH", "PLAYER", "PARENT"] },
        { id: "idp_dashboard", label: "Individual Development Plan", roles: ["SUPERADMIN", "ADMIN", "COACH"] }
      ]
    },
    {
      id: "knowledge_group",
      label: "Knowledge Base",
      icon: BookOpen,
      roles: ["SUPERADMIN", "ADMIN", "COACH", "SCOUT", "DATA_ADMIN", "PLAYER", "PARENT"],
      subItems: [
        { id: "drills", label: "Drill Library", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "tactic", label: "Tactical Board", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "assets", label: "Assets", roles: ["SUPERADMIN", "ADMIN", "COACH"] },
        { id: "downloads", label: "Downloads", roles: ["SUPERADMIN", "ADMIN", "COACH", "SCOUT", "DATA_ADMIN", "PLAYER", "PARENT"] }
      ]
    },
    {
      id: "academy_group",
      label: "Academy",
      icon: Shield,
      roles: ["SUPERADMIN", "ADMIN", "DATA_ADMIN"],
      subItems: [
        { id: "settings:academy", label: "Academy Settings", roles: ["SUPERADMIN", "ADMIN"] },
        { id: "coaches", label: "Coach Management", roles: ["SUPERADMIN", "ADMIN"] },
        { id: "settings:season", label: "Season Management", roles: ["SUPERADMIN", "ADMIN"] },
        { id: "settings:roles", label: "Roles & Permissions", roles: ["SUPERADMIN", "ADMIN"] },
        { id: "settings:age_groups", label: "Age Groups", roles: ["SUPERADMIN", "ADMIN"] },
        { id: "settings:observation-profile", label: "Observation Profiles", roles: ["SUPERADMIN", "ADMIN"] },
        { id: "settings:system", label: "System Settings", roles: ["SUPERADMIN", "ADMIN", "DATA_ADMIN"] },
        { id: "subscription", label: "Upgrade Plan", roles: ["SUPERADMIN", "ADMIN"] },
        { id: "superadmin", label: "Superadmin Portal", roles: ["SUPERADMIN"] }
      ]
    },
    {
      id: "settings",
      label: "Settings",
      icon: SettingsIcon,
      roles: ["ADMIN"],
    },
  ];

  // Auto-expand groups when navigating
  useEffect(() => {
    navItems.forEach(group => {
      if (group.subItems?.some(sub => sub.id === currentPage)) {
        if (!openNavGroups.includes(group.id)) {
          setOpenNavGroups(prev => [...prev, group.id]);
        }
      }
    });
  }, [currentPage]);

  const toggleNavGroup = (groupId: string) => {
    setOpenNavGroups(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]);
  };


  const navigateTo = (page: string) => {
    setCurrentPage(page);
    setIsMobileMenuOpen(false);
  };

  if (!currentUser) {
    return <Login />;
  }
  
  if (currentUser.status === "PENDING" || currentUser.status === "REJECTED") {
    return <PendingApproval />;
  }

  // If they are a new coach without an academy, show the Join Academy screen
  if (
    currentUser.status === "Inactive" &&
    currentUser.requestedRole === "COACH" &&
    !currentUser.academyId
  ) {
    return <JoinAcademy />;
  }

  // Enable Paywall for new registrations
  const isPaywallActive = currentUser.status === "Inactive" || currentUser.status === "Pending";

  const renderContent = () => {
    if (isPaywallActive && !isImpersonating) {
      return <SubscriptionPaywall />;
    }
    if (
      isPaywallActive &&
      isImpersonating &&
      currentUser?.status === "Pending"
    ) {
      return <SubscriptionPaywall />;
    }
    if (
      isPaywallActive &&
      isImpersonating &&
      currentUser?.status === "Inactive"
    ) {
      return <SubscriptionPaywall />;
    }

    // Wrap Route Protection Logic
    if (currentPage === "settings" && !hasPermission(["ADMIN"])) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }
    if (currentPage === "fitness" && !hasPermission(["ADMIN"])) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }
    if (currentPage === "scout" && !hasPermission(["ADMIN", "SCOUT"])) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }
    if (currentPage === "superadmin" && !hasPermission(["SUPERADMIN"])) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }
    if (currentPage === "youth" && !hasPermission(["ADMIN", "COACH", "SUPERADMIN", "SCOUT"])) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }

    if (currentPage === "subscription") {
      return <SubscriptionPaywall />;
    }

    const basePage = currentPage.split(":")[0];
    const pageParam = currentPage.split(":")[1];

    if (basePage === "settings") {
      return (
        <Settings
          onBack={() => navigateTo("dashboard")}
          setLanguage={setLanguage}
          currentLanguage={language}
          pendingSyncs={pendingSyncs}
          initialTab={pageParam as any}
        />
      );
    }

    switch (currentPage) {
      case "dashboard":
        return (currentUser?.role === "PLAYER" || currentUser?.role === "PARENT") ? (
          <PlayerDashboard onNavigate={navigateTo} />
        ) : (
          <Dashboard onNavigate={navigateTo} />
        );
      case "superadmin":
        return <SuperadminPortal onBack={() => navigateTo("dashboard")} />;
      case "concierge":
        return <ConciergeDashboard onNavigate={navigateTo} />;
      case "idp_dashboard":
        return (
          <IDPDashboard
            onBack={() => navigateTo("dashboard")}
            onNavigateToPlayer={(id) => {
              setSelectedProPlayer({
                id,
                name: "Teerasil Dangda",
                nationality: "Thailand",
                dob: "1988-06-06",
                position: "Striker",
                height: 181,
                weight: 76,
                preferredFoot: "Right",
                currentClub: "BG Pathum United",
                league: "T1",
                contractExpiry: "2025-05-31",
                avatarUrl:
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=Teerasil",
                actionShotUrl:
                  "https://images.unsplash.com/photo-1574629810360-7efbb212aa2d?auto=format&fit=crop&q=80&w=800",
                careerHistory: [],
                attributes: {
                  technical: 85,
                  tactical: 88,
                  physical: 75,
                  mental: 90,
                  attacking: 89,
                  defending: 40,
                },
              });
              navigateTo("pro_cv");
            }}
          />
        );
      case "fitness":
        return (
          <FitnessTesting
            onBack={() => navigateTo("dashboard")}
            teamName={activeTeam}
            isOnline={isOnline}
            onOfflineSave={() => setPendingSyncs((p) => p + 1)}
          />
        );
      case "coaches":
        return <CoachManagement onBack={() => navigateTo("dashboard")} />;
      case "periodization":
        return (
          <WeeklyPeriodization
            onBack={() => navigateTo("dashboard")}
            onNavigate={navigateTo}
          />
        );
      case "attendance":
        return (
          <WeeklyPeriodization
            onBack={() => navigateTo("dashboard")}
            onNavigate={navigateTo}
            defaultView="attendance"
          />
        );
      case "daily_attendance_summary":
        return (
          <DailyAttendanceSummary
            onBack={() => navigateTo("dashboard")}
            onNavigate={navigateTo}
          />
        );
      case "training_log":
        return (
          <TrainingLogManager
            onBack={() => navigateTo("dashboard")}
            onNavigate={navigateTo}
          />
        );
      case "starting_xi":
        return <StartingXIBuilder onBack={() => navigateTo("dashboard")} />;
      case "youth":
        return (
          <YouthPlayerManager
            onBack={() => navigateTo("dashboard")}
            onNavigate={navigateTo}
            onSelectPlayer={(p: any) => {
              setSelectedYouthPlayer(p);
              navigateTo("youth_cv");
            }}
          />
        );
      case "youth_cv":
        return selectedYouthPlayer ? (
          <YouthPlayerCV
            player={selectedYouthPlayer}
            onBack={() => navigateTo("youth")}
          />
        ) : null;
      case "tactic":
        return <TacticBoard onBack={() => navigateTo("drills")} />;
      case "drills":
        return <DrillLibrary onNavigate={navigateTo} />;
      case "scout":
        return <ScoutDashboard onBack={() => navigateTo("dashboard")} />;
      case "recovery":
        return (
          <RecoveryDashboard
            onBack={() => navigateTo("dashboard")}
            teamName={activeTeam}
          />
        );
      case "pro":
        return (
          <ProPlayerManager
            onBack={() => navigateTo("dashboard")}
            onSelectPlayer={(p) => {
              setSelectedProPlayer(p);
              navigateTo("pro_cv");
            }}
          />
        );
      case "pro_cv":
        return selectedProPlayer ? (
          <ProPlayerCV
            player={selectedProPlayer}
            onBack={() => navigateTo("pro")}
          />
        ) : null;
      case "post_match":
        return (
          <PostMatchStatsEntry 
            matchId={selectedMatch?.id}
            onBack={() => navigateTo("periodization")} 
          />
        );
      case "player_evaluation":
        return <PlayerEvaluationForm onBack={() => navigateTo("dashboard")} />;
      case "idp_manager":
        return <IDPManager onNavigate={navigateTo} />;
      case "/coach/match-evaluation":
        return <PostMatchStatsEntry matchId={selectedMatch?.id} onBack={() => navigateTo("dashboard")} />;
      case "/player/peer-voting":
        return <PlayerDashboard onNavigate={navigateTo} />;
      case "/report":
        return (
          <YouthDevelopmentReport onBack={() => navigateTo("dashboard")} />
        );
      case "criteria_manager":
        return <EvaluationCriteriaManager />;
      case "match_scheduler":
        return <MatchScheduler onBack={() => navigateTo("dashboard")} onEvaluate={(match) => { setSelectedMatch(match); navigateTo("match_summary"); }} />;
      case "tournament_manager":
        return <TournamentManager onBack={() => navigateTo("dashboard")} />;
      case "match_summary":
        return selectedMatch ? (
          <MatchSummaryDashboard 
            match={selectedMatch} 
            onBack={() => navigateTo("match_scheduler")} 
            onEdit={() => navigateTo("/coach/match-evaluation")}
          />
        ) : (
          <MatchScheduler onBack={() => navigateTo("dashboard")} onEvaluate={(match) => { setSelectedMatch(match); navigateTo("match_summary"); }} />
        );
      case "parent-match-center":
        return <ParentMatchCenter onSelectMatch={(matchId, playerId, position, academyId) => {
          setParentObservationMatchId(matchId);
          setParentObservationPlayerId(playerId);
          if (position) setParentObservationPlayerPosition(position);
          if (academyId) setParentObservationAcademyId(academyId);
          navigateTo("parent-match-observation");
        }} />;
      case "parent-match-observation":
        return <ParentMatchObservation 
          matchId={parentObservationMatchId} 
          playerId={parentObservationPlayerId} 
          playerPosition={parentObservationPlayerPosition}
          resolvedAcademyId={parentObservationAcademyId}
          onBack={() => navigateTo("parent-match-center")} 
        />;
      default:
        return (currentUser?.role === "PLAYER" || currentUser?.role === "PARENT") ? (
          <PlayerDashboard onNavigate={navigateTo} />
        ) : (
          <Dashboard onNavigate={navigateTo} />
        );
    }
  };



  return (
    <div className="flex h-[100dvh] bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-[60] md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-slate-900 flex flex-col shrink-0 z-[70] transform transition-transform duration-300 md:static md:translate-x-0 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-4 relative flex flex-col items-center flex-1 overflow-y-auto overflow-x-hidden">
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-white md:hidden"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-3 mt-4 mb-4 w-full px-2">
            <div className="w-10 h-10 flex shrink-0 items-center justify-center rounded-xl overflow-hidden bg-white/10">
              {academySettings.logoUrl ? (
                <img src={academySettings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <svg
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full drop-shadow-md"
                >
                  <path
                    d="M15 90 L35 35 L90 35 L80 15 L15 15 Z"
                    fill="url(#grad1)"
                  />
                  <path d="M30 65 L45 35 L85 35 L75 15 L20 15 Z" fill="#0f172a" />
                  <path
                    d="M30 65 L45 35 L80 35 L70 20 L25 20 Z"
                    fill="url(#grad2)"
                  />
                  <defs>
                    <linearGradient
                      id="grad1"
                      x1="0%"
                      y1="100%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop
                        offset="0%"
                        style={{ stopColor: "#10b981", stopOpacity: 1 }}
                      />
                      <stop
                        offset="100%"
                        style={{ stopColor: "#bef264", stopOpacity: 1 }}
                      />
                    </linearGradient>
                    <linearGradient
                      id="grad2"
                      x1="0%"
                      y1="100%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop
                        offset="0%"
                        style={{ stopColor: "#059669", stopOpacity: 1 }}
                      />
                      <stop
                        offset="100%"
                        style={{ stopColor: "#a3e635", stopOpacity: 1 }}
                      />
                    </linearGradient>
                  </defs>
                </svg>
              )}
            </div>
            <span className="font-black text-xl text-white tracking-tight truncate max-w-[150px]">
              {currentUser?.role === "SUPERADMIN" ? "Futverse HQ" : (academySettings.shortName || academySettings.name)}
            </span>
          </div>

          <nav className="space-y-2 mt-8 w-full px-2">
            {navItems.map((item) => {
              if (currentUser && !item.roles.includes(currentUser.role))
                return null;

              if (item.subItems) {
                // Check if user has permission for at least one sub-item
                const visibleSubItems = item.subItems.filter(sub => currentUser && sub.roles.includes(currentUser.role));
                if (visibleSubItems.length === 0) return null;

                const isOpen = openNavGroups.includes(item.id);
                const hasActiveSub = item.subItems.some(sub => sub.id === currentPage);

                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      onClick={() => toggleNavGroup(item.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
                        hasActiveSub
                          ? "bg-emerald-500/10 text-emerald-500 font-bold"
                          : "text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon size={20} className={hasActiveSub ? "text-emerald-500" : ""} />
                        <span className="font-bold text-sm">{item.label}</span>
                      </div>
                      <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    
                    {isOpen && (
                      <div className="pl-4 space-y-1">
                        {visibleSubItems.map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => navigateTo(sub.id)}
                            className={`w-full flex items-center justify-start gap-3 p-2.5 rounded-lg transition-colors pl-9 relative ${
                              currentPage === sub.id
                                ? "bg-emerald-500 text-white shadow-md font-bold"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                            }`}
                          >
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-current opacity-50"></div>
                            <span className="text-sm">{sub.label}</span>
                            {sub.hasNotification && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 bg-rose-500 rounded-full"></span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors ${
                    currentPage === item.id
                      ? "bg-emerald-500 text-white shadow-md"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                  title={item.label}
                >
                  <div className="relative shrink-0">
                    <item.icon size={20} />
                    {item.hasNotification && (
                      <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 border-2 border-slate-900 rounded-full -translate-y-1 translate-x-1"></span>
                    )}
                  </div>
                  <span className="font-bold text-sm">{item.label}</span>
                </button>
              );
            })}

            <button
              onClick={() => setIsNotificationOpen(true)}
              className="w-full flex items-center justify-start gap-3 p-3 rounded-xl transition-colors text-slate-400 hover:bg-slate-800"
              title="Notifications"
            >
              <div className="relative shrink-0">
                <Bell size={20} />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 border-2 border-slate-900 rounded-full -translate-y-1 translate-x-1 animate-pulse"></span>
                )}
              </div>
              <span className="font-bold text-sm">Notifications</span>
              {unreadNotificationsCount > 0 && (
                <span className="ml-auto bg-rose-500 text-white font-bold text-xs px-2 py-0.5 rounded-full">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-slate-800">
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 p-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors focus:outline-none"
            title="Profile & Log Out"
          >
            <div className="w-10 h-10 rounded-full shrink-0 bg-slate-700 overflow-hidden hover:ring-2 hover:ring-emerald-500 transition-all">
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.name || "Coach"}`}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="font-bold text-sm text-white truncate">
                {currentUser?.name}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {currentUser?.role}
              </div>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Impersonation Banner */}
        {isImpersonating && (
          <div className="absolute top-0 left-0 right-0 h-12 bg-amber-400 text-amber-900 z-50 flex items-center justify-center px-4 shadow-md overflow-hidden">
            <div className="flex items-center justify-between w-full max-w-6xl text-xs sm:text-sm font-bold">
              <span className="flex items-center gap-2 truncate">
                <span className="text-lg">⚠️</span> คุณกำลังใช้งานในฐานะ{" "}
                {currentUser?.name} (Impersonating)
              </span>
              <button
                onClick={revertImpersonation}
                className="ml-4 shrink-0 px-4 py-1.5 bg-amber-900 text-amber-50 hover:bg-amber-800 rounded-lg transition-colors cursor-pointer"
              >
                ออกจากโหมดจำลอง
              </button>
            </div>
          </div>
        )}

        {/* Top Header Bar with Dynamic Squad Switcher & Network Status */}
        <header
          className={`fixed top-0 right-0 left-0 md:left-64 z-40 h-16 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-2 sm:px-8 ${isImpersonating ? "mt-12" : ""}`}
        >
          <div className="flex items-center gap-1 sm:gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg md:hidden transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:block text-sm font-semibold text-slate-600 dark:text-slate-300">
              {currentUser?.role === "SUPERADMIN" ? "Futverse HQ" : academySettings.name}
            </div>
            <div className="hidden md:block h-4 w-[1px] bg-slate-300 dark:bg-slate-700"></div>

            {/* Squad Context Switcher (Dynamic based on Academy Context) */}
            {!isGlobalRoute && (
              <div className="relative group">
                <button className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg transition-colors">
                  {activeTeam}
                  <ChevronDown size={14} className="text-slate-500 dark:text-slate-400 hidden sm:block" />
                </button>
                <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 origin-top">
                  {academySquads.map((squad) => (
                    <button
                      key={squad}
                      onClick={() => setActiveTeam(squad)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeTeam === squad ? "text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/50 dark:bg-emerald-900/30" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                    >
                      {squad}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Season Context Switcher */}
            {!isGlobalRoute && academySettings.seasons && (
              <div className="relative group">
                <button className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm font-bold text-indigo-800 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-1.5 sm:px-3 py-1.5 rounded-lg transition-colors border border-indigo-100 dark:border-indigo-800/50 whitespace-nowrap">
                  <Calendar size={12} className="text-indigo-500 dark:text-indigo-400 sm:w-[14px] sm:h-[14px]" />
                  <span className="hidden sm:inline">Season</span> {activeSeason}
                  <ChevronDown size={12} className="text-indigo-400 dark:text-indigo-500 hidden sm:block sm:w-[14px] sm:h-[14px]" />
                </button>
                <div className="absolute top-full left-0 mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 origin-top">
                  {academySettings.seasons.map((season) => (
                    <button
                      key={season}
                      onClick={() => setActiveSeason(season)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeSeason === season ? "text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-900/30" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                    >
                      {season}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-1 sm:gap-4 items-center">
            {/* Language Switcher */}
            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button
                onClick={() => setLanguage("th")}
                className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${language === "th" ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
              >
                🇹🇭 TH
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${language === "en" ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
              >
                🇬🇧 EN
              </button>
            </div>

            {/* Network Indicator */}
            <button
              onClick={toggleSimulation}
              className={`flex items-center justify-center gap-1.5 w-7 h-7 sm:w-auto sm:px-3 sm:py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors border ${
                isOnline
                  ? pendingSyncs > 0
                    ? "bg-amber-50 text-amber-600 border-amber-200"
                    : "bg-emerald-50 text-emerald-600 border-emerald-200"
                  : "bg-rose-50 text-rose-600 border-rose-200"
              }`}
              title="Click to simulate network drop"
            >
              {isOnline ? (
                <>
                  <Wifi size={14} />
                  <span className="hidden sm:inline">
                    {pendingSyncs > 0
                      ? `Syncing (${pendingSyncs})...`
                      : "Online"}
                  </span>
                </>
              ) : (
                <>
                  <WifiOff size={14} />
                  <span className="hidden sm:inline">
                    Offline (Saved: {pendingSyncs})
                  </span>
                </>
              )}
            </button>

            <button
              onClick={toggleTheme}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs sm:text-sm"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              onClick={() => setIsNotificationOpen(true)}
              className="relative w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs sm:text-sm"
              title="Notifications"
            >
              <Bell size={16} />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white font-black text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 shadow-md border-2 border-white dark:border-slate-800 animate-pulse">
                  {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <div
          className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pt-20 sm:pt-24 pb-32 sm:pb-6 ${isImpersonating ? "mt-12" : ""}`}
        >
          {renderContent()}
        </div>
      </main>

      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onNavigate={(page) => {
          navigateTo(page);
        }}
      />

      {currentUser && !currentUser.pdpaAccepted && <PDPAConsentModal />}

      {/* Mobile Bottom Navigation (only visible on mobile) */}
      <MobileBottomNav
        currentPage={currentPage}
        navigateTo={navigateTo}
        openDrawer={() => setIsMobileMenuOpen(true)}
      />
    </div>
  );
}
