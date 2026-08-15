import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../lib/firebase";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { evaluateBootstrapPlan } from "../services/bootstrapLegacyAdminCore";

export default function BootstrapLegacyAdmin() {
  const { currentUser } = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  const TARGET_ACADEMY_ID = "BaBH6XFlcSgpYTbDLhmbBshp2rm1";
  const TARGET_UID = "BaBH6XFlcSgpYTbDLhmbBshp2rm1";
  const CONFIRM_TEXT = "BOOTSTRAP_TALUMBALL_MAX_ADMIN";

  const handleBootstrap = async () => {
    if (currentUser?.role !== "SUPERADMIN") {
      setResult({ type: "error", message: "UNAUTHORIZED: SUPERADMIN role required." });
      return;
    }
    if (confirmation !== CONFIRM_TEXT) return;

    setLoading(true);
    setResult(null);

    try {
      const resultMessage = await runTransaction(db, async (transaction) => {
        const academyRef = doc(db, "academies", TARGET_ACADEMY_ID);
        const userRef = doc(db, "users", TARGET_UID);
        const memberRef = doc(db, `academies/${TARGET_ACADEMY_ID}/members`, TARGET_UID);
        const inviteRef = doc(db, "academy_invites", "FUT-TDIZ");

        // 1. Read all documents first
        const academySnap = await transaction.get(academyRef);
        const userSnap = await transaction.get(userRef);
        const memberSnap = await transaction.get(memberRef);
        const inviteSnap = await transaction.get(inviteRef);

        const academyDoc = { exists: academySnap.exists(), id: academySnap.id, data: academySnap.data() };
        const userDoc = { exists: userSnap.exists(), id: userSnap.id, data: userSnap.data() };
        const memberDoc = { exists: memberSnap.exists(), id: memberSnap.id, data: memberSnap.data() };
        const inviteDoc = { exists: inviteSnap.exists(), id: inviteSnap.id, data: inviteSnap.data() };

        const actorUid = currentUser?.uid || currentUser?.id;
        if (!actorUid) {
            throw new Error("REJECTED: Actor UID is missing.");
        }

        const actor = {
            uid: actorUid,
            role: currentUser?.role || "USER",
            confirmation: confirmation
        };

        // 2. Pure Evaluation
        const evalResult = evaluateBootstrapPlan(
            actor,
            academyDoc,
            userDoc,
            memberDoc,
            inviteDoc,
            serverTimestamp
        );

        if (evalResult.status === "REJECTED") {
            throw new Error(`REJECTED: ${evalResult.reason}`);
        }

        if (evalResult.status === "ALREADY_BOOTSTRAPPED") {
            return `ALREADY_BOOTSTRAPPED: ${evalResult.reason}`;
        }

        // 3. Execution (SUCCESS state)
        if (evalResult.status === "SUCCESS") {
            for (const action of evalResult.plan) {
                const parts = action.path.split('/');
                const isMember = parts.includes("members");
                const isInvite = parts.includes("academy_invites");
                const isUser = parts.includes("users");

                if (action.type === "SET_MEMBER" && isMember) {
                    transaction.set(memberRef, action.data);
                } else if (action.type === "MERGE_USER" && isUser) {
                    transaction.set(userRef, action.data, { merge: true });
                } else if (action.type === "SET_INVITE" && isInvite) {
                    transaction.set(inviteRef, action.data);
                } else {
                    throw new Error(`Unsupported plan action or path: ${action.type} - ${action.path}`);
                }
            }
            return "SUCCESS: Successfully bootstrapped Legacy Academy Admin and Invite.";
        }

        throw new Error("Unexpected evaluation state");
      });

      if (resultMessage.startsWith("ALREADY_BOOTSTRAPPED")) {
         setResult({ type: "info", message: resultMessage });
      } else {
         setResult({ type: "success", message: resultMessage });
      }
    } catch (error: any) {
      console.error(error);
      setResult({ type: "error", message: error.message || "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <AlertCircle className="text-amber-500" size={24} />
        <h2 className="text-xl font-bold text-slate-800">Bootstrap Legacy Academy Admin</h2>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-sm text-slate-700 space-y-2">
        <p><strong className="text-slate-900">Academy:</strong> Talumball Academy</p>
        <p><strong className="text-slate-900">Academy ID:</strong> BaBH6XFlcSgpYTbDLhmbBshp2rm1</p>
        <p><strong className="text-slate-900">Admin:</strong> Max Coach</p>
        <p><strong className="text-slate-900">Admin UID:</strong> BaBH6XFlcSgpYTbDLhmbBshp2rm1</p>
        <p><strong className="text-slate-900">Invite:</strong> FUT-TDIZ</p>
      </div>

      {result && (
        <div className={`p-4 rounded-xl mb-6 flex items-start gap-3 border ${
          result.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' :
          result.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-700' :
          'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {result.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
          <div className="font-medium text-sm">{result.message}</div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            Type confirmation code to proceed: <span className="text-rose-500 select-all">{CONFIRM_TEXT}</span>
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRM_TEXT}
            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>

        <button
          onClick={handleBootstrap}
          disabled={confirmation !== CONFIRM_TEXT || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="animate-spin" size={20} /> Processing Transaction...</>
          ) : (
            "Run Bootstrap Transaction"
          )}
        </button>
      </div>
    </div>
  );
}
