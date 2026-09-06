import { useEffect, useRef, useState } from "react";
import { History, RefreshCw, RotateCcw, UserMinus } from "lucide-react";
import type { ProClubAuthorizationRole } from "../../types/ProClub";
import { staffRoleLabels } from "../../lib/proClubOnboarding";
import {
  proClubStaffLifecycleReviewErrorMessage,
  proClubStaffLifecycleReviewRepository,
} from "../../lib/proClubStaffLifecycleReviewRepository";
import type {
  ProClubStaffLifecycleEntryV1,
  ProClubStaffLifecycleReviewResponseV1,
} from "../../lib/proClubStaffLifecycleReviewModel";
import {
  proClubStaffManagementErrorMessage,
  proClubStaffManagementRepository,
} from "../../lib/proClubStaffManagementRepository";
import { getProClubStaffReactivationUiPolicyV1 } from "../../lib/proClubStaffManagementUi";
import { buttonClass, secondaryClass, StatusBadge } from "./StaffOnboarding";

function eventLabel(action: string): string {
  switch (action) {
    case "CHANGE_ROLE": return "Role changed";
    case "DEACTIVATE": return "Deactivated";
    case "REACTIVATE": return "Reactivated";
    case "MARK_LEFT": return "Marked as left";
    default: return "Staff updated";
  }
}

export default function StaffLifecycleReview({
  clubId,
  uid,
  actorRole,
}: {
  clubId: string;
  uid: string;
  actorRole: ProClubAuthorizationRole;
}) {
  const [review, setReview] = useState<ProClubStaffLifecycleReviewResponseV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const version = useRef(0);

  async function refresh() {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const result = await proClubStaffLifecycleReviewRepository.loadReview(clubId, uid);
      if (current === version.current) setReview(result);
    } catch (cause) {
      if (current === version.current) {
        setReview(null);
        setError(proClubStaffLifecycleReviewErrorMessage(cause));
      }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => { ++version.current; };
  }, [clubId, uid]);

  async function reactivate(entry: ProClubStaffLifecycleEntryV1) {
    const policy = getProClubStaffReactivationUiPolicyV1({ actorRole, actorUid: uid, entry });
    if (!policy.canReactivate || busyUid) return;
    const name = entry.displayName ?? "this staff member";
    if (!window.confirm(`Reactivate ${name}? Their membership and staff assignment will return to ACTIVE.`)) return;
    setBusyUid(entry.userId);
    setError("");
    setNotice("");
    try {
      await proClubStaffManagementRepository.manageStaff(
        { clubId, targetUid: entry.userId, action: { type: "REACTIVATE" } },
        uid,
      );
      setNotice(`${name} was reactivated.`);
      await refresh();
    } catch (cause) {
      setError(proClubStaffManagementErrorMessage(cause));
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <section aria-labelledby="staff-lifecycle-review-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="staff-lifecycle-review-title" className="text-xl font-black text-slate-900">Staff lifecycle & history</h2>
          <p className="mt-1 text-sm text-slate-500">Inactive and former staff remain preserved. Left staff are terminal in V1.</p>
        </div>
        <button className={`${secondaryClass} inline-flex items-center gap-2`} onClick={() => void refresh()} disabled={loading || Boolean(busyUid)}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      {loading ? <p role="status" className="py-8 text-center text-slate-500">Loading staff lifecycle…</p> : review && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {review.inactiveEntries.map((entry) => {
              const policy = getProClubStaffReactivationUiPolicyV1({ actorRole, actorUid: uid, entry });
              return (
                <article key={`inactive:${entry.userId}`} className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-slate-900">{entry.displayName ?? "Staff member"}</h3>
                      <p className="mt-1 text-sm text-slate-600">{staffRoleLabels[entry.staffRole]}</p>
                      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{entry.authorizationRole}</p>
                    </div>
                    <StatusBadge status="INACTIVE" />
                  </div>
                  {policy.canReactivate && (
                    <button className={`${buttonClass} mt-4 inline-flex items-center gap-2`} disabled={Boolean(busyUid)} onClick={() => void reactivate(entry)}>
                      <RotateCcw size={16} /> {busyUid === entry.userId ? "Reactivating…" : "Reactivate"}
                    </button>
                  )}
                </article>
              );
            })}

            {review.leftEntries.map((entry) => (
              <article key={`left:${entry.userId}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-900">{entry.displayName ?? "Staff member"}</h3>
                    <p className="mt-1 text-sm text-slate-600">{staffRoleLabels[entry.staffRole]}</p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{entry.authorizationRole}</p>
                  </div>
                  <StatusBadge status="LEFT" />
                </div>
                <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><UserMinus size={14} /> Left is terminal in Staff Management V1.</p>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2"><History size={18} className="text-slate-600" /><h3 className="font-bold text-slate-900">Recent staff management history</h3></div>
            {review.events.length === 0 ? <p className="mt-3 text-sm text-slate-500">No staff management events recorded yet.</p> : (
              <ol className="mt-4 space-y-3">
                {review.events.map((event) => (
                  <li key={event.eventId} className="rounded-xl bg-slate-50 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{eventLabel(event.action)}</span>
                      <time className="text-xs text-slate-500">{new Date(event.changedAtMs).toLocaleString()}</time>
                    </div>
                    <p className="mt-1 text-slate-600">{staffRoleLabels[event.previousStaffRole]} → {staffRoleLabels[event.nextStaffRole]}</p>
                    <p className="mt-1 text-xs text-slate-500">{event.previousStaffStatus} → {event.nextStaffStatus}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
