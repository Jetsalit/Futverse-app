import type {
  DashboardLoadState,
  EffectiveRoleCounts,
  RecentActivityItem,
} from "./dashboardModel";

export const DASHBOARD_CSV_MIME_TYPE = "text/csv;charset=utf-8";
export const DASHBOARD_EXPORT_UNAVAILABLE = "Unavailable";

const CSV_HEADERS = [
  "section",
  "metric",
  "value",
  "action",
  "actor",
  "target",
  "activity_timestamp",
  "exported_at",
] as const;

type CsvHeader = (typeof CSV_HEADERS)[number];
type CsvRow = Record<CsvHeader, unknown>;

export interface SuperAdminDashboardExportInput {
  exportedAt: Date;
  pendingUsers: number;
  academyCount: number | null;
  academyLoadState: DashboardLoadState;
  roleCounts: EffectiveRoleCounts;
  paymentApprovals: number | null;
  paymentApprovalsLoadState: DashboardLoadState;
  profileClaims: number | null;
  profileClaimsLoadState: DashboardLoadState;
  errorReports: number | null;
  errorReportsLoadState: DashboardLoadState;
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
  };
}

export function buildSuperAdminDashboardCsv(
  input: SuperAdminDashboardExportInput,
): string {
  const exportedAt = input.exportedAt.toISOString();
  const rows: CsvRow[] = [
    summaryRow("Export Timestamp", exportedAt, exportedAt),
    summaryRow("Pending Users", input.pendingUsers, exportedAt),
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
      metricValue(input.paymentApprovalsLoadState, input.paymentApprovals),
      exportedAt,
    ),
    summaryRow(
      "Pending Profile Claims",
      metricValue(input.profileClaimsLoadState, input.profileClaims),
      exportedAt,
    ),
    summaryRow(
      "Error Reports",
      metricValue(input.errorReportsLoadState, input.errorReports),
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
      });
    });
  }

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
