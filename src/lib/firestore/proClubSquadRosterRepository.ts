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
import {
  canTransitionProClubSquadRosterStatus,
  validateProClubSquadRosterFootballInput,
  type ValidProClubSquadRosterFootballInput,
} from "../proClubSquadRoster";
import {
  isExactPlayerKey,
  isIssuedFutIdV1,
} from "../playerIdentityFoundation";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export interface ProClubSquadRosterDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubSquadRosterListSnapshot {
  readonly documents: readonly ProClubSquadRosterDocumentSnapshot[];
}

export interface ProClubSquadRosterRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(
    path: readonly string[],
  ): Promise<ProClubSquadRosterDocumentSnapshot>;
  listDocuments(
    path: readonly string[],
  ): Promise<ProClubSquadRosterListSnapshot>;
  createDocument(
    path: readonly string[],
    data: DocumentData,
  ): Promise<void>;
  updateDocument(
    path: readonly string[],
    data: DocumentData,
  ): Promise<void>;
  timestamp(): unknown;
}

export interface ProClubSquadRosterRecord
  extends ValidProClubSquadRosterFootballInput {
  playerKey: string;
  createdAt: unknown;
  createdBy: string;
  updatedAt: unknown;
  updatedBy: string;
}

const DOCUMENT_KEYS = [
  "additionalPositions",
  "createdAt",
  "createdBy",
  "firstName",
  "futId",
  "jerseyNumber",
  "lastName",
  "position",
  "schemaVersion",
  "squadLabel",
  "status",
  "updatedAt",
  "updatedBy",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...DOCUMENT_KEYS].sort();
  return actual.length === expected.length && actual.join(",") === expected.join(",");
}

function requireExactPathIdentity(
  value: unknown,
  label: string,
): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(`${label} must be an exact Firestore document ID.`);
  }
}

function requireExactPlayerKey(value: unknown): asserts value is string {
  if (!isExactPlayerKey(value)) {
    throw new Error("playerKey must be an exact Player Identity key.");
  }
}

function requireAuthenticatedUid(ops: ProClubSquadRosterRepositoryOps): string {
  const uid = ops.getAuthenticatedUid();
  requireExactPathIdentity(uid, "Authenticated actor UID");
  return uid;
}

function assertActiveStaffAuthority(authority: ProClubOrganizationAuthority): void {
  if (
    authority.organizationStatus !== "ACTIVE" ||
    authority.membershipStatus !== "ACTIVE" ||
    authority.hasMembershipAuthority !== true ||
    authority.staffRole === null
  ) {
    throw new Error(
      "Active Pro Club Membership and active staff authority are required.",
    );
  }
}

function assertHeadCoachAuthority(authority: ProClubOrganizationAuthority): void {
  assertActiveStaffAuthority(authority);

  if (authority.staffRole !== "HEAD_COACH") {
    throw new Error(
      "Pro Club Squad roster mutation requires an active HEAD_COACH.",
    );
  }
}

async function resolveRequiredAuthority(
  clubId: string,
  uid: string,
  ops: ProClubSquadRosterRepositoryOps,
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

function parseRosterDocument(
  playerKey: string,
  raw: unknown,
): ProClubSquadRosterRecord {
  requireExactPlayerKey(playerKey);

  if (!isPlainObject(raw) || !hasExactKeys(raw)) {
    throw new Error("Invalid Pro Club Squad roster document shape.");
  }

  if (raw.schemaVersion !== 1) {
    throw new Error("Invalid Pro Club Squad roster schema version.");
  }

  const football = validateProClubSquadRosterFootballInput({
    futId: raw.futId,
    firstName: raw.firstName,
    lastName: raw.lastName,
    position: raw.position,
    additionalPositions: raw.additionalPositions,
    jerseyNumber: raw.jerseyNumber,
    squadLabel: raw.squadLabel,
    status: raw.status,
  });

  if (football.ok === false) {
    throw new Error(
      `Invalid Pro Club Squad roster football data: ${football.errors.join(" ")}`,
    );
  }

  if (
    !isValidDocumentIdentifier(raw.createdBy) ||
    !isValidDocumentIdentifier(raw.updatedBy) ||
    raw.createdAt == null ||
    raw.updatedAt == null
  ) {
    throw new Error("Invalid Pro Club Squad roster audit data.");
  }

  return {
    playerKey,
    ...football.value,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
}

/**
 * Client-side transition guard only.
 *
 * futIdRegistry is intentionally not client-readable. Exact FUTID -> playerKey
 * compatibility is therefore enforced by Firestore Rules on the write itself.
 * The repository still fails early on malformed FUTIDs and non-null replacement.
 */
function assertRequestedFutIdTransition(
  currentFutId: string | null,
  requestedFutId: string | null,
): void {
  if (currentFutId === null) {
    if (requestedFutId === null || isIssuedFutIdV1(requestedFutId)) {
      return;
    }

    throw new Error("Requested FUTID is not a valid issued FUTID V1 value.");
  }

  if (requestedFutId !== currentFutId) {
    throw new Error("Existing non-null FUTID is immutable in Pro Club Squad V1.");
  }
}

function cloneFootballFields(
  value: ValidProClubSquadRosterFootballInput,
): DocumentData {
  return {
    schemaVersion: value.schemaVersion,
    futId: value.futId,
    firstName: value.firstName,
    lastName: value.lastName,
    position: value.position,
    additionalPositions: [...value.additionalPositions],
    jerseyNumber: value.jerseyNumber,
    squadLabel: value.squadLabel,
    status: value.status,
  };
}

function createFirestoreOps(): ProClubSquadRosterRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },

    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },

    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Squad roster read path.");
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
        throw new Error("Invalid Pro Club Squad roster collection path.");
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
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Squad roster create path.");
      }

      const [first, ...rest] = path;
      await setDoc(doc(db, first, ...rest), data);
    },

    async updateDocument(path, data) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Squad roster update path.");
      }

      const [first, ...rest] = path;
      await updateDoc(doc(db, first, ...rest), data);
    },

    timestamp() {
      return serverTimestamp();
    },
  };
}

const FIRESTORE_OPS = createFirestoreOps();

export function createFirestoreProClubSquadRosterRepositoryOps(): ProClubSquadRosterRepositoryOps {
  return createFirestoreOps();
}

export async function listProClubSquadRoster(
  clubId: string,
  ops: ProClubSquadRosterRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubSquadRosterRecord[]> {
  requireExactPathIdentity(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaffAuthority(authority);

  const snapshot = await ops.listDocuments(["proClubs", clubId, "players"]);

  return snapshot.documents.map((item) => {
    if (!item.exists) {
      throw new Error("Roster list returned a missing document snapshot.");
    }
    return parseRosterDocument(item.id, item.data);
  });
}

export async function getProClubSquadRosterPlayer(
  clubId: string,
  playerKey: string,
  ops: ProClubSquadRosterRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubSquadRosterRecord | null> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPlayerKey(playerKey);
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaffAuthority(authority);

  const snapshot = await ops.readDocument([
    "proClubs",
    clubId,
    "players",
    playerKey,
  ]);

  if (!snapshot.exists) {
    return null;
  }

  if (snapshot.id !== playerKey) {
    throw new Error("Roster read returned a mismatched canonical playerKey.");
  }

  return parseRosterDocument(playerKey, snapshot.data);
}

export async function createProClubSquadRosterPlayer(
  clubId: string,
  playerKey: string,
  input: unknown,
  ops: ProClubSquadRosterRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubSquadRosterRecord> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPlayerKey(playerKey);

  const validation = validateProClubSquadRosterFootballInput(input);
  if (validation.ok === false) {
    throw new Error(
      `Invalid Pro Club Squad roster input: ${validation.errors.join(" ")}`,
    );
  }

  if (validation.value.status !== "ACTIVE") {
    throw new Error("New Pro Club Squad roster players must start ACTIVE.");
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertHeadCoachAuthority(authority);

  const path = ["proClubs", clubId, "players", playerKey] as const;
  const existing = await ops.readDocument(path);

  if (existing.exists) {
    throw new Error("Pro Club Squad roster player already exists.");
  }

  assertRequestedFutIdTransition(null, validation.value.futId);

  const timestamp = ops.timestamp();

  await ops.createDocument(path, {
    ...cloneFootballFields(validation.value),
    createdAt: timestamp,
    createdBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== playerKey) {
    throw new Error(
      "Roster create outcome is ambiguous: read-back did not find the canonical document.",
    );
  }

  const record = parseRosterDocument(playerKey, readBack.data);
  if (
    record.createdBy !== uid ||
    record.updatedBy !== uid ||
    JSON.stringify(cloneFootballFields(record)) !==
      JSON.stringify(cloneFootballFields(validation.value))
  ) {
    throw new Error("Roster create read-back did not match the requested canonical data.");
  }

  return record;
}

export async function releaseProClubSquadRosterPlayer(
  clubId: string,
  playerKey: string,
  ops: ProClubSquadRosterRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubSquadRosterRecord> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPlayerKey(playerKey);
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertHeadCoachAuthority(authority);

  const current = await getProClubSquadRosterPlayer(clubId, playerKey, ops);
  if (!current) {
    throw new Error("Pro Club Squad roster player does not exist.");
  }

  if (current.status === "RELEASED") {
    return current;
  }

  return updateProClubSquadRosterPlayer(
    clubId,
    playerKey,
    {
      futId: current.futId,
      firstName: current.firstName,
      lastName: current.lastName,
      position: current.position,
      additionalPositions: [...current.additionalPositions],
      jerseyNumber: current.jerseyNumber,
      squadLabel: current.squadLabel,
      status: "RELEASED",
    },
    ops,
  );
}

export async function updateProClubSquadRosterPlayer(
  clubId: string,
  playerKey: string,
  input: unknown,
  ops: ProClubSquadRosterRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubSquadRosterRecord> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPlayerKey(playerKey);

  const validation = validateProClubSquadRosterFootballInput(input);
  if (validation.ok === false) {
    throw new Error(
      `Invalid Pro Club Squad roster input: ${validation.errors.join(" ")}`,
    );
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertHeadCoachAuthority(authority);

  const path = ["proClubs", clubId, "players", playerKey] as const;
  const existing = await ops.readDocument(path);

  if (!existing.exists || existing.id !== playerKey) {
    throw new Error("Pro Club Squad roster player does not exist.");
  }

  const current = parseRosterDocument(playerKey, existing.data);

  if (!canTransitionProClubSquadRosterStatus(current.status, validation.value.status)) {
    throw new Error("Invalid Pro Club Squad roster status transition.");
  }

  assertRequestedFutIdTransition(current.futId, validation.value.futId);

  await ops.updateDocument(path, {
    ...cloneFootballFields(validation.value),
    updatedAt: ops.timestamp(),
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== playerKey) {
    throw new Error(
      "Roster update outcome is ambiguous: canonical read-back is unavailable.",
    );
  }

  const record = parseRosterDocument(playerKey, readBack.data);
  if (
    record.createdBy !== current.createdBy ||
    record.updatedBy !== uid ||
    JSON.stringify(cloneFootballFields(record)) !==
      JSON.stringify(cloneFootballFields(validation.value))
  ) {
    throw new Error("Roster update read-back did not match the requested canonical data.");
  }

  return record;
}
