import { useState } from "react";
import { AlertCircle, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSuperAdminSupport } from "../../contexts/SuperAdminSupportContext";

export function SuperAdminStaffAuthorityGate() {
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
      console.error("Failed to close paused Staff Work As session:", error);
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <ShieldCheck size={30} />
        </div>
        <h1 className="mt-5 text-2xl font-black text-slate-900">
          Revalidating Work As authority
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          FutVerse temporarily paused tenant actions because the target Membership
          snapshot fell back to cache. The current Work As session is preserved while
          authoritative server verification is restored.
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

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800">
          <Loader2 className="animate-spin" size={15} /> Waiting for authoritative Membership data
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
