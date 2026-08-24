import type { User, UserRole } from "../../contexts/AuthContext";

export type SuperAdminTab =
  | "dashboard"
  | "approvals"
  | "users"
  | "relationships"
  | "academies"
  | "system_logs"
  | "profile_claims"
  | "payment_approvals"
  | "observation_metrics"
  | "bootstrap_legacy";

export type DashboardLoadState = "idle" | "loading" | "loaded" | "unavailable";

export type DashboardMetric =
  | {
      state: "LOADING";
      value: null;
    }
  | {
      state: "READY";
      value: number;
    }
  | {
      state: "UNAVAILABLE";
      value: null;
    };

export type DashboardOperationalSignalState =
  | "LOADING"
  | "PENDING"
  | "CLEAR"
  | "UNAVAILABLE"
  | "NOT_CONNECTED";

export type DashboardOperationalSignalId =
  | "user-approvals"
  | "profile-claims"
  | "payment-approvals"
  | "error-reports";

export interface DashboardOperationalSignalSource {
  loadState: DashboardLoadState;
  count: number | null;
}

export interface DashboardOperationalSignal {
  id: DashboardOperationalSignalId;
  state: DashboardOperationalSignalState;
  count: number | null;
}

export interface DashboardOperationalSignalInput {
  userApprovals: DashboardOperationalSignalSource;
  profileClaims: DashboardOperationalSignalSource;
}

export interface AcademyDirectoryItem {
  id: string;
  name: string;
}

export interface ProfileClaimSearchItem {
  id: string;
  playerName?: string;
  futId?: string;
  userEmail?: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorUid?: string;
  approvedBy?: string;
  rejectedBy?: string;
  updatedBy?: string;
  userId?: string;
  targetUser?: string;
  targetUid?: string;
  targetEmail?: string;
  email?: string;
  timestamp?: unknown;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp?: unknown;
}

export interface EffectiveRoleCounts {
  coaches: number;
  playerAccounts: number;
  parents: number;
  scouts: number;
}

export interface DashboardSearchResult {
  id: string;
  type: "user" | "academy" | "claim";
  title: string;
  subtitle: string;
  tab: SuperAdminTab;
  searchValue?: string;
  academyFilter?: string;
}

export interface DashboardSearchSelection {
  tab: SuperAdminTab;
  accountQuery: string;
  academyQuery: string;
  claimQuery: string;
}

export function resolveDashboardSearchSelection(
  result: DashboardSearchResult,
): DashboardSearchSelection {
  return {
    tab: result.tab,
    accountQuery:
      result.type === "user"
        ? result.searchValue || result.title
        : "",
    academyQuery:
      result.type === "academy"
        ? result.academyFilter || result.title
        : "",
    claimQuery:
      result.type === "claim"
        ? result.searchValue || result.title
        : "",
  };
}
export interface DashboardAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  tab?: SuperAdminTab;
}

const DASHBOARD_ROLES: ReadonlySet<UserRole> = new Set([
  "COACH",
  "PLAYER",
  "PARENT",
  "SCOUT",
]);

export function deriveDashboardMetric(input: {
  loadState: DashboardLoadState;
  value: number | null;
}): DashboardMetric {
  if (
    input.loadState === "idle" ||
    input.loadState === "loading"
  ) {
    return {
      state: "LOADING",
      value: null,
    };
  }

  if (input.loadState === "unavailable") {
    return {
      state: "UNAVAILABLE",
      value: null,
    };
  }

  const hasValidValue =
    typeof input.value === "number" &&
    Number.isFinite(input.value) &&
    Number.isInteger(input.value) &&
    input.value >= 0;

  if (!hasValidValue) {
    return {
      state: "UNAVAILABLE",
      value: null,
    };
  }

  return {
    state: "READY",
    value: input.value,
  };
}

export function deriveEffectiveRoleCounts(users: readonly User[]): EffectiveRoleCounts {
  const counts: EffectiveRoleCounts = {
    coaches: 0,
    playerAccounts: 0,
    parents: 0,
    scouts: 0,
  };

  for (const user of users) {
    if (!DASHBOARD_ROLES.has(user.role)) continue;

    switch (user.role) {
      case "COACH":
        counts.coaches += 1;
        break;
      case "PLAYER":
        counts.playerAccounts += 1;
        break;
      case "PARENT":
        counts.parents += 1;
        break;
      case "SCOUT":
        counts.scouts += 1;
        break;
    }
  }

  return counts;
}

export function parseAuditLog(id: string, data: Record<string, unknown>): AuditLogEntry {
  const optionalString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value : undefined;

  return {
    id,
    action: optionalString(data.action) || "UNKNOWN_ACTION",
    actorUid: optionalString(data.actorUid),
    approvedBy: optionalString(data.approvedBy),
    rejectedBy: optionalString(data.rejectedBy),
    updatedBy: optionalString(data.updatedBy),
    userId: optionalString(data.userId),
    targetUser: optionalString(data.targetUser),
    targetUid: optionalString(data.targetUid),
    targetEmail: optionalString(data.targetEmail),
    email: optionalString(data.email),
    timestamp: data.timestamp,
  };
}

const ACTION_LABELS: Readonly<Record<string, string>> = {
  USER_REGISTERED: "User registered",
  USER_APPROVED: "User approved",
  USER_BULK_APPROVED: "User bulk-approved",
  USER_REJECTED: "User rejected",
  ROLE_UPDATED: "Role changed",
  STATUS_UPDATED: "Status changed",
  PAYMENT_APPROVED: "Payment approved",
  PAYMENT_REJECTED: "Payment rejected",
};

export function buildRecentActivities(
  logs: readonly AuditLogEntry[],
  users: readonly User[],
): RecentActivityItem[] {
  const usersById = new Map<string, User>();
  for (const user of users) {
    if (user.id) usersById.set(user.id, user);
    if (user.uid) usersById.set(user.uid, user);
  }

  return logs.map((log) => {
    const actorId = log.actorUid || log.approvedBy || log.rejectedBy || log.updatedBy || log.userId;
    const actorUser = actorId ? usersById.get(actorId) : undefined;
    const actor = actorUser?.name || actorUser?.email || actorId || "System";
    const target = log.targetEmail || log.email || log.targetUid || log.targetUser || "—";

    return {
      id: log.id,
      action: ACTION_LABELS[log.action] || log.action.replaceAll("_", " ").toLowerCase(),
      actor,
      target,
      timestamp: log.timestamp,
    };
  });
}

export function searchDashboardData(input: {
  query: string;
  users: readonly User[];
  academies: readonly AcademyDirectoryItem[];
  claims: readonly ProfileClaimSearchItem[];
  limit?: number;
}): DashboardSearchResult[] {
  const normalizedQuery = input.query.trim().toLocaleLowerCase();
  if (normalizedQuery.length < 2) return [];

  const resultLimit = input.limit ?? 8;
  const results: DashboardSearchResult[] = [];
  const matches = (value?: string | null) =>
    Boolean(value?.toLocaleLowerCase().includes(normalizedQuery));

  for (const user of input.users) {
    if (!matches(user.name) && !matches(user.email)) continue;
    results.push({
      id: `user:${user.id || user.uid || user.email || user.name}`,
      type: "user",
      title: user.name || user.email || "Unnamed user",
      subtitle: [user.email, user.role].filter(Boolean).join(" · "),
      tab: "users",
      searchValue: user.email || user.name,
    });
    if (results.length >= resultLimit) return results;
  }

  for (const academy of input.academies) {
    if (!matches(academy.name) && !matches(academy.id)) continue;
    results.push({
      id: `academy:${academy.id}`,
      type: "academy",
      title: academy.name,
      subtitle: `Academy · ${academy.id}`,
      tab: "academies",
      academyFilter: academy.name,
    });
    if (results.length >= resultLimit) return results;
  }

  for (const claim of input.claims) {
    if (!matches(claim.playerName) && !matches(claim.futId) && !matches(claim.userEmail)) continue;
    results.push({
      id: `claim:${claim.id}`,
      type: "claim",
      title: claim.playerName || claim.futId || "Profile claim",
      subtitle: [claim.futId, claim.userEmail].filter(Boolean).join(" · "),
      tab: "profile_claims",
      searchValue: claim.futId || claim.userEmail || claim.playerName,
    });
    if (results.length >= resultLimit) return results;
  }

  return results;
}

function deriveConnectedOperationalSignal(
  id: DashboardOperationalSignalId,
  source: DashboardOperationalSignalSource,
): DashboardOperationalSignal {
  if (
    source.loadState === "idle" ||
    source.loadState === "loading"
  ) {
    return {
      id,
      state: "LOADING",
      count: null,
    };
  }

  if (source.loadState === "unavailable") {
    return {
      id,
      state: "UNAVAILABLE",
      count: null,
    };
  }

  const hasValidCount =
    typeof source.count === "number" &&
    Number.isFinite(source.count) &&
    Number.isInteger(source.count) &&
    source.count >= 0;

  if (!hasValidCount) {
    return {
      id,
      state: "UNAVAILABLE",
      count: null,
    };
  }

  return {
    id,
    state: source.count === 0 ? "CLEAR" : "PENDING",
    count: source.count,
  };
}

export function deriveDashboardOperationalSignals(
  input: DashboardOperationalSignalInput,
): DashboardOperationalSignal[] {
  return [
    deriveConnectedOperationalSignal(
      "user-approvals",
      input.userApprovals,
    ),
    deriveConnectedOperationalSignal(
      "profile-claims",
      input.profileClaims,
    ),
    {
      id: "payment-approvals",
      state: "NOT_CONNECTED",
      count: null,
    },
    {
      id: "error-reports",
      state: "NOT_CONNECTED",
      count: null,
    },
  ];
}

const DASHBOARD_OPERATIONAL_SIGNAL_IDS:
  readonly DashboardOperationalSignalId[] = [
    "user-approvals",
    "profile-claims",
    "payment-approvals",
    "error-reports",
  ];



function validPendingSignalCount(
  signal: DashboardOperationalSignal | undefined,
): number | null {
  if (
    !signal ||
    signal.state !== "PENDING" ||
    typeof signal.count !== "number" ||
    !Number.isFinite(signal.count) ||
    !Number.isInteger(signal.count) ||
    signal.count <= 0
  ) {
    return null;
  }

  return signal.count;
}

export function deriveDashboardAlerts(
  signals: readonly DashboardOperationalSignal[],
): DashboardAlert[] {

  const signalById =
    new Map<DashboardOperationalSignalId, DashboardOperationalSignal>();

  for (const signal of signals) {
    if (!signalById.has(signal.id)) {
      signalById.set(signal.id, signal);
    }
  }

  const alerts: DashboardAlert[] = [];

  const errorReports =
    validPendingSignalCount(
      signalById.get("error-reports"),
    );

  if (errorReports !== null) {
    alerts.push({
      id: "error-reports",
      severity: "critical",
      title: `${errorReports} error report${errorReports === 1 ? "" : "s"}`,
      detail: "Review the latest captured application errors.",
    });
  }

  const pendingUsers =
    validPendingSignalCount(
      signalById.get("user-approvals"),
    );

  if (pendingUsers !== null) {
    alerts.push({
      id: "pending-users",
      severity: "warning",
      title: `${pendingUsers} user approval${pendingUsers === 1 ? "" : "s"} pending`,
      detail: "New accounts are waiting for an approval decision.",
      tab: "approvals",
    });
  }

  const profileClaims =
    validPendingSignalCount(
      signalById.get("profile-claims"),
    );

  if (profileClaims !== null) {
    alerts.push({
      id: "profile-claims",
      severity: "warning",
      title: `${profileClaims} profile claim${profileClaims === 1 ? "" : "s"} pending`,
      detail: "Player profile linking requests require review.",
      tab: "profile_claims",
    });
  }

  const paymentApprovals =
    validPendingSignalCount(
      signalById.get("payment-approvals"),
    );

  if (paymentApprovals !== null) {
    alerts.push({
      id: "payment-approvals",
      severity: "info",
      title: `${paymentApprovals} payment approval${paymentApprovals === 1 ? "" : "s"} pending`,
      detail: "Uploaded payment evidence is ready for review.",
      tab: "payment_approvals",
    });
  }

  const hasCompleteClearCoverage =
    signals.length ===
      DASHBOARD_OPERATIONAL_SIGNAL_IDS.length &&
    DASHBOARD_OPERATIONAL_SIGNAL_IDS.every(
      (id) => {
        const matchingSignals =
          signals.filter(
            (signal) => signal.id === id,
          );

        return (
          matchingSignals.length === 1 &&
          matchingSignals[0].state === "CLEAR" &&
          matchingSignals[0].count === 0
        );
      },
    );

  if (
    alerts.length === 0 &&
    hasCompleteClearCoverage
  ) {
    alerts.push({
      id: "all-clear",
      severity: "info",
      title: "No known actions require attention",
      detail:
        "All operational signal sources are confirmed clear.",
    });
  }

  return alerts;
}
