import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, UserCheck, UserPlus, Users, X } from "lucide-react";
import { EmptyState } from "../common/EmptyState";
import { proClubOnboardingRepository, type PendingStaffRequest } from "../../lib/firestore/proClubOnboardingRepository";
import { isClaimantIdentity, onboardingErrorMessage, staffRoleLabels, visibleInviteStatus, type ProClubInvite, type ResolvedStaffCandidate } from "../../lib/proClubOnboarding";
import type { ProClubStaffRole } from "../../types/ProClub";
import { buttonClass, inputClass, secondaryClass, StatusBadge } from "./StaffOnboarding";

function ClaimantDetails({ request }: { request: PendingStaffRequest }) {
  const identity = request.claim.claimantIdentity;
  if (!isClaimantIdentity(identity)) return <p className="font-bold text-amber-800">Identity unavailable</p>;
  return <div className="space-y-1 break-words">
    {identity.displayName && <p className="font-bold text-slate-900">{identity.displayName}</p>}
    {identity.email && <p className="text-sm text-slate-700">{identity.email}</p>}
    <p className="text-xs text-slate-500">Account reference: {request.claim.userId}</p>
  </div>;
}

function IssueInviteForm({
  clubId,
  clubName,
  uid,
  onClose,
  onIssued,
}: {
  clubId: string;
  clubName: string;
  uid: string;
  onClose: () => void;
  onIssued: (invite: ProClubInvite) => void;
}) {
  const [email, setEmail] = useState("");
  const [candidate, setCandidate] = useState<ResolvedStaffCandidate | null>(null);
  const [staffRole, setStaffRole] = useState<ProClubStaffRole>("STAFF");
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const repository = proClubOnboardingRepository;

  // Clear candidate state if clubId or uid changes
  useEffect(() => {
    setCandidate(null);
    setEmail("");
    setError("");
  }, [clubId, uid]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid staff email address.");
      return;
    }
    setVerifying(true);
    try {
      const resolved = await repository.resolveCandidate(clubId, cleanEmail, uid);
      setCandidate(resolved);
    } catch (cause) {
      setCandidate(null);
      setError(onboardingErrorMessage(cause));
    } finally {
      setVerifying(false);
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate || candidate.email.toLowerCase() !== email.trim().toLowerCase()) {
      setError("Please verify the staff account before issuing an invitation.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const invite = await repository.issueInvitation(
        { clubId, targetUid: candidate.targetUid, staffRole },
        uid,
      );
      setCandidate(null);
      setEmail("");
      onIssued(invite);
    } catch (cause) {
      setError(onboardingErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">Invite new staff member</h3>
        <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Close form">
          <X size={20} />
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Find and invite an existing FutVerse account for <strong>{clubName}</strong> using their registered email.
      </p>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {!candidate ? (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label htmlFor="staff-email" className="block text-sm font-bold text-slate-700">
              Staff email address
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Enter the exact email registered to the candidate's FutVerse account.
            </p>
            <input
              id="staff-email"
              type="email"
              className={`${inputClass} mt-1`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setCandidate(null);
                setError("");
              }}
              placeholder="e.g. coach@example.com"
              maxLength={254}
              required
              autoComplete="off"
              disabled={verifying}
            />
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" className={buttonClass} disabled={verifying}>
              {verifying ? "Verifying account…" : "Verify account"}
            </button>
            <button type="button" className={secondaryClass} onClick={onClose} disabled={verifying}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleCreateInvite} className="space-y-4">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <UserCheck size={18} className="text-emerald-600" />
              <span>Verified FutVerse account</span>
            </div>
            {candidate.displayName && (
              <p className="text-sm text-slate-700">
                <span className="font-semibold text-slate-500 text-xs block uppercase tracking-wider">Name</span>
                {candidate.displayName}
              </p>
            )}
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-500 text-xs block uppercase tracking-wider">Email</span>
              {candidate.email}
            </p>
            <button
              type="button"
              className="text-xs text-emerald-700 hover:text-emerald-900 underline font-medium pt-1"
              onClick={() => {
                setCandidate(null);
                setError("");
              }}
            >
              Change email
            </button>
          </div>

          <div>
            <label htmlFor="staff-role-select" className="block text-sm font-bold text-slate-700">
              Staff role
            </label>
            <select
              id="staff-role-select"
              className={`${inputClass} mt-1`}
              value={staffRole}
              onChange={(e) => setStaffRole(e.target.value as ProClubStaffRole)}
              disabled={submitting}
            >
              {(Object.keys(staffRoleLabels) as ProClubStaffRole[]).map((role) => (
                <option key={role} value={role}>
                  {staffRoleLabels[role]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="submit" className={buttonClass} disabled={submitting}>
              {submitting ? "Generating invitation…" : "Create invitation"}
            </button>
            <button
              type="button"
              className={secondaryClass}
              onClick={() => {
                setCandidate(null);
                setError("");
              }}
              disabled={submitting}
            >
              Back
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function PendingStaffRequests({ clubId, clubName, uid }: { clubId: string; clubName: string; uid: string }) {
  const repository = proClubOnboardingRepository;
  const [requests, setRequests] = useState<PendingStaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{ request: PendingStaffRequest; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [issuedInvite, setIssuedInvite] = useState<ProClubInvite | null>(null);
  const [copied, setCopied] = useState(false);
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

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

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
      <div><h2 id="pending-staff-title" className="text-xl font-black text-slate-900">Pending staff requests</h2><p className="mt-1 text-sm text-slate-500">Review invitations and manage onboarding for this club.</p></div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={loading || busy} onClick={() => { setIsInviting(true); setIssuedInvite(null); }}>
          <UserPlus size={16} className="inline mr-1.5" /> Invite staff
        </button>
        <button className={secondaryClass} disabled={loading || busy} onClick={() => void refresh()}>Refresh</button>
      </div>
    </div>

    {isInviting && (
      <IssueInviteForm
        clubId={clubId}
        clubName={clubName}
        uid={uid}
        onClose={() => setIsInviting(false)}
        onIssued={(invite) => {
          setIsInviting(false);
          setIssuedInvite(invite);
        }}
      />
    )}

    {issuedInvite && (
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm space-y-3" role="status">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-emerald-900">Invitation created successfully</h3>
          <button className="text-emerald-700 hover:text-emerald-900" onClick={() => setIssuedInvite(null)} aria-label="Dismiss banner">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-emerald-800">
          Invitation code for <strong>{staffRoleLabels[issuedInvite.staffRole]}</strong>:
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-xl bg-slate-900 px-4 py-2 font-mono text-base font-bold text-emerald-400">
            {issuedInvite.inviteCode}
          </code>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-white px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
            onClick={() => void copyCode(issuedInvite.inviteCode)}
          >
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            {copied ? "Copied!" : "Copy code"}
          </button>
        </div>
        <p className="text-xs text-emerald-700">
          Share this invitation code with the staff member. They will enter it under <strong>Staff onboarding</strong> to submit their claim for your approval.
        </p>
      </div>
    )}

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
