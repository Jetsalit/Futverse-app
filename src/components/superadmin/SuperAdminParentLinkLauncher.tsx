import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { Link2, Shield, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth, type User } from "../../contexts/AuthContext";
import { isExactActiveSuperAdmin, isExactDocumentId } from "../../lib/superAdminSupportModel";
import { NONSTAFF_ASSOCIATION_COLLECTION } from "../../lib/nonStaffPlayerAccess";

interface AcademyOption {
  id: string;
  name: string;
}

interface PlayerOption {
  id: string;
  firstName?: string;
  lastName?: string;
  futId?: string;
}

export function SuperAdminParentLinkLauncher() {
  const { actualUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [academies, setAcademies] = useState<AcademyOption[]>([]);
  const [parents, setParents] = useState<User[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [academyId, setAcademyId] = useState("");
  const [parentUid, setParentUid] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enabled = isExactActiveSuperAdmin(actualUser);

  useEffect(() => {
    if (!open || !enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);

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
        setParents(
          userSnapshot.docs
            .map((item) => ({
              ...(item.data() as User),
              id: item.id,
              uid: item.id,
            }))
            .filter(
              (user) =>
                user.role === "PARENT" &&
                (user.status === "ACTIVE" || user.status === "Active"),
            ),
        );
      })
      .catch((loadError) => {
        console.error("Failed to load Parent Link inventory:", loadError);
        if (!cancelled) setError("Unable to load Academy or Parent inventory.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, enabled]);

  useEffect(() => {
    if (!open || !academyId) {
      setPlayers([]);
      setPlayerId("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDocs(collection(db, "academies", academyId, "players"))
      .then((snapshot) => {
        if (cancelled) return;
        setPlayers(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              firstName: typeof data.firstName === "string" ? data.firstName : undefined,
              lastName: typeof data.lastName === "string" ? data.lastName : undefined,
              futId:
                typeof data.futId === "string"
                  ? data.futId
                  : typeof data.futID === "string"
                    ? data.futID
                    : undefined,
            };
          }),
        );
      })
      .catch((loadError) => {
        console.error("Failed to load Academy players:", loadError);
        if (!cancelled) setError("Unable to load players for this Academy.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, academyId]);

  const filteredParents = useMemo(() => {
    const q = parentSearch.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((parent) =>
      [parent.name, parent.email, parent.uid, parent.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [parentSearch, parents]);

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return players;
    return players.filter((player) =>
      [player.firstName, player.lastName, player.futId, player.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [playerSearch, players]);

  if (!enabled) return null;

  const handleLink = async () => {
    if (loading) return;
    const actorUid = actualUser?.uid || actualUser?.id;
    if (
      !isExactActiveSuperAdmin(actualUser) ||
      !isExactDocumentId(actorUid) ||
      !isExactDocumentId(academyId) ||
      !isExactDocumentId(parentUid) ||
      !isExactDocumentId(playerId)
    ) {
      setError("Select an exact Academy, Parent account, and Player before linking.");
      return;
    }

    const selectedParent = parents.find((parent) => (parent.uid || parent.id) === parentUid);
    const selectedPlayer = players.find((player) => player.id === playerId);
    if (!selectedParent || !selectedPlayer) {
      setError("The selected Parent or Player is no longer available.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const associationRef = doc(
        db,
        "academies",
        academyId,
        "nonstaffUsers",
        parentUid,
        NONSTAFF_ASSOCIATION_COLLECTION,
        playerId,
      );
      const parentRef = doc(db, "users", parentUid);
      const playerRef = doc(db, "academies", academyId, "players", playerId);
      const academyRef = doc(db, "academies", academyId);
      const logRef = doc(collection(db, "logs"));

      await runTransaction(db, async (transaction) => {
        const [academySnapshot, parentSnapshot, playerSnapshot, associationSnapshot] =
          await Promise.all([
            transaction.get(academyRef),
            transaction.get(parentRef),
            transaction.get(playerRef),
            transaction.get(associationRef),
          ]);

        if (!academySnapshot.exists()) {
          throw new Error("Academy no longer exists.");
        }
        if (!parentSnapshot.exists()) {
          throw new Error("Parent account no longer exists.");
        }
        const parentData = parentSnapshot.data();
        if (
          parentSnapshot.id !== parentUid ||
          parentData.uid !== parentUid ||
          parentData.role !== "PARENT" ||
          !["ACTIVE", "Active"].includes(String(parentData.status))
        ) {
          throw new Error("Parent account is not an active canonical PARENT account.");
        }
        if (!playerSnapshot.exists() || playerSnapshot.id !== playerId) {
          throw new Error("Player no longer exists in the selected Academy.");
        }

        if (associationSnapshot.exists()) {
          const data = associationSnapshot.data();
          if (
            data.userId !== parentUid ||
            data.academyId !== academyId ||
            data.playerId !== playerId ||
            data.role !== "PARENT"
          ) {
            throw new Error(
              "Existing association identity is inconsistent; refusing to overwrite it.",
            );
          }
          if (data.status !== "ACTIVE") {
            transaction.update(associationRef, { status: "ACTIVE" });
          }
        } else {
          transaction.set(associationRef, {
            userId: parentUid,
            academyId,
            playerId,
            role: "PARENT",
            status: "ACTIVE",
          });
        }

        transaction.set(logRef, {
          action: "SUPERADMIN_PARENT_PLAYER_LINKED",
          actorUid,
          academyId,
          targetUid: parentUid,
          playerId,
          mode: "ASSISTED_SUPPORT",
          timestamp: serverTimestamp(),
        });
      });

      const parentName = selectedParent.name || selectedParent.email || parentUid;
      const playerName =
        `${selectedPlayer.firstName || ""} ${selectedPlayer.lastName || ""}`.trim() ||
        playerId;
      setNotice(`Linked ${parentName} to ${playerName} successfully.`);
    } catch (linkError) {
      console.error("Failed to link Parent to Player:", linkError);
      setError(
        linkError instanceof Error
          ? linkError.message
          : "Unable to link this Parent to the selected Player.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-[80] flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-xl hover:bg-indigo-500"
      >
        <Link2 size={16} /> Link Parent
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3">
                <Shield className="text-indigo-600" />
                <div>
                  <h2 className="font-black text-slate-900">Link Parent to Player</h2>
                  <p className="text-xs text-slate-500">
                    Uses the existing canonical Parent association model.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-5 p-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Academy
                </label>
                <select
                  value={academyId}
                  onChange={(event) => {
                    setAcademyId(event.target.value);
                    setPlayerId("");
                    setNotice(null);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-3 py-3"
                >
                  <option value="">Select Academy</option>
                  {academies.map((academy) => (
                    <option key={academy.id} value={academy.id}>
                      {academy.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Parent account
                </label>
                <input
                  value={parentSearch}
                  onChange={(event) => setParentSearch(event.target.value)}
                  placeholder="Search email, name or UID"
                  className="mb-2 w-full rounded-xl border border-slate-300 px-3 py-3"
                />
                <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200">
                  {filteredParents.map((parent) => {
                    const uid = parent.uid || parent.id || "";
                    return (
                      <button
                        type="button"
                        key={uid}
                        onClick={() => setParentUid(uid)}
                        className={`w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 ${
                          parentUid === uid ? "bg-indigo-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-bold text-slate-900">{parent.name || uid}</div>
                        <div className="text-xs text-slate-500">{parent.email || uid}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Player
                </label>
                <input
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Search player, FUTID or ID"
                  disabled={!academyId}
                  className="mb-2 w-full rounded-xl border border-slate-300 px-3 py-3 disabled:bg-slate-100"
                />
                <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200">
                  {filteredPlayers.map((player) => (
                    <button
                      type="button"
                      key={player.id}
                      onClick={() => setPlayerId(player.id)}
                      className={`w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 ${
                        playerId === player.id ? "bg-indigo-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-bold text-slate-900">
                        {player.firstName || "Player"} {player.lastName || ""}
                      </div>
                      <div className="text-xs text-slate-500">
                        {player.futId ? `${player.futId} • ` : ""}
                        {player.id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="md:col-span-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {error}
                </div>
              )}
              {notice && (
                <div className="md:col-span-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {notice}
                </div>
              )}

              <div className="md:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-2 font-bold text-slate-600"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleLink}
                  disabled={!academyId || !parentUid || !playerId || loading}
                  className="rounded-xl bg-slate-900 px-5 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Checking..." : "Confirm Link"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
