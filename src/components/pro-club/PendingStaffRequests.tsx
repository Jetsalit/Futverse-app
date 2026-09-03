import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { proClubOnboardingRepository as repository, type PendingStaffRequest } from "../../lib/firestore/proClubOnboardingRepository";
import { isClaimantIdentity, onboardingErrorMessage, staffRoleLabels, visibleInviteStatus } from "../../lib/proClubOnboarding";
import { buttonClass, secondaryClass, StatusBadge } from "./StaffOnboarding";

function ClaimantDetails({ request }: { request: PendingStaffRequest }) {
  const identity = request.claim.claimantIdentity;
  if (!isClaimantIdentity(identity)) return <p className="font-bold text-amber-800">Identity unavailable</p>;
  return <div className="space-y-1 break-words">
    {identity.displayName && <p className="font-bold text-slate-900">{identity.displayName}</p>}
    {identity.email && <p className="text-sm text-slate-700">{identity.email}</p>}
    <p className="text-xs text-slate-500">Account reference: {request.claim.userId}</p>
  </div>;
}

export default function PendingStaffRequests({ clubId, clubName, uid }: { clubId: string; clubName: string; uid: string }) {
  const [requests, setRequests] = useState<PendingStaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ request: PendingStaffRequest; decision: "APPROVED" | "REJECTED" } | null>(null);
  const version = useRef(0);
  async function refresh() {
    const current = ++version.current;
    setLoading(true); setError(""); setConfirmation(null);
    try {
      const result = await repository.loadPending(clubId, uid);
      if (current === version.current) setRequests(result);
    } catch (cause) {
      if (current === version.current) { setRequests([]); setError(onboardingErrorMessage(cause)); }
    } finally { if (current === version.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); return () => { ++version.current; }; }, [clubId, uid]);
  async function confirm() {
    if (!confirmation || busy || !isClaimantIdentity(confirmation.request.claim.claimantIdentity)) return;
    const current = version.current;
    setBusy(true); setError(""); setSuccess("");
    try {
      await repository.reviewClaim(clubId, confirmation.request.claimId, confirmation.decision, uid);
      if (current !== version.current) return;
      setSuccess(confirmation.decision === "APPROVED" ? "Request approved. The staff member can now open the club workspace." : "Request rejected. The invitation has been revoked.");
      await refresh();
    } catch (cause) { if (current === version.current) { setError(onboardingErrorMessage(cause)); setConfirmation(null); } }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="pending-staff-title" className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="pending-staff-title" className="text-xl font-black text-slate-900">Pending staff requests</h2><p className="mt-1 text-sm text-slate-500">Review invitations for this club.</p></div>
      <button className={secondaryClass} disabled={loading || busy} onClick={() => void refresh()}>Refresh requests</button>
    </div>
    {success && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {loading ? <p role="status" className="py-10 text-center text-slate-500">Loading staff requests…</p> : !error && requests.length === 0 ?
      <EmptyState icon={Users} title="You’re all caught up" description="New staff requests for this club will appear here." /> :
      requests.map((request) => <article key={request.claimId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><ClaimantDetails request={request} />
            <h3 className="mt-3 font-bold text-slate-900">{staffRoleLabels[request.claim.staffRole]}</h3>
            <p className="mt-1 text-sm text-slate-600">Invitation ending {request.claim.inviteCode.slice(-6)}</p>
            <p className="mt-2 text-xs text-slate-500">Requested {request.claim.createdAt.toDate().toLocaleString()}</p></div>
          <StatusBadge status="PENDING" />
        </div>
        {!isClaimantIdentity(request.claim.claimantIdentity) && <p className="mt-3 text-sm text-amber-800">Approval and rejection are unavailable until the claimant’s identity can be verified. Contact your club.</p>}
        <p className="mt-4 text-xs font-bold text-slate-500">Invitation: {request.invite ? visibleInviteStatus(request.invite) : "Unavailable — refresh to retry"}</p>
        {confirmation?.request.claimId === request.claimId ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" role="group" aria-label="Confirm staff decision">
          <h4 className="font-bold text-slate-900">{confirmation.decision === "APPROVED" ? "Approve this staff request?" : "Reject this staff request?"}</h4>
          <div className="mt-3"><ClaimantDetails request={request} /></div>
          <p className="mt-2 break-words text-sm font-bold text-slate-800">{staffRoleLabels[request.claim.staffRole]} · {clubName}</p>
          <p className="mt-2 text-sm text-slate-700">{confirmation.decision === "APPROVED" ? "This grants club membership and the invited staff role." : "The invitation will be revoked. Joining later requires a new invitation."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button autoFocus className={confirmation.decision === "APPROVED" ? buttonClass : "rounded-xl bg-rose-700 px-5 py-3 font-bold text-white disabled:opacity-50"} disabled={busy || !isClaimantIdentity(request.claim.claimantIdentity)} onClick={() => void confirm()}>{busy ? "Saving…" : confirmation.decision === "APPROVED" ? "Confirm approval" : "Confirm rejection"}</button>
            <button className={secondaryClass} disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
          </div>
        </div> : <div className="mt-5 flex flex-wrap gap-3">
          <button className={buttonClass} disabled={busy || loading || !isClaimantIdentity(request.claim.claimantIdentity) || !request.invite || visibleInviteStatus(request.invite) !== "ACTIVE"}
            onClick={() => setConfirmation({ request, decision: "APPROVED" })}>Approve</button>
          <button className={`${secondaryClass} text-rose-700`} disabled={busy || loading || !isClaimantIdentity(request.claim.claimantIdentity) || request.invite?.status !== "ACTIVE"}
            onClick={() => setConfirmation({ request, decision: "REJECTED" })}>Reject</button>
        </div>}
      </article>)}
  </section>;
}
