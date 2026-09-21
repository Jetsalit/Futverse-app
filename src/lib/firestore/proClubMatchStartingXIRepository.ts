import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { createEmptyGameModelTextSnapshot } from "../gameModel";
import { isExactPlayerKey } from "../playerIdentityFoundation";
import {
  validatePositionSelection,
  type PlayerPositionCode,
} from "../playerPositionSelection";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  canAuthorProClubMatchStartingXI,
  canMutateShootoutAtMatchStatus,
  canMutateStartingXIAtMatchStatus,
  proClubMatchDocumentPath,
  proClubMatchRosterDocumentPath,
  proClubMatchShootoutDocumentPath,
  proClubMatchStartingXIDocumentPath,
  validateProClubMatchCoreData,
  validateProClubMatchRosterSnapshot,
  validateProClubPersistedShootoutPlan,
  validateProClubPersistedStartingXIPlan,
  type ProClubMatchCoreData,
  type ProClubMatchRosterSnapshot,
  type ProClubPersistedShootoutPlan,
  type ProClubPersistedStartingXIPlan,
} from "../proClubMatchStartingXI";
import { validateProClubSquadRosterFootballInput } from "../proClubSquadRoster";
import {
  createProClubCustomFormationSlotsFromFixed,
  type ProClubCustomFormationSlot,
} from "../proClubStartingXI11v11";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

type FootballAuthorityRole = "HEAD_COACH" | "TECHNICAL_DIRECTOR";

export interface ProClubMatchStartingXIRepositoryDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubMatchStartingXIRepositoryListSnapshot {
  readonly documents: readonly ProClubMatchStartingXIRepositoryDocumentSnapshot[];
}

export type ProClubMatchStartingXIAtomicWrite =
  | {
      readonly kind: "set";
      readonly path: readonly string[];
      readonly data: DocumentData;
    }
  | {
      readonly kind: "update";
      readonly path: readonly string[];
      readonly data: DocumentData;
    }
  | {
      readonly kind: "delete";
      readonly path: readonly string[];
    };

export interface ProClubMatchStartingXIRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(
    path: readonly string[],
  ): Promise<ProClubMatchStartingXIRepositoryDocumentSnapshot>;
  listDocuments(
    path: readonly string[],
  ): Promise<ProClubMatchStartingXIRepositoryListSnapshot>;
  setDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  commitAtomic(writes: readonly ProClubMatchStartingXIAtomicWrite[]): Promise<void>;
  timestamp(): unknown;
}

export interface ProClubMatchRecord extends ProClubMatchCoreData {
  readonly matchId: string;
  readonly rosterPlayerKeys: readonly string[];
  readonly rosterRevision: number;
  readonly rosterMutationPlayerKey: string | null;
  readonly rosterMutationKind: "ADD" | "REMOVE" | null;
  readonly createdAt: unknown;
  readonly createdBy: string;
  readonly createdByRole: FootballAuthorityRole;
  readonly updatedAt: unknown;
  readonly updatedBy: string;
  readonly updatedByRole: FootballAuthorityRole;
}

export interface ProClubMatchRosterRecord extends ProClubMatchRosterSnapshot {
  readonly createdAt: unknown;
  readonly createdBy: string;
  readonly createdByRole: FootballAuthorityRole;
  readonly updatedAt: unknown;
  readonly updatedBy: string;
  readonly updatedByRole: FootballAuthorityRole;
}

export interface ProClubStartingXIRecord extends ProClubPersistedStartingXIPlan {
  readonly matchRosterRevision: number;
  readonly revision: number;
  readonly createdAt: unknown;
  readonly createdBy: string;
  readonly createdByRole: FootballAuthorityRole;
  readonly updatedAt: unknown;
  readonly updatedBy: string;
  readonly updatedByRole: FootballAuthorityRole;
}

export interface ProClubShootoutRecord extends ProClubPersistedShootoutPlan {
  readonly matchRosterRevision: number;
  readonly revision: number;
  readonly createdAt: unknown;
  readonly createdBy: string;
  readonly createdByRole: FootballAuthorityRole;
  readonly updatedAt: unknown;
  readonly updatedBy: string;
  readonly updatedByRole: FootballAuthorityRole;
}

export interface ProClubMatchRosterMutationResult {
  readonly match: ProClubMatchRecord;
  readonly roster: readonly ProClubMatchRosterRecord[];
}

const MATCH_KEYS = [
  "schemaVersion",
  "status",
  "squadLabel",
  "competitionName",
  "opponentName",
  "kickoffAt",
  "venueType",
  "rosterPlayerKeys",
  "rosterRevision",
  "rosterMutationPlayerKey",
  "rosterMutationKind",
  "createdAt",
  "createdBy",
  "createdByRole",
  "updatedAt",
  "updatedBy",
  "updatedByRole",
] as const;

const ROSTER_KEYS = [
  "schemaVersion",
  "playerKey",
  "futId",
  "firstName",
  "lastName",
  "jerseyNumber",
  "position",
  "additionalPositions",
  "createdAt",
  "createdBy",
  "createdByRole",
  "updatedAt",
  "updatedBy",
  "updatedByRole",
] as const;

const STARTING_XI_KEYS = [
  "schemaVersion",
  "formation",
  "customFormationSlots",
  "slotPlayerKeys",
  "substitutePlayerKeys",
  "positionRoleAssignments",
  "setPieceAssignments",
  "gameModelSnapshot",
  "coachNotes",
  "matchRosterRevision",
  "revision",
  "createdAt",
  "createdBy",
  "createdByRole",
  "updatedAt",
  "updatedBy",
  "updatedByRole",
] as const;

const SHOOTOUT_KEYS = [
  "schemaVersion",
  "primaryTakers",
  "backupTakers",
  "matchRosterRevision",
  "revision",
  "createdAt",
  "createdBy",
  "createdByRole",
  "updatedAt",
  "updatedBy",
  "updatedByRole",
] as const;

const SET_PIECE_KEYS = [
  "CORNER_LEFT",
  "CORNER_RIGHT",
  "FREE_KICK_LEFT",
  "FREE_KICK_RIGHT",
  "THROW_IN_LEFT",
  "THROW_IN_RIGHT",
  "PENALTY",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.join(",") === expected.join(",");
}

function requireDocumentId(value: unknown, label: string): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(`${label} must be an exact Firestore document ID.`);
  }
}

function requirePlayerKey(value: unknown): asserts value is string {
  if (!isExactPlayerKey(value)) {
    throw new Error("playerKey must be an exact canonical Player Identity key.");
  }
}

function requireNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function isFootballAuthorityRole(value: unknown): value is FootballAuthorityRole {
  return value === "HEAD_COACH" || value === "TECHNICAL_DIRECTOR";
}

function timestampToDate(value: unknown, label: string): Date {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (isPlainObject(value) && typeof value.toDate === "function") {
    const converted = (value.toDate as () => unknown)();
    if (converted instanceof Date && Number.isFinite(converted.getTime())) {
      return new Date(converted.getTime());
    }
  }
  throw new Error(`${label} must be a Firestore timestamp.`);
}

function nullableTimestampToDate(value: unknown, label: string): Date | null {
  return value === null ? null : timestampToDate(value, label);
}

function requireAudit(
  raw: Record<string, unknown>,
): {
  createdAt: unknown;
  createdBy: string;
  createdByRole: FootballAuthorityRole;
  updatedAt: unknown;
  updatedBy: string;
  updatedByRole: FootballAuthorityRole;
} {
  requireDocumentId(raw.createdBy, "createdBy");
  requireDocumentId(raw.updatedBy, "updatedBy");
  if (
    raw.createdAt == null ||
    raw.updatedAt == null ||
    !isFootballAuthorityRole(raw.createdByRole) ||
    !isFootballAuthorityRole(raw.updatedByRole)
  ) {
    throw new Error("Invalid Pro Club Match audit fields.");
  }
  return {
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    createdByRole: raw.createdByRole,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
    updatedByRole: raw.updatedByRole,
  };
}

function parseMatch(matchId: string, raw: unknown): ProClubMatchRecord {
  requireDocumentId(matchId, "matchId");
  if (!isPlainObject(raw) || !hasExactKeys(raw, MATCH_KEYS)) {
    throw new Error("Invalid Pro Club Match document shape.");
  }

  const rosterPlayerKeys = raw.rosterPlayerKeys;
  if (
    !Array.isArray(rosterPlayerKeys) ||
    rosterPlayerKeys.length > 64 ||
    !rosterPlayerKeys.every((value) => typeof value === "string" && isExactPlayerKey(value)) ||
    new Set(rosterPlayerKeys).size !== rosterPlayerKeys.length
  ) {
    throw new Error("Invalid Pro Club Match roster index.");
  }
  requireNonNegativeInteger(raw.rosterRevision, "rosterRevision");

  let rosterMutationPlayerKey: string | null = null;
  if (raw.rosterMutationPlayerKey !== null) {
    if (
      typeof raw.rosterMutationPlayerKey !== "string" ||
      !isExactPlayerKey(raw.rosterMutationPlayerKey)
    ) {
      throw new Error("Invalid Pro Club Match roster mutation playerKey.");
    }
    rosterMutationPlayerKey = raw.rosterMutationPlayerKey;
  }
  if (
    raw.rosterMutationKind !== null &&
    raw.rosterMutationKind !== "ADD" &&
    raw.rosterMutationKind !== "REMOVE"
  ) {
    throw new Error("Invalid Pro Club Match roster mutation kind.");
  }

  const core: ProClubMatchCoreData = {
    schemaVersion: raw.schemaVersion as 1,
    status: raw.status as ProClubMatchCoreData["status"],
    squadLabel: raw.squadLabel as string,
    competitionName: raw.competitionName as string,
    opponentName: raw.opponentName as string | null,
    kickoffAt: nullableTimestampToDate(raw.kickoffAt, "kickoffAt"),
    venueType: raw.venueType as ProClubMatchCoreData["venueType"],
  };
  const validation = validateProClubMatchCoreData(core);
  if (!validation.ok) {
    throw new Error(`Invalid Pro Club Match core: ${validation.errors.join(" ")}`);
  }

  if (
    raw.rosterRevision === 0
      ? rosterPlayerKeys.length !== 0 ||
        rosterMutationPlayerKey !== null ||
        raw.rosterMutationKind !== null
      : rosterMutationPlayerKey === null || raw.rosterMutationKind === null
  ) {
    throw new Error("Invalid Pro Club Match roster revision invariants.");
  }

  return {
    matchId,
    ...core,
    rosterPlayerKeys: [...rosterPlayerKeys],
    rosterRevision: raw.rosterRevision,
    rosterMutationPlayerKey,
    rosterMutationKind: raw.rosterMutationKind as "ADD" | "REMOVE" | null,
    ...requireAudit(raw),
  };
}

function parseRoster(playerKey: string, raw: unknown): ProClubMatchRosterRecord {
  requirePlayerKey(playerKey);
  if (!isPlainObject(raw) || !hasExactKeys(raw, ROSTER_KEYS)) {
    throw new Error("Invalid Pro Club Match roster snapshot shape.");
  }

  if (!Array.isArray(raw.additionalPositions)) {
    throw new Error("Invalid Pro Club Match roster additionalPositions.");
  }

  const position = raw.position as ProClubMatchRosterSnapshot["position"];
  const additionalPositions = [...raw.additionalPositions];
  if (
    position === null
      ? additionalPositions.length !== 0
      : !validatePositionSelection({
          primary: position,
          additional: additionalPositions.filter(
            (value): value is string => typeof value === "string",
          ),
        }).valid ||
        additionalPositions.some((value) => typeof value !== "string")
  ) {
    throw new Error("Invalid Pro Club Match roster additionalPositions.");
  }

  const snapshot: ProClubMatchRosterSnapshot = {
    schemaVersion: raw.schemaVersion as 1,
    playerKey: raw.playerKey as string,
    futId: raw.futId as string | null,
    firstName: raw.firstName as string,
    lastName: raw.lastName as string,
    jerseyNumber: raw.jerseyNumber as number,
    position,
    additionalPositions: additionalPositions as PlayerPositionCode[],
  };

  if (snapshot.playerKey !== playerKey) {
    throw new Error("Match roster snapshot playerKey does not match its path.");
  }
  const validation = validateProClubMatchRosterSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`Invalid Pro Club Match roster snapshot: ${validation.errors.join(" ")}`);
  }

  return {
    ...snapshot,
    additionalPositions: [...snapshot.additionalPositions],
    ...requireAudit(raw),
  };
}

function parseSetPieces(value: unknown): ProClubPersistedStartingXIPlan["setPieceAssignments"] {
  if (!isPlainObject(value) || !hasExactKeys(value, SET_PIECE_KEYS)) {
    throw new Error("Invalid Starting XI set-piece assignment shape.");
  }
  for (const key of SET_PIECE_KEYS) {
    const playerKey = value[key];
    if (playerKey !== null && (typeof playerKey !== "string" || !isExactPlayerKey(playerKey))) {
      throw new Error("Invalid Starting XI set-piece playerKey.");
    }
  }
  return { ...value } as ProClubPersistedStartingXIPlan["setPieceAssignments"];
}

function parseStartingXI(
  raw: unknown,
  rosterPlayerKeys: readonly string[],
): ProClubStartingXIRecord {
  const legacyWithoutCustomKeys = STARTING_XI_KEYS.filter(
    (key) => key !== "customFormationSlots",
  );
  const legacyWithoutGameModelOrCustomKeys = legacyWithoutCustomKeys.filter(
    (key) => key !== "gameModelSnapshot",
  );
  if (
    !isPlainObject(raw) ||
    (
      !hasExactKeys(raw, STARTING_XI_KEYS) &&
      !hasExactKeys(raw, legacyWithoutCustomKeys) &&
      !hasExactKeys(raw, legacyWithoutGameModelOrCustomKeys)
    )
  ) {
    throw new Error("Invalid Pro Club Starting XI document shape.");
  }
  if (
    !Array.isArray(raw.slotPlayerKeys) ||
    !raw.slotPlayerKeys.every((value) => value === null || (typeof value === "string" && isExactPlayerKey(value))) ||
    !Array.isArray(raw.substitutePlayerKeys) ||
    !raw.substitutePlayerKeys.every((value) => typeof value === "string" && isExactPlayerKey(value)) ||
    !Array.isArray(raw.positionRoleAssignments) ||
    !raw.positionRoleAssignments.every((value) => value === null || typeof value === "string") ||
    typeof raw.coachNotes !== "string"
  ) {
    throw new Error("Invalid Pro Club Starting XI field types.");
  }

  const plan: ProClubPersistedStartingXIPlan = {
    schemaVersion: raw.schemaVersion as 1,
    formation: raw.formation as ProClubPersistedStartingXIPlan["formation"],
    customFormationSlots:
      raw.formation === "CUSTOM"
        ? Array.isArray(raw.customFormationSlots)
          ? raw.customFormationSlots.map((slot) => ({ ...(slot as ProClubCustomFormationSlot) }))
          : createProClubCustomFormationSlotsFromFixed("4-3-3")
        : null,
    slotPlayerKeys: [...raw.slotPlayerKeys] as (string | null)[],
    substitutePlayerKeys: [...raw.substitutePlayerKeys] as string[],
    positionRoleAssignments: [...raw.positionRoleAssignments] as (string | null)[],
    setPieceAssignments: parseSetPieces(raw.setPieceAssignments),
    gameModelSnapshot:
      raw.gameModelSnapshot && typeof raw.gameModelSnapshot === "object"
        ? { ...(raw.gameModelSnapshot as NonNullable<ProClubPersistedStartingXIPlan["gameModelSnapshot"]>) }
        : {
            IN_POSSESSION: "",
            OUT_OF_POSSESSION: "",
            TRANSITION_TO_ATTACK: "",
            TRANSITION_TO_DEFEND: "",
          },
    coachNotes: raw.coachNotes,
  };
  const validation = validateProClubPersistedStartingXIPlan(plan, rosterPlayerKeys);
  if (!validation.ok) {
    throw new Error(`Invalid Pro Club Starting XI: ${validation.errors.join(" ")}`);
  }
  requireNonNegativeInteger(raw.matchRosterRevision, "matchRosterRevision");
  requireNonNegativeInteger(raw.revision, "revision");
  if (raw.revision < 1) {
    throw new Error("Starting XI revision must be at least 1.");
  }

  return {
    ...plan,
    slotPlayerKeys: [...plan.slotPlayerKeys],
    substitutePlayerKeys: [...plan.substitutePlayerKeys],
    positionRoleAssignments: [...plan.positionRoleAssignments],
    setPieceAssignments: { ...plan.setPieceAssignments },
    gameModelSnapshot: { ...(plan.gameModelSnapshot ?? createEmptyGameModelTextSnapshot()) },
    customFormationSlots:
      plan.customFormationSlots?.map((slot) => ({ ...slot })) ?? null,
    matchRosterRevision: raw.matchRosterRevision,
    revision: raw.revision,
    ...requireAudit(raw),
  };
}

function parseShootout(
  raw: unknown,
  rosterPlayerKeys: readonly string[],
): ProClubShootoutRecord {
  if (!isPlainObject(raw) || !hasExactKeys(raw, SHOOTOUT_KEYS)) {
    throw new Error("Invalid Pro Club shootout document shape.");
  }
  if (
    !Array.isArray(raw.primaryTakers) ||
    !raw.primaryTakers.every((value) => typeof value === "string" && isExactPlayerKey(value)) ||
    !Array.isArray(raw.backupTakers) ||
    !raw.backupTakers.every((value) => typeof value === "string" && isExactPlayerKey(value))
  ) {
    throw new Error("Invalid Pro Club shootout field types.");
  }

  const plan: ProClubPersistedShootoutPlan = {
    schemaVersion: raw.schemaVersion as 1,
    primaryTakers: [...raw.primaryTakers] as string[],
    backupTakers: [...raw.backupTakers] as string[],
  };
  const validation = validateProClubPersistedShootoutPlan(plan, rosterPlayerKeys);
  if (!validation.ok) {
    throw new Error(`Invalid Pro Club shootout: ${validation.errors.join(" ")}`);
  }
  requireNonNegativeInteger(raw.matchRosterRevision, "matchRosterRevision");
  requireNonNegativeInteger(raw.revision, "revision");
  if (raw.revision < 1) {
    throw new Error("Shootout revision must be at least 1.");
  }

  return {
    ...plan,
    primaryTakers: [...plan.primaryTakers],
    backupTakers: [...plan.backupTakers],
    matchRosterRevision: raw.matchRosterRevision,
    revision: raw.revision,
    ...requireAudit(raw),
  };
}

function requireAuthenticatedUid(ops: ProClubMatchStartingXIRepositoryOps): string {
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  return uid;
}

async function resolveRequiredAuthority(
  clubId: string,
  uid: string,
  ops: ProClubMatchStartingXIRepositoryOps,
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
    authority.organizationType !== "PRO_CLUB" ||
    authority.organizationStatus !== "ACTIVE" ||
    authority.membershipStatus !== "ACTIVE" ||
    authority.hasMembershipAuthority !== true ||
    authority.staffRole === null
  ) {
    throw new Error("Active Pro Club staff authority is required.");
  }
}

function requireFootballAuthority(
  authority: ProClubOrganizationAuthority,
): FootballAuthorityRole {
  if (!canAuthorProClubMatchStartingXI(authority) || !isFootballAuthorityRole(authority.staffRole)) {
    throw new Error("Active HEAD_COACH or TECHNICAL_DIRECTOR authority is required.");
  }
  return authority.staffRole;
}

function documentFieldsForMatch(data: ProClubMatchCoreData): DocumentData {
  return {
    schemaVersion: data.schemaVersion,
    status: data.status,
    squadLabel: data.squadLabel,
    competitionName: data.competitionName,
    opponentName: data.opponentName,
    kickoffAt: data.kickoffAt,
    venueType: data.venueType,
  };
}

function createFirestoreOps(): ProClubMatchStartingXIRepositoryOps {
  function assertPath(path: readonly string[], label: string): void {
    if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
      throw new Error(`Invalid ${label} path.`);
    }
  }

  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      assertPath(path, "Pro Club Match read");
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
        throw new Error("Invalid Pro Club Match collection path.");
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
    async setDocument(path, data) {
      assertPath(path, "Pro Club Match set");
      const [first, ...rest] = path;
      await setDoc(doc(db, first, ...rest), data);
    },
    async updateDocument(path, data) {
      assertPath(path, "Pro Club Match update");
      const [first, ...rest] = path;
      await updateDoc(doc(db, first, ...rest), data);
    },
    async commitAtomic(writes) {
      const batch = writeBatch(db);
      for (const write of writes) {
        assertPath(write.path, "Pro Club Match atomic write");
        const [first, ...rest] = write.path;
        const ref = doc(db, first, ...rest);
        if (write.kind === "set") batch.set(ref, write.data);
        if (write.kind === "update") batch.update(ref, write.data);
        if (write.kind === "delete") batch.delete(ref);
      }
      await batch.commit();
    },
    timestamp() {
      return serverTimestamp();
    },
  };
}

const FIRESTORE_OPS = createFirestoreOps();

export function createFirestoreProClubMatchStartingXIRepositoryOps():
  ProClubMatchStartingXIRepositoryOps {
  return createFirestoreOps();
}

export async function getProClubMatch(
  clubId: string,
  matchId: string,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchRecord | null> {
  const path = proClubMatchDocumentPath(clubId, matchId);
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaff(authority);

  const snapshot = await ops.readDocument(path);
  if (!snapshot.exists) return null;
  if (snapshot.id !== matchId) {
    throw new Error("Pro Club Match read returned a mismatched document ID.");
  }
  return parseMatch(matchId, snapshot.data);
}

export async function listProClubMatches(
  clubId: string,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchRecord[]> {
  requireDocumentId(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaff(authority);

  const snapshot = await ops.listDocuments(["proClubs", clubId, "matches"]);
  return snapshot.documents.map((item) => {
    if (!item.exists) {
      throw new Error("Pro Club Match list returned a missing document.");
    }
    return parseMatch(item.id, item.data);
  });
}

export async function createProClubMatch(
  clubId: string,
  matchId: string,
  data: ProClubMatchCoreData,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchRecord> {
  const path = proClubMatchDocumentPath(clubId, matchId);
  const validation = validateProClubMatchCoreData(data);
  if (!validation.ok || data.status !== "DRAFT") {
    throw new Error(`Invalid Pro Club Match create data: ${validation.errors.join(" ")}`);
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  const role = requireFootballAuthority(authority);

  const existing = await ops.readDocument(path);
  if (existing.exists) {
    throw new Error("Pro Club Match already exists.");
  }

  const timestamp = ops.timestamp();
  await ops.setDocument(path, {
    ...documentFieldsForMatch(data),
    rosterPlayerKeys: [],
    rosterRevision: 0,
    rosterMutationPlayerKey: null,
    rosterMutationKind: null,
    createdAt: timestamp,
    createdBy: uid,
    createdByRole: role,
    updatedAt: timestamp,
    updatedBy: uid,
    updatedByRole: role,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== matchId) {
    throw new Error("Pro Club Match create outcome is ambiguous.");
  }
  const record = parseMatch(matchId, readBack.data);
  if (record.createdBy !== uid || record.rosterRevision !== 0) {
    throw new Error("Pro Club Match create read-back did not match canonical data.");
  }
  return record;
}

export async function listProClubMatchRoster(
  clubId: string,
  matchId: string,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchRosterRecord[]> {
  proClubMatchDocumentPath(clubId, matchId);
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaff(authority);

  const match = await getProClubMatch(clubId, matchId, ops);
  if (!match) throw new Error("Pro Club Match does not exist.");

  const snapshot = await ops.listDocuments([
    "proClubs", clubId, "matches", matchId, "roster",
  ]);
  const records = snapshot.documents.map((item) => {
    if (!item.exists) throw new Error("Match roster list returned a missing document.");
    return parseRoster(item.id, item.data);
  });
  const recordKeys = records.map((item) => item.playerKey);
  if (
    recordKeys.length !== match.rosterPlayerKeys.length ||
    !match.rosterPlayerKeys.every((key) => recordKeys.includes(key))
  ) {
    throw new Error("Match roster snapshots do not match the authoritative roster index.");
  }
  return records;
}

function parseCanonicalRosterPlayer(
  playerKey: string,
  raw: unknown,
): ProClubMatchRosterSnapshot {
  requirePlayerKey(playerKey);
  if (!isPlainObject(raw)) {
    throw new Error("Canonical Pro Club roster player is invalid.");
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
  if (football.ok === false || football.value.status !== "ACTIVE") {
    throw new Error("Match roster requires an ACTIVE canonical Pro Club roster player.");
  }

  const snapshot: ProClubMatchRosterSnapshot = {
    schemaVersion: 1,
    playerKey,
    futId: football.value.futId,
    firstName: football.value.firstName,
    lastName: football.value.lastName,
    jerseyNumber: football.value.jerseyNumber,
    position: football.value.position,
    additionalPositions: [...football.value.additionalPositions],
  };
  const validation = validateProClubMatchRosterSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`Invalid canonical roster snapshot: ${validation.errors.join(" ")}`);
  }
  return snapshot;
}

async function readMatchForMutation(
  clubId: string,
  matchId: string,
  expectedRosterRevision: number,
  ops: ProClubMatchStartingXIRepositoryOps,
): Promise<ProClubMatchRecord> {
  requireNonNegativeInteger(expectedRosterRevision, "expectedRosterRevision");
  const match = await getProClubMatch(clubId, matchId, ops);
  if (!match) throw new Error("Pro Club Match does not exist.");
  if (match.rosterRevision !== expectedRosterRevision) {
    throw new Error("Stale Match roster revision.");
  }
  if (match.status !== "DRAFT" && match.status !== "SCHEDULED") {
    throw new Error("Match roster is locked at the current Match status.");
  }
  return match;
}

export async function addProClubMatchRosterPlayer(
  clubId: string,
  matchId: string,
  playerKey: string,
  expectedRosterRevision: number,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchRosterMutationResult> {
  proClubMatchRosterDocumentPath(clubId, matchId, playerKey);
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  const role = requireFootballAuthority(authority);
  const match = await readMatchForMutation(
    clubId, matchId, expectedRosterRevision, ops,
  );
  if (match.rosterPlayerKeys.includes(playerKey)) {
    throw new Error("Player is already in the authoritative Match roster.");
  }
  if (match.rosterPlayerKeys.length >= 64) {
    throw new Error("Match roster supports at most 64 players.");
  }

  const source = await ops.readDocument(["proClubs", clubId, "players", playerKey]);
  if (!source.exists || source.id !== playerKey) {
    throw new Error("Canonical Pro Club roster player does not exist.");
  }
  const snapshot = parseCanonicalRosterPlayer(playerKey, source.data);
  const timestamp = ops.timestamp();
  const rosterPath = proClubMatchRosterDocumentPath(clubId, matchId, playerKey);
  const matchPath = proClubMatchDocumentPath(clubId, matchId);

  await ops.commitAtomic([
    {
      kind: "update",
      path: matchPath,
      data: {
        rosterPlayerKeys: [...match.rosterPlayerKeys, playerKey],
        rosterRevision: match.rosterRevision + 1,
        rosterMutationPlayerKey: playerKey,
        rosterMutationKind: "ADD",
        updatedAt: timestamp,
        updatedBy: uid,
        updatedByRole: role,
      },
    },
    {
      kind: "set",
      path: rosterPath,
      data: {
        ...snapshot,
        additionalPositions: [...snapshot.additionalPositions],
        createdAt: timestamp,
        createdBy: uid,
        createdByRole: role,
        updatedAt: timestamp,
        updatedBy: uid,
        updatedByRole: role,
      },
    },
  ]);

  const updatedMatch = await getProClubMatch(clubId, matchId, ops);
  if (!updatedMatch || updatedMatch.rosterRevision !== match.rosterRevision + 1) {
    throw new Error("Match roster add outcome is ambiguous.");
  }
  return {
    match: updatedMatch,
    roster: await listProClubMatchRoster(clubId, matchId, ops),
  };
}

export async function removeProClubMatchRosterPlayer(
  clubId: string,
  matchId: string,
  playerKey: string,
  expectedRosterRevision: number,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchRosterMutationResult> {
  proClubMatchRosterDocumentPath(clubId, matchId, playerKey);
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  const role = requireFootballAuthority(authority);
  const match = await readMatchForMutation(
    clubId, matchId, expectedRosterRevision, ops,
  );
  if (!match.rosterPlayerKeys.includes(playerKey)) {
    throw new Error("Player is not in the authoritative Match roster.");
  }

  const timestamp = ops.timestamp();
  await ops.commitAtomic([
    {
      kind: "update",
      path: proClubMatchDocumentPath(clubId, matchId),
      data: {
        rosterPlayerKeys: match.rosterPlayerKeys.filter((key) => key !== playerKey),
        rosterRevision: match.rosterRevision + 1,
        rosterMutationPlayerKey: playerKey,
        rosterMutationKind: "REMOVE",
        updatedAt: timestamp,
        updatedBy: uid,
        updatedByRole: role,
      },
    },
    {
      kind: "delete",
      path: proClubMatchRosterDocumentPath(clubId, matchId, playerKey),
    },
  ]);

  const updatedMatch = await getProClubMatch(clubId, matchId, ops);
  if (!updatedMatch || updatedMatch.rosterRevision !== match.rosterRevision + 1) {
    throw new Error("Match roster remove outcome is ambiguous.");
  }
  return {
    match: updatedMatch,
    roster: await listProClubMatchRoster(clubId, matchId, ops),
  };
}

async function readMatchForPlan(
  clubId: string,
  matchId: string,
  ops: ProClubMatchStartingXIRepositoryOps,
): Promise<ProClubMatchRecord> {
  const match = await getProClubMatch(clubId, matchId, ops);
  if (!match) throw new Error("Pro Club Match does not exist.");
  return match;
}

export async function getProClubStartingXI(
  clubId: string,
  matchId: string,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStartingXIRecord | null> {
  const match = await readMatchForPlan(clubId, matchId, ops);
  const snapshot = await ops.readDocument(proClubMatchStartingXIDocumentPath(clubId, matchId));
  if (!snapshot.exists) return null;
  if (snapshot.id !== "current") {
    throw new Error("Starting XI read returned an unexpected document ID.");
  }
  return parseStartingXI(snapshot.data, match.rosterPlayerKeys);
}

export async function saveProClubStartingXI(
  clubId: string,
  matchId: string,
  plan: ProClubPersistedStartingXIPlan,
  expectedRevision: number,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStartingXIRecord> {
  requireNonNegativeInteger(expectedRevision, "expectedRevision");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  const role = requireFootballAuthority(authority);
  const match = await readMatchForPlan(clubId, matchId, ops);

  if (!canMutateStartingXIAtMatchStatus(match.status)) {
    throw new Error("Starting XI is locked at the current Match status.");
  }
  const validation = validateProClubPersistedStartingXIPlan(plan, match.rosterPlayerKeys);
  if (!validation.ok) {
    throw new Error(`Invalid Starting XI plan: ${validation.errors.join(" ")}`);
  }

  const path = proClubMatchStartingXIDocumentPath(clubId, matchId);
  const existing = await ops.readDocument(path);
  const timestamp = ops.timestamp();
  const payload = {
    schemaVersion: plan.schemaVersion,
    formation: plan.formation,
    customFormationSlots:
      plan.formation === "CUSTOM"
        ? plan.customFormationSlots?.map((slot) => ({ ...slot })) ?? null
        : null,
    slotPlayerKeys: [...plan.slotPlayerKeys],
    substitutePlayerKeys: [...plan.substitutePlayerKeys],
    positionRoleAssignments: [...plan.positionRoleAssignments],
    setPieceAssignments: { ...plan.setPieceAssignments },
    gameModelSnapshot: { ...(plan.gameModelSnapshot ?? createEmptyGameModelTextSnapshot()) },
    coachNotes: plan.coachNotes,
    matchRosterRevision: match.rosterRevision,
  };

  if (!existing.exists) {
    if (expectedRevision !== 0) {
      throw new Error("Stale Starting XI revision.");
    }
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
    const current = parseStartingXI(existing.data, match.rosterPlayerKeys);
    if (current.revision !== expectedRevision) {
      throw new Error("Stale Starting XI revision.");
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
  if (!readBack.exists) throw new Error("Starting XI save outcome is ambiguous.");
  const saved = parseStartingXI(readBack.data, match.rosterPlayerKeys);
  if (
    saved.revision !== expectedRevision + 1 ||
    saved.matchRosterRevision !== match.rosterRevision ||
    saved.updatedBy !== uid
  ) {
    throw new Error("Starting XI save read-back did not match canonical data.");
  }
  return saved;
}

export async function getProClubShootout(
  clubId: string,
  matchId: string,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubShootoutRecord | null> {
  const match = await readMatchForPlan(clubId, matchId, ops);
  const snapshot = await ops.readDocument(proClubMatchShootoutDocumentPath(clubId, matchId));
  if (!snapshot.exists) return null;
  if (snapshot.id !== "current") {
    throw new Error("Shootout read returned an unexpected document ID.");
  }
  return parseShootout(snapshot.data, match.rosterPlayerKeys);
}

export async function saveProClubShootout(
  clubId: string,
  matchId: string,
  plan: ProClubPersistedShootoutPlan,
  expectedRevision: number,
  ops: ProClubMatchStartingXIRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubShootoutRecord> {
  requireNonNegativeInteger(expectedRevision, "expectedRevision");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  const role = requireFootballAuthority(authority);
  const match = await readMatchForPlan(clubId, matchId, ops);

  if (!canMutateShootoutAtMatchStatus(match.status)) {
    throw new Error("Shootout order is locked at the current Match status.");
  }
  const validation = validateProClubPersistedShootoutPlan(plan, match.rosterPlayerKeys);
  if (!validation.ok) {
    throw new Error(`Invalid shootout plan: ${validation.errors.join(" ")}`);
  }

  const path = proClubMatchShootoutDocumentPath(clubId, matchId);
  const existing = await ops.readDocument(path);
  const timestamp = ops.timestamp();
  const payload = {
    schemaVersion: plan.schemaVersion,
    primaryTakers: [...plan.primaryTakers],
    backupTakers: [...plan.backupTakers],
    matchRosterRevision: match.rosterRevision,
  };

  if (!existing.exists) {
    if (expectedRevision !== 0) throw new Error("Stale shootout revision.");
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
    const current = parseShootout(existing.data, match.rosterPlayerKeys);
    if (current.revision !== expectedRevision) {
      throw new Error("Stale shootout revision.");
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
  if (!readBack.exists) throw new Error("Shootout save outcome is ambiguous.");
  const saved = parseShootout(readBack.data, match.rosterPlayerKeys);
  if (
    saved.revision !== expectedRevision + 1 ||
    saved.matchRosterRevision !== match.rosterRevision ||
    saved.updatedBy !== uid
  ) {
    throw new Error("Shootout save read-back did not match canonical data.");
  }
  return saved;
}
