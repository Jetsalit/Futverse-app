import { useState } from "react";
import { AlertCircle, LogOut, ShieldAlert, UserCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSuperAdminNonStaffSupport } from "../../contexts/SuperAdminNonStaffSupportContext";

export function SuperAdminNonStaffSupportBar() {
  const { actualUser } = useAuth();
  const support = useSuperAdminNonStaffSupport();
  const [isExiting, setIsExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  if (!support.isActive || !support.session || !support.effectiveUser) return null;

  const handleExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    setExitError(null);
    try {
      await support.exitNonStaffWorkMode();
    } catch (error) {
      console.error("Failed to safely exit Parent/Player Work As:", error);
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
    <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-500/30 bg-slate-950 px-4 py-2 text-xs font-semibold text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/20 px-2 py-1 font-black text-amber-300">
            <ShieldAlert size={14} /> SUPERADMIN WORK AS {support.presentationRole}
          </div>
          <div className="flex items-center gap-1 text-slate-300">
            <UserCheck size={14} className="text-emerald-400" />
            <span>Working for:</span>
            <strong className="text-white">
              {support.effectiveUser.name || support.session.subject.uid}
            </strong>
          </div>
          <span className="hidden text-slate-600 md:inline">|</span>
          <div className="hidden text-slate-400 md:block">
            Academy scope: <span className="text-slate-200">{support.session.academyId}</span>
          </div>
          <span className="hidden text-slate-600 lg:inline">|</span>
          <div className="hidden text-slate-400 lg:block">
            Authenticated actor:{" "}
            <span className="text-slate-200">
              {actualUser?.name || actualUser?.email || actualUser?.uid || "SUPERADMIN"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {exitError && (
            <div className="flex max-w-xs items-center gap-1 text-[11px] text-amber-300">
              <AlertCircle size={12} className="shrink-0" />
              <span className="truncate">{exitError}</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleExit}
            disabled={isExiting}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={14} /> {isExiting ? "Exiting..." : "Exit Work As"}
          </button>
        </div>
      </div>
    </div>
  );
}
