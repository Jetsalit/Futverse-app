import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
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
}: {
  authority: ProClubOrganizationAuthority;
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

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
      <header className="border-b border-slate-800 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
              FutVerse Pro Club
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              {authority.organizationName}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              First Team dashboard
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-white/10 px-3 py-2">
              {authority.organizationLevel}
            </span>
            <span className="rounded-lg bg-emerald-400/10 px-3 py-2 text-emerald-300">
              {authority.organizationStatus}
            </span>
            {authority.staffRole && (
              <span className="rounded-lg bg-white/10 px-3 py-2">
                {staffRoleLabels[authority.staffRole]}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav
          aria-label="Pro Club team sections"
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
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

        <div className="min-w-0">
          {activeTab === "OVERVIEW" && (
            <section aria-labelledby="pro-club-team-overview" className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Overview
                </p>
                <h3 id="pro-club-team-overview" className="mt-2 text-xl font-black">
                  {authority.organizationName} First Team
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
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
        </div>
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
    <article className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="text-cyan-300">{icon}</div>
      <h4 className="mt-3 font-bold">{title}</h4>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </article>
  );
}
