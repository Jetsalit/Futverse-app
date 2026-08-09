import React, { useState, useEffect } from "react";
import { Shield, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import type { AcademyInvite, AcademyJoinClaim, TenantRole } from "../types/Membership";
import {
  activateApprovedMembership,
  buildAcademyJoinClaimId,
  MAX_INVITE_CODE_LENGTH,
  normalizeAndValidateInviteCode,
  validateActiveAcademyInvite,
} from "../services/membershipService";

function getRequestedTenantRole(
  requestedRole?: string,
  currentRole?: string,
): TenantRole | null {
  if (requestedRole === "ADMIN" || requestedRole === "COACH") return requestedRole;
  if (currentRole === "ADMIN" || currentRole === "COACH") return currentRole;
  return null;
}

function formatClaimDate(value: AcademyJoinClaim["createdAt"]) {
  if (!value) return "recently";
  const date = typeof value === "object" && "toDate" in value
    ? value.toDate()
    : new Date(value as Date | string);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleDateString();
}

export default function JoinAcademy({ onBack }: { onBack?: () => void }) {
  const { currentUser, logout } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [activationComplete, setActivationComplete] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [existingClaim, setExistingClaim] = useState<AcademyJoinClaim | null>(null);
  const requestedRole = getRequestedTenantRole(currentUser?.requestedRole, currentUser?.role);
  const userId = currentUser?.uid || currentUser?.id;

  useEffect(() => {
    if (!userId || !requestedRole) return;
    const q = query(
      collection(db, "profile_claims"),
      where("userId", "==", userId),
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const claims = snapshot.docs
        .map((snapshotDoc) => ({
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
        }) as AcademyJoinClaim)
        .filter((claim) =>
          claim.type === "COACH_JOIN"
            ? requestedRole === "COACH"
            : claim.type === "ACADEMY_JOIN" && claim.requestedRole === requestedRole,
        );
      setExistingClaim(
        claims.find((claim) => claim.status === "PENDING") ||
        claims.find((claim) => claim.status === "APPROVED") ||
        claims.find((claim) => claim.status === "REJECTED") ||
        null,
      );
    });
    return () => unsub();
  }, [requestedRole, userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!currentUser || !userId || !requestedRole) {
      setError("Only ADMIN or COACH users can submit an Academy join request.");
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedInviteCode = normalizeAndValidateInviteCode(inviteCode);
      const claimId = buildAcademyJoinClaimId(userId, requestedRole, normalizedInviteCode);
      const claimRef = doc(db, "profile_claims", claimId);
      const inviteRef = doc(db, "academy_invites", normalizedInviteCode);

      await runTransaction(db, async (transaction) => {
        const inviteSnapshot = await transaction.get(inviteRef);
        const claimSnapshot = await transaction.get(claimRef);
        if (!inviteSnapshot.exists()) {
          throw new Error("This Academy invite code does not exist.");
        }
        const academyId = validateActiveAcademyInvite(
          inviteSnapshot.data() as AcademyInvite,
          normalizedInviteCode,
        );
        if (claimSnapshot.exists()) {
          const storedClaim = claimSnapshot.data() as AcademyJoinClaim;
          if (storedClaim.status === "PENDING") return;
          throw new Error("A previous request already exists for this invite code and role.");
        }

        transaction.set(claimRef, {
          type: "ACADEMY_JOIN",
          userId,
          userEmail: currentUser.email || null,
          userName: currentUser.name,
          requestedRole,
          inviteCode: normalizedInviteCode,
          requestedAcademyId: academyId,
          ...(currentUser.requestedAcademyName
            ? { requestedAcademyName: currentUser.requestedAcademyName }
            : {}),
          status: "PENDING",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async () => {
    setError("");
    if (!existingClaim?.approvedAcademyId || !userId) {
      setError("Approved Academy details are missing.");
      return;
    }

    setIsActivating(true);
    try {
      await activateApprovedMembership(
        existingClaim.approvedAcademyId,
        userId,
      );
      setActivationComplete(true);
    } catch (activationError) {
      console.error(activationError);
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Failed to activate Academy access.",
      );
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8 text-center bg-indigo-600 relative">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-white/20">
            <Shield size={40} className="text-white" />
          </div>
          <h2 className="text-3xl font-black text-white mb-2">Join Academy</h2>
          <p className="text-indigo-100 font-medium text-sm">
            Submit an invite code to request {requestedRole || "Academy"} access.
          </p>
        </div>

        <div className="p-8">
          {existingClaim ? (
            <div className="text-center">
              {existingClaim.status === "PENDING" ? (
                <>
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock size={32} className="text-amber-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Request Pending</h3>
                  <p className="text-slate-500 mb-6">
                    Your {requestedRole} request to join with code <strong className="text-slate-700">{existingClaim.inviteCode}</strong> has been sent to the Academy Admin. Please wait for approval.
                  </p>
                  <p className="text-xs text-slate-400 mb-6">
                    Submitted {formatClaimDate(existingClaim.createdAt)}
                  </p>
                </>
              ) : existingClaim.status === "APPROVED" ? (
                <>
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} className="text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">
                    {activationComplete ? "Academy Access Activated" : "Membership Approved"}
                  </h3>
                  <p className="text-slate-500 mb-6">
                    {activationComplete
                      ? "Your account is refreshing with the approved Academy access."
                      : "Activate your account pointers after verifying the approved Membership."}
                  </p>
                  {!activationComplete && (
                    <button
                      type="button"
                      onClick={handleActivate}
                      disabled={isActivating}
                      className="w-full bg-emerald-600 text-white font-bold rounded-xl px-4 py-4 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isActivating ? "Activating..." : "Activate Academy Access"}
                    </button>
                  )}
                  {error && (
                    <div className="mt-4 p-4 bg-rose-50 text-rose-600 text-sm font-bold rounded-xl border border-rose-100 text-center">
                      {error}
                    </div>
                  )}
                </>
              ) : existingClaim.status === "REJECTED" ? (
                <>
                  <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield size={32} className="text-rose-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Request Rejected</h3>
                  <p className="text-slate-500 mb-6">
                    Your request was rejected by the Head Coach.
                  </p>
                </>
              ) : null}
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Request Sent!</h3>
              <p className="text-slate-500 mb-6">
                An Academy Admin will review your {requestedRole} request. Access is granted only after approval.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Academy Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  maxLength={MAX_INVITE_CODE_LENGTH}
                  placeholder="e.g., FUT-A1B2C3"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-800 text-center uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                  required
                />
                <p className="text-xs text-slate-500 text-center mt-2 font-medium">
                  Ask your Head Coach for this code
                </p>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 text-rose-600 text-sm font-bold rounded-xl border border-rose-100 text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-indigo-600 text-white font-bold rounded-xl px-4 py-4 hover:bg-indigo-700 hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isSubmitting ? "Sending Request..." : "Request to Join"}
                {!isSubmitting && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
              </button>
            </form>
          )}

          <div className="mt-8 text-center">
            <button
              onClick={() => logout()}
              className="text-slate-500 hover:text-slate-800 font-bold text-sm transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
