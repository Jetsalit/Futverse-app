import { useState } from "react";
import { AlertCircle, LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSuperAdminNonStaffSupport } from "../../contexts/SuperAdminNonStaffSupportContext";

export function SuperAdminNonStaffPresentationGate() {
  const { actualUser } = useAuth();
  const support = useSuperAdminNonStaffSupport();
  const [isExiting, setIsExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  const handleExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    setExitError(null);
    try {
      await support.exitNonStaffWorkMode();
    } catch (error) {
      console.error("Failed to close unresolved Parent/Player Work As session:", error);
      setExitError(
        error instanceof Error
          ? error.message
          : "Unable to safely close this Work As session.",
      );
    } finally {
      setIsExiting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto mt-16 max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
        <ShieldAlert className="mx-auto text-amber-500" size={46} />
        <h1 className="mt-5 text-2xl font-black">Work As identity unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          FutVerse will not render the owner interface until the selected Parent or Player
          identity is authoritative, active, and exactly matches this Work As session.
        </p>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left text-xs text-slate-600">
          <div>
            Authenticated actor: <strong>{actualUser?.name || actualUser?.uid || "SUPERADMIN"}</strong>
          </div>
          <div className="mt-1">
            Work As target: <strong>{support.session?.subject.displayName || support.session?.subject.uid || "Unavailable"}</strong>
          </div>
          <div className="mt-1">
            Expected role: <strong>{support.session?.subject.role || "Unavailable"}</strong>
          </div>
        </div>
        {exitError && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-left text-xs font-semibold text-rose-700">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{exitError}</span>
          </div>
        )}
        <button
          type="button"
          onClick={handleExit}
          disabled={isExiting}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogOut size={16} /> {isExiting ? "Exiting..." : "Exit Work As"}
        </button>
      </div>
    </div>
  );
}
