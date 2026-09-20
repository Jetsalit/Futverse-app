import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Shield, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useOrganizationRuntime } from "../../contexts/OrganizationRuntimeContext";
import { isOrganizationRuntimeAuthorized } from "../../lib/organizationRuntimeSelection";
import { isValidDocumentIdentifier } from "../../lib/proClubModel";
import {
  clearProClubWorkspaceSession,
  readProClubWorkspaceSession,
  rememberProClubWorkspaceSession,
} from "../../lib/proClubWorkspaceSession";
import { staffRoleLabels } from "../../lib/proClubOnboarding";
import { loadOwnProClubMembershipDiscoveries } from "../../lib/firestore/proClubMembershipDiscoveryRepository";
import { isProClubReviewer, proClubOnboardingRepository as repository } from "../../lib/firestore/proClubOnboardingRepository";
import type { ProClubOrganizationAuthority } from "../../lib/firestore/proClubOrganizationAdapter";
import StaffOnboarding, { buttonClass, inputClass, secondaryClass } from "./StaffOnboarding";
import PendingStaffRequests from "./PendingStaffRequests";
import ProClubTeamDashboard from "./operations/ProClubTeamDashboard";

type ProClubDiscoveryState = "DISCOVERING" | "OPENING" | "COMPLETE";

type ProClubMobileEntryStage =
  | "DISCOVERY"
  | "CLUB"
  | "MEMBERSHIP"
  | "STAFF_ROLE";

interface ProClubMobileEntryMeasurement {
  readonly stage: ProClubMobileEntryStage;
  readonly durationMs: number;
}

const SLOW_ENTRY_THRESHOLD_MS = 4_000;

function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function ClubWorkspace({
  authority,
  onBack,
  onLogout,
}: {
  authority: Readonly<ProClubOrganizationAuthority>;
  onBack: () => void;
  onLogout: () => void;
}) {
  const clubId = authority.organizationId;
  const uid = authority.userId;

  return (
    <ProClubTeamDashboard
      authority={authority}
      onBack={onBack}
      onLogout={onLogout}
      overviewSupplement={
        isProClubReviewer(authority) ? (
          <PendingStaffRequests
            clubId={clubId}
            clubName={authority.organizationName}
            uid={uid}
          />
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <Users className="text-emerald-600" />
            <h3 className="mt-3 text-lg font-bold">Welcome to your club</h3>
            <p className="mt-2 text-sm text-slate-600">
              You have joined the club as {authority.staffRole ? staffRoleLabels[authority.staffRole].toLowerCase() : "a member"}.
            </p>
          </section>
        )
      }
    />
  );
}

export default function ProClubPortal({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  const { actualUser, currentUser } = useAuth();
  const {
    runtimeState,
    selectProClub,
    proClubAuthority,
    proClubEntryProgress,
  } = useOrganizationRuntime();
  // The provider survives navigation. A previous entry's verified authority
  // cannot open this entry while discovery or restored selection is pending.
  const [entryGeneration] = useState(runtimeState.generation);
  const [restoredClubReference] = useState(() => readProClubWorkspaceSession());
  const [tab, setTab] = useState<"join" | "workspace">(restoredClubReference ? "workspace" : "join");
  const [clubReference, setClubReference] = useState(restoredClubReference ?? "");
  const [inputError, setInputError] = useState("");
  const [shouldDiscover, setShouldDiscover] = useState(!restoredClubReference);
  const [discoveryState, setDiscoveryState] = useState<ProClubDiscoveryState>(restoredClubReference ? "OPENING" : "DISCOVERING");
  const [discoveredAuthorities, setDiscoveredAuthorities] = useState<ProClubOrganizationAuthority[]>([]);
  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const [measurements, setMeasurements] = useState<ProClubMobileEntryMeasurement[]>([]);
  const [isTakingLonger, setIsTakingLonger] = useState(false);
  const discoveryStarted = useRef(false);
  const uid = actualUser?.uid;
  const allowed = uid && currentUser?.uid === uid && !currentUser.supportPresentation;
  const pendingStage: ProClubMobileEntryStage | null =
    discoveryState === "DISCOVERING"
      ? "DISCOVERY"
      : runtimeState.status === "RESOLVING"
        ? proClubEntryProgress.stage
        : null;
  const authorized = allowed && runtimeState.generation > entryGeneration && runtimeState.uid === uid && isOrganizationRuntimeAuthorized(runtimeState) && runtimeState.selection?.organizationType === "PRO_CLUB" &&
    proClubAuthority?.hasMembershipAuthority === true && proClubAuthority.userId === uid &&
    proClubAuthority.organizationType === "PRO_CLUB" && proClubAuthority.organizationId === runtimeState.selection.organizationId;

  useEffect(() => {
    if (!uid || !restoredClubReference) return;
    selectProClub(restoredClubReference);
  }, [restoredClubReference, selectProClub, uid]);

  useEffect(() => {
    if (!uid || !restoredClubReference || shouldDiscover) return;
    if (
      runtimeState.uid !== uid ||
      runtimeState.selection?.organizationType !== "PRO_CLUB" ||
      runtimeState.selection.organizationId !== restoredClubReference
    ) return;

    if (runtimeState.status === "REJECTED" || runtimeState.status === "ERROR") {
      clearProClubWorkspaceSession();
      setClubReference("");
      setTab("join");
      setDiscoveryState("DISCOVERING");
      setShouldDiscover(true);
    }
  }, [restoredClubReference, runtimeState, shouldDiscover, uid]);

  useEffect(() => {
    if (!allowed || !uid || !shouldDiscover || discoveryStarted.current) return;
    discoveryStarted.current = true;
    setDiscoveryState("DISCOVERING");
    setIsTakingLonger(false);
    const startedAt = monotonicNow();
    let mounted = true;

    void loadOwnProClubMembershipDiscoveries(uid)
      .then(async (discoveries) => {
        if (mounted) {
          setMeasurements((current) => [
            ...current.filter(({ stage }) => stage !== "DISCOVERY"),
            { stage: "DISCOVERY", durationMs: Math.max(0, monotonicNow() - startedAt) },
          ]);
        }
        if (!mounted) return;
        if (discoveries.length === 1) {
          const clubId = discoveries[0].clubId;
          setClubReference(clubId);
          setTab("workspace");
          setDiscoveryState("OPENING");
          selectProClub(clubId);
          return;
        }
        const candidates = await Promise.all(
          discoveries.map(async ({ clubId }) => {
            try {
              return await repository.loadWorkspace(clubId, uid);
            } catch {
              return null;
            }
          }),
        );

        if (!mounted) return;
        const validAuthorities = candidates.filter(
          (candidate): candidate is ProClubOrganizationAuthority => candidate !== null,
        );
        setDiscoveredAuthorities(validAuthorities);

        if (validAuthorities.length === 1) {
          const clubId = validAuthorities[0].organizationId;
          setClubReference(clubId);
          setTab("workspace");
          setDiscoveryState("OPENING");
          selectProClub(clubId);
        } else {
          if (validAuthorities.length > 1) setTab("workspace");
          setDiscoveryState("COMPLETE");
        }
      })
      .catch(() => {
        if (mounted) {
          setDiscoveredAuthorities([]);
          setDiscoveryState("COMPLETE");
        }
      });

    return () => {
      mounted = false;
      discoveryStarted.current = false;
    };
  }, [allowed, discoveryAttempt, selectProClub, shouldDiscover, uid]);

  useEffect(() => {
    if (discoveryState !== "OPENING") return;
    if (runtimeState.status === "REJECTED" || runtimeState.status === "ERROR") {
      setDiscoveryState("COMPLETE");
    }
  }, [discoveryState, runtimeState.status]);

  useEffect(() => {
    if (!authorized || runtimeState.selection?.organizationType !== "PRO_CLUB") return;
    rememberProClubWorkspaceSession(runtimeState.selection.organizationId);
  }, [authorized, runtimeState.selection]);

  function retryCurrentEntry() {
    setIsTakingLonger(false);

    if (discoveryState === "DISCOVERING") {
      discoveryStarted.current = false;
      setMeasurements((current) => current.filter(({ stage }) => stage !== "DISCOVERY"));
      setDiscoveryAttempt((current) => current + 1);
      return;
    }

    const targetClubId =
      runtimeState.selection?.organizationType === "PRO_CLUB"
        ? runtimeState.selection.organizationId
        : clubReference.trim();

    if (isValidDocumentIdentifier(targetClubId)) {
      selectProClub(targetClubId);
    }
  }

  useEffect(() => {
    if (pendingStage === null) {
      setIsTakingLonger(false);
      return;
    }

    setIsTakingLonger(false);
    const timer = globalThis.setTimeout(() => {
      setIsTakingLonger(true);
    }, SLOW_ENTRY_THRESHOLD_MS);

    return () => globalThis.clearTimeout(timer);
  }, [pendingStage, discoveryAttempt, runtimeState.generation]);

  useEffect(() => {
    const durations = proClubEntryProgress.completedDurationsMs;
    setMeasurements((current) => {
      const retained = current.filter(({ stage }) => stage === "DISCOVERY");
      for (const stage of ["CLUB", "MEMBERSHIP", "STAFF_ROLE"] as const) {
        const durationMs = durations[stage];
        if (typeof durationMs === "number") retained.push({ stage, durationMs });
      }
      return retained;
    });
  }, [proClubEntryProgress.completedDurationsMs]);

  function openClub(clubId: string) {
    if (!isValidDocumentIdentifier(clubId)) { setInputError("Enter the club workspace reference provided by your club."); return; }
    setDiscoveryState("COMPLETE");
    setInputError(""); setTab("workspace"); setClubReference(clubId);
    selectProClub(clubId); // Also refreshes the same selection through the existing authority bridge.
  }

  function openStaffOnboarding() {
    clearProClubWorkspaceSession();
    setDiscoveryState("COMPLETE");
    setInputError("");
    setTab("join");
  }

  function leaveProClub() {
    clearProClubWorkspaceSession();
    onBack();
  }

  function signOut() {
    clearProClubWorkspaceSession();
    onLogout();
  }

  if (!allowed) return <p role="alert">Sign in with your own account to open Pro Club onboarding.</p>;

  return authorized ? (
    <ClubWorkspace
      key={`${uid}:${runtimeState.generation}`}
      authority={proClubAuthority}
      onBack={leaveProClub}
      onLogout={signOut}
    />
  ) : (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex w-full max-w-none flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <button className="inline-flex items-center gap-2 text-sm font-bold text-slate-600" onClick={leaveProClub}><ArrowLeft size={18} /> Back to FutVerse</button>
        <div className="flex items-center gap-2 font-black"><Shield size={20} className="text-emerald-600" /> Pro Club</div>
        <button className="text-sm font-bold text-slate-600" onClick={signOut}>Sign out</button>
      </div></header>
      <main className="mx-auto w-full max-w-none space-y-7 px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        {discoveryState !== "COMPLETE" ? (
          <section className="rounded-3xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
            <Shield className="mx-auto text-emerald-600" size={28} />
            <h1 className="mt-4 text-2xl font-black">Opening your club…</h1>
            <p role="status" className="mt-2 text-sm text-slate-500">
              {pendingStage === "DISCOVERY"
                ? "Finding your Pro Club membership."
                : pendingStage === "CLUB"
                  ? "Reading the club workspace."
                  : pendingStage === "MEMBERSHIP"
                    ? "Checking your membership."
                    : pendingStage === "STAFF_ROLE"
                      ? "Checking your football role."
                      : "Checking your active Pro Club membership and workspace authority."}
            </p>
            {isTakingLonger && (
              <div className="mx-auto mt-5 max-w-md rounded-2xl bg-amber-50 p-4 text-amber-950">
                <p className="font-bold">This is taking longer than usual.</p>
                <p className="mt-1 text-sm">You will not enter the club until the current account and club authority checks succeed.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  <button type="button" className={buttonClass} onClick={retryCurrentEntry}>Try again</button>
                  <button type="button" className={secondaryClass} onClick={leaveProClub}>Back</button>
                </div>
              </div>
            )}
            <span className="sr-only" aria-hidden="true">
              {measurements.map(({ stage, durationMs }) => `${stage}:${Math.round(durationMs)}ms`).join(" ")}
            </span>
          </section>
        ) : (
          <>
            <div><h1 className="text-3xl font-black tracking-tight">Your club starts here</h1><p className="mt-2 text-slate-500">Join your team or open your club workspace.</p></div>
            <nav aria-label="Pro Club sections" className="flex flex-wrap gap-2">
              <button className={tab === "join" ? buttonClass : secondaryClass} aria-current={tab === "join" ? "page" : undefined} onClick={openStaffOnboarding}>Staff onboarding</button>
              <button className={tab === "workspace" ? buttonClass : secondaryClass} aria-current={tab === "workspace" ? "page" : undefined} onClick={() => setTab("workspace")}>Club workspace</button>
            </nav>
            {tab === "join" ? <StaffOnboarding key={uid} uid={uid} onOpenClub={openClub} /> : <div className="space-y-7">
              {runtimeState.status === "RESOLVING" ? (
                <section className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center">
                  <p role="status" className="text-slate-600">
                    {pendingStage === "CLUB"
                      ? "Reading the club workspace."
                      : pendingStage === "MEMBERSHIP"
                        ? "Checking your membership."
                        : pendingStage === "STAFF_ROLE"
                          ? "Checking your football role."
                          : "Opening your club…"}
                  </p>
                  {isTakingLonger && (
                    <div className="mx-auto mt-5 max-w-md rounded-2xl bg-amber-50 p-4 text-amber-950">
                      <p className="font-bold">This is taking longer than usual.</p>
                      <p className="mt-1 text-sm">You will not enter the club until the current account and club authority checks succeed.</p>
                      <div className="mt-4 flex flex-wrap justify-center gap-3">
                        <button type="button" className={buttonClass} onClick={retryCurrentEntry}>Try again</button>
                        <button type="button" className={secondaryClass} onClick={leaveProClub}>Back</button>
                      </div>
                    </div>
                  )}
                </section>
              ) : discoveredAuthorities.length > 1 ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-lg font-black">Choose your club</h2>
                  <p className="mt-1 text-sm text-slate-500">Select the team workspace you want to open.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {discoveredAuthorities.map((authority) => (
                      <button
                        key={authority.organizationId}
                        type="button"
                        className={`${secondaryClass} justify-start text-left`}
                        onClick={() => openClub(authority.organizationId)}
                      >
                        {authority.organizationName}
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <form className="rounded-2xl border border-slate-200 bg-white p-5" onSubmit={(event) => { event.preventDefault(); openClub(clubReference.trim()); }}>
                  <label htmlFor="club-workspace-reference" className="block text-sm font-bold">Club workspace reference</label>
                  <p className="mt-1 text-sm text-slate-500">Use the reference provided by your club administrator. Access is checked when you open it.</p>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row"><input id="club-workspace-reference" className={inputClass} value={clubReference} maxLength={200} onChange={(event) => setClubReference(event.target.value)} required autoComplete="off" />
                    <button className={`${buttonClass} shrink-0`}>Open workspace</button></div>
                </form>
              )}
              {inputError && <p role="alert" className="text-rose-700">{inputError}</p>}
              {discoveredAuthorities.length <= 1 && (runtimeState.status === "ERROR" || runtimeState.status === "REJECTED") && <p role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">This club workspace is unavailable for your account. Check the reference and your membership, then try again.</p>}
            </div>}
          </>
        )}
      </main>
    </div>
  );
}
