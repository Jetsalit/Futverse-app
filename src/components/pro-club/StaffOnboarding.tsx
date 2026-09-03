import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { proClubOnboardingRepository as repository, type InvitationInspection } from "../../lib/firestore/proClubOnboardingRepository";
import { onboardingErrorMessage, staffRoleLabels, visibleInviteStatus } from "../../lib/proClubOnboarding";

export const buttonClass = "rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";
export const secondaryClass = "rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const inputClass = "w-full min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

export function StatusBadge({ status }: { status: string }) {
  const color = status === "ACTIVE" || status === "APPROVED" ? "bg-emerald-50 text-emerald-700" :
    status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${color}`}>{status}</span>;
}

export default function StaffOnboarding({ uid, onOpenClub }: { uid: string; onOpenClub: (clubId: string) => void }) {
  const [code, setCode] = useState("");
  const [inspection, setInspection] = useState<InvitationInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const requestVersion = useRef(0);
  useEffect(() => () => { ++requestVersion.current; }, []);
  useEffect(() => {
    if (!inspection || inspection.invite.status !== "ACTIVE") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [inspection]);

  async function inspect(rawCode: string) {
    const version = ++requestVersion.current;
    setBusy(true); setError(""); setInspection(null);
    try {
      const result = await repository.inspectInvitation(rawCode, uid);
      if (version === requestVersion.current) { setInspection(result); setNow(Date.now()); }
    } catch (cause) { if (version === requestVersion.current) setError(onboardingErrorMessage(cause)); }
    finally { if (version === requestVersion.current) setBusy(false); }
  }
  async function submit() {
    if (!inspection || busy) return;
    const version = ++requestVersion.current;
    setBusy(true); setError("");
    try {
      const claim = await repository.requestMembership(inspection.invite.inviteCode, uid);
      if (version === requestVersion.current) setInspection((current) => current ? { ...current, claim } : null);
    } catch (cause) { if (version === requestVersion.current) setError(onboardingErrorMessage(cause)); }
    finally { if (version === requestVersion.current) setBusy(false); }
  }
  const inviteStatus = inspection ? visibleInviteStatus(inspection.invite, now) : null;
  const isRecipient = inspection?.invite.targetUid === uid;
  const claimStatus = inspection?.claim?.status;
  const canEnter = claimStatus === "APPROVED" || inspection?.membershipExists;
  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="staff-onboarding-title">
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Your next chapter</p>
      <h2 id="staff-onboarding-title" className="mt-2 text-2xl font-black text-slate-900">Join a Pro Club</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Use the invitation from your club. After you request to join, a club owner or administrator will review it.</p>
      <form className="mt-7 space-y-4" onSubmit={(event) => { event.preventDefault(); void inspect(code); }}>
        <label htmlFor="pro-club-invite" className="block text-sm font-bold text-slate-800">Invitation code</label>
        <input id="pro-club-invite" className={`${inputClass} font-mono text-sm`} value={code} maxLength={55}
          autoComplete="off" spellCheck={false} placeholder="FUT-PC-…" required disabled={busy}
          onChange={(event) => { setCode(event.target.value); setInspection(null); setError(""); }} />
        <button className={`${buttonClass} w-full sm:w-auto`} disabled={busy} type="submit">{busy ? "Checking…" : "Check invitation"}</button>
      </form>
      {error && <p role="alert" className="mt-5 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {inspection && <div className="mt-7 border-t border-slate-100 pt-6" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-slate-900">Pro Club staff invitation</h3><StatusBadge status={inviteStatus!} />
        </div>
        <p className="mt-3 text-lg font-bold text-slate-800">{staffRoleLabels[inspection.invite.staffRole]}</p>
        <p className="mt-1 text-sm text-slate-500">Club details become available when your membership is active.</p>
        {!isRecipient && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This invitation is for another account. Only the invited person can request to join.</p>}
        {claimStatus && <div className="mt-5 rounded-2xl bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            {claimStatus === "PENDING" ? <Clock size={22} className="text-amber-600" /> : <CheckCircle2 size={22} className="text-slate-600" />}
            <h3 className="font-bold">{claimStatus === "PENDING" ? "Request sent — awaiting review" : claimStatus === "APPROVED" ? "You’re approved" : "Request rejected"}</h3>
          </div>
          <div className="mt-3"><StatusBadge status={claimStatus} /></div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{claimStatus === "PENDING" ? "Your request is already with the club. Refresh here to check for a decision." :
            claimStatus === "APPROVED" ? "Your club membership is ready. Open your workspace to continue." : "Contact your club if you would like a new invitation."}</p>
        </div>}
        {!claimStatus && inviteStatus !== "ACTIVE" && <p className="mt-4 text-sm text-slate-600">{inviteStatus === "EXPIRED" ? "This invitation has expired. Ask your club for a new code." :
          inviteStatus === "REVOKED" ? "This invitation was revoked. Contact your club." : "This invitation has already been used."}</p>}
        {inspection.membershipExists && !claimStatus && <p className="mt-4 text-sm text-slate-600">A membership already exists for your account. Open the workspace to check access.</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          {isRecipient && inviteStatus === "ACTIVE" && !claimStatus && !inspection.membershipExists &&
            <button className={`${buttonClass} inline-flex items-center gap-2`} disabled={busy} onClick={() => void submit()}>Confirm request to join <ArrowRight size={18} /></button>}
          {canEnter && <button className={buttonClass} disabled={busy} onClick={() => onOpenClub(inspection.invite.clubId)}>Open club workspace</button>}
          <button className={`${secondaryClass} inline-flex items-center gap-2`} disabled={busy} onClick={() => void inspect(inspection.invite.inviteCode)}><RefreshCw size={16} /> Refresh status</button>
        </div>
      </div>}
    </section>
  );
}
