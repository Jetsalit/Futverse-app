import {
  Activity,
  Bell,
  Building2,
  FileDown,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";

import type {
  DashboardOperationalSignal,
  DashboardOperationalSignalId,
  SuperAdminTab,
} from "./dashboardModel";
import {
  SUPERADMIN_PRIMARY_NAVIGATION,
  findSuperAdminSectionForTab,
} from "./superAdminNavigationModel";

interface SuperAdminPortalNavigationProps {
  activeTab: SuperAdminTab;
  onNavigate: (tab: SuperAdminTab) => void;
  operationalSignals: readonly DashboardOperationalSignal[];
  academyCount: number | null;
}

const SECTION_ICONS = {
  command_center: LayoutDashboard,
  users_access: Users,
  organizations: Building2,
  integrity_center: ShieldCheck,
  audit_logs: FileText,
  notifications: Bell,
  support_tools: Activity,
  reports: FileDown,
} as const;

const TAB_LABELS = {
  dashboard: "Overview",
  approvals: "Approval Queue",
  users: "Accounts",
  relationships: "Relationships",
  academies: "Academy Directory",
  system_logs: "System Audit",
  profile_claims: "Profile Claims",
  payment_approvals: "Payment Approvals",
  observation_metrics: "Observation Metrics",
  bootstrap_legacy: "Bootstrap Legacy",
} satisfies Record<SuperAdminTab, string>;

export default function SuperAdminPortalNavigation({
  activeTab,
  onNavigate,
  operationalSignals,
  academyCount,
}: SuperAdminPortalNavigationProps) {
  const tabSections =
    SUPERADMIN_PRIMARY_NAVIGATION.filter(
      (section) => section.kind === "tabs",
    );

  const activeSection =
    findSuperAdminSectionForTab(activeTab);

  if (!activeSection) {
    return null;
  }

  const pendingCountFor = (
    id: DashboardOperationalSignalId,
  ): number => {
    const signal =
      operationalSignals.find(
        (candidate) => candidate.id === id,
      );

    if (
      signal?.state !== "PENDING" ||
      typeof signal.count !== "number" ||
      !Number.isFinite(signal.count) ||
      !Number.isInteger(signal.count) ||
      signal.count <= 0
    ) {
      return 0;
    }

    return signal.count;
  };

  const pendingUsers =
    pendingCountFor("user-approvals");

  const pendingProfileClaims =
    pendingCountFor("profile-claims");

  const getTabBadge = (
    tab: SuperAdminTab,
  ): string | null => {
    if (
      tab === "approvals" &&
      pendingUsers > 0
    ) {
      return String(pendingUsers);
    }

    if (
      tab === "profile_claims" &&
      pendingProfileClaims > 0
    ) {
      return String(pendingProfileClaims);
    }

    if (
      tab === "observation_metrics" ||
      tab === "payment_approvals"
    ) {
      return "Unavailable";
    }

    return null;
  };

  const getSectionBadge = (
    sectionId: (typeof tabSections)[number]["id"],
  ): string | null => {
    if (sectionId === "users_access") {
      const reviewCount =
        pendingUsers +
        pendingProfileClaims;

      return reviewCount > 0
        ? String(reviewCount)
        : null;
    }

    if (
      sectionId === "organizations" &&
      academyCount !== null
    ) {
      return String(academyCount);
    }

    return null;
  };

  return (
    <section
      className="shrink-0 border-b border-slate-200 bg-white"
      aria-label="SuperAdmin workspace navigation"
    >
      <div className="hidden xl:flex min-h-[58px] items-stretch">
        <nav
          className="flex min-w-0 flex-1 items-stretch"
          aria-label="SuperAdmin primary sections"
        >
          {tabSections.map((section) => {
            const Icon =
              SECTION_ICONS[section.id];

            const isActive =
              section.id === activeSection.id;

            const badge =
              getSectionBadge(section.id);

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  if (section.defaultTab) {
                    onNavigate(
                      section.defaultTab,
                    );
                  }
                }}
                aria-current={
                  isActive
                    ? "page"
                    : undefined
                }
                className={`group relative flex min-w-0 flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-bold transition ${
                  isActive
                    ? "border-emerald-500 bg-emerald-50/50 text-slate-950"
                    : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon
                  size={17}
                  className={
                    isActive
                      ? "shrink-0 text-emerald-600"
                      : "shrink-0 text-slate-400 transition group-hover:text-slate-600"
                  }
                />

                <span className="truncate">
                  {section.label}
                </span>

                {badge && (
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                      isActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-b border-slate-200 px-4 py-3 xl:hidden sm:px-6">
        <label
          htmlFor="superadmin-primary-section"
          className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-400"
        >
          Administration area
        </label>

        <select
          id="superadmin-primary-section"
          value={activeSection.id}
          onChange={(event) => {
            const section =
              tabSections.find(
                (candidate) =>
                  candidate.id ===
                  event.target.value,
              );

            if (section?.defaultTab) {
              onNavigate(
                section.defaultTab,
              );
            }
          }}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
        >
          {tabSections.map((section) => (
            <option
              key={section.id}
              value={section.id}
            >
              {section.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-slate-50/80 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
              Global administration
            </div>

            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-black text-slate-950">
                {activeSection.label}
              </h2>

              <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                Global
              </span>
            </div>

            <p className="mt-0.5 max-w-2xl text-xs font-medium leading-relaxed text-slate-500">
              {activeSection.description}
            </p>
          </div>

          {activeSection.tabs.length > 1 && (
            <nav
              className="flex flex-wrap items-center gap-1.5"
              aria-label={`${activeSection.label} views`}
            >
              {activeSection.tabs.map(
                (tab) => {
                  const isActive =
                    activeTab === tab;

                  const badge =
                    getTabBadge(tab);

                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() =>
                        onNavigate(tab)
                      }
                      aria-current={
                        isActive
                          ? "page"
                          : undefined
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                      }`}
                    >
                      <span>
                        {TAB_LABELS[tab]}
                      </span>

                      {badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-black ${
                            isActive
                              ? "bg-white/15 text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                },
              )}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}