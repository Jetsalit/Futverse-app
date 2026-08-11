import { ArrowLeft, HeartPulse } from "lucide-react";
import { EmptyState } from "./common/EmptyState";

export default function RecoveryDashboard({ onBack }: { onBack: () => void; teamName: string }) {
  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Recovery Center</h1>
          <p className="text-sm text-slate-500">Injury and wellness records</p>
        </div>
      </div>
      <EmptyState
        icon={HeartPulse}
        title="Health records unavailable"
        description="No authoritative injury or wellness backend is configured. Health records cannot be displayed, created, or updated from this screen."
        primaryActionLabel="Go Back"
        onPrimaryAction={onBack}
      />
    </div>
  );
}
