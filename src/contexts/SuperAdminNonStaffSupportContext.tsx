import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth, type User } from "./AuthContext";
import { useSuperAdminSupport } from "./SuperAdminSupportContext";
import {
  buildNonStaffSupportSubject,
  isExactActiveNonStaffSupportUser,
  resolveNonStaffPresentationRole,
  type NonStaffSupportRole,
  type NonStaffSupportSession,
} from "../lib/superAdminNonStaffSupportModel";
import { isExactActiveSuperAdmin, isExactDocumentId } from "../lib/superAdminSupportModel";
import {
  NONSTAFF_ASSOCIATION_COLLECTION,
  resolveAuthoritativeAssociationSnapshot,
} from "../lib/nonStaffPlayerAccess";
import { registerNonStaffSupportLogoutExit } from "../lib/supportLogoutCoordinator";
import {
  type NonStaffSupportAuthGuard,
  type PendingNonStaffSupportExitAction,
  type PendingNonStaffSupportExitAudit,
  convertNonStaffOrphanMarkerToClosureRecord,
  getOrCreateNonStaffTabId,
  loadActiveNonStaffSupportSessionMarkersForActor,
  NONSTAFF_HEARTBEAT_INTERVAL_MS,
  performBoundedNonStaffExitAudit,
  recoverStaleNonStaffOrphanMarkers,
  refreshActiveNonStaffSupportSessionHeartbeat,
  removeActiveNonStaffSupportSessionMarker,
  replayPendingNonStaffSupportExitAuditsForActor,
  saveActiveNonStaffSupportSessionMarker,
  savePendingNonStaffSupportExitAudit,
} from "../lib/durableNonStaffSupportAudit";

interface SuperAdminNonStaffSupportContextValue {
  session: NonStaffSupportSession | null;
  isActive: boolean;
  presentationRole: NonStaffSupportRole | "NONE";
  effectiveUser: User | null;
  startNonStaffWorkMode: (academyId: string, targetUid: string) => Promise<void>;
  exitNonStaffWorkMode: () => Promise<void>;
}

const SuperAdminNonStaffSupportContext = createContext<
  SuperAdminNonStaffSupportContextValue | undefined
>(undefined);

export function SuperAdminNonStaffSupportProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { actualUser } = useAuth();
  const staffSupport = useSuperAdminSupport();
  const [session, setSession] = useState<NonStaffSupportSession | null>(null);
  const [effectiveUser, setEffectiveUser] = useState<User | null>(null);
  const unsubscribeUserRef = useRef<(() => void) | null>(null);
  const unsubscribeAssociationsRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const sessionRef = useRef<NonStaffSupportSession | null>(null);
  const actualUserRef = useRef<User | null>(actualUser);
  const activeSessionIdRef = useRef<string | null>(null);

  const clearListeners = () => {
    unsubscribeUserRef.current?.();
    unsubscribeAssociationsRef.current?.();
    unsubscribeUserRef.current = null;
    unsubscribeAssociationsRef.current = null;
  };

  const clearSessionState = () => {
    generationRef.current += 1;
    clearListeners();
    sessionRef.current = null;
    activeSessionIdRef.current = null;
    setSession(null);
    setEffectiveUser(null);
  };

  const createAuthGuard = (
    actorUid: string,
    generation: number,
  ): NonStaffSupportAuthGuard => ({
    validate() {
      if (generationRef.current !== generation) {
        throw new Error("Nonstaff support generation changed.");
      }
      if (!isExactActiveSuperAdmin(actualUserRef.current)) {
        throw new Error("Actor is no longer an active SUPERADMIN.");
      }
      const liveUid = actualUserRef.current?.uid || actualUserRef.current?.id;
      if (liveUid !== actorUid) {
        throw new Error("Actor UID changed during nonstaff support audit.");
      }
    },
  });

  const writeStartAudit = async (targetSession: NonStaffSupportSession) => {
    const actorUid = actualUserRef.current?.uid || actualUserRef.current?.id;
    if (
      !isExactActiveSuperAdmin(actualUserRef.current) ||
      !isExactDocumentId(actorUid)
    ) {
      throw new Error("Active SUPERADMIN actor is required for support audit.");
    }

    await addDoc(collection(db, "logs"), {
      action: "SUPERADMIN_NONSTAFF_WORK_STARTED",
      actorUid,
      academyId: targetSession.academyId,
      mode: "WORK_AS_NONSTAFF",
      targetUid: targetSession.subject.uid,
      effectiveRole: targetSession.subject.role,
      timestamp: serverTimestamp(),
    });
  };

  const durableSessionClosure = async (
    closingSession: NonStaffSupportSession,
    actorUid: string,
    action: PendingNonStaffSupportExitAction,
    sessionId: string | null,
    guard?: NonStaffSupportAuthGuard,
  ) => {
    const pendingRecord: PendingNonStaffSupportExitAudit = {
      logDocId: doc(collection(db, "logs")).id,
      actorUid,
      action,
      academyId: closingSession.academyId,
      mode: "WORK_AS_NONSTAFF",
      targetUid: closingSession.subject.uid,
      effectiveRole: closingSession.subject.role,
      createdAt: Date.now(),
    };

    savePendingNonStaffSupportExitAudit(pendingRecord);
    if (sessionId) {
      removeActiveNonStaffSupportSessionMarker(actorUid, sessionId);
    }
    await performBoundedNonStaffExitAudit(db, pendingRecord, { guard });
  };

  useEffect(() => {
    actualUserRef.current = actualUser;

    if (isExactActiveSuperAdmin(actualUser)) {
      const actorUid = actualUser.uid || actualUser.id;
      if (isExactDocumentId(actorUid)) {
        const tabId = getOrCreateNonStaffTabId();
        recoverStaleNonStaffOrphanMarkers(actorUid, tabId);
        const guard = createAuthGuard(actorUid, generationRef.current);
        replayPendingNonStaffSupportExitAuditsForActor(actualUser, db, {
          guard,
        }).catch((error) => {
          console.warn("Nonstaff support audit replay failed:", error);
        });
      }
    } else {
      generationRef.current += 1;
      clearListeners();
      sessionRef.current = null;
      activeSessionIdRef.current = null;
      setSession(null);
      setEffectiveUser(null);
    }

    return () => clearListeners();
  }, [actualUser]);

  useEffect(() => {
    const handlePageHide = () => {
      const actorUid = actualUserRef.current?.uid || actualUserRef.current?.id;
      const activeSessionId = activeSessionIdRef.current;
      if (!isExactDocumentId(actorUid) || !activeSessionId) return;

      const tabId = getOrCreateNonStaffTabId();
      const markers = loadActiveNonStaffSupportSessionMarkersForActor(actorUid).filter(
        (marker) => marker.tabId === tabId && marker.sessionId === activeSessionId,
      );

      for (const marker of markers) {
        try {
          const closure = convertNonStaffOrphanMarkerToClosureRecord(marker);
          savePendingNonStaffSupportExitAudit(closure);
          removeActiveNonStaffSupportSessionMarker(actorUid, marker.sessionId);
        } catch {
          // Best effort during unload. Marker remains for stale-orphan recovery.
        }
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  useEffect(() => {
    const activeSessionId = activeSessionIdRef.current;
    const actorUid = actualUserRef.current?.uid || actualUserRef.current?.id;
    if (!session || !activeSessionId || !isExactDocumentId(actorUid)) return;

    const intervalId = window.setInterval(() => {
      refreshActiveNonStaffSupportSessionHeartbeat(actorUid, activeSessionId);
    }, NONSTAFF_HEARTBEAT_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [session]);

  const startNonStaffWorkMode = async (
    academyId: string,
    targetUid: string,
  ) => {
    const generation = ++generationRef.current;
    clearListeners();
    sessionRef.current = null;
    activeSessionIdRef.current = null;
    setSession(null);
    setEffectiveUser(null);

    if (staffSupport.isSupportActive) {
      throw new Error("Exit the current Academy/Staff support session before starting Parent/Player Work As.");
    }
    if (!isExactActiveSuperAdmin(actualUserRef.current)) {
      throw new Error("Only an active SUPERADMIN can start non-staff Work As mode.");
    }
    if (!isExactDocumentId(academyId) || !isExactDocumentId(targetUid)) {
      throw new Error("Academy ID and target UID must be exact Firestore document IDs.");
    }
    const actorUid = actualUserRef.current.uid || actualUserRef.current.id;
    if (!isExactDocumentId(actorUid) || actorUid === targetUid) {
      throw new Error("Invalid Work As target.");
    }

    const [academySnap, userSnap, associationSnap] = await Promise.all([
      getDocFromServer(doc(db, "academies", academyId)),
      getDocFromServer(doc(db, "users", targetUid)),
      getDocsFromServer(
        collection(
          db,
          "academies",
          academyId,
          "nonstaffUsers",
          targetUid,
          NONSTAFF_ASSOCIATION_COLLECTION,
        ),
      ),
    ]);

    if (generation !== generationRef.current) {
      throw new Error("Work As activation was superseded.");
    }
    if (!academySnap.exists()) {
      throw new Error("Academy not found.");
    }
    if (!userSnap.exists()) {
      throw new Error("Target user not found.");
    }

    const targetUser = {
      ...(userSnap.data() as User),
      id: targetUid,
      uid: targetUid,
    } satisfies User;

    if (!isExactActiveNonStaffSupportUser(targetUser, targetUid)) {
      throw new Error("Target must be an active PARENT or PLAYER account.");
    }

    const resolution = resolveAuthoritativeAssociationSnapshot(targetUser, {
      fromCache: false,
      hasPendingWrites: false,
      documents: associationSnap.docs.map((associationDocument) => ({
        id: associationDocument.id,
        path: associationDocument.ref.path,
        data: associationDocument.data(),
      })),
    });

    if (
      resolution.type !== "AUTHORIZED_ASSOCIATIONS" ||
      !resolution.associations.some(
        (association) => association.academyId === academyId,
      )
    ) {
      throw new Error("No active authoritative player association exists in this Academy.");
    }

    const subject = buildNonStaffSupportSubject(targetUser);
    if (!subject) {
      throw new Error("Unable to build authoritative Work As subject.");
    }

    const nextSession: NonStaffSupportSession = {
      academyId,
      subject,
      startedAt: Date.now(),
    };

    await writeStartAudit(nextSession);
    if (generation !== generationRef.current) {
      throw new Error("Work As activation changed while audit was being written.");
    }

    const sessionId = doc(collection(db, "_")).id;
    saveActiveNonStaffSupportSessionMarker({
      sessionId,
      actorUid,
      academyId,
      mode: "WORK_AS_NONSTAFF",
      targetUid,
      effectiveRole: subject.role,
      startedAt: nextSession.startedAt,
      tabId: getOrCreateNonStaffTabId(),
      heartbeatAt: Date.now(),
    });
    activeSessionIdRef.current = sessionId;
    sessionRef.current = nextSession;
    setEffectiveUser(targetUser);
    setSession(nextSession);

    const invalidate = () => {
      if (generation !== generationRef.current) return;
      const invalidatedSession = sessionRef.current;
      const invalidatedSessionId = activeSessionIdRef.current;
      const capturedActorUid = actualUserRef.current?.uid || actualUserRef.current?.id;

      clearSessionState();

      if (!invalidatedSession || !isExactDocumentId(capturedActorUid)) return;
      const pendingRecord: PendingNonStaffSupportExitAudit = {
        logDocId: doc(collection(db, "logs")).id,
        actorUid: capturedActorUid,
        action: "SUPERADMIN_NONSTAFF_WORK_INVALIDATED",
        academyId: invalidatedSession.academyId,
        mode: "WORK_AS_NONSTAFF",
        targetUid: invalidatedSession.subject.uid,
        effectiveRole: invalidatedSession.subject.role,
        createdAt: Date.now(),
      };

      try {
        savePendingNonStaffSupportExitAudit(pendingRecord);
        if (invalidatedSessionId) {
          removeActiveNonStaffSupportSessionMarker(
            capturedActorUid,
            invalidatedSessionId,
          );
        }

        const liveUid = actualUserRef.current?.uid || actualUserRef.current?.id;
        if (
          isExactActiveSuperAdmin(actualUserRef.current) &&
          liveUid === capturedActorUid
        ) {
          const guard = createAuthGuard(capturedActorUid, generationRef.current);
          performBoundedNonStaffExitAudit(db, pendingRecord, { guard }).catch(
            (error) => console.warn("Nonstaff invalidation audit failed:", error),
          );
        }
      } catch (error) {
        console.warn("Unable to persist nonstaff invalidation audit:", error);
      }
    };

    unsubscribeUserRef.current = onSnapshot(
      doc(db, "users", targetUid),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (generation !== generationRef.current) return;
        if (
          snapshot.metadata.fromCache ||
          snapshot.metadata.hasPendingWrites
        ) {
          // Preserve the last server-authoritative nonstaff support session.
          // Do not consume transient cache/local-pending user snapshots.
          return;
        }
        if (!snapshot.exists()) {
          invalidate();
          return;
        }
        const liveUser = {
          ...(snapshot.data() as User),
          id: targetUid,
          uid: targetUid,
        } satisfies User;
        if (!isExactActiveNonStaffSupportUser(liveUser, targetUid)) {
          invalidate();
          return;
        }
        setEffectiveUser(liveUser);
      },
      invalidate,
    );

    unsubscribeAssociationsRef.current = onSnapshot(
      collection(
        db,
        "academies",
        academyId,
        "nonstaffUsers",
        targetUid,
        NONSTAFF_ASSOCIATION_COLLECTION,
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (generation !== generationRef.current) return;
        if (
          snapshot.metadata.fromCache ||
          snapshot.metadata.hasPendingWrites
        ) {
          // Preserve the last server-authoritative nonstaff support session.
          // Do not consume transient cache/local-pending association snapshots.
          return;
        }
        const liveResolution = resolveAuthoritativeAssociationSnapshot(targetUser, {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          documents: snapshot.docs.map((associationDocument) => ({
            id: associationDocument.id,
            path: associationDocument.ref.path,
            data: associationDocument.data(),
          })),
        });
        if (
          liveResolution.type !== "AUTHORIZED_ASSOCIATIONS" ||
          !liveResolution.associations.some(
            (association) => association.academyId === academyId,
          )
        ) {
          invalidate();
        }
      },
      invalidate,
    );
  };

  const exitNonStaffWorkMode = async () => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;

    const actorUid = actualUserRef.current?.uid || actualUserRef.current?.id;
    if (
      !isExactActiveSuperAdmin(actualUserRef.current) ||
      !isExactDocumentId(actorUid)
    ) {
      throw new Error("Cannot safely exit nonstaff Work As without active SUPERADMIN actor.");
    }

    const generation = generationRef.current;
    const guard = createAuthGuard(actorUid, generation);
    await durableSessionClosure(
      activeSession,
      actorUid,
      "SUPERADMIN_NONSTAFF_WORK_ENDED",
      activeSessionIdRef.current,
      guard,
    );
    clearSessionState();
  };

  useEffect(() => {
    return registerNonStaffSupportLogoutExit(exitNonStaffWorkMode);
  }, [session, actualUser]);

  return (
    <SuperAdminNonStaffSupportContext.Provider
      value={{
        session,
        isActive: session !== null,
        presentationRole: resolveNonStaffPresentationRole(session),
        effectiveUser,
        startNonStaffWorkMode,
        exitNonStaffWorkMode,
      }}
    >
      {children}
    </SuperAdminNonStaffSupportContext.Provider>
  );
}

export function useSuperAdminNonStaffSupport() {
  const context = useContext(SuperAdminNonStaffSupportContext);
  if (!context) {
    throw new Error(
      "useSuperAdminNonStaffSupport must be used within SuperAdminNonStaffSupportProvider",
    );
  }
  return context;
}
