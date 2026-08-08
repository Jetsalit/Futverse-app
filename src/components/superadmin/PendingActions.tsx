import { AlertTriangle, BadgeCheck, CreditCard, FileWarning, UserRoundCheck } from "lucide-react";
import type { SuperAdminTab } from "./dashboardModel";

interface PendingActionItem {
  id: string;
  label: string;
  count: number | null;
  tab: SuperAdminTab;
  icon: typeof AlertTriangle;
  tone: string;
}

interface PendingActionsProps {
  userApprovals: number;
  profileClaims: number | null;
  paymentApprovals: number;
  errorReports: number | null;
  onNavigate: (tab: SuperAdminTab) => void;
}

export default function PendingActions({
  userApprovals,
  profileClaims,
  paymentApprovals,
  errorReports,
  onNavigate,
}: PendingActionsProps) {
  const actions: PendingActionItem[] = [
    { id: "users", label: "User Approvals", count: userApprovals, tab: "approvals", icon: UserRoundCheck, tone: "bg-emerald-50 text-emerald-700" },
    { id: "claims", label: "Profile Claims", count: profileClaims, tab: "profile_claims", icon: BadgeCheck, tone: "bg-indigo-50 text-indigo-700" },
    { id: "payments", label: "Payment Approvals", count: paymentApprovals, tab: "payment_approvals", icon: CreditCard, tone: "bg-amber-50 text-amber-700" },
    { id: "errors", label: "Error Reports", count: errorReports, tab: "system_logs", icon: FileWarning, tone: "bg-rose-50 text-rose-700" },
  ];

  return (
    <section aria-labelledby="action-required-title">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="text-amber-500" size={18} />
        <h2 id="action-required-title" className="text-base font-black text-slate-900">Action Required</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {actions.map(({ id, label, count, tab, icon: Icon, tone }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(tab)}
            className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                <Icon size={19} />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-800">{label}</span>
                <span className="block text-xs text-slate-500">Open existing module</span>
              </span>
            </span>
            <span className="ml-3 text-2xl font-black text-slate-900">{count ?? "—"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
