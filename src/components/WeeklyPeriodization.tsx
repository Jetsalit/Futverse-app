import { ArrowLeft, CalendarDays, Library } from "lucide-react";
import { EmptyState } from "./common/EmptyState";

export default function WeeklyPeriodization({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  onNavigate: (page: string) => void;
}) {
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
            Weekly Periodization
          </h1>
          <p className="text-sm text-slate-500">Training schedule and attendance</p>
        </div>
      </div>
      <EmptyState
        icon={CalendarDays}
        title="Periodization backend unavailable"
        description="No authoritative training-plan, attendance, or sharing backend is configured. Schedules and completion status cannot be created or saved from this screen."
        primaryActionLabel="Open Drill Library"
        onPrimaryAction={() => onNavigate("drills")}
      />
      <button
        type="button"
        onClick={() => onNavigate("drills")}
        className="mx-auto flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700"
      >
        <Library size={16} /> Authoritative drills remain available in the Drill Library
      </button>
    </div>
  );
}
