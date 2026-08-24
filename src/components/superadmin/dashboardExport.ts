import type {
  DashboardLoadState,
  DashboardOperationalSignal,
  EffectiveRoleCounts,
  RecentActivityItem,
} from "./dashboardModel";
import type { User } from "../../contexts/AuthContext";
import { assessRequestedIntent } from "../../lib/accountRolePolicy";

export const DASHBOARD_CSV_MIME_TYPE = "text/csv;charset=utf-8";
export const DASHBOARD_EXPORT_UNAVAILABLE = "Unavailable";
export const DASHBOARD_EXPORT_NOT_CONNECTED = "Not Connected";
export const DASHBOARD_EXPORT_LOADING = "Loading";

const CSV_HEADERS = [
  "section",
  "metric",
  "value",
  "action",
  "actor",
  "target",
  "activity_timestamp",
  "exported_at",
  "user_uid",
  "user_name",
  "user_email",
  "authoritative_role",
  "authoritative_status",
  "requested_intent",
] as const;

type CsvHeader = (typeof CSV_HEADERS)[number];
type CsvRow = Record<CsvHeader, unknown>;

export interface SuperAdminDashboardExportInput {
  exportedAt: Date;
  academyCount: number | null;
  academyLoadState: DashboardLoadState;
  roleCounts: EffectiveRoleCounts;
  users: readonly User[];
  operationalSignals: readonly DashboardOperationalSignal[];
  recentActivities: readonly RecentActivityItem[];
  recentActivityLoadState: DashboardLoadState;
}

function formulaSafeText(value: unknown): string {
  const text = value === null || value === undefined
    ? ""
    : value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? value
        : String(value);

  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function dashboardCsvCell(value: unknown): string {
  return `"${formulaSafeText(value).replace(/"/g, '""')}"`;
}

function timestampToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  if (value && typeof value === "object") {
    const firestoreTimestamp = value as {
      toDate?: () => Date;
      seconds?: number;
    };
    if (typeof firestoreTimestamp.toDate === "function") {
      return firestoreTimestamp.toDate().toISOString();
    }
    if (typeof firestoreTimestamp.seconds === "number") {
      return new Date(firestoreTimestamp.seconds * 1_000).toISOString();
    }
  }
  return "";
}

function metricValue(
  loadState: DashboardLoadState,
  value: number | null,
): number | typeof DASHBOARD_EXPORT_UNAVAILABLE {
  return loadState === "loaded" && value !== null
    ? value
    : DASHBOARD_EXPORT_UNAVAILABLE;
}

function operationalSignalValue(
  signals: readonly DashboardOperationalSignal[],
  id: DashboardOperationalSignal["id"],
):
  | number
  | typeof DASHBOARD_EXPORT_UNAVAILABLE
  | typeof DASHBOARD_EXPORT_NOT_CONNECTED
  | typeof DASHBOARD_EXPORT_LOADING {
  const matchingSignals =
    signals.filter(
      (signal) => signal.id === id,
    );

  if (matchingSignals.length !== 1) {
    return DASHBOARD_EXPORT_UNAVAILABLE;
  }

  const signal = matchingSignals[0];

  switch (signal.state) {
    case "LOADING":
      return DASHBOARD_EXPORT_LOADING;

    case "UNAVAILABLE":
      return DASHBOARD_EXPORT_UNAVAILABLE;

    case "NOT_CONNECTED":
      return DASHBOARD_EXPORT_NOT_CONNECTED;

    case "CLEAR":
      return signal.count === 0
        ? 0
        : DASHBOARD_EXPORT_UNAVAILABLE;

    case "PENDING": {
      const validPendingCount =
        typeof signal.count === "number" &&
        Number.isFinite(signal.count) &&
        Number.isInteger(signal.count) &&
        signal.count > 0;

      return validPendingCount
        ? signal.count
        : DASHBOARD_EXPORT_UNAVAILABLE;
    }
  }
}

function summaryRow(
  metric: string,
  value: unknown,
  exportedAt: string,
): CsvRow {
  return {
    section: "summary",
    metric,
    value,
    action: "",
    actor: "",
    target: "",
    activity_timestamp: "",
    exported_at: exportedAt,
    user_uid: "",
    user_name: "",
    user_email: "",
    authoritative_role: "",
    authoritative_status: "",
    requested_intent: "",
  };
}

export function buildSuperAdminDashboardCsv(
  input: SuperAdminDashboardExportInput,
): string {
  const exportedAt = input.exportedAt.toISOString();
  const rows: CsvRow[] = [
    summaryRow("Export Timestamp", exportedAt, exportedAt),
    summaryRow(
      "Pending Users",
      operationalSignalValue(
        input.operationalSignals,
        "user-approvals",
      ),
      exportedAt,
    ),
    summaryRow(
      "Academies",
      metricValue(input.academyLoadState, input.academyCount),
      exportedAt,
    ),
    summaryRow("Coaches", input.roleCounts.coaches, exportedAt),
    summaryRow("Player Accounts", input.roleCounts.playerAccounts, exportedAt),
    summaryRow("Parents", input.roleCounts.parents, exportedAt),
    summaryRow("Scouts", input.roleCounts.scouts, exportedAt),
    summaryRow(
      "Payment Approvals",
      operationalSignalValue(
        input.operationalSignals,
        "payment-approvals",
      ),
      exportedAt,
    ),
    summaryRow(
      "Pending Profile Claims",
      operationalSignalValue(
        input.operationalSignals,
        "profile-claims",
      ),
      exportedAt,
    ),
    summaryRow(
      "Error Reports",
      operationalSignalValue(
        input.operationalSignals,
        "error-reports",
      ),
      exportedAt,
    ),
    summaryRow(
      "Recent Activity Count",
      metricValue(
        input.recentActivityLoadState,
        input.recentActivityLoadState === "loaded"
          ? input.recentActivities.length
          : null,
      ),
      exportedAt,
    ),
  ];

  if (input.recentActivityLoadState === "loaded") {
    input.recentActivities.forEach((activity, index) => {
      rows.push({
        section: "recent_activity",
        metric: `Activity ${index + 1}`,
        value: "",
        action: activity.action,
        actor: activity.actor,
        target: activity.target,
        activity_timestamp: timestampToIso(activity.timestamp),
        exported_at: exportedAt,
        user_uid: "",
        user_name: "",
        user_email: "",
        authoritative_role: "",
        authoritative_status: "",
        requested_intent: "",
      });
    });
  }

  input.users.forEach((user) => {
    rows.push({
      section: "user_authority",
      metric: "User authority record",
      value: "",
      action: "",
      actor: "",
      target: "",
      activity_timestamp: "",
      exported_at: exportedAt,
      user_uid: user.id || user.uid || "",
      user_name: user.name,
      user_email: user.email || "",
      authoritative_role: user.role || "MISSING",
      authoritative_status: user.status || "MISSING",
      requested_intent: assessRequestedIntent(user.requestedRole).display,
    });
  });

  const csvLines = [
    CSV_HEADERS.map(dashboardCsvCell).join(","),
    ...rows.map((row) => CSV_HEADERS.map((header) => dashboardCsvCell(row[header])).join(",")),
  ];

  return `\uFEFF${csvLines.join("\r\n")}\r\n`;
}

export function dashboardExportFilename(exportedAt: Date): string {
  const timestamp = exportedAt.toISOString().replace(/[:.]/g, "-");
  return `futverse-superadmin-dashboard-${timestamp}.csv`;
}

export function downloadSuperAdminDashboardCsv(
  input: SuperAdminDashboardExportInput,
): void {
  const csv = buildSuperAdminDashboardCsv(input);
  const blob = new Blob([csv], { type: DASHBOARD_CSV_MIME_TYPE });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = dashboardExportFilename(input.exportedAt);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
