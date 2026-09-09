import { ClipboardCheck, Dumbbell, FileSearch, ShieldCheck } from "lucide-react";
import type { ProClubStaffRole } from "../../../types/ProClub";

function EmptyTask({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <h4 className="font-bold text-white">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </article>
  );
}

export default function ProClubRoleWorkspace({ staffRole }: { staffRole: ProClubStaffRole | null }) {
  if (staffRole === "HEAD_COACH") {
    return (
      <section aria-labelledby="pro-club-role-workspace" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">My workspace</p>
          <h3 id="pro-club-role-workspace" className="mt-2 text-xl font-black text-white">Head Coach</h3>
          <p className="mt-2 text-sm text-slate-400">Training planning and technical work will connect here after authoritative persistence is reviewed.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyTask title="Weekly Training" description="Create, edit and submit the weekly plan in the next vertical slice." />
          <EmptyTask title="Today’s Session" description="Derived session view will come from the same weekly-plan source of truth." />
          <EmptyTask title="Department Updates" description="Submitted Fitness, Analysis, GK and Availability work will appear here for review when enabled." />
          <EmptyTask title="Match Preparation" description="Match planning remains deferred until the Pro Club match repository is defined." />
        </div>
      </section>
    );
  }

  if (staffRole === "TECHNICAL_DIRECTOR") {
    return (
      <section aria-labelledby="pro-club-role-workspace" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">My workspace</p>
          <h3 id="pro-club-role-workspace" className="mt-2 text-xl font-black text-white">Technical Director</h3>
          <p className="mt-2 text-sm text-slate-400">Co-planning, review and approval surfaces are visible as a shell only until technical authority persistence is connected.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyTask title="Training Collaboration" description="Co-authoring of Head Coach plans will be added in the Weekly Training vertical slice." />
          <EmptyTask title="Technical Review Queue" description="No synthetic queue is shown. Real submitted work will appear after repository and permission contracts exist." />
          <EmptyTask title="Department Reports" description="Fitness, Analysis, GK and Availability submissions will aggregate here without duplicate re-entry." />
          <EmptyTask title="Technical Decisions" description="Review comments, revision requests and approvals will preserve actor-role provenance." />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="pro-club-role-workspace" className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 text-cyan-300" size={20} />
        <div>
          <h3 id="pro-club-role-workspace" className="font-bold text-white">Role workspace foundation</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">This preview slice currently defines Head Coach and Technical Director workspaces only. Other staff roles keep the existing Pro Club workspace until their own reviewed slice is added.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Dumbbell size={14} /> Training</span>
        <span className="inline-flex items-center gap-1"><FileSearch size={14} /> Analysis</span>
        <span className="inline-flex items-center gap-1"><ClipboardCheck size={14} /> Reports</span>
      </div>
    </section>
  );
}
