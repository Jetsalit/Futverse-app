import type { ReactNode } from "react";
import { Activity, CalendarDays, ClipboardList, HeartPulse, ShieldCheck } from "lucide-react";
import type { ProClubOrganizationAuthority } from "../../../lib/firestore/proClubOrganizationAdapter";
import { staffRoleLabels } from "../../../lib/proClubOnboarding";
import ProClubRoleWorkspace from "./ProClubRoleWorkspace";
import ProClubSquadRoster from "./ProClubSquadRoster";

function EmptyModule({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="text-cyan-300">{icon}</div>
      <h3 className="mt-3 font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </article>
  );
}

export default function ProClubOperationsDashboard({
  authority,
}: {
  authority: ProClubOrganizationAuthority;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl">
      <header className="border-b border-slate-800 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
              <span>FutVerse Pro Club</span>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1">DEV PREVIEW</span>
            </div>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">Operations Cockpit</h2>
            <p className="mt-2 text-sm text-slate-400">{authority.organizationName}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-white/10 px-3 py-2">{authority.organizationLevel}</span>
            <span className="rounded-lg bg-emerald-400/10 px-3 py-2 text-emerald-300">{authority.organizationStatus}</span>
            <span className="rounded-lg bg-white/10 px-3 py-2">{authority.membershipAuthorizationRole}</span>
            {authority.staffRole && <span className="rounded-lg bg-white/10 px-3 py-2">{staffRoleLabels[authority.staffRole]}</span>}
          </div>
        </div>
      </header>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Pro Club operations preview" className="space-y-2 text-sm">
          {["Overview", "My Workspace", "Squad", "Training", "Matches", "Fitness", "Analysis", "Availability", "Reports", "Staff", "Club"].map((item, index) => (
            <div
              key={item}
              className={index === 0 ? "rounded-xl bg-cyan-400/10 px-3 py-2.5 font-bold text-cyan-200" : "rounded-xl px-3 py-2.5 text-slate-500"}
            >
              {item}
            </div>
          ))}
          <p className="pt-3 text-xs leading-5 text-slate-600">Navigation remains intentionally non-interactive in this preview. The canonical First Team roster is now connected below, while Head Coach Weekly Training continues through its reviewed workspace.</p>
        </nav>

        <div className="space-y-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Overview</p>
            <h3 className="mt-2 text-xl font-black">Authoritative data only</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The First Team roster now reads from the canonical Pro Club tenant path. Weekly Training remains on its reviewed fresh-DRAFT workflow. Other football modules stay closed until their own contracts and adapters are accepted.</p>
          </div>

          <ProClubSquadRoster authority={authority} />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <EmptyModule icon={<ClipboardList size={20} />} title="Weekly Training" description="Fresh Head Coach DRAFT creation is connected in the role workspace through the reviewed persistence path." />
            <EmptyModule icon={<Activity size={20} />} title="Department Reports" description="Will aggregate real submitted work instead of asking staff to enter reports twice." />
            <EmptyModule icon={<HeartPulse size={20} />} title="Availability" description="Only football availability states will be broadly visible; clinical detail remains restricted." />
            <EmptyModule icon={<CalendarDays size={20} />} title="Competition Calendar" description="Match planning remains deferred until the reviewed Pro Club match slice is connected." />
            <EmptyModule icon={<ShieldCheck size={20} />} title="Authority" description="Club access continues to come from the exact Membership + staff authority bridge; Firestore Rules remain final for client writes." />
          </div>

          <ProClubRoleWorkspace authority={authority} />
        </div>
      </div>
    </section>
  );
}
