import {
  Activity,
  CalendarDays,
  ClipboardList,
  History,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ProClubStaffRole } from "../../../types/ProClub";

const assignments = [
  { role: "Assistant Coach", responsibility: "Tactical possession block", scope: "Session 2" },
  { role: "Fitness Coach", responsibility: "Conditioning + planned load", scope: "Session 2" },
  { role: "GK Coach", responsibility: "Goalkeeper-specific block", scope: "Session 2" },
  { role: "Analyst", responsibility: "Opponent clips + coaching cues", scope: "Session 2" },
] as const;

const auditPreview = [
  { actor: "Head Coach", action: "Created Weekly Plan", detail: "Weekly objective and Session 2 intent defined" },
  { actor: "Assistant Coach", action: "Prepared assigned block", detail: "Tactical possession exercise added under Head Coach assignment" },
  { actor: "Fitness Coach", action: "Prepared load block", detail: "Conditioning work aligned to planned MODERATE load" },
  { actor: "Session Coach", action: "Recorded actual change", detail: "3 players unavailable; exercise changed from 10v10 to 8v8" },
] as const;

function audienceLabel(role: ProClubStaffRole): string {
  switch (role) {
    case "HEAD_COACH":
      return "Head Coach owner view";
    case "TECHNICAL_DIRECTOR":
      return "Technical Director governance view";
    case "ASSISTANT_COACH":
      return "Assistant Coach contributor view";
    case "GK_COACH":
      return "GK Coach contributor view";
    case "FITNESS_COACH":
      return "Fitness Coach contributor view";
    case "ANALYST":
      return "Analyst contributor view";
    default:
      return "Weekly Training collaboration preview";
  }
}

export default function WeeklyTrainingCollaborationPreview({
  role,
}: {
  role: ProClubStaffRole;
}) {
  return (
    <section
      aria-labelledby="weekly-training-collaboration-preview-title"
      className="space-y-5 rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
            Collaboration preview
          </p>
          <h4
            id="weekly-training-collaboration-preview-title"
            className="mt-2 text-lg font-black text-white"
          >
            Weekly Training — Plan → Execution → Actual
          </h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {audienceLabel(role)}. This is a read-only sample of the reviewed collaboration model.
            It does not save delegation, Actual data or audit events yet.
          </p>
        </div>
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-200">
          PREVIEW ONLY · NO PRODUCTION WRITE
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-cyan-300">
            <CalendarDays size={18} />
            <p className="text-xs font-black uppercase tracking-[0.14em]">Weekly Plan</p>
          </div>
          <p className="mt-3 font-bold text-white">Owner: Head Coach</p>
          <p className="mt-1 text-sm text-slate-300">Main objective: Build through midfield under pressure</p>
          <div className="mt-3 space-y-1 text-xs text-slate-400">
            <p>Planned squad: 20 players</p>
            <p>Planned load: MODERATE</p>
            <p>Session 2: Tactical + Conditioning</p>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 xl:col-span-2">
          <div className="flex items-center gap-2 text-cyan-300">
            <Users size={18} />
            <p className="text-xs font-black uppercase tracking-[0.14em]">Assigned coaching team</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {assignments.map((item) => (
              <div key={item.role} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="font-bold text-white">{item.role}</p>
                <p className="mt-1 text-sm text-slate-300">{item.responsibility}</p>
                <p className="mt-2 text-xs text-slate-500">Scope: {item.scope} · explicit assignment required</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-emerald-300">
            <Activity size={18} />
            <p className="text-xs font-black uppercase tracking-[0.14em]">Plan vs Actual</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Planned</p>
              <p className="mt-2 font-bold text-white">20 players · 10v10</p>
              <p className="mt-1 text-sm text-slate-400">Original training intent remains preserved.</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-300">Actual</p>
              <p className="mt-2 font-bold text-white">17 players · 8v8</p>
              <p className="mt-1 text-sm text-slate-300">3 players unavailable due to injury/availability.</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            A coach may adjust the working session, or leave the original plan untouched and record the
            real execution here. FutVerse should not rewrite history just to make Plan and Actual match.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-violet-300">
            <History size={18} />
            <p className="text-xs font-black uppercase tracking-[0.14em]">Actor audit timeline</p>
          </div>
          <div className="mt-3 space-y-3">
            {auditPreview.map((event) => (
              <div key={`${event.actor}-${event.action}`} className="border-l-2 border-slate-700 pl-3">
                <p className="text-sm font-bold text-white">{event.actor} · {event.action}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{event.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Future persisted audit entries are append-only and retain actor UID, actor role, target,
            timestamp, delegation provenance and reason where applicable.
          </p>
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 text-sky-300" size={18} />
            <div>
              <p className="font-bold text-white">Technical Director boundary</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                Football-governance review and necessary correction can be added later with exact actor
                provenance. Technical Director is not an automatic co-author of every Weekly Plan.
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 text-rose-300" size={18} />
            <div>
              <p className="font-bold text-white">SuperAdmin emergency boundary</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">
                SuperAdmin never receives automatic football-content authority. Future emergency support
                requires an explicit scoped break-glass action, reason and immutable audit trail.
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
