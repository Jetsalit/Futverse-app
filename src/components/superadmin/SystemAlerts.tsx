import { AlertCircle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type {
  DashboardAlert,
  DashboardOperationalSignal,
  SuperAdminTab,
} from "./dashboardModel";

interface SystemAlertsProps {
  alerts: readonly DashboardAlert[];
  operationalSignals: readonly DashboardOperationalSignal[];
  onNavigate: (tab: SuperAdminTab) => void;
  availableTabs?: readonly SuperAdminTab[];
}

const severityClasses: Record<DashboardAlert["severity"], string> = {
  critical: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
};

export default function SystemAlerts({
  alerts,
  operationalSignals,
  onNavigate,
  availableTabs,
}: SystemAlertsProps) {
  const isAvailable = (tab: SuperAdminTab) =>
    !availableTabs || availableTabs.includes(tab);

  const loadingCount =
    operationalSignals.filter(
      (signal) => signal.state === "LOADING",
    ).length;

  const unavailableCount =
    operationalSignals.filter(
      (signal) => signal.state === "UNAVAILABLE",
    ).length;

  const notConnectedCount =
    operationalSignals.filter(
      (signal) => signal.state === "NOT_CONNECTED",
    ).length;

  const hasPartialCoverage =
    loadingCount > 0 ||
    unavailableCount > 0 ||
    notConnectedCount > 0;

  const coverageDetail = [
    loadingCount > 0
      ? `${loadingCount} loading`
      : null,
    unavailableCount > 0
      ? `${unavailableCount} unavailable`
      : null,
    notConnectedCount > 0
      ? `${notConnectedCount} not connected`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-labelledby="system-alerts-title"
    >
      <div className="flex items-center gap-2">
        <ShieldAlert className="text-slate-700" size={19} />
        <h2
          id="system-alerts-title"
          className="text-base font-black text-slate-900"
        >
          System Alerts
        </h2>
      </div>

      <div className="mt-4 space-y-3">
        {alerts.map((alert) => {
          const Icon =
            alert.severity === "critical"
              ? AlertCircle
              : alert.severity === "warning"
                ? ShieldAlert
                : CheckCircle2;

          const available =
            alert.tab
              ? isAvailable(alert.tab)
              : false;

          const content = (
            <>
              <Icon
                className="mt-0.5 shrink-0"
                size={17}
              />
              <span>
                <span className="block text-sm font-bold">
                  {alert.title}
                </span>
                <span className="mt-0.5 block text-xs opacity-80">
                  {alert.detail}
                </span>
              </span>
            </>
          );

          return alert.tab ? (
            <button
              key={alert.id}
              type="button"
              disabled={!available}
              onClick={() =>
                available &&
                onNavigate(alert.tab!)
              }
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${severityClasses[alert.severity]} ${
                available
                  ? "hover:brightness-95"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              {content}
            </button>
          ) : (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-xl border p-3 ${severityClasses[alert.severity]}`}
            >
              {content}
            </div>
          );
        })}

        {hasPartialCoverage && (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
            <Info
              className="mt-0.5 shrink-0"
              size={17}
            />
            <span>
              <span className="block text-sm font-bold">
                Operational signal coverage is partial
              </span>
              <span className="mt-0.5 block text-xs">
                {coverageDetail}.
                Sources without confirmed current data
                are not treated as healthy.
              </span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
