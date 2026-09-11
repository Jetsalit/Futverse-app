import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSuperAdminSupport } from "../../contexts/SuperAdminSupportContext";
import { isExactActiveSuperAdmin } from "../../lib/superAdminSupportModel";
import { isValidDocumentIdentifier } from "../../lib/proClubModel";
import type { ProClubStaffRole } from "../../types/ProClub";
import { OnboardingError } from "../../lib/proClubOnboarding";
import {
  proClubSuperAdminOnboardingControlRepository,
  type SuperAdminPendingStaffRequest,
} from "../../lib/firestore/proClubSuperAdminOnboardingControlRepository";

interface ProClubStaffOnboardingControlPlaneProps {
  onClose: () => void;
}

const STAFF_ROLES: Array<{ value: ProClubStaffRole; label: string }> = [
  { value: "TECHNICAL_DIRECTOR", label: "Technical Director" },
  { value: "MANAGER", label: "Manager" },
  { value: "HEAD_COACH", label: "Head Coach" },
  { value: "ASSISTANT_COACH", label: "Assistant Coach" },
  { value: "GK_COACH", label: "GK Coach" },
  { value: "FITNESS_COACH", label: "Fitness Coach" },
  { value: "ANALYST", label: "Analyst" },
  { value: "PHYSIO", label: "Physio" },
  { value: "TEAM_MANAGER", label: "Team Manager" },
  { value: "STAFF", label: "Staff" },
];

function presentOnboardingError(error: unknown): string {
  if (error instanceof OnboardingError) {
    const messages: Partial<Record<OnboardingError["code"], string>> = {
      AUTH_CHANGED: "Authenticated actor changed. Re-open the control plane and try again.",
      REVIEWER_REQUIRED: "An ACTIVE SuperAdmin account is required for this action.",
      TARGET_USER_NOT_FOUND: "Account Reference was not found or is not eligible for a staff invitation.",
      IDENTITY_UNAVAILABLE: "Claimant identity is unavailable. This request cannot be decided safely.",
      STALE_REQUEST: "This request changed or was already decided. Refresh the queue.",
      EXPIRED: "The invitation has expired. Create a new invitation instead.",
      CONSUMED: "The invitation has already been used.",
      REVOKED: "The invitation has been revoked.",
      INVALID_DATA: "The supplied identifiers or onboarding state are invalid.",
      UNAVAILABLE: "The required onboarding record is unavailable.",
      NETWORK: "The operation could not be verified. Check the connection and retry.",
    };
    return messages[error.code] ?? `Onboarding action failed (${error.code}).`;
  }
  return "The onboarding action could not be completed.";
}

function claimantLabel(item: SuperAdminPendingStaffRequest): string {
  const identity = item.claim.claimantIdentity;
  if (identity && typeof identity === "object" && "displayName" in identity) {
    const displayName = (identity as { displayName?: unknown }).displayName;
    if (typeof displayName === "string" && displayName.trim()) return displayName;
  }
  return item.claim.userId;
}

export default function ProClubStaffOnboardingControlPlane({
  onClose,
}: ProClubStaffOnboardingControlPlaneProps) {
  const { actualUser } = useAuth();
  const { isSupportActive } = useSuperAdminSupport();
  const actorUid = actualUser?.uid || actualUser?.id || "";
  const actorAuthorized = isExactActiveSuperAdmin(actualUser) && !isSupportActive;

  const [clubId, setClubId] = useState("");
  const [targetUid, setTargetUid] = useState("");
  const [staffRole, setStaffRole] = useState<ProClubStaffRole>("HEAD_COACH");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [pending, setPending] = useState<SuperAdminPendingStaffRequest[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [busy, setBusy] = useState<"invite" | "refresh" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const normalizedClubId = clubId.trim();
  const normalizedTargetUid = targetUid.trim();

  const canIssue = useMemo(
    () =>
      actorAuthorized &&
      isValidDocumentIdentifier(normalizedClubId) &&
      isValidDocumentIdentifier(normalizedTargetUid) &&
      busy === null,
    [actorAuthorized, normalizedClubId, normalizedTargetUid, busy],
  );

  const canRefresh =
    actorAuthorized &&
    isValidDocumentIdentifier(normalizedClubId) &&
    busy === null;

  const resetFeedback = () => {
    setError(null);
    setNotice(null);
  };

  const handleIssue = async () => {
    if (!canIssue) return;
    resetFeedback();
    setInviteCode(null);
    setBusy("invite");
    try {
      const invite = await proClubSuperAdminOnboardingControlRepository.issueInvitation(
        {
          clubId: normalizedClubId,
          targetUid: normalizedTargetUid,
          staffRole,
        },
        actorUid,
      );
      setInviteCode(invite.inviteCode);
      setNotice(`Invitation created for ${invite.targetUid} as ${invite.staffRole}.`);
    } catch (caught) {
      setError(presentOnboardingError(caught));
    } finally {
      setBusy(null);
    }
  };

  const handleRefresh = async () => {
    if (!canRefresh) return;
    resetFeedback();
    setBusy("refresh");
    try {
      const items = await proClubSuperAdminOnboardingControlRepository.loadPending(
        normalizedClubId,
        actorUid,
      );
      setPending(items);
      setQueueLoaded(true);
    } catch (caught) {
      setPending([]);
      setQueueLoaded(false);
      setError(presentOnboardingError(caught));
    } finally {
      setBusy(null);
    }
  };

  const handleDecision = async (
    item: SuperAdminPendingStaffRequest,
    decision: "APPROVED" | "REJECTED",
  ) => {
    if (!actorAuthorized || busy !== null) return;
    resetFeedback();
    const busyKey = `${decision}:${item.claimId}`;
    setBusy(busyKey);
    try {
      await proClubSuperAdminOnboardingControlRepository.reviewClaim(
        normalizedClubId,
        item.claimId,
        decision,
        actorUid,
      );
      setPending((current) => current.filter((candidate) => candidate.claimId !== item.claimId));
      setNotice(`${claimantLabel(item)} was ${decision === "APPROVED" ? "approved" : "rejected"}.`);
    } catch (caught) {
      setError(presentOnboardingError(caught));
    } finally {
      setBusy(null);
    }
  };

  const copyInvite = async () => {
    if (!inviteCode || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setNotice("Invitation code copied.");
    } catch {
      setError("Could not copy the invitation code. Copy it manually instead.");
    }
  };

  return (
    <div className="fixed inset-0 z-[85] bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-7">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
              <ShieldCheck size={16} />
              SuperAdmin control authority
            </div>
            <h1 className="text-xl font-black text-slate-950 sm:text-2xl">
              Pro Club Staff Onboarding
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Issue an exact Account Reference invitation, then review the claimant without becoming a member of the club.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close Pro Club staff onboarding control"
          >
            <X size={20} />
          </button>
        </header>

        {!actorAuthorized ? (
          <div className="flex flex-1 items-center justify-center p-6 sm:p-10">
            <div className="max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-950">
              <div className="flex items-center gap-2 font-black">
                <XCircle size={18} />
                Write authority unavailable
              </div>
              <p className="mt-2 text-sm leading-6">
                This control requires the actual authenticated ACTIVE SuperAdmin actor. Support/presentation mode never grants onboarding write authority.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[0.9fr_1.1fr] lg:p-7">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                Spark-native UID path
              </div>
              <h2 className="mt-1 text-lg font-black text-slate-900">Invite staff</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                No email directory lookup is performed. Enter the canonical Pro Club ID and exact FutVerse Account Reference / Firebase UID.
              </p>

              <div className="mt-5 grid gap-4">
                <label>
                  <span className="text-xs font-bold text-slate-600">Pro Club ID</span>
                  <input
                    value={clubId}
                    onChange={(event) => {
                      setClubId(event.target.value);
                      setPending([]);
                      setQueueLoaded(false);
                    }}
                    placeholder="canonical club document ID"
                    autoComplete="off"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <label>
                  <span className="text-xs font-bold text-slate-600">Account Reference / UID</span>
                  <input
                    value={targetUid}
                    onChange={(event) => setTargetUid(event.target.value)}
                    placeholder="exact registered account UID"
                    autoComplete="off"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>

                <label>
                  <span className="text-xs font-bold text-slate-600">Staff role</span>
                  <select
                    value={staffRole}
                    onChange={(event) => setStaffRole(event.target.value as ProClubStaffRole)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  >
                    {STAFF_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={handleIssue}
                disabled={!canIssue}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "invite" ? <Loader2 size={17} className="animate-spin" /> : <UserPlus size={17} />}
                Create staff invitation
              </button>

              {inviteCode && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-black text-emerald-900">
                    <CheckCircle2 size={17} /> Invitation ready
                  </div>
                  <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-800">
                    {inviteCode}
                  </code>
                  <button
                    type="button"
                    onClick={copyInvite}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-emerald-800"
                  >
                    <Clipboard size={14} /> Copy code
                  </button>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Membership authority is fixed to <strong>MEMBER</strong>. Choosing Head Coach assigns football role <strong>HEAD_COACH</strong>; it never grants OWNER or ADMIN authority.
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Exact-club review queue</div>
                  <h2 className="mt-1 text-lg font-black text-slate-900">Pending staff requests</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Refresh only the selected club. Approval and rejection are revalidated and committed atomically with audit evidence.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={!canRefresh}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={busy === "refresh" ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {!queueLoaded && busy !== "refresh" && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">
                    Enter a Pro Club ID and refresh the queue.
                  </div>
                )}

                {queueLoaded && pending.length === 0 && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-center text-sm font-bold text-emerald-800">
                    No pending staff requests for this club.
                  </div>
                )}

                {pending.map((item) => (
                  <article key={item.claimId} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-black text-slate-900">{claimantLabel(item)}</div>
                        <div className="mt-1 break-all text-xs text-slate-500">UID: {item.claim.userId}</div>
                        <div className="mt-1 text-xs font-bold text-slate-700">Role: {item.claim.staffRole}</div>
                        <div className="mt-1 break-all text-[11px] text-slate-400">Claim: {item.claimId}</div>
                        {!item.invite && (
                          <div className="mt-2 text-xs font-bold text-amber-700">Invitation state unavailable — decision will fail closed.</div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => handleDecision(item, "REJECTED")}
                          disabled={busy !== null || !item.invite}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {busy === `REJECTED:${item.claimId}` ? "Rejecting…" : "Reject"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecision(item, "APPROVED")}
                          disabled={busy !== null || !item.invite}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy === `APPROVED:${item.claimId}` ? "Approving…" : "Approve"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {(error || notice) && (
          <footer className="border-t border-slate-200 bg-white px-5 py-3 sm:px-7">
            {error && <p className="text-sm font-bold text-rose-700">{error}</p>}
            {notice && <p className="text-sm font-bold text-emerald-700">{notice}</p>}
          </footer>
        )}
      </div>
    </div>
  );
}
