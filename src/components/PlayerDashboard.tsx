import { useEffect, useState } from "react";
import { Activity, ShieldAlert, UserCircle } from "lucide-react";
import { collectionGroup, doc, onSnapshot, query, where } from "firebase/firestore";
import { useAuth, type User } from "../contexts/AuthContext";
import { useSuperAdminNonStaffSupport } from "../contexts/SuperAdminNonStaffSupportContext";
import { db } from "../lib/firebase";
import { mapCanonicalSnapshot } from "../lib/firestore/canonicalDocument";
import {
  linkedPlayerLookupForUser,
  NONSTAFF_ASSOCIATION_COLLECTION,
  resolveAuthoritativeAssociationSnapshot,
} from "../lib/nonStaffPlayerAccess";
import { EmptyState } from "./common/EmptyState";

const associationKey = (academyId: string, playerId: string) =>
  JSON.stringify([academyId, playerId]);

const accessScopeKey = (user: User | null) =>
  user
    ? JSON.stringify([
        user.uid || user.id || null,
        user.role,
        user.status || null,
        user.academyId ?? null,
        user.activeAcademyId ?? null,
        user.linkedPlayerId ?? null,
      ])
    : null;

export default function PlayerDashboard({
  onNavigate: _onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { currentUser } = useAuth();
  const nonStaffSupport = useSuperAdminNonStaffSupport();
  const presentedUser = nonStaffSupport.isActive
    ? nonStaffSupport.effectiveUser
    : currentUser;
  const [playerProfiles, setPlayerProfiles] = useState<any[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null);
  const [resolvedScopeKey, setResolvedScopeKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resolutionVersion = 0;
    let unsubscribeAssociations: (() => void) | undefined;
    let unsubscribePlayers: Array<() => void> = [];

    const stopPlayerListeners = () => {
      unsubscribePlayers.forEach((unsubscribe) => unsubscribe());
      unsubscribePlayers = [];
    };

    const clearResolvedProfiles = () => {
      setPlayerProfiles([]);
      setSelectedProfileKey(null);
      setResolvedScopeKey(null);
    };

    const lookup = linkedPlayerLookupForUser(presentedUser);
    const expectedScopeKey = accessScopeKey(presentedUser);
    clearResolvedProfiles();
    setReadError(null);
    setLoading(true);

    if (lookup.type === "UNAVAILABLE") {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const associationsQuery = query(
      collectionGroup(db, NONSTAFF_ASSOCIATION_COLLECTION),
      where("userId", "==", lookup.uid),
    );

    unsubscribeAssociations = onSnapshot(
      associationsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (cancelled) return;
        const currentVersion = ++resolutionVersion;
        stopPlayerListeners();
        clearResolvedProfiles();

        const resolution = resolveAuthoritativeAssociationSnapshot(presentedUser, {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          documents: snapshot.docs.map((associationDocument) => ({
            id: associationDocument.id,
            path: associationDocument.ref.path,
            data: associationDocument.data(),
          })),
        });

        if (resolution.type === "UNAVAILABLE") {
          setReadError("Authoritative player associations are unavailable.");
          setLoading(false);
          return;
        }

        if (resolution.associations.length === 0) {
          setReadError(null);
          setLoading(false);
          return;
        }

        const authoritativeProfiles = new Map<string, any>();
        setReadError(null);
        setLoading(true);

        for (const association of resolution.associations) {
          const key = associationKey(association.academyId, association.playerId);
          const playerReference = doc(
            db,
            "academies",
            association.academyId,
            "players",
            association.playerId,
          );

          const unsubscribePlayer = onSnapshot(
            playerReference,
            { includeMetadataChanges: true },
            (playerSnapshot) => {
              if (cancelled || currentVersion !== resolutionVersion) return;

              if (
                playerSnapshot.metadata.fromCache ||
                playerSnapshot.metadata.hasPendingWrites ||
                !playerSnapshot.exists() ||
                playerSnapshot.id !== association.playerId
              ) {
                authoritativeProfiles.delete(key);
                clearResolvedProfiles();
                setReadError("Authoritative player data is unavailable.");
                setLoading(false);
                return;
              }

              authoritativeProfiles.set(key, {
                ...mapCanonicalSnapshot(playerSnapshot),
                academyId: association.academyId,
                associationKey: key,
              });

              if (authoritativeProfiles.size === resolution.associations.length) {
                const nextProfiles = resolution.associations.map((item) =>
                  authoritativeProfiles.get(associationKey(item.academyId, item.playerId)),
                );
                setPlayerProfiles(nextProfiles);
                setResolvedScopeKey(expectedScopeKey);
                setSelectedProfileKey((previousKey) =>
                  previousKey &&
                  nextProfiles.some((profile) => profile.associationKey === previousKey)
                    ? previousKey
                    : nextProfiles[0].associationKey,
                );
                setReadError(null);
                setLoading(false);
              }
            },
            (error) => {
              if (cancelled || currentVersion !== resolutionVersion) return;
              ++resolutionVersion;
              stopPlayerListeners();
              clearResolvedProfiles();
              setReadError("Authoritative player data could not be loaded.");
              setLoading(false);
              console.error("Authoritative player listener failed:", error);
            },
          );
          unsubscribePlayers.push(unsubscribePlayer);
        }
      },
      (error) => {
        ++resolutionVersion;
        stopPlayerListeners();
        if (cancelled) return;
        clearResolvedProfiles();
        setReadError("Authoritative player associations could not be loaded.");
        setLoading(false);
        console.error("Authoritative association listener failed:", error);
      },
    );

    return () => {
      cancelled = true;
      ++resolutionVersion;
      unsubscribeAssociations?.();
      stopPlayerListeners();
    };
  }, [presentedUser]);

  const currentScopeKey = accessScopeKey(presentedUser);
  const visiblePlayerProfiles =
    resolvedScopeKey === currentScopeKey ? playerProfiles : [];
  const playerProfile =
    visiblePlayerProfiles.find(
      (profile) => profile.associationKey === selectedProfileKey,
    ) ||
    visiblePlayerProfiles[0] ||
    null;

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!playerProfile) {
    return (
      <div className="h-[calc(100vh-6rem)] w-full">
        <EmptyState
          icon={readError ? ShieldAlert : UserCircle}
          title={readError ? "Player data unavailable" : "Player Profile Not Found"}
          description={
            readError ||
            "No authoritative player association was found for this account. Please contact your coach or administrator."
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-24">
      {visiblePlayerProfiles.length > 1 && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          {visiblePlayerProfiles.map((profile) => (
            <button
              key={profile.associationKey}
              type="button"
              onClick={() => setSelectedProfileKey(profile.associationKey)}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${
                profile.associationKey === playerProfile.associationKey
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {profile.firstName} {profile.lastName}
            </button>
          ))}
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-6 shadow-xl">
        <div className="relative z-10 flex items-center gap-5">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-lime-300 bg-slate-800 text-lime-300">
            {playerProfile.avatar ? (
              <img
                src={playerProfile.avatar}
                alt={`${playerProfile.firstName} ${playerProfile.lastName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <UserCircle size={44} />
            )}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              {playerProfile.firstName} {playerProfile.lastName}
            </h1>
            <p className="mt-2 text-sm font-bold uppercase tracking-widest text-slate-300">
              {playerProfile.position || "Position unavailable"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <Activity className="text-amber-500" size={24} />
        <h2 className="mt-3 text-lg font-black text-slate-800">
          Wellness and peer voting unavailable
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          No authoritative wellness or peer-voting backend is configured. This screen does not
          accept local submissions or report a successful save.
        </p>
      </div>
    </div>
  );
}
