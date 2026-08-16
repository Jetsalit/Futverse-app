import type { User } from "../contexts/AuthContext";
import { isExactDocumentId } from "./superAdminSupportModel";

export interface AssistedRecordIdentity {
  actorUid: string | null;
  ownerUid: string | null;
  isAssisted: boolean;
}

const isActiveSuperAdmin = (user: User | null): boolean =>
  Boolean(
    user &&
      user.role === "SUPERADMIN" &&
      (user.status === "ACTIVE" || user.status === "Active"),
  );

export function resolveAssistedRecordIdentity(
  actualUser: User | null,
  currentUser: User | null,
): AssistedRecordIdentity {
  const actorUid = actualUser?.uid || actualUser?.id || null;
  if (!isExactDocumentId(actorUid)) {
    return { actorUid: null, ownerUid: null, isAssisted: false };
  }

  if (
    isActiveSuperAdmin(actualUser) &&
    currentUser?.supportPresentation === true
  ) {
    const presentedUid = currentUser.uid || currentUser.id || null;
    if (
      isExactDocumentId(presentedUid) &&
      presentedUid !== actorUid &&
      (currentUser.status === "ACTIVE" || currentUser.status === "Active")
    ) {
      return {
        actorUid,
        ownerUid: presentedUid,
        isAssisted: true,
      };
    }
  }

  return {
    actorUid,
    ownerUid: actorUid,
    isAssisted: false,
  };
}
