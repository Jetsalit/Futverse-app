import type { UserRole } from "../contexts/AuthContext";

export const NONSTAFF_ASSOCIATION_COLLECTION = "playerAssociations";

export type NonStaffRole = "PLAYER" | "PARENT";
export type NonStaffAssociationStatus = "ACTIVE" | "INACTIVE" | "REVOKED";

export interface NonStaffPlayerAccessInput {
  id?: string;
  uid?: string;
  role: UserRole;
  status?: unknown;
  // Legacy routing metadata is deliberately accepted but never read here.
  academyId?: string | null;
  activeAcademyId?: string | null;
  linkedPlayerId?: string | null;
}

export interface NonStaffPlayerAssociation {
  userId: string;
  academyId: string;
  playerId: string;
  role: NonStaffRole;
  status: "ACTIVE";
}

export interface AssociationDocumentCandidate {
  id: string;
  path: string;
  data: unknown;
}

export interface AssociationSnapshotCandidate {
  fromCache: boolean;
  hasPendingWrites: boolean;
  documents: AssociationDocumentCandidate[];
}

export type NonStaffAccessLookupResult =
  | { type: "ASSOCIATION_LISTENER"; uid: string; role: NonStaffRole }
  | { type: "UNAVAILABLE" };

export type NonStaffAssociationResolution =
  | {
      type: "AUTHORIZED_ASSOCIATIONS";
      uid: string;
      role: NonStaffRole;
      associations: NonStaffPlayerAssociation[];
    }
  | { type: "UNAVAILABLE" };

export function isExactFirestoreDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

function isActiveAccountStatus(status: unknown): boolean {
  return status === "ACTIVE" || status === "Active";
}

function isNonStaffRole(role: unknown): role is NonStaffRole {
  return role === "PLAYER" || role === "PARENT";
}

function hasExactAssociationFields(
  value: unknown,
): value is Record<keyof NonStaffPlayerAssociation, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === 5 &&
    keys.join(",") === "academyId,playerId,role,status,userId"
  );
}

function resolveAssociationDocument(
  candidate: AssociationDocumentCandidate,
  uid: string,
  role: NonStaffRole,
): NonStaffPlayerAssociation | NonStaffAssociationStatus | null {
  const segments = candidate.path.split("/");
  if (
    segments.length !== 6 ||
    segments[0] !== "academies" ||
    segments[2] !== "nonstaffUsers" ||
    segments[4] !== NONSTAFF_ASSOCIATION_COLLECTION
  ) {
    return null;
  }

  const academyId = segments[1];
  const pathUid = segments[3];
  const playerId = segments[5];
  if (
    !isExactFirestoreDocumentId(academyId) ||
    !isExactFirestoreDocumentId(pathUid) ||
    !isExactFirestoreDocumentId(playerId) ||
    candidate.id !== playerId ||
    pathUid !== uid ||
    !hasExactAssociationFields(candidate.data)
  ) {
    return null;
  }

  const data = candidate.data;
  if (
    data.userId !== uid ||
    data.academyId !== academyId ||
    data.playerId !== playerId ||
    data.role !== role ||
    !isNonStaffRole(data.role) ||
    !isExactFirestoreDocumentId(data.userId) ||
    !isExactFirestoreDocumentId(data.academyId) ||
    !isExactFirestoreDocumentId(data.playerId) ||
    !["ACTIVE", "INACTIVE", "REVOKED"].includes(String(data.status))
  ) {
    return null;
  }

  if (data.status !== "ACTIVE") return data.status as NonStaffAssociationStatus;

  return {
    userId: data.userId,
    academyId: data.academyId,
    playerId: data.playerId,
    role: data.role,
    status: "ACTIVE",
  };
}

export function linkedPlayerLookupForUser(
  user?: NonStaffPlayerAccessInput | null,
): NonStaffAccessLookupResult {
  if (!user || !isNonStaffRole(user.role) || !isActiveAccountStatus(user.status)) {
    return { type: "UNAVAILABLE" };
  }

  const uid = user.uid || user.id;
  if (!isExactFirestoreDocumentId(uid)) return { type: "UNAVAILABLE" };

  return {
    type: "ASSOCIATION_LISTENER",
    uid,
    role: user.role,
  };
}

export function resolveAuthoritativeAssociationSnapshot(
  user: NonStaffPlayerAccessInput | null | undefined,
  snapshot: AssociationSnapshotCandidate,
): NonStaffAssociationResolution {
  const lookup = linkedPlayerLookupForUser(user);
  if (
    lookup.type === "UNAVAILABLE" ||
    snapshot.fromCache ||
    snapshot.hasPendingWrites
  ) {
    return { type: "UNAVAILABLE" };
  }

  const activeAssociations: NonStaffPlayerAssociation[] = [];
  const identities = new Set<string>();

  for (const candidate of snapshot.documents) {
    const association = resolveAssociationDocument(
      candidate,
      lookup.uid,
      lookup.role,
    );
    if (association === null) return { type: "UNAVAILABLE" };
    if (typeof association === "string") continue;

    const identity = JSON.stringify([
      association.userId,
      association.academyId,
      association.playerId,
    ]);
    if (identities.has(identity)) return { type: "UNAVAILABLE" };
    identities.add(identity);
    activeAssociations.push(association);
  }

  if (activeAssociations.length === 0) return { type: "UNAVAILABLE" };

  activeAssociations.sort((left, right) =>
    left.academyId.localeCompare(right.academyId) ||
    left.playerId.localeCompare(right.playerId),
  );

  return {
    type: "AUTHORIZED_ASSOCIATIONS",
    uid: lookup.uid,
    role: lookup.role,
    associations: activeAssociations,
  };
}
