import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  Shield,
  Users,
} from "lucide-react";

import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import { staffRoleLabels } from "../../../lib/proClubOnboarding";
import ProClubAttendance from "./ProClubAttendance";
import ProClubHeadCoachWeeklyProductionWorkspace from "./ProClubHeadCoachWeeklyProductionWorkspace";
import ProClubSquadRoster from "./ProClubSquadRoster";

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
      className="min-h-screen bg-slate-950 text-white lg:grid lg:grid-cols-[248px_minmax(0,1fr)]"
    >
      <aside className="border-b border-slate-800 bg-slate-950 px-4 py-5 sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
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

      <div className="min-w-0 bg-slate-100 text-slate-900">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
              >
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Back to FutVerse</span>
                <span className="sm:hidden">Back</span>
              </button>
              <div className="hidden h-6 w-px bg-slate-200 sm:block" />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {TAB_LABELS[activeTab]}
                </p>
                <p className="hidden truncate text-xs text-slate-500 sm:block">
                  {authority.organizationName} · {staffRoleLabel} · {authority.organizationStatus}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {activeTab === "OVERVIEW" && (
            <section aria-labelledby="pro-club-team-overview" className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">
                  Overview
                </p>
                <h3 id="pro-club-team-overview" className="mt-2 text-2xl font-black text-slate-950">
                  {authority.organizationName} First Team
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
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
            <ProClubSquadRoster authority={authority} />
          )}

          {activeTab === "TRAINING" && (
            <ProClubHeadCoachWeeklyProductionWorkspace authority={authority} />
          )}

          {activeTab === "ATTENDANCE" && (
            <ProClubAttendance
              key={attendanceAuthorityKey}
              authority={authority}
            />
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
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-cyan-700">{icon}</div>
      <h4 className="mt-3 font-bold text-slate-950">{title}</h4>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </article>
  );
}
