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
  type PendingSupportExitAudit,
  performBoundedExitAudit,
  replayPendingSupportExitAuditsForActor,
  savePendingSupportExitAudit,
} from "../lib/durableSupportExitAudit";

interface SuperAdminSupportContextType {
  session: SuperAdminSupportSession | null;
  activeAcademyId: string | null;
  supportSubject: SuperAdminSupportSubject | null;
  isSupportActive: boolean;
  isStaffWorkMode: boolean;
  presentationRole: "SUPERADMIN" | "ADMIN" | "COACH" | "PLAYER" | "PARENT" | "NONE";
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
  const membershipUnsubscribeRef = useRef<(() => void) | null>(null);
  const operationGenerationRef = useRef<number>(0);
  const sessionRef = useRef<SuperAdminSupportSession | null>(null);
  const actualUserRef = useRef(actualUser);

  const clearMembershipListener = () => {
    if (membershipUnsubscribeRef.current) {
      membershipUnsubscribeRef.current();
      membershipUnsubscribeRef.current = null;
    }
  };

  useEffect(() => {
    actualUserRef.current = actualUser;
    if (isExactActiveSuperAdmin(actualUser)) {
      replayPendingSupportExitAuditsForActor(actualUser, db).catch((err) => {
        console.warn("Background replay of pending support exit audits error:", err);
      });
    } else {
      // If the authenticated user is no longer an active SuperAdmin, clear support session immediately
      operationGenerationRef.current++;
      clearMembershipListener();
      sessionRef.current = null;
      setSession(null);
    }
  }, [actualUser]);

  useEffect(() => {
    return () => {
      clearMembershipListener();
    };
  }, []);

  const assertAuthoritativeSessionActivation = (expectedOpGen: number) => {
    if (!isExactActiveSuperAdmin(actualUserRef.current)) {
      throw new Error("Revalidation failed: actualUser is no longer an active SUPERADMIN.");
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
    const actorUid = actualUserRef.current?.uid || actualUserRef.current?.id;
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

  const invalidateWorkMode = (reason: string) => {
    console.warn(`Work Mode invalidated: ${reason}`);
    operationGenerationRef.current++;
    clearMembershipListener();
    const currentSession = sessionRef.current;
    sessionRef.current = null;
    setSession(null);

    if (currentSession) {
      writeAuditLog(
        "SUPERADMIN_STAFF_WORK_INVALIDATED",
        currentSession.academyId,
        currentSession.mode,
        currentSession.subject?.uid,
        currentSession.subject?.tenantRole,
      ).catch((err) => {
        console.warn("Failed to write invalidation audit log:", err);
      });
    }
  };

  const enterAcademyWorkspace = async (academyId: string) => {
    const currentOpGen = ++operationGenerationRef.current;

    if (sessionRef.current === null) {
      clearMembershipListener();
    }

    if (!isExactActiveSuperAdmin(actualUserRef.current)) {
      throw new Error("Only an active SUPERADMIN can enter an Academy workspace.");
    }
    if (!isExactDocumentId(academyId)) {
      throw new Error("Academy ID must be an exact document ID.");
    }

    const academySnap = await getDocFromServer(doc(db, "academies", academyId));
    if (!academySnap.exists()) {
      throw new Error(`Academy document '${academyId}' not found.`);
    }

    assertAuthoritativeSessionActivation(currentOpGen);

    const previousSession = sessionRef.current;

    if (previousSession) {
      clearMembershipListener();
      sessionRef.current = null;
      setSession(null);

      const endAction =
        previousSession.mode === "WORK_AS_STAFF"
          ? "SUPERADMIN_STAFF_WORK_ENDED"
          : "SUPERADMIN_ACADEMY_WORKSPACE_ENDED";
      try {
        await writeAuditLog(
          endAction,
          previousSession.academyId,
          previousSession.mode,
          previousSession.subject?.uid,
          previousSession.subject?.tenantRole,
        );
      } catch (err) {
        console.warn("Failed to write audit log for previous session closure:", err);
      }
    }

    assertAuthoritativeSessionActivation(currentOpGen);

    // START audit must throw if it fails so session is not presented as active
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

    const newSession: SuperAdminSupportSession = {
      academyId,
      mode: "ACADEMY_WORKSPACE",
      startedAt: Date.now(),
    };
    sessionRef.current = newSession;
    setSession(newSession);
  };

  const startStaffWorkMode = async (academyId: string, targetUid: string) => {
    const currentOpGen = ++operationGenerationRef.current;

    if (sessionRef.current === null) {
      clearMembershipListener();
    }

    if (!canEnterAcademyWorkspace(actualUserRef.current, academyId)) {
      throw new Error("Only an active SUPERADMIN can start Staff Work Mode.");
    }
    if (!isExactDocumentId(targetUid)) {
      throw new Error("Target UID must be an exact document ID.");
    }
    const actorUid = actualUserRef.current?.uid || actualUserRef.current?.id;
    if (actorUid === targetUid) {
      throw new Error("SuperAdmin cannot start Work Mode for their own UID.");
    }

    // FIX 2: Server-validate BOTH Academy document AND Membership document
    const academyRef = doc(db, "academies", academyId);
    const academySnap = await getDocFromServer(academyRef);
    if (!academySnap.exists()) {
      throw new Error(`Academy document '${academyId}' not found.`);
    }

    const memberRef = doc(db, "academies", academyId, "members", targetUid);
    const memberSnap = await getDocFromServer(memberRef);

    if (!memberSnap.exists()) {
      throw new Error(`Membership not found for target UID '${targetUid}'.`);
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

    // Optionally fetch user display name from /users/{targetUid} (best effort)
    let displayName: string | undefined = undefined;
    try {
      const userSnap = await getDoc(doc(db, "users", targetUid));
      if (userSnap.exists() && typeof userSnap.data()?.name === "string") {
        displayName = userSnap.data()?.name;
      }
    } catch {
      // Ignored - display name is optional metadata
    }

    assertAuthoritativeSessionActivation(currentOpGen);

    const previousSession = sessionRef.current;

    if (previousSession) {
      clearMembershipListener();
      sessionRef.current = null;
      setSession(null);

      const endAction =
        previousSession.mode === "WORK_AS_STAFF"
          ? "SUPERADMIN_STAFF_WORK_ENDED"
          : "SUPERADMIN_ACADEMY_WORKSPACE_ENDED";
      try {
        await writeAuditLog(
          endAction,
          previousSession.academyId,
          previousSession.mode,
          previousSession.subject?.uid,
          previousSession.subject?.tenantRole,
        );
      } catch (err) {
        console.warn("Failed to write audit log for previous session closure:", err);
      }
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
        reject(new Error("Timeout waiting for authoritative target Membership data."));
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
              finishPendingPhase(new Error("Pending writes detected before server authority established."));
              return;
            }
            if (snapshot.metadata.fromCache) {
              return; // Ignore initial cache
            }

            if (!snapshot.exists()) {
              finishPendingPhase(new Error("Target Membership was deleted."));
              return;
            }
            const data = snapshot.data();
            if (
              !isExactActiveStaffMembershipForRole(
                data,
                expectedUid,
                expectedAcademyId,
                snapshot.id,
                tenantRole
              )
            ) {
              finishPendingPhase(new Error("Target Membership became inactive, invalid, or changed role."));
              return;
            }

            finishPendingPhase();
            return;
          }

          // Active Phase
          let isValid = true;
          let invalidReason = "";

          if (snapshot.metadata.fromCache) {
            isValid = false;
            invalidReason = "Authoritative target Membership data lost (fell back to cache).";
          } else if (snapshot.metadata.hasPendingWrites) {
            isValid = false;
            invalidReason = "Pending writes detected on active session.";
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
                tenantRole
              )
            ) {
              isValid = false;
              invalidReason = "Target Membership became inactive, invalid, or changed role.";
            }
          }

          if (!isValid) {
            isAuthorityValidForActivation = false;
            if (isExpectedSession()) {
              invalidateWorkMode(invalidReason);
            }
          }
        },
        (error) => {
          if (!hasAchievedServerAuthority) {
            finishPendingPhase(error);
          } else {
            isAuthorityValidForActivation = false;
            if (isExpectedSession()) {
              console.error("Error listening to target Membership:", error);
              invalidateWorkMode("Error monitoring target Membership.");
            }
          }
        }
      );
      membershipUnsubscribeRef.current = unsubscribe;
    }).catch((err) => {
      if (operationGenerationRef.current === currentOpGen) {
        clearMembershipListener();
      }
      throw err;
    });

    assertAuthoritativeSessionActivation(currentOpGen);

    // START audit must succeed before presentation
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
      throw new Error("Target Membership became invalid during session activation.");
    }

    sessionRef.current = newSession;
    setSession(newSession);
  };

  const exitSupportMode = async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      return;
    }

    const actorUid = actualUserRef.current?.uid || actualUserRef.current?.id;
    if (!isExactActiveSuperAdmin(actualUserRef.current) || !isExactDocumentId(actorUid)) {
      throw new Error("Cannot safely exit support mode: actor is not an active SUPERADMIN.");
    }

    const action =
      currentSession.mode === "WORK_AS_STAFF"
        ? "SUPERADMIN_STAFF_WORK_ENDED"
        : "SUPERADMIN_ACADEMY_WORKSPACE_ENDED";

    const logDocId = doc(collection(db, "logs")).id;
    const pendingRecord: PendingSupportExitAudit = {
      logDocId,
      actorUid,
      action,
      academyId: currentSession.academyId,
      mode: currentSession.mode,
      targetUid: currentSession.subject?.uid || null,
      effectiveTenantRole: currentSession.subject?.tenantRole || null,
      createdAt: Date.now(),
    };

    // 1. Save record locally BEFORE clearing memory state
    try {
      savePendingSupportExitAudit(pendingRecord);
    } catch (storageErr) {
      throw new Error(
        "Failed to durably queue support exit audit locally before session clearance: " +
          String(storageErr),
      );
    }

    // 2. Clear in-memory session
    operationGenerationRef.current++;
    clearMembershipListener();
    sessionRef.current = null;
    setSession(null);

    // 3. Attempt bounded write to Firestore
    await performBoundedExitAudit(db, pendingRecord);
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
