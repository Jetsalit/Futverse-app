import { useEffect, useState } from "react";
import { ArrowLeft, Shield, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganizationRuntime } from "../../contexts/OrganizationRuntimeContext";
import { isOrganizationRuntimeAuthorized } from "../../lib/organizationRuntimeSelection";
import { isValidDocumentIdentifier } from "../../lib/proClubModel";
import { onboardingErrorMessage, staffRoleLabels } from "../../lib/proClubOnboarding";
import { isProClubReviewer, proClubOnboardingRepository as repository } from "../../lib/firestore/proClubOnboardingRepository";
import type { ProClubOrganizationAuthority } from "../../lib/firestore/proClubOrganizationAdapter";
import StaffOnboarding, { buttonClass, inputClass, secondaryClass, StatusBadge } from "./StaffOnboarding";
import PendingStaffRequests from "./PendingStaffRequests";

function ClubWorkspace({ clubId, uid }: { clubId: string; uid: string }) {
  const [authority, setAuthority] = useState<ProClubOrganizationAuthority | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void repository.loadWorkspace(clubId, uid).then((result) => { if (mounted) setAuthority(result); })
      .catch((cause) => { if (mounted) setError(onboardingErrorMessage(cause)); });
    return () => { mounted = false; };
  }, [clubId, uid]);
  if (error) return <p role="alert" className="rounded-xl bg-rose-50 p-5 text-rose-800">{error}</p>;
  if (!authority) return <p role="status" className="py-12 text-center text-slate-600">Loading your club…</p>;
  return <div className="space-y-8">
    <section className="rounded-3xl bg-slate-900 p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Pro Club workspace</p><StatusBadge status="ACTIVE" /></div>
      <h2 className="mt-4 text-3xl font-black">{authority.organizationName}</h2>
      <div className="mt-5 flex flex-wrap gap-3 text-sm"><span className="rounded-lg bg-white/10 px-3 py-2">{authority.membershipAuthorizationRole}</span>
        {authority.staffRole && <span className="rounded-lg bg-white/10 px-3 py-2">{staffRoleLabels[authority.staffRole]}</span>}</div>
      <p className="mt-5 text-sm text-slate-300">Your club membership is active.</p>
    </section>
    {isProClubReviewer(authority) ? <PendingStaffRequests clubId={clubId} clubName={authority.organizationName} uid={uid} /> :
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><Users className="text-emerald-600" /><h3 className="mt-3 text-lg font-bold">Welcome to your club</h3><p className="mt-2 text-sm text-slate-600">You have joined the club as {authority.staffRole ? staffRoleLabels[authority.staffRole].toLowerCase() : "a member"}.</p></section>}
  </div>;
}

export default function ProClubPortal({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const { actualUser, currentUser } = useAuth();
  const { runtimeState, selectProClub } = useOrganizationRuntime();
  const [tab, setTab] = useState<"join" | "workspace">("join");
  const [clubReference, setClubReference] = useState("");
  const [inputError, setInputError] = useState("");
  const uid = actualUser?.uid;
  const allowed = uid && currentUser?.uid === uid && !currentUser.supportPresentation;
  const authorized = allowed && runtimeState.uid === uid && isOrganizationRuntimeAuthorized(runtimeState) && runtimeState.selection?.organizationType === "PRO_CLUB";
  function openClub(clubId: string) {
    if (!isValidDocumentIdentifier(clubId)) { setInputError("Enter the club workspace reference provided by your club."); return; }
    setInputError(""); setTab("workspace"); setClubReference(clubId);
    selectProClub(clubId); // Also refreshes the same selection through the existing authority bridge.
  }
  if (!allowed) return <p role="alert">Sign in with your own account to open Pro Club onboarding.</p>;
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <button className="inline-flex items-center gap-2 text-sm font-bold text-slate-600" onClick={onBack}><ArrowLeft size={18} /> Back to FutVerse</button>
      <div className="flex items-center gap-2 font-black"><Shield size={20} className="text-emerald-600" /> Pro Club</div>
      <button className="text-sm font-bold text-slate-600" onClick={onLogout}>Sign out</button>
    </div></header>
    <main className="mx-auto max-w-5xl space-y-7 px-4 py-7 sm:px-6 sm:py-10">
      <div><h1 className="text-3xl font-black tracking-tight">Your club starts here</h1><p className="mt-2 text-slate-500">Join your team or open your club workspace.</p></div>
      <nav aria-label="Pro Club sections" className="flex flex-wrap gap-2">
        <button className={tab === "join" ? buttonClass : secondaryClass} aria-current={tab === "join" ? "page" : undefined} onClick={() => setTab("join")}>Staff onboarding</button>
        <button className={tab === "workspace" ? buttonClass : secondaryClass} aria-current={tab === "workspace" ? "page" : undefined} onClick={() => setTab("workspace")}>Club workspace</button>
      </nav>
      {tab === "join" ? <StaffOnboarding key={uid} uid={uid} onOpenClub={openClub} /> : <div className="space-y-7">
        <form className="rounded-2xl border border-slate-200 bg-white p-5" onSubmit={(event) => { event.preventDefault(); openClub(clubReference.trim()); }}>
          <label htmlFor="club-workspace-reference" className="block text-sm font-bold">Club workspace reference</label>
          <p className="mt-1 text-sm text-slate-500">Use the reference provided by your club administrator. Access is checked when you open it.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input id="club-workspace-reference" className={inputClass} value={clubReference} maxLength={200} onChange={(event) => setClubReference(event.target.value)} required autoComplete="off" />
            <button className={`${buttonClass} shrink-0`} disabled={runtimeState.status === "RESOLVING"}>Open workspace</button></div>
        </form>
        {inputError && <p role="alert" className="text-rose-700">{inputError}</p>}
        {runtimeState.status === "RESOLVING" && <p role="status" className="py-8 text-center text-slate-500">Checking club access…</p>}
        {(runtimeState.status === "ERROR" || runtimeState.status === "REJECTED") && <p role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">This club workspace is unavailable for your account. Check the reference and your membership, then try again.</p>}
        {authorized && <ClubWorkspace key={`${uid}:${runtimeState.generation}`} uid={uid} clubId={runtimeState.selection!.organizationId} />}
      </div>}
    </main>
  </div>;
}
