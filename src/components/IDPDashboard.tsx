import { ChevronLeft, Target } from "lucide-react";
import { EmptyState } from "./common/EmptyState";

export default function IDPDashboard({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-100"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">IDP Dashboard</h1>
          <p className="text-sm font-bold text-slate-500">Individual Development Plans</p>
        </div>
      </div>
      <EmptyState
        icon={Target}
        title="IDP data unavailable"
        description="No authoritative IDP data source is configured. Progress, goals, and player development status cannot be displayed or updated here."
        primaryActionLabel="Go Back"
        onPrimaryAction={onBack}
      />
    </div>
  );
}
