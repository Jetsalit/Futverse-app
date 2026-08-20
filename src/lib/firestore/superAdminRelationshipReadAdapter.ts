import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import {
  resolveSuperAdminUserRelationshipRow,
  type SuperAdminLegacyEvidence,
  type SuperAdminNonStaffAssociationInput,
  type SuperAdminStaffMembershipInput,
  type SuperAdminUserRelationshipRow,
} from "../superAdminRelationshipReadModel";

export interface SuperAdminRelationshipInventoryCoverage {
  accounts: "AVAILABLE";
  academies: "AVAILABLE";
  staffMemberships: "AVAILABLE";
  nonStaffAssociations: "AVAILABLE";
}

export interface SuperAdminRelationshipInventory {
  rows: SuperAdminUserRelationshipRow[];
  coverage: SuperAdminRelationshipInventoryCoverage;
  isCompleteForCurrentAccounts: boolean;
  warnings: string[];
}

export type SuperAdminRelationshipInventoryResult =
  | { state: "READY"; inventory: SuperAdminRelationshipInventory }
  | { state: "UNAVAILABLE"; error: Error };

export interface SuperAdminReadDocument {
  id: string;
  data: Record<string, unknown>;
  path?: string;
}

export interface SuperAdminRelationshipReadOps {
  listCollection(path: readonly string[]): Promise<SuperAdminReadDocument[]>;
  listCollectionGroup(
    collectionId: "playerAssociations",
  ): Promise<SuperAdminReadDocument[]>;
}

interface AcademyReadIdentity {
  id: string;
  name?: string;
}

const DEFAULT_READ_CONCURRENCY = 6;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalLegacyString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function legacyEvidenceFromUser(
  data: Record<string, unknown>,
): SuperAdminLegacyEvidence | undefined {
  const assignedClients = Array.isArray(data.assignedClients)
    ? data.assignedClients.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : undefined;

  const evidence: SuperAdminLegacyEvidence = {
    academyId: optionalLegacyString(data.academyId),
    activeAcademyId: optionalLegacyString(data.activeAcademyId),
    tenantRole: optionalLegacyString(data.tenantRole),
    linkedPlayerId: optionalLegacyString(data.linkedPlayerId),
    assignedClients,
  };

  return (
    (typeof evidence.academyId === "string" && evidence.academyId.length > 0) ||
    (typeof evidence.activeAcademyId === "string" &&
      evidence.activeAcademyId.length > 0) ||
    (typeof evidence.tenantRole === "string" && evidence.tenantRole.length > 0) ||
    (typeof evidence.linkedPlayerId === "string" &&
      evidence.linkedPlayerId.length > 0) ||
    Boolean(evidence.assignedClients?.length)
  )
    ? evidence
    : undefined;
}

function academyIdentityFromDocument(
  academyDoc: SuperAdminReadDocument,
): AcademyReadIdentity | null {
  if (academyDoc.id === "superadmin_system") return null;
  return {
    id: academyDoc.id,
    name:
      stringValue(academyDoc.data.name) ?? stringValue(academyDoc.data.shortName),
  };
}

function membershipInputFromDocument(
  academy: AcademyReadIdentity,
  membershipDoc: SuperAdminReadDocument,
): SuperAdminStaffMembershipInput {
  return {
    documentId: membershipDoc.id,
    userId: stringValue(membershipDoc.data.userId) ?? "",
    academyId: stringValue(membershipDoc.data.academyId) ?? academy.id,
    role: membershipDoc.data.role,
    status: membershipDoc.data.status,
    source: membershipDoc.data.source,
    organizationName: academy.name,
  };
}

function associationInputFromDocument(
  associationDoc: SuperAdminReadDocument,
  academyNames: ReadonlyMap<string, string | undefined>,
): SuperAdminNonStaffAssociationInput {
  const pathParts = associationDoc.path?.split("/") ?? [];
  const exactPathShape =
    pathParts.length === 6 &&
    pathParts[0] === "academies" &&
    pathParts[2] === "nonstaffUsers" &&
    pathParts[4] === "playerAssociations";

  const pathAcademyId = exactPathShape ? pathParts[1] : "";
  const pathUserId = exactPathShape ? pathParts[3] : "";
  const pathPlayerId = exactPathShape ? pathParts[5] : "";
  const academyId = stringValue(associationDoc.data.academyId) ?? "";

  return {
    documentId: associationDoc.id,
    userId: stringValue(associationDoc.data.userId) ?? "",
    academyId,
    playerId: stringValue(associationDoc.data.playerId) ?? "",
    role: associationDoc.data.role,
    status: associationDoc.data.status,
    organizationName: academyNames.get(academyId),
    pathAcademyId,
    pathUserId,
    pathPlayerId,
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (values.length === 0) return [];
  const workerCount = Math.max(1, Math.min(concurrency, values.length));
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function membershipBelongsToAccountCandidate(
  membership: SuperAdminStaffMembershipInput,
  userId: string,
): boolean {
  return membership.userId === userId || membership.documentId === userId;
}

function associationBelongsToAccountCandidate(
  association: SuperAdminNonStaffAssociationInput,
  userId: string,
): boolean {
  return association.userId === userId || association.pathUserId === userId;
}

export async function loadSuperAdminRelationshipInventory(
  ops: SuperAdminRelationshipReadOps,
  options?: { membershipReadConcurrency?: number },
): Promise<SuperAdminRelationshipInventoryResult> {
  try {
    const [userDocs, academyDocs, associationDocs] = await Promise.all([
      ops.listCollection(["users"]),
      ops.listCollection(["academies"]),
      ops.listCollectionGroup("playerAssociations"),
    ]);

    const academies = academyDocs
      .map(academyIdentityFromDocument)
      .filter((academy): academy is AcademyReadIdentity => academy !== null);
    const academyNames = new Map(
      academies.map((academy) => [academy.id, academy.name] as const),
    );

    const membershipsByAcademy = await mapWithConcurrency(
      academies,
      options?.membershipReadConcurrency ?? DEFAULT_READ_CONCURRENCY,
      async (academy) => {
        const documents = await ops.listCollection([
          "academies",
          academy.id,
          "members",
        ]);
        return documents.map((document) =>
          membershipInputFromDocument(academy, document),
        );
      },
    );

    const staffMemberships = membershipsByAcademy.flat();
    const nonStaffAssociations = associationDocs.map((document) =>
      associationInputFromDocument(document, academyNames),
    );

    const rows = userDocs.map((userDoc) =>
      resolveSuperAdminUserRelationshipRow({
        account: {
          userId: userDoc.id,
          name: stringValue(userDoc.data.name),
          email: stringValue(userDoc.data.email),
          accountRole: stringValue(userDoc.data.role),
          accountStatus: stringValue(userDoc.data.status),
          lastKnownAccountActivity: userDoc.data.lastLogin,
        },
        staffMemberships: staffMemberships.filter((membership) =>
          membershipBelongsToAccountCandidate(membership, userDoc.id),
        ),
        nonStaffAssociations: nonStaffAssociations.filter((association) =>
          associationBelongsToAccountCandidate(association, userDoc.id),
        ),
        legacyEvidence: legacyEvidenceFromUser(userDoc.data),
      }),
    );

    rows.sort((left, right) =>
      (left.name ?? left.email ?? left.userId).localeCompare(
        right.name ?? right.email ?? right.userId,
      ),
    );

    return {
      state: "READY",
      inventory: {
        rows,
        coverage: {
          accounts: "AVAILABLE",
          academies: "AVAILABLE",
          staffMemberships: "AVAILABLE",
          nonStaffAssociations: "AVAILABLE",
        },
        isCompleteForCurrentAccounts: true,
        warnings: [],
      },
    };
  } catch (error) {
    return {
      state: "UNAVAILABLE",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export const firestoreSuperAdminRelationshipReadOps: SuperAdminRelationshipReadOps = {
  async listCollection(path) {
    if (path.length === 0) {
      throw new Error("Firestore collection path must not be empty.");
    }
    const reference = collection(db, path[0], ...path.slice(1));
    const snapshot = await getDocs(reference);
    return snapshot.docs.map((document) => ({
      id: document.id,
      path: document.ref.path,
      data: document.data() as Record<string, unknown>,
    }));
  },

  async listCollectionGroup(collectionId) {
    const snapshot = await getDocs(collectionGroup(db, collectionId));
    return snapshot.docs.map((document) => ({
      id: document.id,
      path: document.ref.path,
      data: document.data() as Record<string, unknown>,
    }));
  },
};
