import { useEffect, useMemo, useState } from "react";
import { Activity, LogOut, ShieldAlert, UserCircle } from "lucide-react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { mapCanonicalSnapshot } from "../../lib/firestore/canonicalDocument";
import { useSuperAdminNonStaffSupport } from "../../contexts/SuperAdminNonStaffSupportContext";
import {
  NONSTAFF_ASSOCIATION_COLLECTION,
  resolveAuthoritativeAssociationSnapshot,
} from "../../lib/nonStaffPlayerAccess";

type PlayerProfile = Record<string, unknown> & {
  id: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  avatar?: string;
};

export function SuperAdminNonStaffWorkAsShell() {
  const support = useSuperAdminNonStaffSupport();
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!support.session || !support.effectiveUser) {
      setProfiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let version = 0;
    let playerUnsubscribes: Array<() => void> = [];

    const stopPlayers = () => {
      playerUnsubscribes.forEach((unsubscribe) => unsubscribe());
      playerUnsubscribes = [];
    };

    setProfiles([]);
    setSelectedPlayerId(null);
    setLoading(true);
    setError(null);

    const academyId = support.session.academyId;
    const targetUid = support.session.subject.uid;
    const associationRef = collection(
      db,
      "academies",
      academyId,
      "nonstaffUsers",
      targetUid,
      NONSTAFF_ASSOCIATION_COLLECTION,
    );

    const unsubscribeAssociations = onSnapshot(
      associationRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (cancelled) return;
        const currentVersion = ++version;
        stopPlayers();
        setProfiles([]);

        const resolution = resolveAuthoritativeAssociationSnapshot(
          support.effectiveUser,
          {
            fromCache: snapshot.metadata.fromCache,
            hasPendingWrites: snapshot.metadata.hasPendingWrites,
            documents: snapshot.docs.map((associationDocument) => ({
              id: associationDocument.id,
              path: associationDocument.ref.path,
              data: associationDocument.data(),
            })),
          },
        );

        if (resolution.type !== "AUTHORIZED_ASSOCIATIONS") {
          setError("Authoritative Parent/Player association is unavailable.");
          setLoading(false);
          return;
        }

        const academyAssociations = resolution.associations.filter(
          (association) => association.academyId === academyId,
        );
        if (academyAssociations.length === 0) {
          setError("No active player association exists in this Academy.");
          setLoading(false);
          return;
        }

        const resolved = new Map<string, PlayerProfile>();
        setLoading(true);
        setError(null);

        for (const association of academyAssociations) {
          const unsubscribePlayer = onSnapshot(
            doc(db, "academies", academyId, "players", association.playerId),
            { includeMetadataChanges: true },
            (playerSnapshot) => {
              if (cancelled || currentVersion !== version) return;
              if (
                playerSnapshot.metadata.fromCache ||
                playerSnapshot.metadata.hasPendingWrites ||
                !playerSnapshot.exists() ||
                playerSnapshot.id !== association.playerId
              ) {
                setProfiles([]);
                setError("Authoritative player record is unavailable.");
                setLoading(false);
                return;
              }

              resolved.set(association.playerId, {
                ...mapCanonicalSnapshot<Record<string, unknown>>(playerSnapshot),
                id: association.playerId,
              });

              if (resolved.size === academyAssociations.length) {
                const nextProfiles = academyAssociations.map(
                  (item) => resolved.get(item.playerId)!,
                );
                setProfiles(nextProfiles);
                setSelectedPlayerId((previous) =>
                  previous && nextProfiles.some((profile) => profile.id === previous)
                    ? previous
                    : nextProfiles[0]?.id || null,
                );
                setLoading(false);
              }
            },
            () => {
              if (cancelled || currentVersion !== version) return;
              setProfiles([]);
              setError("Unable to read the linked player record.");
              setLoading(false);
            },
          );
          playerUnsubscribes.push(unsubscribePlayer);
        }
      },
      () => {
        if (cancelled) return;
        stopPlayers();
        setProfiles([]);
        setError("Unable to read Parent/Player associations.");
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      ++version;
      unsubscribeAssociations();
      stopPlayers();
    };
  }, [support.session, support.effectiveUser]);

  const selectedProfile = useMemo(
    () =>
      profiles.find((profile) => profile.id === selectedPlayerId) ||
      profiles[0] ||
      null,
    [profiles, selectedPlayerId],
  );

  if (!support.session || !support.effectiveUser) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="sticky top-0 z-50 border-b border-amber-400/40 bg-slate-950 px-4 py-3 text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-amber-300">
              SUPERADMIN WORK AS {support.presentationRole}
            </div>
            <div className="mt-1 text-sm font-bold">
              {support.effectiveUser.name || support.session.subject.uid}
              {support.effectiveUser.email ? ` • ${support.effectiveUser.email}` : ""}
            </div>
            <div className="text-[11px] text-slate-400">
              Academy scope: {support.session.academyId} • Authenticated actor remains SUPERADMIN
            </div>
          </div>
          <button
            type="button"
            onClick={support.exitNonStaffWorkMode}
            className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-amber-400"
          >
            <LogOut size={16} /> Exit Work As
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
        {loading && (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-indigo-600" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <ShieldAlert className="mx-auto text-rose-500" size={40} />
            <h2 className="mt-4 text-xl font-black">Player data unavailable</h2>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
          </div>
        )}

        {!loading && !error && selectedProfile && (
          <>
            {profiles.length > 1 && (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                {profiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(profile.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${
                      profile.id === selectedProfile.id
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {profile.firstName || "Player"} {profile.lastName || ""}
                  </button>
                ))}
              </div>
            )}

            <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-6 shadow-xl">
              <div className="flex items-center gap-5">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-lime-300 bg-slate-800 text-lime-300">
                  {typeof selectedProfile.avatar === "string" && selectedProfile.avatar ? (
                    <img
                      src={selectedProfile.avatar}
                      alt="Player"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserCircle size={44} />
                  )}
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-white">
                    {selectedProfile.firstName || "Player"} {selectedProfile.lastName || ""}
                  </h1>
                  <p className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-300">
                    {selectedProfile.position || "Position unavailable"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <Activity className="text-amber-500" size={24} />
              <h2 className="mt-3 text-lg font-black text-slate-800">
                Current owner-visible player record
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                This Work As view is resolved from the selected account's active authoritative association in the selected Academy. Features without an authoritative backend remain unavailable, matching the current production owner experience rather than fabricating editable data.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
