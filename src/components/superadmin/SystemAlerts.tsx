import { AlertCircle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { DashboardAlert, SuperAdminTab } from "./dashboardModel";

interface SystemAlertsProps {
  alerts: readonly DashboardAlert[];
  errorReportsAvailable: boolean;
  profileClaimsAvailable: boolean;
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
  errorReportsAvailable,
  profileClaimsAvailable,
  onNavigate,
  availableTabs,
}: SystemAlertsProps) {
  const isAvailable = (tab: SuperAdminTab) =>
    !availableTabs || availableTabs.includes(tab);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="system-alerts-title">
      <div className="flex items-center gap-2">
        <ShieldAlert className="text-slate-700" size={19} />
        <h2 id="system-alerts-title" className="text-base font-black text-slate-900">System Alerts</h2>
      </div>

      <div className="mt-4 space-y-3">
        {alerts.map((alert) => {
          const Icon = alert.severity === "critical" ? AlertCircle : alert.severity === "warning" ? ShieldAlert : CheckCircle2;
          const available = alert.tab ? isAvailable(alert.tab) : false;
          const content = (
            <>
              <Icon className="mt-0.5 shrink-0" size={17} />
              <span>
                <span className="block text-sm font-bold">{alert.title}</span>
                <span className="mt-0.5 block text-xs opacity-80">{alert.detail}</span>
              </span>
            </>
          );
          return alert.tab ? (
            <button
              key={alert.id}
              type="button"
              disabled={!available}
              onClick={() => available && onNavigate(alert.tab!)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${severityClasses[alert.severity]} ${
                available ? "hover:brightness-95" : "opacity-60 cursor-not-allowed"
              }`}
            >
              {content}
            </button>
          ) : (
            <div key={alert.id} className={`flex items-start gap-3 rounded-xl border p-3 ${severityClasses[alert.severity]}`}>
              {content}
            </div>
          );
        })}

        {(!errorReportsAvailable || !profileClaimsAvailable) && (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600">
            <Info className="mt-0.5 shrink-0" size={17} />
            <span>
              <span className="block text-sm font-bold">Some action counts are not loaded</span>
              <span className="mt-0.5 block text-xs">Profile Claims and Error Reports remain lazy-loaded. Open their modules to retrieve current data.</span>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
