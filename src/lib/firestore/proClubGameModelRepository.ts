import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import {
  cloneGameModelTextSnapshot,
  validateGameModelTextSnapshot,
  type GameModelTextSnapshot,
} from "../gameModel";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export const PRO_CLUB_GAME_MODEL_SCHEMA_VERSION = 1 as const;

export interface ProClubGameModelRecord {
  readonly schemaVersion: typeof PRO_CLUB_GAME_MODEL_SCHEMA_VERSION;
  readonly phases: GameModelTextSnapshot;
  readonly revision: number;
  readonly createdAt: unknown;
  readonly createdBy: string;
  readonly createdByRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR";
  readonly updatedAt: unknown;
  readonly updatedBy: string;
  readonly updatedByRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR";
}

export interface ProClubGameModelRepositoryDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubGameModelRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(
    path: readonly string[],
  ): Promise<ProClubGameModelRepositoryDocumentSnapshot>;
  setDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length && actual.join(",") === canonical.join(",");
}

function requireDocumentId(value: unknown, label: string): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(`${label} must be an exact Firestore document ID.`);
  }
}

function isAuthorRole(value: unknown): value is "HEAD_COACH" | "TECHNICAL_DIRECTOR" {
  return value === "HEAD_COACH" || value === "TECHNICAL_DIRECTOR";
}

function assertActiveStaff(authority: ProClubOrganizationAuthority): void {
  if (
    authority.organizationType !== "PRO_CLUB" ||
    authority.organizationStatus !== "ACTIVE" ||
    authority.membershipStatus !== "ACTIVE" ||
    authority.hasMembershipAuthority !== true ||
    authority.staffRole === null
  ) {
    throw new Error("Active Pro Club staff authority is required.");
  }
}

function requireAuthorRole(
  authority: ProClubOrganizationAuthority,
): "HEAD_COACH" | "TECHNICAL_DIRECTOR" {
  assertActiveStaff(authority);
  if (!isAuthorRole(authority.staffRole)) {
    throw new Error("Active HEAD_COACH or TECHNICAL_DIRECTOR authority is required.");
  }
  return authority.staffRole;
}

async function resolveRequiredAuthority(
  clubId: string,
  uid: string,
  ops: ProClubGameModelRepositoryOps,
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

export function proClubGameModelDocumentPath(
  clubId: string,
): readonly ["proClubs", string, "gameModel", "current"] {
  requireDocumentId(clubId, "clubId");
  return ["proClubs", clubId, "gameModel", "current"];
}

function parseRecord(raw: unknown): ProClubGameModelRecord {
  if (
    !isPlainObject(raw) ||
    !hasExactKeys(raw, [
      "schemaVersion",
      "phases",
      "revision",
      "createdAt",
      "createdBy",
      "createdByRole",
      "updatedAt",
      "updatedBy",
      "updatedByRole",
    ])
  ) {
    throw new Error("Invalid Pro Club Game Model document shape.");
  }

  if (raw.schemaVersion !== PRO_CLUB_GAME_MODEL_SCHEMA_VERSION) {
    throw new Error("Unsupported Pro Club Game Model schemaVersion.");
  }
  const phasesValidation = validateGameModelTextSnapshot(raw.phases);
  if (!phasesValidation.ok) {
    throw new Error(`Invalid Pro Club Game Model: ${phasesValidation.errors.join(" ")}`);
  }
  if (typeof raw.revision !== "number" || !Number.isInteger(raw.revision) || raw.revision < 1) {
    throw new Error("Invalid Pro Club Game Model revision.");
  }
  requireDocumentId(raw.createdBy, "createdBy");
  requireDocumentId(raw.updatedBy, "updatedBy");
  if (
    raw.createdAt == null ||
    raw.updatedAt == null ||
    !isAuthorRole(raw.createdByRole) ||
    !isAuthorRole(raw.updatedByRole)
  ) {
    throw new Error("Invalid Pro Club Game Model audit fields.");
  }

  return {
    schemaVersion: PRO_CLUB_GAME_MODEL_SCHEMA_VERSION,
    phases: cloneGameModelTextSnapshot(raw.phases as GameModelTextSnapshot),
    revision: raw.revision,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    createdByRole: raw.createdByRole,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
    updatedByRole: raw.updatedByRole,
  };
}

function createFirestoreOps(): ProClubGameModelRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Game Model path.");
      }
      const [first, ...rest] = path;
      const snapshot = await getDocFromServer(doc(db, first, ...rest));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
    async setDocument(path, data) {
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

export async function getProClubGameModel(
  clubId: string,
  ops: ProClubGameModelRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubGameModelRecord | null> {
  const path = proClubGameModelDocumentPath(clubId);
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaff(authority);

  const snapshot = await ops.readDocument(path);
  if (!snapshot.exists) return null;
  if (snapshot.id !== "current") {
    throw new Error("Pro Club Game Model read returned an unexpected document ID.");
  }
  return parseRecord(snapshot.data);
}

export async function saveProClubGameModel(
  clubId: string,
  phases: GameModelTextSnapshot,
  expectedRevision: number,
  ops: ProClubGameModelRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubGameModelRecord> {
  const validation = validateGameModelTextSnapshot(phases);
  if (!validation.ok) {
    throw new Error(`Invalid Game Model: ${validation.errors.join(" ")}`);
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("expectedRevision must be a non-negative integer.");
  }

  const path = proClubGameModelDocumentPath(clubId);
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  const role = requireAuthorRole(authority);
  const existing = await ops.readDocument(path);
  const timestamp = ops.timestamp();
  const payload = {
    schemaVersion: PRO_CLUB_GAME_MODEL_SCHEMA_VERSION,
    phases: cloneGameModelTextSnapshot(phases),
  };

  if (!existing.exists) {
    if (expectedRevision !== 0) throw new Error("Stale Game Model revision.");
    await ops.setDocument(path, {
      ...payload,
      revision: 1,
      createdAt: timestamp,
      createdBy: uid,
      createdByRole: role,
      updatedAt: timestamp,
      updatedBy: uid,
      updatedByRole: role,
    });
  } else {
    const current = parseRecord(existing.data);
    if (current.revision !== expectedRevision) {
      throw new Error("Stale Game Model revision.");
    }
    await ops.updateDocument(path, {
      ...payload,
      revision: expectedRevision + 1,
      updatedAt: timestamp,
      updatedBy: uid,
      updatedByRole: role,
    });
  }

  const readBack = await ops.readDocument(path);
  if (!readBack.exists) throw new Error("Game Model save outcome is ambiguous.");
  const saved = parseRecord(readBack.data);
  if (saved.revision !== expectedRevision + 1 || saved.updatedBy !== uid) {
    throw new Error("Game Model save read-back did not match canonical data.");
  }
  return saved;
}
