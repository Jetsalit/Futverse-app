import { useEffect, useRef, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { staffRoleLabels } from "../../lib/proClubOnboarding";
import {
  proClubStaffRosterErrorMessage,
  proClubStaffRosterRepository,
} from "../../lib/proClubStaffRosterRepository";
import type { ProClubStaffRosterEntryV1 } from "../../lib/proClubStaffRosterModel";
import {
  proClubStaffManagementErrorMessage,
  proClubStaffManagementRepository,
} from "../../lib/proClubStaffManagementRepository";
import {
  getProClubStaffManagementUiPolicyV1,
  PRO_CLUB_STAFF_ROLE_OPTIONS,
} from "../../lib/proClubStaffManagementUi";
import type { ProClubAuthorizationRole, ProClubStaffRole } from "../../types/ProClub";
import { buttonClass, inputClass, secondaryClass, StatusBadge } from "./StaffOnboarding";

export default function StaffRoster({
  clubId,
  uid,
  actorRole,
}: {
  clubId: string;
  uid: string;
  actorRole: ProClubAuthorizationRole;
}) {
  const [entries, setEntries] = useState<ProClubStaffRosterEntryV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managementError, setManagementError] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, ProClubStaffRole>>({});
  const version = useRef(0);

  async function refresh() {
    const current = ++version.current;
    setLoading(true);
    setError("");
    setManagementError("");
    try {
      const result = await proClubStaffRosterRepository.loadRoster(clubId, uid);
      if (current === version.current) {
        setEntries(result.entries);
        setRoleDrafts(Object.fromEntries(result.entries.map((entry) => [entry.userId, entry.staffRole])));
      }
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

  async function manage(
    entry: ProClubStaffRosterEntryV1,
    action:
      | { type: "CHANGE_ROLE"; staffRole: ProClubStaffRole }
      | { type: "DEACTIVATE" }
      | { type: "MARK_LEFT" },
  ) {
    if (busyUserId) return;

    const policy = getProClubStaffManagementUiPolicyV1({ actorRole, actorUid: uid, entry });
    const permitted =
      (action.type === "CHANGE_ROLE" && policy.canChangeRole) ||
      (action.type === "DEACTIVATE" && policy.canDeactivate) ||
      (action.type === "MARK_LEFT" && policy.canMarkLeft);
    if (!permitted) return;

    const label = entry.displayName ?? "this staff member";
    const confirmation =
      action.type === "CHANGE_ROLE"
        ? `Change ${label}'s staff role to ${staffRoleLabels[action.staffRole]}?`
        : action.type === "DEACTIVATE"
          ? `Deactivate ${label}? They will lose active club access until reactivated through a future authorized workflow.`
          : `Mark ${label} as left? This is a terminal Staff Management V1 action and cannot be reversed here.`;

    if (!window.confirm(confirmation)) return;

    setBusyUserId(entry.userId);
    setManagementError("");
    try {
      await proClubStaffManagementRepository.manageStaff(
        { clubId, targetUid: entry.userId, action },
        uid,
      );
      await refresh();
    } catch (cause) {
      setManagementError(proClubStaffManagementErrorMessage(cause));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section aria-labelledby="active-staff-roster-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="active-staff-roster-title" className="text-xl font-black text-slate-900">Active staff roster</h2>
          <p className="mt-1 text-sm text-slate-500">Current active club staff verified by FutVerse.</p>
        </div>
        <button className={`${secondaryClass} inline-flex items-center gap-2`} onClick={() => void refresh()} disabled={loading || !!busyUserId}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {managementError && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{managementError}</p>}
      {loading ? <p role="status" className="py-8 text-center text-slate-500">Loading active staff…</p> :
        !error && entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Users className="mx-auto text-slate-400" />
            <h3 className="mt-3 font-bold text-slate-900">No active staff found</h3>
            <p className="mt-1 text-sm text-slate-500">Approved active staff will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map((entry) => {
              const policy = getProClubStaffManagementUiPolicyV1({ actorRole, actorUid: uid, entry });
              const busy = busyUserId === entry.userId;
              const roleDraft = roleDrafts[entry.userId] ?? entry.staffRole;
              return (
                <article key={entry.userId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-slate-900">{entry.displayName ?? "Staff member"}</h3>
                      <p className="mt-1 text-sm text-slate-600">{staffRoleLabels[entry.staffRole]}</p>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{entry.authorizationRole}</p>
                    </div>
                    <StatusBadge status="ACTIVE" />
                  </div>

                  {policy.canManage && (
                    <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500" htmlFor={`staff-role-${entry.userId}`}>
                          Functional role
                        </label>
                        <select
                          id={`staff-role-${entry.userId}`}
                          className={inputClass}
                          value={roleDraft}
                          disabled={busy || !!busyUserId}
                          onChange={(event) => setRoleDrafts((current) => ({
                            ...current,
                            [entry.userId]: event.target.value as ProClubStaffRole,
                          }))}
                        >
                          {PRO_CLUB_STAFF_ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>{staffRoleLabels[role]}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={buttonClass}
                          disabled={busy || !!busyUserId || roleDraft === entry.staffRole}
                          onClick={() => void manage(entry, { type: "CHANGE_ROLE", staffRole: roleDraft })}
                        >
                          {busy ? "Updating…" : "Save role"}
                        </button>
                        <button
                          type="button"
                          className={secondaryClass}
                          disabled={busy || !!busyUserId}
                          onClick={() => void manage(entry, { type: "DEACTIVATE" })}
                        >
                          Deactivate
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={busy || !!busyUserId}
                          onClick={() => void manage(entry, { type: "MARK_LEFT" })}
                        >
                          Mark left
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
    </section>
  );
}
