import { useState } from "react";
import { AlertCircle, LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSuperAdminSupport } from "../../contexts/SuperAdminSupportContext";

export function SuperAdminStaffPresentationGate() {
  const { actualUser } = useAuth();
  const { supportSubject, exitSupportMode } = useSuperAdminSupport();
  const [isExiting, setIsExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  const handleExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    setExitError(null);
    try {
      await exitSupportMode();
    } catch (error) {
      console.error("Failed to close unresolved Staff Work As session:", error);
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
          FutVerse is waiting for an authoritative active user identity that matches the
          selected Staff Work As session. No tenant action is available while identity
          verification is incomplete or invalid.
        </p>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left text-xs text-slate-600">
          <div>
            Authenticated actor: <strong>{actualUser?.name || actualUser?.uid || "SUPERADMIN"}</strong>
          </div>
          <div className="mt-1">
            Work As target: <strong>{supportSubject?.displayName || supportSubject?.uid || "Unavailable"}</strong>
          </div>
          <div className="mt-1">
            Expected role: <strong>{supportSubject?.tenantRole || supportSubject?.role || "Unavailable"}</strong>
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
