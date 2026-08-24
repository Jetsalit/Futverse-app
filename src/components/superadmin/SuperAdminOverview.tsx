import { Building2, CircleAlert, GraduationCap, ScanFace, SearchCheck, UsersRound, UserRoundCheck } from "lucide-react";
import SuperAdminKpiCard from "./SuperAdminKpiCard";
import SuperAdminReviewQueue from "./SuperAdminReviewQueue";
import PendingActions from "./PendingActions";
import RecentActivity from "./RecentActivity";
import SystemAlerts from "./SystemAlerts";
import type {
  DashboardAlert,
  DashboardLoadState,
  DashboardOperationalSignal,
  EffectiveRoleCounts,
  RecentActivityItem,
  SuperAdminTab,
} from "./dashboardModel";
import type { SuperAdminReviewQueueItem } from "./reviewQueueModel";
import { deriveDashboardMetric } from "./dashboardModel";

interface SuperAdminOverviewProps {
  academyCount: number | null;
  academyLoadState: DashboardLoadState;
  roleCounts: EffectiveRoleCounts;
  userLoadState: DashboardLoadState;
  operationalSignals: readonly DashboardOperationalSignal[];
  reviewQueue: readonly SuperAdminReviewQueueItem[];
  activities: readonly RecentActivityItem[];
  activityLoadState: DashboardLoadState;
  alerts: readonly DashboardAlert[];
  onNavigate: (tab: SuperAdminTab) => void;
  availableTabs?: readonly SuperAdminTab[];
}

export default function SuperAdminOverview({
  academyCount,
  academyLoadState,
  roleCounts,
  userLoadState,
  operationalSignals,
  reviewQueue,
  activities,
  activityLoadState,
  alerts,
  onNavigate,
  availableTabs,
}: SuperAdminOverviewProps) {
  const userApprovalSignal =
    operationalSignals.find(
      (signal) => signal.id === "user-approvals",
    );

  const pendingUsersValue =
    userApprovalSignal &&
    (
      userApprovalSignal.state === "PENDING" ||
      userApprovalSignal.state === "CLEAR"
    )
      ? userApprovalSignal.count
      : null;

  const pendingUsersMetric =
    deriveDashboardMetric({
      loadState: userLoadState,
      value: pendingUsersValue,
    });

  const academyMetric =
    deriveDashboardMetric({
      loadState: academyLoadState,
      value: academyCount,
    });

  const roleMetrics = {
    coaches: deriveDashboardMetric({
      loadState: userLoadState,
      value: roleCounts.coaches,
    }),
    playerAccounts: deriveDashboardMetric({
      loadState: userLoadState,
      value: roleCounts.playerAccounts,
    }),
    parents: deriveDashboardMetric({
      loadState: userLoadState,
      value: roleCounts.parents,
    }),
    scouts: deriveDashboardMetric({
      loadState: userLoadState,
      value: roleCounts.scouts,
    }),
  };

  const openIssuesMetric =
    deriveDashboardMetric({
      loadState: "unavailable",
      value: null,
    });

  return (
    <div className="space-y-6">
      <section aria-labelledby="platform-overview-title">
        <div className="mb-3 flex items-center gap-2">
          <SearchCheck
            className="text-emerald-600"
            size={18}
          />
          <h2
            id="platform-overview-title"
            className="text-base font-black text-slate-900"
          >
            Platform Overview
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          <SuperAdminKpiCard
            label="Pending Users"
            metric={pendingUsersMetric}
            detail="Authoritative approval queue"
            icon={UserRoundCheck}
            tone="rose"
          />
          <SuperAdminKpiCard
            label="Academies"
            metric={academyMetric}
            detail="Excludes system workspace"
            icon={Building2}
            tone="emerald"
          />
          <SuperAdminKpiCard
            label="Coaches"
            metric={roleMetrics.coaches}
            detail="Authoritative user.role only"
            icon={GraduationCap}
            tone="blue"
          />
          <SuperAdminKpiCard
            label="Player Accounts"
            metric={roleMetrics.playerAccounts}
            detail="Authoritative user.role only"
            icon={ScanFace}
            tone="indigo"
          />
          <SuperAdminKpiCard
            label="Parents"
            metric={roleMetrics.parents}
            detail="Authoritative user.role only"
            icon={UsersRound}
            tone="violet"
          />
          <SuperAdminKpiCard
            label="Scouts"
            metric={roleMetrics.scouts}
            detail="Authoritative user.role only"
            icon={SearchCheck}
            tone="amber"
          />
          <SuperAdminKpiCard
            label="Open Issues"
            metric={openIssuesMetric}
            detail="Unavailable"
            icon={CircleAlert}
            tone="slate"
          />
        </div>
      </section>

      <SuperAdminReviewQueue
        reviewQueue={reviewQueue}
        onNavigate={onNavigate}
        availableTabs={availableTabs}
      />

      <PendingActions
        operationalSignals={operationalSignals}
        onNavigate={onNavigate}
        availableTabs={availableTabs}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
        <RecentActivity
          activities={activities}
          loadState={activityLoadState}
        />

        <SystemAlerts
          alerts={alerts}
          operationalSignals={operationalSignals}
          onNavigate={onNavigate}
          availableTabs={availableTabs}
        />
      </div>
    </div>
  );
}
