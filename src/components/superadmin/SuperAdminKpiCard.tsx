import type { LucideIcon } from "lucide-react";

interface SuperAdminKpiCardProps {
  label: string;
  value: number | null;
  detail: string;
  icon: LucideIcon;
  tone: "emerald" | "blue" | "indigo" | "violet" | "amber" | "rose" | "slate";
}

const toneClasses: Record<SuperAdminKpiCardProps["tone"], string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
};

export default function SuperAdminKpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: SuperAdminKpiCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${toneClasses[tone]}`}>
          <Icon size={19} />
        </div>
        <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {value === null ? "Unavailable" : "Live"}
        </span>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{value ?? "—"}</p>
      <p className="mt-2 min-h-8 text-xs leading-4 text-slate-500">{value === null ? "Unavailable" : detail}</p>
    </article>
  );
}
