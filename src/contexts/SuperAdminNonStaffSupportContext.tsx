import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth, type User } from "./AuthContext";
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
  exitNonStaffWorkMode: () => void;
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
  const [session, setSession] = useState<NonStaffSupportSession | null>(null);
  const [effectiveUser, setEffectiveUser] = useState<User | null>(null);
  const unsubscribeUserRef = useRef<(() => void) | null>(null);
  const unsubscribeAssociationsRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);

  const clearListeners = () => {
    unsubscribeUserRef.current?.();
    unsubscribeAssociationsRef.current?.();
    unsubscribeUserRef.current = null;
    unsubscribeAssociationsRef.current = null;
  };

  const clearSession = () => {
    generationRef.current += 1;
    clearListeners();
    setSession(null);
    setEffectiveUser(null);
  };

  useEffect(() => {
    if (!isExactActiveSuperAdmin(actualUser)) {
      clearSession();
    }
    return () => clearListeners();
  }, [actualUser]);

  const startNonStaffWorkMode = async (
    academyId: string,
    targetUid: string,
  ) => {
    const generation = ++generationRef.current;
    clearListeners();
    setSession(null);
    setEffectiveUser(null);

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

    setEffectiveUser(targetUser);
    setSession(nextSession);

    const invalidate = () => {
      if (generation === generationRef.current) clearSession();
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
        const currentUser = effectiveUser || targetUser;
        const liveResolution = resolveAuthoritativeAssociationSnapshot(currentUser, {
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

  const exitNonStaffWorkMode = () => clearSession();

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
