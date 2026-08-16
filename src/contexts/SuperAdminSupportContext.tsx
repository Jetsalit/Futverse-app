import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { db } from "../lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "./AuthContext";
import type {
  SuperAdminSupportSession,
  SuperAdminSupportSubject,
} from "../types/SuperAdminSupport";
import {
  canEnterAcademyWorkspace,
  canStartStaffWorkMode,
  isAuthoritativeSnapshotMetadata,
  isExactActiveStaffMembership,
  isExactActiveStaffMembershipForRole,
  isExactActiveSuperAdmin,
  isExactDocumentId,
  resolveSupportPresentationRole,
} from "../lib/superAdminSupportModel";
import {
  type AuthGuard,
  type PendingSupportExitAction,
  type PendingSupportExitAudit,
  convertOrphanMarkerToClosureRecord,
  getOrCreateTabId,
  HEARTBEAT_INTERVAL_MS,
  loadActiveSessionMarkersForActor,
  performBoundedExitAudit,
  recoverStaleOrphanMarkers,
  refreshActiveSessionHeartbeat,
  removeActiveSessionMarker,
  replayPendingSupportExitAuditsForActor,
  saveActiveSessionMarker,
  savePendingSupportExitAudit,
} from "../lib/durableSupportExitAudit";

interface SuperAdminSupportContextType {
  session: SuperAdminSupportSession | null;
  activeAcademyId: string | null;
  supportSubject: SuperAdminSupportSubject | null;
  isSupportActive: boolean;
  isStaffWorkMode: boolean;
  isStaffAuthorityRevalidating: boolean;
  presentationRole: "SUPERADMIN" | "ADMIN" | "COACH" | "NONE";
  enterAcademyWorkspace: (academyId: string) => Promise<void>;
  startStaffWorkMode: (academyId: string, targetUid: string) => Promise<void>;
  exitSupportMode: () => Promise<void>;
}

const SuperAdminSupportContext = createContext<
  SuperAdminSupportContextType | undefined
>(undefined);

const STAFF_AUTHORITY_TIMEOUT_MS = 15_000;

export function SuperAdminSupportProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { actualUser } = useAuth();
  const [session, setSession] = useState<SuperAdminSupportSession | null>(
    null,
  );
  const [isStaffAuthorityRevalidating, setIsStaffAuthorityRevalidating] =
    useState(false);
  const membershipUnsubscribeRef = useRef<(() => void) | null>(null);
  const operationGenerationRef = useRef<number>(0);
  const sessionRef = useRef<SuperAdminSupportSession | null>(null);
  const actualUserRef = useRef(actualUser);
  const activeSessionIdRef = useRef<string | null>(null);
  const authorityRevalidationGenerationRef = useRef(0);

  const clearMembershipListener = () => {
    if (membershipUnsubscribeRef.current) {
      membershipUnsubscribeRef.current();
      membershipUnsubscribeRef.current = null;
    }
  };

  const clearAuthorityRevalidation = () => {
    authorityRevalidationGenerationRef.current += 1;
    setIsStaffAuthorityRevalidating(false);
  };

  // ==========================================
  // Auth guard factory (Section B)
  // ==========================================

  const createAuthGuard = (
    capturedActorUid: string,
    capturedGeneration: number,
  ): AuthGuard => ({
    validate() {
      if (operationGenerationRef.current !== capturedGeneration) {
        throw new Error("Auth generation changed; aborting durable operation.");
      }
      if (!isExactActiveSuperAdmin(actualUserRef.current)) {
        throw new Error("Actor is no longer an active SUPERADMIN.");
      }
      const currentUid =
        actualUserRef.current?.uid || actualUserRef.current?.id;
      if (currentUid !== capturedActorUid) {
        throw new Error("Actor UID changed; aborting durable operation.");
      }
    },
  });

  // ==========================================
  // Lifecycle: actualUser change — orphan recovery + replay + auth loss
  // ==========================================

  useEffect(() => {
    actualUserRef.current = actualUser;
    if (isExactActiveSuperAdmin(actualUser)) {
      const actorUid = actualUser?.uid;
      if (isExactDocumentId(actorUid)) {
        const tabId = getOrCreateTabId();

        recoverStaleOrphanMarkers(actorUid, tabId);

        const guard = createAuthGuard(actorUid, operationGenerationRef.current);
        replayPendingSupportExitAuditsForActor(actualUser, db, {
          guard,
        }).catch((err) => {
          console.warn(
            "Background replay of pending support exit audits error:",
            err,
          );
        });
      }
    } else {
      operationGenerationRef.current++;
      clearMembershipListener();
      clearAuthorityRevalidation();
      sessionRef.current = null;
      activeSessionIdRef.current = null;
      setSession(null);
    }
  }, [actualUser]);

  // ==========================================
  // Lifecycle: pagehide — convert own tab's active marker to closure
  // ==========================================

  useEffect(() => {
    const handlePageHide = () => {
      const actorUid = actualUserRef.current?.uid;
      if (!actorUid || !activeSessionIdRef.current) return;

      const tabId = getOrCreateTabId();
      const markers = loadActiveSessionMarkersForActor(actorUid).filter(
        (m) => m.tabId === tabId,
      );

      for (const marker of markers) {
        try {
          const closureRecord = convertOrphanMarkerToClosureRecord(marker);
          savePendingSupportExitAudit(closureRecord);
          removeActiveSessionMarker(actorUid, marker.sessionId);
        } catch {
          // Best-effort during unload — marker remains for orphan recovery
        }
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      clearMembershipListener();
    };
  }, []);

  // ==========================================
  // Lifecycle: heartbeat interval for active session marker
  // ==========================================

  useEffect(() => {
    if (!session || !activeSessionIdRef.current) return;

    const actorUid = actualUserRef.current?.uid;
    if (!actorUid) return;

    const sessionId = activeSessionIdRef.current;

    const intervalId = setInterval(() => {
      refreshActiveSessionHeartbeat(actorUid, sessionId);
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [session]);

  // ==========================================
  // Helpers
  // ==========================================

  const assertAuthoritativeSessionActivation = (expectedOpGen: number) => {
    if (!isExactActiveSuperAdmin(actualUserRef.current)) {
      throw new Error(
        "Revalidation failed: actualUser is no longer an active SUPERADMIN.",
      );
    }
    if (operationGenerationRef.current !== expectedOpGen) {
      throw new Error("Support mode operation was superseded or cancelled.");
    }
  };

  const writeAuditLog = async (
    action: string,
    academyId: string,
    mode: string,
    targetUid?: string,
    effectiveTenantRole?: string,
  ) => {
    const actorUid = actualUserRef.current?.uid;
    if (!isExactDocumentId(actorUid)) {
      throw new Error("Invalid actorUid for audit log.");
    }
    await addDoc(collection(db, "logs"), {
      action,
      actorUid,
      academyId,
      mode,
      targetUid: targetUid || null,
      effectiveTenantRole: effectiveTenantRole || null,
      timestamp: serverTimestamp(),
    });
  };

  // ==========================================
  // Durable session closure primitive (Section D)
  // ==========================================

  const durableSessionClosure = async (
    closingSession: SuperAdminSupportSession,
    actorUid: string,
    action: PendingSupportExitAction,
    sessionId: string | null,
    guard: AuthGuard | null,
  ): Promise<void> => {
    const logDocId = doc(collection(db, "logs")).id;
    const pendingRecord: PendingSupportExitAudit = {
      logDocId,
      actorUid,
      action,
      academyId: closingSession.academyId,
      mode: closingSession.mode,
      targetUid: closingSession.subject?.uid || null,
      effectiveTenantRole: closingSession.subject?.tenantRole || null,
      createdAt: Date.now(),
    };

    savePendingSupportExitAudit(pendingRecord);

    if (sessionId) {
      removeActiveSessionMarker(actorUid, sessionId);
    }

    await performBoundedExitAudit(db, pendingRecord, {
      guard: guard ?? undefined,
    });
  };

  // ==========================================
  // Forced membership invalidation
  // ==========================================

  const invalidateWorkMode = (reason: string) => {
    console.warn(`Work Mode invalidated: ${reason}`);

    const capturedSession = sessionRef.current;
    const capturedActorUid = actualUserRef.current?.uid;
    const capturedSessionId = activeSessionIdRef.current;

    operationGenerationRef.current++;
    clearMembershipListener();
    clearAuthorityRevalidation();
    sessionRef.current = null;
    activeSessionIdRef.current = null;
    setSession(null);

    if (!capturedSession || !isExactDocumentId(capturedActorUid)) return;

    try {
      const logDocId = doc(collection(db, "logs")).id;
      const closureRecord: PendingSupportExitAudit = {
        logDocId,
        actorUid: capturedActorUid,
        action: "SUPERADMIN_STAFF_WORK_INVALIDATED",
        academyId: capturedSession.academyId,
        mode: capturedSession.mode,
        targetUid: capturedSession.subject?.uid || null,
        effectiveTenantRole: capturedSession.subject?.tenantRole || null,
        createdAt: Date.now(),
      };
      savePendingSupportExitAudit(closureRecord);

      if (capturedSessionId) {
        removeActiveSessionMarker(capturedActorUid, capturedSessionId);
      }

      const currentActorUid = actualUserRef.current?.uid;
      if (
        isExactActiveSuperAdmin(actualUserRef.current) &&
        currentActorUid === capturedActorUid
      ) {
        const newGeneration = operationGenerationRef.current;
        const guard = createAuthGuard(capturedActorUid, newGeneration);
        performBoundedExitAudit(db, closureRecord, { guard }).catch((err) => {
          console.warn("Bounded invalidation audit write failed:", err);
        });
      }
    } catch (err) {
      console.warn("Failed to persist invalidation audit record:", err);
    }
  };

  // ==========================================
  // enterAcademyWorkspace
  // ==========================================

  const enterAcademyWorkspace = async (academyId: string) => {
    const currentOpGen = ++operationGenerationRef.current;
    clearAuthorityRevalidation();

    if (sessionRef.current === null) {
      clearMembershipListener();
    }

    if (!isExactActiveSuperAdmin(actualUserRef.current)) {
      throw new Error(
        "Only an active SUPERADMIN can enter an Academy workspace.",
      );
    }
    if (!isExactDocumentId(academyId)) {
      throw new Error("Academy ID must be an exact document ID.");
    }

    const actorUid = actualUserRef.current?.uid;
    if (!isExactDocumentId(actorUid)) {
      throw new Error("Invalid actorUid.");
    }

    const academySnap = await getDocFromServer(doc(db, "academies", academyId));
    if (!academySnap.exists()) {
      throw new Error(`Academy document '${academyId}' not found.`);
    }

    assertAuthoritativeSessionActivation(currentOpGen);

    const previousSession = sessionRef.current;

    if (previousSession) {
      const endAction: PendingSupportExitAction =
        previousSession.mode === "WORK_AS_STAFF"
          ? "SUPERADMIN_STAFF_WORK_ENDED"
          : "SUPERADMIN_ACADEMY_WORKSPACE_ENDED";
      const guard = createAuthGuard(actorUid, currentOpGen);

      await durableSessionClosure(
        previousSession,
        actorUid,
        endAction,
        activeSessionIdRef.current,
        guard,
      );

      clearMembershipListener();
      sessionRef.current = null;
      activeSessionIdRef.current = null;
      setSession(null);
    }

    assertAuthoritativeSessionActivation(currentOpGen);

    let startAuditSucceeded = false;
    await writeAuditLog(
      "SUPERADMIN_ACADEMY_WORKSPACE_STARTED",
      academyId,
      "ACADEMY_WORKSPACE",
      undefined,
      "SUPERADMIN",
    );
    startAuditSucceeded = true;

    try {
      assertAuthoritativeSessionActivation(currentOpGen);
    } catch (err) {
      if (startAuditSucceeded) {
        try {
          await writeAuditLog(
            "SUPERADMIN_ACADEMY_WORKSPACE_ABORTED",
            academyId,
            "ACADEMY_WORKSPACE",
            undefined,
            "SUPERADMIN",
          );
        } catch (abortErr) {
          console.warn("Failed to write abort audit log:", abortErr);
        }
      }
      throw err;
    }

    const sessionId = doc(collection(db, "_")).id;
    saveActiveSessionMarker({
      sessionId,
      actorUid,
      academyId,
      mode: "ACADEMY_WORKSPACE",
      targetUid: null,
      tenantRole: null,
      startedAt: Date.now(),
      tabId: getOrCreateTabId(),
      heartbeatAt: Date.now(),
    });
    activeSessionIdRef.current = sessionId;

    const newSession: SuperAdminSupportSession = {
      academyId,
      mode: "ACADEMY_WORKSPACE",
      startedAt: Date.now(),
    };
    sessionRef.current = newSession;
    setSession(newSession);
  };

  // ==========================================
  // startStaffWorkMode
  // ==========================================

  const startStaffWorkMode = async (
    academyId: string,
    targetUid: string,
  ) => {
    const currentOpGen = ++operationGenerationRef.current;
    clearAuthorityRevalidation();

    if (sessionRef.current === null) {
      clearMembershipListener();
    }

    if (!canEnterAcademyWorkspace(actualUserRef.current, academyId)) {
      throw new Error(
        "Only an active SUPERADMIN can start Staff Work Mode.",
      );
    }
    if (!isExactDocumentId(targetUid)) {
      throw new Error("Target UID must be an exact document ID.");
    }
    const actorUid = actualUserRef.current?.uid;
    if (!isExactDocumentId(actorUid)) {
      throw new Error("Invalid actorUid.");
    }
    if (actorUid === targetUid) {
      throw new Error(
        "SuperAdmin cannot start Work Mode for their own UID.",
      );
    }

    const academyRef = doc(db, "academies", academyId);
    const academySnap = await getDocFromServer(academyRef);
    if (!academySnap.exists()) {
      throw new Error(`Academy document '${academyId}' not found.`);
    }

    const memberRef = doc(
      db,
      "academies",
      academyId,
      "members",
      targetUid,
    );
    const memberSnap = await getDocFromServer(memberRef);

    if (!memberSnap.exists()) {
      throw new Error(
        `Membership not found for target UID '${targetUid}'.`,
      );
    }

    const memberData = memberSnap.data();
    if (
      !isExactActiveStaffMembership(
        memberData,
        targetUid,
        academyId,
        memberSnap.id,
      )
    ) {
      throw new Error(
        "Target Membership is not an active ADMIN or COACH membership.",
      );
    }

    const tenantRole = memberData.role as "ADMIN" | "COACH";

    let displayName: string | undefined = undefined;
    try {
      const userSnap = await getDoc(doc(db, "users", targetUid));
      if (userSnap.exists() && typeof userSnap.data()?.name === "string") {
        displayName = userSnap.data()?.name;
      }
    } catch {
      // Display name is optional metadata.
    }

    assertAuthoritativeSessionActivation(currentOpGen);

    const previousSession = sessionRef.current;

    if (previousSession) {
      const endAction: PendingSupportExitAction =
        previousSession.mode === "WORK_AS_STAFF"
          ? "SUPERADMIN_STAFF_WORK_ENDED"
          : "SUPERADMIN_ACADEMY_WORKSPACE_ENDED";
      const guard = createAuthGuard(actorUid, currentOpGen);

      await durableSessionClosure(
        previousSession,
        actorUid,
        endAction,
        activeSessionIdRef.current,
        guard,
      );

      clearMembershipListener();
      sessionRef.current = null;
      activeSessionIdRef.current = null;
      setSession(null);
    }

    assertAuthoritativeSessionActivation(currentOpGen);

    const newSession: SuperAdminSupportSession = {
      academyId,
      mode: "WORK_AS_STAFF",
      subject: {
        uid: targetUid,
        role: tenantRole,
        tenantRole,
        displayName,
      },
      startedAt: Date.now(),
    };

    const expectedUid = targetUid;
    const expectedAcademyId = academyId;
    const expectedSession = newSession;

    const isExpectedSession = () => {
      const activeSess = sessionRef.current;
      return Boolean(
        activeSess === expectedSession &&
          activeSess.mode === "WORK_AS_STAFF" &&
          activeSess.subject?.uid === expectedUid &&
          activeSess.academyId === expectedAcademyId,
      );
    };

    let hasAchievedServerAuthority = false;
    let isAuthorityValidForActivation = false;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            "Timeout waiting for authoritative target Membership data.",
          ),
        );
      }, STAFF_AUTHORITY_TIMEOUT_MS);

      const finishPendingPhase = (error?: Error) => {
        clearTimeout(timeoutId);
        if (error) {
          reject(error);
        } else {
          hasAchievedServerAuthority = true;
          isAuthorityValidForActivation = true;
          resolve();
        }
      };

      const unsubscribe = onSnapshot(
        memberRef,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!hasAchievedServerAuthority) {
            if (snapshot.metadata.hasPendingWrites) {
              finishPendingPhase(
                new Error(
                  "Pending writes detected before server authority established.",
                ),
              );
              return;
            }
            if (snapshot.metadata.fromCache) {
              return;
            }

            if (!snapshot.exists()) {
              finishPendingPhase(
                new Error("Target Membership was deleted."),
              );
              return;
            }
            const data = snapshot.data();
            if (
              !isExactActiveStaffMembershipForRole(
                data,
                expectedUid,
                expectedAcademyId,
                snapshot.id,
                tenantRole,
              )
            ) {
              finishPendingPhase(
                new Error(
                  "Target Membership became inactive, invalid, or changed role.",
                ),
              );
              return;
            }

            finishPendingPhase();
            return;
          }

          if (snapshot.metadata.fromCache) {
            isAuthorityValidForActivation = false;
            if (!isExpectedSession()) return;

            const revalidationGeneration =
              ++authorityRevalidationGenerationRef.current;
            setIsStaffAuthorityRevalidating(true);

            getDocFromServer(memberRef)
              .then((serverSnapshot) => {
                if (
                  authorityRevalidationGenerationRef.current !==
                    revalidationGeneration ||
                  !isExpectedSession()
                ) {
                  return;
                }

                if (
                  !serverSnapshot.exists() ||
                  !isExactActiveStaffMembershipForRole(
                    serverSnapshot.data(),
                    expectedUid,
                    expectedAcademyId,
                    serverSnapshot.id,
                    tenantRole,
                  )
                ) {
                  clearAuthorityRevalidation();
                  invalidateWorkMode(
                    "Target Membership failed authoritative server revalidation.",
                  );
                  return;
                }

                isAuthorityValidForActivation = true;
                clearAuthorityRevalidation();
              })
              .catch((error) => {
                if (
                  authorityRevalidationGenerationRef.current !==
                    revalidationGeneration ||
                  !isExpectedSession()
                ) {
                  return;
                }
                console.error(
                  "Unable to revalidate target Membership from server:",
                  error,
                );
                clearAuthorityRevalidation();
                invalidateWorkMode(
                  "Unable to revalidate target Membership from server.",
                );
              });
            return;
          }

          authorityRevalidationGenerationRef.current += 1;
          setIsStaffAuthorityRevalidating(false);

          let isValid = true;
          let invalidReason = "";

          if (snapshot.metadata.hasPendingWrites) {
            isValid = false;
            invalidReason =
              "Pending writes detected on active session.";
          } else if (!snapshot.exists()) {
            isValid = false;
            invalidReason = "Target Membership was deleted.";
          } else {
            const data = snapshot.data();
            if (
              !isExactActiveStaffMembershipForRole(
                data,
                expectedUid,
                expectedAcademyId,
                snapshot.id,
                tenantRole,
              )
            ) {
              isValid = false;
              invalidReason =
                "Target Membership became inactive, invalid, or changed role.";
            }
          }

          if (isValid) {
            isAuthorityValidForActivation = true;
            return;
          }

          isAuthorityValidForActivation = false;
          if (isExpectedSession()) {
            invalidateWorkMode(invalidReason);
          }
        },
        (error) => {
          if (!hasAchievedServerAuthority) {
            finishPendingPhase(error);
          } else {
            isAuthorityValidForActivation = false;
            if (isExpectedSession()) {
              console.error(
                "Error listening to target Membership:",
                error,
              );
              invalidateWorkMode("Error monitoring target Membership.");
            }
          }
        },
      );
      membershipUnsubscribeRef.current = unsubscribe;
    }).catch((err) => {
      if (operationGenerationRef.current === currentOpGen) {
        clearMembershipListener();
      }
      throw err;
    });

    assertAuthoritativeSessionActivation(currentOpGen);

    let startAuditSucceeded = false;
    await writeAuditLog(
      "SUPERADMIN_STAFF_WORK_STARTED",
      academyId,
      "WORK_AS_STAFF",
      targetUid,
      tenantRole,
    );
    startAuditSucceeded = true;

    try {
      assertAuthoritativeSessionActivation(currentOpGen);
    } catch (err) {
      if (startAuditSucceeded) {
        try {
          await writeAuditLog(
            "SUPERADMIN_STAFF_WORK_ABORTED",
            academyId,
            "WORK_AS_STAFF",
            targetUid,
            tenantRole,
          );
        } catch (abortErr) {
          console.warn("Failed to write abort audit log:", abortErr);
        }
      }
      throw err;
    }

    if (!isAuthorityValidForActivation) {
      if (operationGenerationRef.current === currentOpGen) {
        clearMembershipListener();
      }
      try {
        await writeAuditLog(
          "SUPERADMIN_STAFF_WORK_INVALIDATED",
          academyId,
          "WORK_AS_STAFF",
          targetUid,
          tenantRole,
        );
      } catch (err) {
        console.warn("Failed to write invalidation audit log:", err);
      }
      throw new Error(
        "Target Membership became invalid during session activation.",
      );
    }

    const sessionId = doc(collection(db, "_")).id;
    saveActiveSessionMarker({
      sessionId,
      actorUid,
      academyId,
      mode: "WORK_AS_STAFF",
      targetUid,
      tenantRole,
      startedAt: Date.now(),
      tabId: getOrCreateTabId(),
      heartbeatAt: Date.now(),
    });
    activeSessionIdRef.current = sessionId;

    sessionRef.current = newSession;
    setSession(newSession);
  };

  // ==========================================
  // exitSupportMode — explicit exit via durable lifecycle
  // ==========================================

  const exitSupportMode = async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      return;
    }

    const actorUid = actualUserRef.current?.uid;
    if (
      !isExactActiveSuperAdmin(actualUserRef.current) ||
      !isExactDocumentId(actorUid)
    ) {
      throw new Error(
        "Cannot safely exit support mode: actor is not an active SUPERADMIN.",
      );
    }

    const currentGen = operationGenerationRef.current;
    const guard = createAuthGuard(actorUid, currentGen);
    const action: PendingSupportExitAction =
      currentSession.mode === "WORK_AS_STAFF"
        ? "SUPERADMIN_STAFF_WORK_ENDED"
        : "SUPERADMIN_ACADEMY_WORKSPACE_ENDED";

    await durableSessionClosure(
      currentSession,
      actorUid,
      action,
      activeSessionIdRef.current,
      guard,
    );

    operationGenerationRef.current++;
    clearMembershipListener();
    clearAuthorityRevalidation();
    sessionRef.current = null;
    activeSessionIdRef.current = null;
    setSession(null);
  };

  const isSupportActive = session !== null;
  const isStaffWorkMode = session?.mode === "WORK_AS_STAFF";
  const activeAcademyId = session?.academyId ?? null;
  const supportSubject = session?.subject ?? null;
  const presentationRole = resolveSupportPresentationRole(session);

  return (
    <SuperAdminSupportContext.Provider
      value={{
        session,
        activeAcademyId,
        supportSubject,
        isSupportActive,
        isStaffWorkMode,
        isStaffAuthorityRevalidating,
        presentationRole,
        enterAcademyWorkspace,
        startStaffWorkMode,
        exitSupportMode,
      }}
    >
      {children}
    </SuperAdminSupportContext.Provider>
  );
}

export function useSuperAdminSupport() {
  const context = useContext(SuperAdminSupportContext);
  if (context === undefined) {
    throw new Error(
      "useSuperAdminSupport must be used within a SuperAdminSupportProvider",
    );
  }
  return context;
}
