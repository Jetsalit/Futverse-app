import { ArrowLeft, FileWarning } from "lucide-react";
import { EmptyState } from "./common/EmptyState";

interface YouthDevelopmentReportProps {
  onBack: () => void;
  player?: { firstName?: string; lastName?: string } | null;
}

export default function YouthDevelopmentReport({
  onBack,
  player,
}: YouthDevelopmentReportProps) {
  const playerName = [player?.firstName, player?.lastName].filter(Boolean).join(" ");

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
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Youth Development Report
          </h1>
          {playerName && <p className="text-sm text-slate-500">{playerName}</p>}
        </div>
      </div>
      <EmptyState
        icon={FileWarning}
        title="Development report unavailable"
        description="No authoritative performance, growth, badge, or coach-report backend is configured. This screen will not generate sample player metrics."
        primaryActionLabel="Go Back"
        onPrimaryAction={onBack}
      />
    </div>
  );
}
