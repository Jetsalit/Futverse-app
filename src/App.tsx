import { useState, useEffect, useRef } from "react";
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
  Shield,
  UserCircle,
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
import { useAcademy, type AcademyAccessState } from "./contexts/AcademyContext";
import {
  appShellLandingPage,
  isStaffOnboardingRequest,
  normalSuperAdminNeedsAcademyWorkspace,
  requiresStaffMembership,
} from "./contexts/academyAccessModel";
import AccessDenied from "./components/AccessDenied";
import Login from "./components/Login";
import JoinAcademy from "./components/JoinAcademy";
import SuperadminPortal from "./components/SuperadminPortal";
import SubscriptionPaywall from "./components/SubscriptionPaywall";
import ConciergeDashboard from "./components/ConciergeDashboard";
import PendingApproval from "./components/PendingApproval";
import {
  isActivePrivilegedActor,
  type PrivilegedRole,
} from "./lib/privilegedAuthorization";
import { isExplicitlyActiveAccountStatus } from "./lib/accountRolePolicy";
import { useSuperAdminSupport } from "./contexts/SuperAdminSupportContext";
import { SuperAdminSupportBar } from "./components/superadmin/SuperAdminSupportBar";
import { canAccessTenantCapability } from "./lib/superAdminSupportModel";

function AccessResolutionScreen({
  accessState,
  error,
  onLogout,
}: {
  accessState: AcademyAccessState;
  error: Error | null;
  onLogout: () => void;
}) {
  const messages: Record<string, string> = {
    LOADING: "Resolving your Academy access...",
    NO_ACADEMY: "No exact Academy workspace is linked to this account.",
    MEMBERSHIP_MISSING: "Your Academy pointer exists, but no Membership was found.",
    MEMBERSHIP_PENDING: "Your Academy Membership is pending approval.",
    MEMBERSHIP_SUSPENDED: "Your Academy Membership is suspended.",
    MEMBERSHIP_LEFT: "Your Academy Membership has ended.",
    MEMBERSHIP_REVOKED: "Your Academy Membership was revoked.",
    ACADEMY_NOT_FOUND: "The exact Academy document linked to this account was not found.",
    PERMISSION_DENIED: "Permission was denied while resolving Academy access.",
    ERROR: "Academy access could not be resolved.",
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <Shield className="mx-auto mb-5 text-indigo-600" size={44} />
        <h1 className="text-2xl font-black text-slate-900">Academy Access</h1>
        <p className="mt-3 text-slate-600">{messages[accessState] || messages.ERROR}</p>
        {error && <p className="mt-3 text-sm text-rose-600">{error.message}</p>}
        {accessState !== "LOADING" && (
          <button
            type="button"
            onClick={onLogout}
            className="mt-7 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
          >
            Log out
          </button>
        )}
      </div>
    </div>
  );
}

function AcademyWorkspaceRequired({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <Shield className="mx-auto mb-5 text-amber-500" size={44} />
        <h2 className="text-2xl font-black text-slate-900">
          Academy Workspace Required
        </h2>
        <p className="mt-3 text-slate-600">
          Direct SuperAdmin access to tenant features requires selecting or resolving an active Academy workspace.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800"
        >
          Return to SuperAdmin Portal
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const { isOnline } = useNetworkStatus();
  const { language, setLanguage } = useLanguage();
  const {
    hasPermission,
    currentUser,
    actualUser,
    logout,
  } = useAuth();
  const {
    isSupportActive,
    presentationRole,
    exitSupportMode,
  } = useSuperAdminSupport();
  const {
    settings: academySettings,
    academyId,
    accessState,
    loading: academyLoading,
    error: academyError,
  } = useAcademy();

  const effectivePresentationRole = isSupportActive
    ? presentationRole
    : (currentUser?.role || "USER");

  const handleLogout = async () => {
    try {
      if (isSupportActive) {
        await exitSupportMode();
      }
    } catch (err) {
      console.error("Failed to safely close support session before logout:", err);
      alert(
        "Unable to safely close support session. Logout was cancelled to preserve audit integrity.",
      );
      return;
    }
    try {
      await logout();
    } catch (err) {
      console.error("Firebase sign-out failed:", err);
      alert("Sign-out failed. Please try again.");
    }
  };

  const prevLandingKeyRef = useRef<string>("");

  useEffect(() => {
    if (!currentUser) {
      prevLandingKeyRef.current = "";
      return;
    }
    const landingKey = `${currentUser.id || currentUser.uid}_${currentUser.role}`;
    if (prevLandingKeyRef.current !== landingKey) {
      prevLandingKeyRef.current = landingKey;
      const targetLanding = appShellLandingPage(currentUser);
      if (targetLanding) {
        setCurrentPage(targetLanding);
        setIsMobileMenuOpen(false);
      }
    }
  }, [currentUser]);

  // Global State / Context for Academy Squads
  const academySquads = academySettings.squads;
  const [activeTeam, setActiveTeam] = useState("");

  useEffect(() => {
    setActiveTeam((previous) =>
      previous && academySquads.includes(previous)
        ? previous
        : academySquads[0] || "",
    );
  }, [academySquads]);

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

  const navigateTo = (page: string) => {
    setCurrentPage(page);
    setIsMobileMenuOpen(false);
  };

  if (!currentUser) {
    return <Login />;
  }

  if (isStaffOnboardingRequest(currentUser)) {
    return <JoinAcademy />;
  }

  if (!isExplicitlyActiveAccountStatus(currentUser.status)) {
    return <PendingApproval />;
  }

  const requiredPrivilegedRole: PrivilegedRole | null =
    currentPage === "superadmin"
      ? "SUPERADMIN"
      : currentPage === "concierge"
        ? "DATA_ADMIN"
        : null;

  if (
    requiredPrivilegedRole &&
    !isActivePrivilegedActor(actualUser, [requiredPrivilegedRole])
  ) {
    return <AccessDenied onBack={() => navigateTo("dashboard")} />;
  }

  if (requiresStaffMembership(currentUser)) {
    if (academyLoading || accessState === "LOADING") {
      return (
        <AccessResolutionScreen
          accessState="LOADING"
          error={academyError}
          onLogout={logout}
        />
      );
    }

    if (accessState === "NO_ACADEMY") {
      return <JoinAcademy />;
    }

    if (accessState !== "ACTIVE_MEMBERSHIP") {
      return (
        <AccessResolutionScreen
          accessState={accessState}
          error={academyError}
          onLogout={logout}
        />
      );
    }
  }

  const renderContent = () => {
    if (
      normalSuperAdminNeedsAcademyWorkspace(
        currentUser,
        academyId,
        currentPage,
      )
    ) {
      return (
        <AcademyWorkspaceRequired
          onBack={() => navigateTo("superadmin")}
        />
      );
    }

    // Wrap Route Protection Logic
    if (
      currentPage === "settings" &&
      !canAccessTenantCapability(
        effectivePresentationRole,
        ["ADMIN"],
        isSupportActive,
        hasPermission,
      )
    ) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }
    if (
      currentPage === "fitness" &&
      !canAccessTenantCapability(
        effectivePresentationRole,
        ["ADMIN"],
        isSupportActive,
        hasPermission,
      )
    ) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }
    if (
      currentPage === "scout" &&
      !canAccessTenantCapability(
        effectivePresentationRole,
        ["ADMIN", "SCOUT"],
        isSupportActive,
        hasPermission,
      )
    ) {
      return <AccessDenied onBack={() => navigateTo("dashboard")} />;
    }
    if (
      currentPage === "coaches" &&
      !canAccessTenantCapability(
        effectivePresentationRole,
        ["ADMIN", "SUPERADMIN"],
        isSupportActive,
        hasPermission,
      )
    ) {
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
          />
        );
      case "subscription":
        return <SubscriptionPaywall onBack={() => navigateTo("dashboard")} />;
      case "idp_dashboard":
        return (
          <IDPDashboard
            onBack={() => navigateTo("dashboard")}
          />
        );
      case "fitness":
        return (
          <FitnessTesting
            onBack={() => navigateTo("dashboard")}
            teamName={activeTeam}
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
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <SuperAdminSupportBar />
      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="absolute inset-0 bg-slate-900/50 z-30 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`absolute inset-y-0 left-0 w-64 bg-slate-900 flex flex-col shrink-0 z-50 overflow-y-auto transform transition-transform duration-300 md:static md:translate-x-0 md:z-auto ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
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
              if (currentUser && !item.roles.includes(effectivePresentationRole))
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
              </div>
              <span className="font-bold text-sm">Notifications</span>
            </button>
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors focus:outline-none"
            title="Profile & Log Out"
          >
            <div className="w-10 h-10 rounded-full shrink-0 bg-slate-700 overflow-hidden hover:ring-2 hover:ring-emerald-500 transition-all">
              <UserCircle className="h-full w-full p-2 text-slate-300" />
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
        {/* Top Header Bar with Dynamic Squad Switcher & Network Status */}
        <header className="absolute top-0 right-0 left-0 z-40 h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8">
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
                  {activeTeam || "No squad selected"}
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
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors border ${
                isOnline
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                  : "bg-rose-50 text-rose-600 border-rose-200"
              }`}
              title="Browser network status"
            >
              {isOnline ? (
                <>
                  <Wifi size={14} />
                  <span className="hidden sm:inline">
                    Online
                  </span>
                </>
              ) : (
                <>
                  <WifiOff size={14} />
                  <span className="hidden sm:inline">
                    Offline
                  </span>
                </>
              )}
            </div>

            <button
              onClick={() => setIsNotificationOpen(true)}
              className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 rounded-full cursor-pointer hover:bg-slate-200 transition-colors text-sm"
            >
              🔔
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pt-20 sm:pt-24">
          {renderContent()}
        </div>
      </main>

      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
      </div>
    </div>
  );
}
