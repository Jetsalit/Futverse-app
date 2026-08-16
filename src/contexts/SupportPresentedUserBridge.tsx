import { type ReactNode, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth, type User } from "./AuthContext";
import { useSuperAdminSupport } from "./SuperAdminSupportContext";
import { useSuperAdminNonStaffSupport } from "./SuperAdminNonStaffSupportContext";
import { isExactActiveSuperAdmin, isExactDocumentId } from "../lib/superAdminSupportModel";

const isActivePresentedTarget = (user: User, expectedUid: string): boolean => {
  const uid = user.uid || user.id;
  return (
    uid === expectedUid &&
    isExactDocumentId(uid) &&
    (user.status === "ACTIVE" || user.status === "Active") &&
    ["ADMIN", "COACH", "PARENT", "PLAYER"].includes(user.role)
  );
};

export function SupportPresentedUserBridge({ children }: { children: ReactNode }) {
  const { actualUser, setSupportPresentedUser } = useAuth();
  const staffSupport = useSuperAdminSupport();
  const nonStaffSupport = useSuperAdminNonStaffSupport();

  useEffect(() => {
    if (!isExactActiveSuperAdmin(actualUser)) {
      setSupportPresentedUser(null);
      return;
    }

    if (nonStaffSupport.isActive && nonStaffSupport.effectiveUser) {
      setSupportPresentedUser(nonStaffSupport.effectiveUser);
      return () => setSupportPresentedUser(null);
    }

    if (
      !staffSupport.isStaffWorkMode ||
      !staffSupport.supportSubject ||
      !isExactDocumentId(staffSupport.supportSubject.uid)
    ) {
      setSupportPresentedUser(null);
      return;
    }

    const targetUid = staffSupport.supportSubject.uid;
    const expectedRole = staffSupport.supportSubject.tenantRole;

    const unsubscribe = onSnapshot(
      doc(db, "users", targetUid),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (
          snapshot.metadata.fromCache ||
          snapshot.metadata.hasPendingWrites ||
          !snapshot.exists()
        ) {
          setSupportPresentedUser(null);
          return;
        }

        const user = {
          ...(snapshot.data() as User),
          id: targetUid,
          uid: targetUid,
        } satisfies User;

        if (
          !isActivePresentedTarget(user, targetUid) ||
          (expectedRole && user.role !== expectedRole)
        ) {
          setSupportPresentedUser(null);
          return;
        }

        setSupportPresentedUser(user);
      },
      () => setSupportPresentedUser(null),
    );

    return () => {
      unsubscribe();
      setSupportPresentedUser(null);
    };
  }, [
    actualUser,
    nonStaffSupport.isActive,
    nonStaffSupport.effectiveUser,
    staffSupport.isStaffWorkMode,
    staffSupport.supportSubject,
    setSupportPresentedUser,
  ]);

  return <>{children}</>;
}
