import { useEffect, useRef, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { staffRoleLabels } from "../../lib/proClubOnboarding";
import {
  proClubStaffRosterErrorMessage,
  proClubStaffRosterRepository,
} from "../../lib/proClubStaffRosterRepository";
import type { ProClubStaffRosterEntryV1 } from "../../lib/proClubStaffRosterModel";
import { secondaryClass, StatusBadge } from "./StaffOnboarding";

export default function StaffRoster({ clubId, uid }: { clubId: string; uid: string }) {
  const [entries, setEntries] = useState<ProClubStaffRosterEntryV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);

  async function refresh() {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const result = await proClubStaffRosterRepository.loadRoster(clubId, uid);
      if (current === version.current) setEntries(result.entries);
    } catch (cause) {
      if (current === version.current) {
        setEntries([]);
        setError(proClubStaffRosterErrorMessage(cause));
      }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => { ++version.current; };
  }, [clubId, uid]);

  return (
    <section aria-labelledby="active-staff-roster-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="active-staff-roster-title" className="text-xl font-black text-slate-900">Active staff roster</h2>
          <p className="mt-1 text-sm text-slate-500">Current active club staff verified by FutVerse.</p>
        </div>
        <button className={`${secondaryClass} inline-flex items-center gap-2`} onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {loading ? <p role="status" className="py-8 text-center text-slate-500">Loading active staff…</p> :
        !error && entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Users className="mx-auto text-slate-400" />
            <h3 className="mt-3 font-bold text-slate-900">No active staff found</h3>
            <p className="mt-1 text-sm text-slate-500">Approved active staff will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map((entry) => (
              <article key={entry.userId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">{entry.displayName ?? "Staff member"}</h3>
                    <p className="mt-1 text-sm text-slate-600">{staffRoleLabels[entry.staffRole]}</p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{entry.authorizationRole}</p>
                  </div>
                  <StatusBadge status="ACTIVE" />
                </div>
              </article>
            ))}
          </div>
        )}
    </section>
  );
}
