import { ChevronLeft, Trophy } from "lucide-react";
import { EmptyState } from "./common/EmptyState";

export default function PostMatchStatsEntry({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-100"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800">Post-Match Entry</h1>
          <p className="text-sm text-slate-500">Match statistics and coach awards</p>
        </div>
      </div>
      <EmptyState
        icon={Trophy}
        title="Match statistics unavailable"
        description="No authoritative match, roster, or statistics backend is configured. Match results, player ratings, and awards cannot be submitted here."
        primaryActionLabel="Go Back"
        onPrimaryAction={onBack}
      />
    </div>
  );
}
