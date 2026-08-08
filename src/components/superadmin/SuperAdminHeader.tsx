import { ArrowLeft, CheckCircle2, FileDown, ShieldCheck, UserCog, Megaphone } from "lucide-react";
import SuperAdminSearch from "./SuperAdminSearch";
import type { DashboardSearchResult, SuperAdminTab } from "./dashboardModel";

interface SuperAdminHeaderProps {
  onBack: () => void;
  onNavigate: (tab: SuperAdminTab) => void;
  onOpenNotice: () => void;
  onExportReport: () => void;
  dashboardActionsDisabled: boolean;
  searchResults: readonly DashboardSearchResult[];
  onSearchQueryChange: (query: string) => void;
  onSearchSelect: (result: DashboardSearchResult) => void;
}

export default function SuperAdminHeader({
  onBack,
  onNavigate,
  onOpenNotice,
  onExportReport,
  dashboardActionsDisabled,
  searchResults,
  onSearchQueryChange,
  onSearchSelect,
}: SuperAdminHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-slate-50/90 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to dashboard"
            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="shrink-0 text-emerald-600" size={26} />
              <h1 className="truncate text-xl font-black tracking-tight text-slate-900 sm:text-2xl">SuperAdmin Portal</h1>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">System Administration &amp; Security</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => onNavigate("approvals")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <CheckCircle2 size={16} /> Approve Users
          </button>
          <button
            type="button"
            onClick={() => onNavigate("users")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700"
          >
            <UserCog size={16} /> Manage Users
          </button>
          <button
            type="button"
            onClick={onOpenNotice}
            disabled={dashboardActionsDisabled}
            title={dashboardActionsDisabled ? "User data is still loading" : "Compose a notice for active users"}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            <Megaphone size={16} /> Send Notice
          </button>
          <button
            type="button"
            onClick={onExportReport}
            disabled={dashboardActionsDisabled}
            title={dashboardActionsDisabled ? "User data is still loading" : "Download the currently loaded Dashboard data as CSV"}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            <FileDown size={16} /> Export Report
          </button>
        </div>
      </div>

      <div className="mt-5">
        <SuperAdminSearch
          results={searchResults}
          onQueryChange={onSearchQueryChange}
          onSelect={onSearchSelect}
        />
      </div>
    </header>
  );
}
