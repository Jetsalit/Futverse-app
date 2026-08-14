import React, { useState } from "react";
import { ShieldAlert, LogOut, UserCheck, AlertCircle } from "lucide-react";
import { useSuperAdminSupport } from "../../contexts/SuperAdminSupportContext";
import { useAuth } from "../../contexts/AuthContext";
import { useAcademy } from "../../contexts/AcademyContext";

export function SuperAdminSupportBar() {
  const { session, isSupportActive, exitSupportMode, presentationRole } =
    useSuperAdminSupport();
  const { currentUser } = useAuth();
  const { academy } = useAcademy();
  const [isExiting, setIsExiting] = useState(false);
  const [exitError, setExitError] = useState<string | null>(null);

  if (!isSupportActive || !session) return null;

  const academyDisplayName =
    academy?.name || academy?.shortName || session.academyId;
  const superAdminName = currentUser?.name || currentUser?.email || "SuperAdmin";

  const handleExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    setExitError(null);
    try {
      await exitSupportMode();
    } catch (err) {
      setExitError(
        "Failed to safely exit support mode. The audit record is queued for retry. " +
          "You may try again or log out.",
      );
      console.error("Error exiting support mode:", err);
    } finally {
      setIsExiting(false);
    }
  };

  return (
    <div className="bg-slate-900 border-b border-amber-500/30 text-white px-4 py-2 text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-2 z-50 shrink-0 shadow-md">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
          <ShieldAlert size={14} className="text-amber-400" />
          {session.mode === "WORK_AS_STAFF"
            ? "SUPERADMIN WORK MODE"
            : "SUPERADMIN SUPPORT"}
        </div>

        <div className="flex items-center gap-1 text-slate-300">
          <span>Academy:</span>
          <span className="text-white font-bold">{academyDisplayName}</span>
        </div>

        {session.mode === "WORK_AS_STAFF" && session.subject && (
          <>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1 text-slate-300">
              <UserCheck size={14} className="text-emerald-400" />
              <span>Working for:</span>
              <span className="text-white font-bold">
                {session.subject.displayName || session.subject.uid}
              </span>
            </div>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1 text-slate-300">
              <span>Effective tenant role:</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                {presentationRole}
              </span>
            </div>
          </>
        )}

        <span className="text-slate-600 hidden md:inline">|</span>
        <div className="text-slate-400 text-[11px] hidden md:inline">
          Authenticated actor:{" "}
          <span className="text-slate-200">{superAdminName}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {exitError && (
          <div className="flex items-center gap-1 text-amber-300 text-[11px] max-w-xs">
            <AlertCircle size={12} className="shrink-0" />
            <span className="truncate">{exitError}</span>
          </div>
        )}
        <button
          type="button"
          onClick={handleExit}
          disabled={isExiting}
          className={`flex items-center gap-1.5 px-3 py-1 font-bold rounded-lg transition-colors shadow-sm shrink-0 ${
            isExiting
              ? "bg-amber-500/50 text-slate-950/50 cursor-not-allowed"
              : "bg-amber-500 hover:bg-amber-600 text-slate-950"
          }`}
        >
          <LogOut size={14} />
          {isExiting
            ? "Exiting..."
            : session.mode === "WORK_AS_STAFF"
              ? "Exit Work Mode"
              : "Exit Workspace"}
        </button>
      </div>
    </div>
  );
}
