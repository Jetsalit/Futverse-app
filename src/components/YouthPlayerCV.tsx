import { ArrowLeft, FileWarning, UserCircle } from "lucide-react";

interface YouthPlayerCVProps {
  player: {
    firstName?: string;
    lastName?: string;
    position?: string;
    age?: number;
    ageGroup?: string;
    avatar?: string;
  };
  onBack: () => void;
}

export default function YouthPlayerCV({ player, onBack }: YouthPlayerCVProps) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft size={16} /> Back to Roster
      </button>
      <div className="flex flex-col items-center gap-6 rounded-3xl bg-slate-900 p-8 text-center text-white sm:flex-row sm:text-left">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-slate-700 bg-slate-800">
          {player.avatar ? (
            <img
              src={player.avatar}
              alt={`${player.firstName || ""} ${player.lastName || ""}`.trim()}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserCircle className="text-slate-400" size={58} />
          )}
        </div>
        <div>
          <h1 className="text-3xl font-black">
            {[player.firstName, player.lastName].filter(Boolean).join(" ") || "Player"}
          </h1>
          <p className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-300">
            {[player.position, player.ageGroup].filter(Boolean).join(" · ") ||
              "Profile details unavailable"}
          </p>
          {typeof player.age === "number" && (
            <p className="mt-1 text-sm text-slate-400">Age {player.age}</p>
          )}
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <FileWarning className="mx-auto text-amber-500" size={36} />
        <h2 className="mt-4 text-xl font-black text-slate-800">
          Performance report unavailable
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          No authoritative assessment, IDP, growth, export, or sharing backend is configured.
          Only the stored roster identity above is displayed.
        </p>
      </div>
    </div>
  );
}
