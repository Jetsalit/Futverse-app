import { AlertTriangle, BadgeCheck, CreditCard, FileWarning, UserRoundCheck } from "lucide-react";
import type {
  DashboardOperationalSignal,
  DashboardOperationalSignalId,
  SuperAdminTab,
} from "./dashboardModel";

interface PendingActionItem {
  id: DashboardOperationalSignalId;
  label: string;
  tab?: SuperAdminTab;
  icon: typeof AlertTriangle;
  tone: string;
}

interface PendingActionsProps {
  operationalSignals: readonly DashboardOperationalSignal[];
  onNavigate: (tab: SuperAdminTab) => void;
  availableTabs?: readonly SuperAdminTab[];
}

interface SignalPresentation {
  displayCount: string;
  subtitle: string;
  actionable: boolean;
}

const ACTION_ITEMS: readonly PendingActionItem[] = [
  {
    id: "user-approvals",
    label: "User Approvals",
    tab: "approvals",
    icon: UserRoundCheck,
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    id: "profile-claims",
    label: "Profile Claims",
    tab: "profile_claims",
    icon: BadgeCheck,
    tone: "bg-indigo-50 text-indigo-700",
  },
  {
    id: "payment-approvals",
    label: "Payment Approvals",
    tab: "payment_approvals",
    icon: CreditCard,
    tone: "bg-amber-50 text-amber-700",
  },
  {
    id: "error-reports",
    label: "Error Reports",
    icon: FileWarning,
    tone: "bg-rose-50 text-rose-700",
  },
];

function signalPresentation(
  signal: DashboardOperationalSignal | undefined,
): SignalPresentation {
  if (!signal) {
    return {
      displayCount: "—",
      subtitle: "Current status unavailable",
      actionable: false,
    };
  }

  switch (signal.state) {
    case "LOADING":
      return {
        displayCount: "…",
        subtitle: "Loading current status",
        actionable: false,
      };

    case "PENDING": {
      const validPendingCount =
        typeof signal.count === "number" &&
        Number.isFinite(signal.count) &&
        Number.isInteger(signal.count) &&
        signal.count > 0;

      return {
        displayCount: validPendingCount
          ? String(signal.count)
          : "—",
        subtitle: validPendingCount
          ? "Requires review"
          : "Current status unavailable",
        actionable: validPendingCount,
      };
    }

    case "CLEAR":
      return {
        displayCount: signal.count === 0 ? "0" : "—",
        subtitle:
          signal.count === 0
            ? "No pending items"
            : "Current status unavailable",
        actionable: signal.count === 0,
      };

    case "UNAVAILABLE":
      return {
        displayCount: "—",
        subtitle: "Current status unavailable",
        actionable: false,
      };

    case "NOT_CONNECTED":
      return {
        displayCount: "—",
        subtitle: "Data source not connected",
        actionable: false,
      };
  }
}

export default function PendingActions({
  operationalSignals,
  onNavigate,
  availableTabs,
}: PendingActionsProps) {
  const isModuleAvailable = (tab: SuperAdminTab | undefined) =>
    Boolean(
      tab &&
        (!availableTabs || availableTabs.includes(tab)),
    );

  return (
    <section aria-labelledby="operational-signals-title">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="text-amber-500" size={18} />
        <h2
          id="operational-signals-title"
          className="text-base font-black text-slate-900"
        >
          Operational Signals
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTION_ITEMS.map(
          ({ id, label, tab, icon: Icon, tone }) => {
            const signal =
              operationalSignals.find(
                (candidate) => candidate.id === id,
              );

            const presentation =
              signalPresentation(signal);

            const moduleAvailable =
              isModuleAvailable(tab);

            const canNavigate =
              Boolean(
                tab &&
                  moduleAvailable &&
                  presentation.actionable,
              );

            const subtitle =
              presentation.actionable && !tab
                ? "Review module not connected"
                : presentation.actionable && !moduleAvailable
                  ? "Module unavailable in this workspace"
                  : presentation.subtitle;

            return (
              <button
                key={id}
                type="button"
                disabled={!canNavigate}
                onClick={() => {
                  if (canNavigate && tab) {
                    onNavigate(tab);
                  }
                }}
                className={`group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition ${
                  canNavigate
                    ? "hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                    : "cursor-not-allowed opacity-60"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
                  >
                    <Icon size={19} />
                  </span>

                  <span>
                    <span className="block text-sm font-bold text-slate-800">
                      {label}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {subtitle}
                    </span>
                  </span>
                </span>

                <span className="ml-3 text-2xl font-black text-slate-900">
                  {presentation.displayCount}
                </span>
              </button>
            );
          },
        )}
      </div>
    </section>
  );
}
