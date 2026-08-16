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
    setSession(null);
    setEffectiveUser(null);
  };

  const writeAudit = async (
    action: "SUPERADMIN_NONSTAFF_WORK_STARTED" | "SUPERADMIN_NONSTAFF_WORK_ENDED" | "SUPERADMIN_NONSTAFF_WORK_INVALIDATED",
    targetSession: NonStaffSupportSession,
  ) => {
    const actorUid = actualUser?.uid || actualUser?.id;
    if (!isExactActiveSuperAdmin(actualUser) || !isExactDocumentId(actorUid)) {
      throw new Error("Active SUPERADMIN actor is required for support audit.");
    }

    await addDoc(collection(db, "logs"), {
      action,
      actorUid,
      academyId: targetSession.academyId,
      mode: "WORK_AS_NONSTAFF",
      targetUid: targetSession.subject.uid,
      effectiveRole: targetSession.subject.role,
      timestamp: serverTimestamp(),
    });
  };

  useEffect(() => {
    if (!isExactActiveSuperAdmin(actualUser)) {
      clearSessionState();
    }
    return () => clearListeners();
  }, [actualUser]);

  const startNonStaffWorkMode = async (
    academyId: string,
    targetUid: string,
  ) => {
    const generation = ++generationRef.current;
    clearListeners();
    sessionRef.current = null;
    setSession(null);
    setEffectiveUser(null);

    if (staffSupport.isSupportActive) {
      throw new Error("Exit the current Academy/Staff support session before starting Parent/Player Work As.");
    }
    if (!isExactActiveSuperAdmin(actualUser)) {
      throw new Error("Only an active SUPERADMIN can start non-staff Work As mode.");
    }
    if (!isExactDocumentId(academyId) || !isExactDocumentId(targetUid)) {
      throw new Error("Academy ID and target UID must be exact Firestore document IDs.");
    }
    const actorUid = actualUser.uid || actualUser.id;
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

    // Fail closed: do not present the target identity until START audit succeeds.
    await writeAudit("SUPERADMIN_NONSTAFF_WORK_STARTED", nextSession);
    if (generation !== generationRef.current) {
      throw new Error("Work As activation changed while audit was being written.");
    }

    sessionRef.current = nextSession;
    setEffectiveUser(targetUser);
    setSession(nextSession);

    const invalidate = () => {
      if (generation !== generationRef.current) return;
      const invalidatedSession = sessionRef.current;
      clearSessionState();
      if (invalidatedSession && isExactActiveSuperAdmin(actualUser)) {
        writeAudit("SUPERADMIN_NONSTAFF_WORK_INVALIDATED", invalidatedSession).catch(
          (error) => console.warn("Failed to write nonstaff invalidation audit:", error),
        );
      }
    };

    unsubscribeUserRef.current = onSnapshot(
      doc(db, "users", targetUid),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (generation !== generationRef.current) return;
        if (
          snapshot.metadata.fromCache ||
          snapshot.metadata.hasPendingWrites ||
          !snapshot.exists()
        ) {
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

    // Fail closed: if END audit cannot be persisted, keep the Work As session visible.
    await writeAudit("SUPERADMIN_NONSTAFF_WORK_ENDED", activeSession);
    clearSessionState();
  };

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
