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
  Settings as SettingsIcon,
  Bell,
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
import IDPDashboard from "./components/IDPDashboard";
import WeeklyPeriodization from "./components/WeeklyPeriodization";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { ProPlayer } from "./types/ProPlayer";
import Settings from "./components/Settings";
import NotificationDrawer from "./components/NotificationDrawer";
import { useLanguage } from "./contexts/LanguageContext";
import PostMatchStatsEntry from "./components/PostMatchStatsEntry";
import StartingXIBuilder from "./components/StartingXIBuilder";
import { useAuth } from "./contexts/AuthContext";
import { useAcademy } from "./contexts/AcademyContext";
import AccessDenied from "./components/AccessDenied";
import Login from "./components/Login";
import SuperadminPortal from "./components/SuperadminPortal";
import SubscriptionPaywall from "./components/SubscriptionPaywall";
import ConciergeDashboard from "./components/ConciergeDashboard";
import PendingApproval from "./components/PendingApproval";

export default function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const { isOnline, toggleSimulation } = useNetworkStatus();
  const { language, setLanguage, t } = useLanguage();
  const {
    hasPermission,
    currentUser,
    logout,
    isImpersonating,
    revertImpersonation,
  } = useAuth();
  const { settings: academySettings } = useAcademy();
  const [pendingSyncs, setPendingSyncs] = useState(0);

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

  // Handle Paywall Logic inside the main app layout so the banner can still be visible
  const isPaywallActive =
    currentUser.status === "Inactive" || currentUser.status === "Pending";

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

    switch (currentPage) {
      case "dashboard":
        return currentUser?.role === "PLAYER" ? (
          <PlayerDashboard onNavigate={navigateTo} />
        ) : (
          <Dashboard onNavigate={navigateTo} />
        );
      case "superadmin":
        return <SuperadminPortal onBack={() => navigateTo("dashboard")} />;
      case "concierge":
        return <ConciergeDashboard onNavigate={navigateTo} />;
      case "settings":
        return (
          <Settings
            onBack={() => navigateTo("dashboard")}
            setLanguage={setLanguage}
            currentLanguage={language}
            pendingSyncs={pendingSyncs}
          />
        );
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
      case "starting_xi":
        return <StartingXIBuilder onBack={() => navigateTo("dashboard")} />;
      case "youth":
        return (
          <YouthPlayerManager
            onBack={() => navigateTo("dashboard")}
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
          <PostMatchStatsEntry onBack={() => navigateTo("periodization")} />
        );
      case "/coach/match-evaluation":
        return <PostMatchStatsEntry onBack={() => navigateTo("dashboard")} />;
      case "/player/peer-voting":
        return <PlayerDashboard onNavigate={navigateTo} />;
      case "/report":
        return (
          <YouthDevelopmentReport onBack={() => navigateTo("dashboard")} />
        );
      default:
        return currentUser?.role === "PLAYER" ? (
          <PlayerDashboard onNavigate={navigateTo} />
        ) : (
          <Dashboard onNavigate={navigateTo} />
        );
    }
  };

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      roles: [
        "SUPERADMIN",
        "ADMIN",
        "COACH",
        "SCOUT",
        "USER",
        "DATA_ADMIN",
        "PLAYER",
        "PARENT",
      ],
    },
    {
      id: "/coach/match-evaluation",
      label: "Match Evaluation",
      icon: Award,
      roles: ["SUPERADMIN", "ADMIN", "COACH"],
    },
    {
      id: "/player/peer-voting",
      label: "Peer Voting",
      icon: Users,
      roles: ["USER", "PLAYER"],
      hasNotification: true,
    },
    {
      id: "/report",
      label: "Youth Report",
      icon: LineChart,
      roles: ["USER", "PARENT"],
    },
    {
      id: "settings",
      label: "Settings",
      icon: SettingsIcon,
      roles: ["SUPERADMIN", "ADMIN"],
    },
  ];

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 bg-slate-900 flex flex-col shrink-0 z-40 transform transition-transform duration-300 md:static md:translate-x-0 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-4 relative flex flex-col items-center">
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
              {academySettings.shortName || academySettings.name}
            </span>
          </div>

          <nav className="space-y-2 mt-8 w-full px-2">
            {navItems.map((item) => {
              if (currentUser && !item.roles.includes(currentUser.role))
                return null;

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
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 border-2 border-slate-900 rounded-full -translate-y-1 translate-x-1"></span>
              </div>
              <span className="font-bold text-sm">Notifications</span>
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
          className={`fixed top-0 right-0 left-0 md:left-64 z-40 h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 ${isImpersonating ? "mt-12" : ""}`}
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg md:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="hidden sm:block text-sm font-semibold text-slate-600">
              {academySettings.name}
            </div>
            <div className="hidden md:block h-4 w-[1px] bg-slate-300"></div>

            {/* Squad Context Switcher (Dynamic based on Academy Context) */}
            {!isGlobalRoute && (
              <div className="relative group">
                <button className="flex items-center gap-2 text-sm font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors">
                  {activeTeam}
                  <ChevronDown size={14} className="text-slate-500" />
                </button>
                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 shadow-lg rounded-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 origin-top">
                  {academySquads.map((squad) => (
                    <button
                      key={squad}
                      onClick={() => setActiveTeam(squad)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${activeTeam === squad ? "text-emerald-600 font-bold bg-emerald-50/50" : "text-slate-700"}`}
                    >
                      {squad}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4 items-center">
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors border ${
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
              onClick={() => setIsNotificationOpen(true)}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-full cursor-pointer hover:bg-slate-200 transition-colors text-sm"
            >
              🔔
            </button>
          </div>
        </header>

        <div
          className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pt-20 sm:pt-24 ${isImpersonating ? "mt-12" : ""}`}
        >
          {renderContent()}
        </div>
      </main>

      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
    </div>
  );
}
