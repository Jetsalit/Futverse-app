import { Building2, CircleAlert, GraduationCap, ScanFace, SearchCheck, UsersRound, UserRoundCheck } from "lucide-react";
import SuperAdminKpiCard from "./SuperAdminKpiCard";
import PendingActions from "./PendingActions";
import RecentActivity from "./RecentActivity";
import SystemAlerts from "./SystemAlerts";
import type {
  DashboardAlert,
  DashboardLoadState,
  EffectiveRoleCounts,
  RecentActivityItem,
  SuperAdminTab,
} from "./dashboardModel";

interface SuperAdminOverviewProps {
  pendingUsers: number;
  academyCount: number | null;
  roleCounts: EffectiveRoleCounts;
  paymentApprovals: number | null;
  profileClaims: number | null;
  errorReports: number | null;
  profileClaimsAvailable: boolean;
  errorReportsAvailable: boolean;
  activities: readonly RecentActivityItem[];
  activityLoadState: DashboardLoadState;
  alerts: readonly DashboardAlert[];
  onNavigate: (tab: SuperAdminTab) => void;
  availableTabs?: readonly SuperAdminTab[];
}

export default function SuperAdminOverview({
  pendingUsers,
  academyCount,
  roleCounts,
  paymentApprovals,
  profileClaims,
  errorReports,
  profileClaimsAvailable,
  errorReportsAvailable,
  activities,
  activityLoadState,
  alerts,
  onNavigate,
  availableTabs,
}: SuperAdminOverviewProps) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="platform-overview-title">
        <div className="mb-3 flex items-center gap-2">
          <SearchCheck className="text-emerald-600" size={18} />
          <h2 id="platform-overview-title" className="text-base font-black text-slate-900">Platform Overview</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          <SuperAdminKpiCard label="Pending Users" value={pendingUsers} detail="Approval queue" icon={UserRoundCheck} tone="rose" />
          <SuperAdminKpiCard label="Academies" value={academyCount} detail="Excludes system workspace" icon={Building2} tone="emerald" />
          <SuperAdminKpiCard label="Coaches" value={roleCounts.coaches} detail="Authoritative user.role only" icon={GraduationCap} tone="blue" />
          <SuperAdminKpiCard label="Player Accounts" value={roleCounts.playerAccounts} detail="Authoritative user.role only" icon={ScanFace} tone="indigo" />
          <SuperAdminKpiCard label="Parents" value={roleCounts.parents} detail="Authoritative user.role only" icon={UsersRound} tone="violet" />
          <SuperAdminKpiCard label="Scouts" value={roleCounts.scouts} detail="Authoritative user.role only" icon={SearchCheck} tone="amber" />
          <SuperAdminKpiCard label="Open Issues" value={null} detail="Unavailable" icon={CircleAlert} tone="slate" />
        </div>
      </section>

      <PendingActions
        userApprovals={pendingUsers}
        profileClaims={profileClaims}
        paymentApprovals={paymentApprovals}
        errorReports={errorReports}
        onNavigate={onNavigate}
        availableTabs={availableTabs}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <RecentActivity activities={activities} loadState={activityLoadState} />
        <SystemAlerts
          alerts={alerts}
          errorReportsAvailable={errorReportsAvailable}
          profileClaimsAvailable={profileClaimsAvailable}
          onNavigate={onNavigate}
          availableTabs={availableTabs}
        />
      </div>
    </div>
  );
}
