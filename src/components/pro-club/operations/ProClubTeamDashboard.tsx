import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  Shield,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import { staffRoleLabels } from "../../../lib/proClubOnboarding";
import ProClubAttendance from "./ProClubAttendance";
import ProClubHeadCoachWeeklyProductionWorkspace from "./ProClubHeadCoachWeeklyProductionWorkspace";
import ProClubSquadRoster from "./ProClubSquadRoster";
import {
  PRO_CLUB_THEME_STORAGE_KEY,
  resolveProClubTheme,
  type ProClubTheme,
} from "./proClubTheme";

export const PRO_CLUB_TEAM_DASHBOARD_TABS = [
  "OVERVIEW",
  "SQUAD",
  "TRAINING",
  "ATTENDANCE",
  "MATCHES",
] as const;

type ProClubTeamDashboardTab =
  (typeof PRO_CLUB_TEAM_DASHBOARD_TABS)[number];

const TAB_LABELS: Record<ProClubTeamDashboardTab, string> = {
  OVERVIEW: "Overview",
  SQUAD: "Squad",
  TRAINING: "Training",
  ATTENDANCE: "Attendance",
  MATCHES: "Matches",
};

export default function ProClubTeamDashboard({
  authority,
  onBack,
  onLogout,
  overviewSupplement,
}: {
  authority: ProClubOrganizationAuthority;
  onBack: () => void;
  onLogout: () => void;
  overviewSupplement?: ReactNode;
}) {
  const [activeTab, setActiveTab] =
    useState<ProClubTeamDashboardTab>("OVERVIEW");
  const [theme, setTheme] = useState<ProClubTheme>("light");

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      setTheme(resolveProClubTheme(window.localStorage.getItem(PRO_CLUB_THEME_STORAGE_KEY)));
    } catch {
      setTheme("light");
    }
  }, []);

  function selectTheme(nextTheme: ProClubTheme) {
    setTheme(nextTheme);

    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(PRO_CLUB_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Theme selection remains usable for the current session even if storage is unavailable.
    }
  }

  const attendanceAuthorityKey = [
    authority.organizationId,
    authority.userId,
    authority.organizationStatus,
    authority.membershipStatus,
    authority.hasMembershipAuthority ? "AUTHORIZED" : "UNAUTHORIZED",
    authority.staffRole ?? "NO_ROLE",
  ].join("|");

  const staffRoleLabel = authority.staffRole
    ? staffRoleLabels[authority.staffRole]
    : authority.membershipAuthorizationRole;

  return (
    <section
      aria-label="Pro Club application shell"
      data-pro-club-theme={theme}
      className="pro-club-theme-root min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]"
    >
      <aside className="pro-club-sidebar border-b px-4 py-5 sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-start justify-between gap-4 lg:block">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-cyan-300">
              <Shield size={18} />
              <p className="text-xs font-black uppercase tracking-[0.18em]">
                FutVerse Pro Club
              </p>
            </div>
            <h2 className="mt-3 truncate text-xl font-black">
              {authority.organizationName}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className="rounded-lg bg-white/10 px-2.5 py-1.5 text-slate-200">
                {staffRoleLabel}
              </span>
              <span className="rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-emerald-300">
                {authority.organizationStatus}
              </span>
              <span className="rounded-lg bg-white/10 px-2.5 py-1.5 text-slate-300">
                {authority.organizationLevel}
              </span>
            </div>
          </div>
        </div>

        <nav
          aria-label="Pro Club team sections"
          className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {PRO_CLUB_TEAM_DASHBOARD_TABS.map((tab) => {
            const disabled = tab === "MATCHES";
            const selected = activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                disabled={disabled}
                aria-current={selected ? "page" : undefined}
                onClick={() => {
                  if (!disabled) setActiveTab(tab);
                }}
                className={[
                  "flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition lg:w-full",
                  selected
                    ? "bg-cyan-400/10 text-cyan-200"
                    : "text-slate-400 hover:bg-white/5 hover:text-white",
                  disabled
                    ? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-slate-400"
                    : "",
                ].join(" ")}
              >
                <span>{TAB_LABELS[tab]}</span>
                {disabled && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="pro-club-main min-w-0">
        <header className="pro-club-topbar sticky top-0 z-30 border-b px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={onBack}
                className="pro-club-topbar-action inline-flex shrink-0 items-center gap-2 text-sm font-bold transition"
              >
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Back to FutVerse</span>
                <span className="sm:hidden">Back</span>
              </button>
              <div className="pro-club-topbar-divider hidden h-6 w-px sm:block" />
              <div className="min-w-0">
                <p className="pro-club-heading truncate text-sm font-black">
                  {TAB_LABELS[activeTab]}
                </p>
                <p className="pro-club-muted hidden truncate text-xs sm:block">
                  {authority.organizationName} · {staffRoleLabel} · {authority.organizationStatus}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                aria-label="Pro Club appearance"
                className="pro-club-theme-toggle inline-flex rounded-xl border p-1"
              >
                <button
                  type="button"
                  aria-pressed={theme === "light"}
                  onClick={() => selectTheme("light")}
                  className="pro-club-theme-option inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black transition"
                  data-selected={theme === "light" ? "true" : "false"}
                >
                  <Sun size={14} />
                  <span className="hidden sm:inline">Light</span>
                </button>
                <button
                  type="button"
                  aria-pressed={theme === "neon"}
                  onClick={() => selectTheme("neon")}
                  className="pro-club-theme-option inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-black transition"
                  data-selected={theme === "neon" ? "true" : "false"}
                >
                  <Sparkles size={14} />
                  <span className="hidden sm:inline">Neon</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="pro-club-topbar-action text-sm font-bold transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 pro-club-themed-surface px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {activeTab === "OVERVIEW" && (
            <section aria-labelledby="pro-club-team-overview" className="pro-club-module-surface space-y-6">
              <div>
                <p className="pro-club-accent text-xs font-bold uppercase tracking-[0.18em]">
                  Overview
                </p>
                <h3 id="pro-club-team-overview" className="pro-club-heading mt-2 text-2xl font-black">
                  {authority.organizationName} First Team
                </h3>
                <p className="pro-club-muted mt-2 max-w-3xl text-sm leading-6">
                  Open the reviewed production football surfaces from one team workspace. Each module continues to use its existing authority and persistence contract.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <OverviewCard
                  icon={<Users size={20} />}
                  title="Squad"
                  description="First Team roster"
                />
                <OverviewCard
                  icon={<Dumbbell size={20} />}
                  title="Training"
                  description="Weekly Training"
                />
                <OverviewCard
                  icon={<ClipboardCheck size={20} />}
                  title="Attendance"
                  description="Training attendance"
                />
                <OverviewCard
                  icon={<CalendarDays size={20} />}
                  title="Matches"
                  description="Coming soon"
                />
              </div>

              {overviewSupplement && <div className="pt-1">{overviewSupplement}</div>}
            </section>
          )}

          {activeTab === "SQUAD" && (
            <div className="pro-club-module-surface">
              <ProClubSquadRoster authority={authority} />
            </div>
          )}

          {activeTab === "TRAINING" && (
            <div className="pro-club-module-surface">
              <ProClubHeadCoachWeeklyProductionWorkspace authority={authority} />
            </div>
          )}

          {activeTab === "ATTENDANCE" && (
            <div className="pro-club-module-surface">
              <ProClubAttendance
                key={attendanceAuthorityKey}
                authority={authority}
              />
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function OverviewCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="pro-club-overview-card rounded-2xl border p-4 shadow-sm">
      <div className="pro-club-accent">{icon}</div>
      <h4 className="pro-club-heading mt-3 font-bold">{title}</h4>
      <p className="pro-club-muted mt-1 text-sm">{description}</p>
    </article>
  );
}
