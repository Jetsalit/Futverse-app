import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Shield, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth, type User } from "../../contexts/AuthContext";
import { useSuperAdminNonStaffSupport } from "../../contexts/SuperAdminNonStaffSupportContext";
import { useSuperAdminSupport } from "../../contexts/SuperAdminSupportContext";
import { isExactActiveSuperAdmin } from "../../lib/superAdminSupportModel";

interface AcademyOption {
  id: string;
  name: string;
}

export function SuperAdminNonStaffWorkAsLauncher() {
  const { actualUser } = useAuth();
  const support = useSuperAdminNonStaffSupport();
  const staffSupport = useSuperAdminSupport();
  const [open, setOpen] = useState(false);
  const [academies, setAcademies] = useState<AcademyOption[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [academyId, setAcademyId] = useState("");
  const [targetUid, setTargetUid] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled =
    isExactActiveSuperAdmin(actualUser) &&
    !support.isActive &&
    !staffSupport.isSupportActive;

  useEffect(() => {
    if (!open || !enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getDocs(collection(db, "academies")),
      getDocs(collection(db, "users")),
    ])
      .then(([academySnapshot, userSnapshot]) => {
        if (cancelled) return;
        setAcademies(
          academySnapshot.docs
            .filter((item) => item.id !== "superadmin_system")
            .map((item) => ({
              id: item.id,
              name:
                (typeof item.data().name === "string" && item.data().name) ||
                (typeof item.data().shortName === "string" && item.data().shortName) ||
                item.id,
            })),
        );
        setUsers(
          userSnapshot.docs
            .map((item) => ({
              ...(item.data() as User),
              id: item.id,
              uid: item.id,
            }))
            .filter(
              (user) =>
                (user.role === "PARENT" || user.role === "PLAYER") &&
                (user.status === "ACTIVE" || user.status === "Active"),
            ),
        );
      })
      .catch((loadError) => {
        if (!cancelled) {
          console.error("Failed to load Work As launcher data:", loadError);
          setError("Unable to load Academy or Parent/Player inventory.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, enabled]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.name, user.email, user.uid, user.id, user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [search, users]);

  if (!enabled) return null;

  const handleStart = async () => {
    if (!academyId || !targetUid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await support.startNonStaffWorkMode(academyId, targetUid);
      setOpen(false);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start Parent/Player Work As mode.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Work As Parent or Player"
        title="Work As Parent or Player"
        onClick={() => setOpen(true)}

        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-slate-950 shadow-sm transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
      >
        <Shield size={18} className="shrink-0" />
        <span>Work As Parent / Player</span>

      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <Shield className="text-amber-500" />
                <div>
                  <h2 className="font-black text-slate-900">Parent / Player Work As</h2>
                  <p className="text-xs text-slate-500">
                    Authenticated actor remains SUPERADMIN.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Academy
                </span>
                <select
                  value={academyId}
                  onChange={(event) => setAcademyId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3"
                >
                  <option value="">Select Academy</option>
                  {academies.map((academy) => (
                    <option key={academy.id} value={academy.id}>
                      {academy.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Search Parent / Player
                </span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, email or UID"
                  className="w-full rounded-xl border border-slate-300 px-3 py-3"
                />
              </label>

              <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200">
                {filteredUsers.map((user) => {
                  const uid = user.uid || user.id || "";
                  return (
                    <button
                      type="button"
                      key={uid}
                      onClick={() => setTargetUid(uid)}
                      className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 ${
                        targetUid === uid ? "bg-amber-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">{user.name || uid}</div>
                        <div className="text-xs text-slate-500">{user.email || uid}</div>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                        {user.role}
                      </span>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!academyId || !targetUid || loading}
                  onClick={handleStart}
                  className="rounded-xl bg-slate-900 px-5 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Checking..." : "Start Work As"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
