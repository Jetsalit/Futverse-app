import { ClipboardCheck, Dumbbell, FileSearch, ShieldCheck } from "lucide-react";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import WeeklyTrainingDraftComposer from "./WeeklyTrainingDraftComposer";

function EmptyTask({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <h4 className="font-bold text-white">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </article>
  );
}

export default function ProClubRoleWorkspace({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
}) {
  if (authority.staffRole === "HEAD_COACH") {
    return (
      <section aria-labelledby="pro-club-role-workspace" className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">My workspace</p>
          <h3 id="pro-club-role-workspace" className="mt-2 text-xl font-black text-white">Head Coach</h3>
          <p className="mt-2 text-sm text-slate-400">Create a fresh Weekly Training DRAFT through the reviewed server-mediated save boundary.</p>
        </div>
        <WeeklyTrainingDraftComposer authority={authority} />
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyTask title="Today’s Session" description="Derived session view will come from the saved weekly-plan source of truth in a later read-model slice." />
          <EmptyTask title="Department Updates" description="Submitted Fitness, Analysis, GK and Availability work will appear here for review when enabled." />
          <EmptyTask title="Match Preparation" description="Match planning remains deferred until the Pro Club match repository is defined." />
        </div>
      </section>
    );
  }

  if (authority.staffRole === "TECHNICAL_DIRECTOR") {
    return (
      <section aria-labelledby="pro-club-role-workspace" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">My workspace</p>
          <h3 id="pro-club-role-workspace" className="mt-2 text-xl font-black text-white">Technical Director</h3>
          <p className="mt-2 text-sm text-slate-400">Fresh-DRAFT writing remains Head Coach only. Co-planning, review and approval stay closed until their own trusted persistence contracts are reviewed.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyTask title="Training Collaboration" description="Technical Director co-author persistence remains deliberately deferred." />
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
          <p className="mt-2 text-sm leading-6 text-slate-400">Weekly Training fresh-DRAFT creation is currently exposed only to an active Head Coach. Other staff roles retain the existing Pro Club workspace until their reviewed slices are added.</p>
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
