import { Target } from "lucide-react";

export default function IDPProfile() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Target className="mx-auto text-slate-400" size={36} />
      <h2 className="mt-4 text-xl font-black text-slate-800">IDP data unavailable</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        No authoritative development-plan, medical, fitness, goal, or drill-assignment backend is
        configured. This profile does not display or save generated development data.
      </p>
    </div>
  );
}
