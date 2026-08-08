import type { User, UserRole } from "../../contexts/AuthContext";

export type SuperAdminTab =
  | "dashboard"
  | "approvals"
  | "payment_approvals"
  | "users"
  | "system_logs"
  | "profile_claims"
  | "observation_metrics";

export type DashboardLoadState = "idle" | "loading" | "loaded" | "unavailable";

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
  approvedBy?: string;
  rejectedBy?: string;
  updatedBy?: string;
  userId?: string;
  targetUser?: string;
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
    approvedBy: optionalString(data.approvedBy),
    rejectedBy: optionalString(data.rejectedBy),
    updatedBy: optionalString(data.updatedBy),
    userId: optionalString(data.userId),
    targetUser: optionalString(data.targetUser),
    targetEmail: optionalString(data.targetEmail),
    email: optionalString(data.email),
    timestamp: data.timestamp,
  };
}

const ACTION_LABELS: Readonly<Record<string, string>> = {
  USER_REGISTERED: "User registered",
  USER_APPROVED: "User approved",
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
    const actorId = log.approvedBy || log.rejectedBy || log.updatedBy || log.userId;
    const actorUser = actorId ? usersById.get(actorId) : undefined;
    const actor = actorUser?.name || actorUser?.email || actorId || "System";
    const target = log.targetEmail || log.email || log.targetUser || "—";

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
      tab: "users",
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
    });
    if (results.length >= resultLimit) return results;
  }

  return results;
}

export function deriveDashboardAlerts(input: {
  pendingUsers: number;
  paymentApprovals: number;
  profileClaims: number | null;
  errorReports: number | null;
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (input.errorReports !== null && input.errorReports > 0) {
    alerts.push({
      id: "error-reports",
      severity: "critical",
      title: `${input.errorReports} error report${input.errorReports === 1 ? "" : "s"}`,
      detail: "Review the latest captured application errors.",
      tab: "system_logs",
    });
  }
  if (input.pendingUsers > 0) {
    alerts.push({
      id: "pending-users",
      severity: "warning",
      title: `${input.pendingUsers} user approval${input.pendingUsers === 1 ? "" : "s"} pending`,
      detail: "New accounts are waiting for an approval decision.",
      tab: "approvals",
    });
  }
  if (input.profileClaims !== null && input.profileClaims > 0) {
    alerts.push({
      id: "profile-claims",
      severity: "warning",
      title: `${input.profileClaims} profile claim${input.profileClaims === 1 ? "" : "s"} pending`,
      detail: "Player profile linking requests require review.",
      tab: "profile_claims",
    });
  }
  if (input.paymentApprovals > 0) {
    alerts.push({
      id: "payment-approvals",
      severity: "info",
      title: `${input.paymentApprovals} payment approval${input.paymentApprovals === 1 ? "" : "s"} pending`,
      detail: "Uploaded payment evidence is ready for review.",
      tab: "payment_approvals",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      severity: "info",
      title: "No known actions require attention",
      detail: "Unavailable data sources are shown separately and are not treated as healthy.",
    });
  }

  return alerts;
}
