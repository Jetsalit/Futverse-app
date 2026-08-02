import React, { useState, useEffect } from "react";
import { Shield, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { collection, addDoc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";

export default function JoinAcademy({ onBack }: { onBack?: () => void }) {
  const { currentUser, logout } = useAuth();
  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [existingClaim, setExistingClaim] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "profile_claims"),
      where("userId", "==", currentUser.id),
      where("type", "==", "COACH_JOIN")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setExistingClaim({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setExistingClaim(null);
      }
    });
    return () => unsub();
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!inviteCode.trim() || !inviteCode.toUpperCase().startsWith("FUT-")) {
      setError("Please enter a valid invite code (e.g., FUT-XXXX)");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "profile_claims"), {
        type: "COACH_JOIN",
        userId: currentUser?.id,
        userEmail: currentUser?.email,
        userName: currentUser?.name,
        inviteCode: inviteCode.toUpperCase().trim(),
        status: "PENDING",
        createdAt: new Date().toISOString()
      });
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
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
            You need to join an academy to access coach features.
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
                    Your request to join with code <strong className="text-slate-700">{existingClaim.inviteCode}</strong> has been sent to the Head Coach. Please wait for their approval.
                  </p>
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
                The Head Coach will review your request. Once approved, you can access the academy dashboard.
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
