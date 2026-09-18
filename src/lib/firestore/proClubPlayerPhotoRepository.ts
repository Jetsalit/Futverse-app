import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { isExactPlayerKey } from "../playerIdentityFoundation";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  validateProClubPlayerPhotoInput,
  type ProClubPlayerPhotoInput,
} from "../proClubPlayerPhoto";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export interface ProClubPlayerPhotoRecord extends ProClubPlayerPhotoInput {
  playerKey: string;
  createdAt: unknown;
  createdBy: string;
  updatedAt: unknown;
  updatedBy: string;
}

export interface ProClubPlayerPhotoRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(path: readonly string[]): Promise<{
    id: string;
    exists: boolean;
    data?: unknown;
  }>;
  listDocuments(path: readonly string[]): Promise<{
    documents: readonly {
      id: string;
      exists: boolean;
      data?: unknown;
    }[];
  }>;
  createDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

const DOCUMENT_KEYS = [
  "schemaVersion",
  "dataUrl",
  "mimeType",
  "width",
  "height",
  "byteSize",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireDocumentId(value: unknown, label: string): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(`${label} must be an exact Firestore document ID.`);
  }
}

function requirePlayerKey(value: unknown): asserts value is string {
  if (!isExactPlayerKey(value)) {
    throw new Error("playerKey must be an exact Player Identity key.");
  }
}

function requireAuthenticatedUid(ops: ProClubPlayerPhotoRepositoryOps): string {
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  return uid;
}

async function resolveAuthority(
  clubId: string,
  uid: string,
  ops: ProClubPlayerPhotoRepositoryOps,
): Promise<ProClubOrganizationAuthority> {
  const result = await ops.resolveAuthority(clubId, uid);
  if (result.state !== "FOUND") {
    throw new Error(`Pro Club authority could not be resolved: ${result.state}.`);
  }
  if (result.value.organizationId !== clubId || result.value.userId !== uid) {
    throw new Error("Resolved Pro Club authority identity mismatch.");
  }
  return result.value;
}

function assertActiveStaff(authority: ProClubOrganizationAuthority): void {
  if (
    authority.organizationStatus !== "ACTIVE" ||
    authority.membershipStatus !== "ACTIVE" ||
    authority.hasMembershipAuthority !== true ||
    authority.staffRole === null
  ) {
    throw new Error("Active Pro Club staff authority is required.");
  }
}

function assertHeadCoach(authority: ProClubOrganizationAuthority): void {
  assertActiveStaff(authority);
  if (authority.staffRole !== "HEAD_COACH") {
    throw new Error("Player photo mutation requires an active HEAD_COACH.");
  }
}

function parsePhoto(playerKey: string, raw: unknown): ProClubPlayerPhotoRecord {
  requirePlayerKey(playerKey);

  if (!isPlainObject(raw)) {
    throw new Error("Invalid Pro Club player photo document.");
  }

  const actualKeys = Object.keys(raw).sort();
  const expectedKeys = [...DOCUMENT_KEYS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.join(",") !== expectedKeys.join(",")
  ) {
    throw new Error("Invalid Pro Club player photo document shape.");
  }

  if (raw.schemaVersion !== 1) {
    throw new Error("Invalid Pro Club player photo schema version.");
  }

  const validation = validateProClubPlayerPhotoInput({
    dataUrl: raw.dataUrl,
    mimeType: raw.mimeType,
    width: raw.width,
    height: raw.height,
    byteSize: raw.byteSize,
  });
  if (!validation.ok) {
    throw new Error(`Invalid Pro Club player photo: ${validation.errors.join(" ")}`);
  }

  if (
    !isValidDocumentIdentifier(raw.createdBy) ||
    !isValidDocumentIdentifier(raw.updatedBy) ||
    raw.createdAt == null ||
    raw.updatedAt == null
  ) {
    throw new Error("Invalid Pro Club player photo audit data.");
  }

  return {
    playerKey,
    ...validation.value,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
}

function photoFields(input: ProClubPlayerPhotoInput): DocumentData {
  return {
    schemaVersion: 1,
    dataUrl: input.dataUrl,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
    byteSize: input.byteSize,
  };
}

function createFirestoreOps(): ProClubPlayerPhotoRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club player photo read path.");
      }
      const [first, ...rest] = path;
      const snapshot = await getDocFromServer(doc(db, first, ...rest));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
    async listDocuments(path) {
      if (path.length < 1 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club player photo collection path.");
      }
      const [first, ...rest] = path;
      const snapshot = await getDocsFromServer(collection(db, first, ...rest));
      return {
        documents: snapshot.docs.map((item) => ({
          id: item.id,
          exists: true,
          data: item.data(),
        })),
      };
    },
    async createDocument(path, data) {
      const [first, ...rest] = path;
      await setDoc(doc(db, first, ...rest), data);
    },
    async updateDocument(path, data) {
      const [first, ...rest] = path;
      await updateDoc(doc(db, first, ...rest), data);
    },
    timestamp() {
      return serverTimestamp();
    },
  };
}

const FIRESTORE_OPS = createFirestoreOps();

export async function listProClubPlayerPhotos(
  clubId: string,
  ops: ProClubPlayerPhotoRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubPlayerPhotoRecord[]> {
  requireDocumentId(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  assertActiveStaff(await resolveAuthority(clubId, uid, ops));

  const snapshot = await ops.listDocuments(["proClubs", clubId, "playerPhotos"]);
  return snapshot.documents.map((item) => {
    if (!item.exists) {
      throw new Error("Player photo list returned a missing document.");
    }
    return parsePhoto(item.id, item.data);
  });
}

export async function upsertProClubPlayerPhoto(
  clubId: string,
  playerKey: string,
  input: unknown,
  ops: ProClubPlayerPhotoRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubPlayerPhotoRecord> {
  requireDocumentId(clubId, "clubId");
  requirePlayerKey(playerKey);

  const validation = validateProClubPlayerPhotoInput(input);
  if (!validation.ok) {
    throw new Error(`Invalid player photo input: ${validation.errors.join(" ")}`);
  }

  const uid = requireAuthenticatedUid(ops);
  assertHeadCoach(await resolveAuthority(clubId, uid, ops));

  const path = ["proClubs", clubId, "playerPhotos", playerKey] as const;
  const existing = await ops.readDocument(path);
  const timestamp = ops.timestamp();

  if (existing.exists) {
    const current = parsePhoto(playerKey, existing.data);
    await ops.updateDocument(path, {
      ...photoFields(validation.value),
      updatedAt: timestamp,
      updatedBy: uid,
    });

    const readBack = await ops.readDocument(path);
    if (!readBack.exists) {
      throw new Error("Player photo update read-back is unavailable.");
    }
    const record = parsePhoto(playerKey, readBack.data);
    if (record.createdBy !== current.createdBy || record.updatedBy !== uid) {
      throw new Error("Player photo update audit mismatch.");
    }
    return record;
  }

  await ops.createDocument(path, {
    ...photoFields(validation.value),
    createdAt: timestamp,
    createdBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists) {
    throw new Error("Player photo create read-back is unavailable.");
  }
  return parsePhoto(playerKey, readBack.data);
}
