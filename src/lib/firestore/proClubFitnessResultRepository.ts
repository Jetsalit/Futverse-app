import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import {
  PRO_CLUB_FITNESS_RESULTS_COLLECTION,
  proClubFitnessResultDocumentIdV1,
  selectProClubFitnessResultHistory,
  selectProClubFitnessResultsForDate,
  validateProClubFitnessResultCreateInput,
  type ProClubFitnessResultCreateInput,
  type ProClubFitnessResultHistoryEntry,
  type ValidProClubFitnessResultCreate,
} from "../proClubFitnessResult";
import type { FitnessTestDefinition } from "../fitnessTestFoundation";
import { parseCanonicalDateOnly } from "../dateTimeFoundation";
import { isExactPlayerKey } from "../playerIdentityFoundation";
import { isValidDocumentIdentifier } from "../proClubModel";
import { auth, db } from "../firebase";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export interface ProClubFitnessResultRepositoryDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubFitnessResultRepositoryListSnapshot {
  readonly documents: readonly ProClubFitnessResultRepositoryDocumentSnapshot[];
}

export interface ProClubFitnessResultRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(
    path: readonly string[],
  ): Promise<ProClubFitnessResultRepositoryDocumentSnapshot>;
  listDocuments(
    path: readonly string[],
    filter?: { field: "observedOn" | "playerKey"; value: string },
  ): Promise<ProClubFitnessResultRepositoryListSnapshot>;
  createDocument(path: readonly string[], data: DocumentData): Promise<void>;
  serverTimestamp(): unknown;
}

export type ProClubFitnessResultCreateOutcome =
  | { kind: "DEFINITELY_CREATED"; resultId: string }
  | { kind: "ALREADY_COMMITTED_EQUIVALENT"; resultId: string }
  | { kind: "OBSERVATION_CONFLICT"; resultId: string }
  | { kind: "WRITE_FAILED"; resultId: string; error: unknown };

const IMMUTABLE_RESULT_FIELDS = [
  "schemaVersion",
  "playerKey",
  "definitionId",
  "definitionVersion",
  "value",
  "observedOn",
  "source",
  "recordedBy",
] as const;
const STORED_RESULT_FIELDS = [...IMMUTABLE_RESULT_FIELDS, "recordedAt"] as const;
const AMBIGUOUS_WRITE_CODES = new Set([
  "aborted",
  "cancelled",
  "deadline-exceeded",
  "internal",
  "unknown",
  "unavailable",
]);

export const MAX_IN_FLIGHT_RESULT_OPERATIONS = 4 as const;

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

function assertActiveStaffAuthority(authority: ProClubOrganizationAuthority): void {
  if (
    authority.organizationType !== "PRO_CLUB" ||
    authority.organizationStatus !== "ACTIVE" ||
    authority.membershipStatus !== "ACTIVE" ||
    authority.hasMembershipAuthority !== true ||
    authority.staffRole === null
  ) {
    throw new Error("Active Pro Club Membership and active staff authority are required.");
  }
}

function assertFitnessCoachAuthority(authority: ProClubOrganizationAuthority): void {
  assertActiveStaffAuthority(authority);
  if (authority.staffRole !== "FITNESS_COACH") {
    throw new Error("Creating Pro Club Fitness results requires an active FITNESS_COACH.");
  }
}

async function resolveRequiredAuthority(
  clubId: string,
  uid: string,
  ops: ProClubFitnessResultRepositoryOps,
): Promise<ProClubOrganizationAuthority> {
  const result = await ops.resolveAuthority(clubId, uid);
  if (result.state !== "FOUND") {
    throw new Error(`Pro Club authority could not be resolved: ${result.state}.`);
  }
  if (
    result.value.organizationId !== clubId ||
    result.value.userId !== uid
  ) {
    throw new Error("Resolved Pro Club authority identity mismatch.");
  }
  return result.value;
}

function requireAuthenticatedUid(ops: ProClubFitnessResultRepositoryOps): string {
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  return uid;
}

function resultCollectionPath(clubId: string): readonly string[] {
  requireDocumentId(clubId, "clubId");
  return ["proClubs", clubId, PRO_CLUB_FITNESS_RESULTS_COLLECTION];
}

function storedResultMatches(
  raw: unknown,
  expected: Record<string, unknown>,
): boolean {
  if (!isPlainObject(raw)) return false;
  const actualKeys = Object.keys(raw).sort();
  const expectedKeys = [...STORED_RESULT_FIELDS].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.join(",") !== expectedKeys.join(",")) {
    return false;
  }
  if (raw.recordedAt == null) return false;
  return IMMUTABLE_RESULT_FIELDS.every((field) => raw[field] === expected[field]);
}

function isAmbiguousWriteFailure(error: unknown): boolean {
  if (!isPlainObject(error) || typeof error.code !== "string") return false;
  const code = error.code.startsWith("firestore/")
    ? error.code.slice("firestore/".length)
    : error.code;
  return AMBIGUOUS_WRITE_CODES.has(code);
}

function createFirestoreOps(
  firestore: Firestore,
  getAuthenticatedUid: () => string | null,
  resolveAuthority: (
    clubId: string,
    uid: string,
  ) => Promise<ProClubOrganizationAuthorityResult>,
): ProClubFitnessResultRepositoryOps {
  return {
    getAuthenticatedUid,
    resolveAuthority,
    async readDocument(path) {
      if (path.length !== 4 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Fitness result document path.");
      }
      const [root, clubId, collectionName, resultId] = path;
      if (root !== "proClubs" || collectionName !== PRO_CLUB_FITNESS_RESULTS_COLLECTION) {
        throw new Error("Invalid Pro Club Fitness result document path.");
      }
      const snapshot = await getDocFromServer(doc(firestore, root, clubId, collectionName, resultId));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
    async listDocuments(path, filter) {
      if (
        path.length !== 3 ||
        !path.every(isValidDocumentIdentifier) ||
        path[0] !== "proClubs" ||
        path[2] !== PRO_CLUB_FITNESS_RESULTS_COLLECTION
      ) {
        throw new Error("Invalid Pro Club Fitness results collection path.");
      }
      const [root, clubId, collectionName] = path;
      const resultsCollection = collection(firestore, root, clubId, collectionName);
      const resultsQuery = filter
        ? query(resultsCollection, where(filter.field, "==", filter.value))
        : resultsCollection;
      const snapshot = await getDocsFromServer(resultsQuery);
      return {
        documents: snapshot.docs.map((document) => ({
          id: document.id,
          exists: true,
          data: document.data(),
        })),
      };
    },
    async createDocument(path, data) {
      if (path.length !== 4 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Fitness result document path.");
      }
      const [root, clubId, collectionName, resultId] = path;
      if (root !== "proClubs" || collectionName !== PRO_CLUB_FITNESS_RESULTS_COLLECTION) {
        throw new Error("Invalid Pro Club Fitness result document path.");
      }
      await setDoc(doc(firestore, root, clubId, collectionName, resultId), data);
    },
    serverTimestamp,
  };
}

export function createFirestoreProClubFitnessResultRepositoryOps(input: {
  firestore?: Firestore;
  getAuthenticatedUid?: () => string | null;
  resolveAuthority?: (
    clubId: string,
    uid: string,
  ) => Promise<ProClubOrganizationAuthorityResult>;
} = {}): ProClubFitnessResultRepositoryOps {
  return createFirestoreOps(
    input.firestore ?? db,
    input.getAuthenticatedUid ?? (() => auth.currentUser?.uid ?? null),
    input.resolveAuthority ?? ((clubId, uid) => resolveProClubOrganizationAuthority(clubId, uid)),
  );
}

const FIRESTORE_OPS = createFirestoreProClubFitnessResultRepositoryOps();

interface PreparedProClubFitnessResult {
  value: ValidProClubFitnessResultCreate;
  resultId: string;
}

async function createPreparedProClubFitnessResult(
  path: readonly string[],
  uid: string,
  prepared: PreparedProClubFitnessResult,
  ops: ProClubFitnessResultRepositoryOps,
): Promise<ProClubFitnessResultCreateOutcome> {
  const { resultId, value } = prepared;
  const record: Record<string, unknown> = {
    ...value,
    recordedAt: ops.serverTimestamp(),
    recordedBy: uid,
  };
  const documentPath = [...path, resultId];
  let existing: ProClubFitnessResultRepositoryDocumentSnapshot;
  try {
    existing = await ops.readDocument(documentPath);
  } catch (error) {
    return { kind: "WRITE_FAILED", resultId, error };
  }
  if (existing.id !== resultId) {
    return {
      kind: "WRITE_FAILED",
      resultId,
      error: new Error("Pro Club Fitness result read returned an unexpected document ID."),
    };
  }
  if (existing.exists) {
    return storedResultMatches(existing.data, record)
      ? { kind: "ALREADY_COMMITTED_EQUIVALENT", resultId }
      : { kind: "OBSERVATION_CONFLICT", resultId };
  }

  try {
    await ops.createDocument(documentPath, record);
    return { kind: "DEFINITELY_CREATED", resultId };
  } catch (error) {
    if (!isAmbiguousWriteFailure(error)) {
      return { kind: "WRITE_FAILED", resultId, error };
    }
    try {
      const readback = await ops.readDocument(documentPath);
      if (readback.id !== resultId) {
        return { kind: "WRITE_FAILED", resultId, error };
      }
      if (!readback.exists) return { kind: "WRITE_FAILED", resultId, error };
      return storedResultMatches(readback.data, record)
        ? { kind: "ALREADY_COMMITTED_EQUIVALENT", resultId }
        : { kind: "OBSERVATION_CONFLICT", resultId };
    } catch {
      return { kind: "WRITE_FAILED", resultId, error };
    }
  }
}

export async function createProClubFitnessResults(
  input: {
    clubId: string;
    inputs: readonly ProClubFitnessResultCreateInput[];
  },
  ops: ProClubFitnessResultRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubFitnessResultCreateOutcome[]> {
  const path = resultCollectionPath(input.clubId);
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(input.clubId, uid, ops);
  assertFitnessCoachAuthority(authority);

  const prepared: PreparedProClubFitnessResult[] = [];
  const resultIds = new Set<string>();
  for (const createInput of input.inputs) {
    const validation = validateProClubFitnessResultCreateInput(createInput);
    if (validation.ok === false) {
      throw new Error(`Invalid Pro Club Fitness result: ${validation.errors.join(" ")}`);
    }
    const resultId = await proClubFitnessResultDocumentIdV1(validation.value);
    if (resultIds.has(resultId)) {
      throw new Error("Bulk Pro Club Fitness results contain a duplicate deterministic identity.");
    }
    resultIds.add(resultId);
    prepared.push({ value: validation.value, resultId });
  }

  const outcomes: ProClubFitnessResultCreateOutcome[] = new Array(prepared.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < prepared.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = prepared[index];
      try {
        outcomes[index] = await createPreparedProClubFitnessResult(path, uid, result, ops);
      } catch (error) {
        outcomes[index] = { kind: "WRITE_FAILED", resultId: result.resultId, error };
      }
    }
  };
  const workerCount = Math.min(MAX_IN_FLIGHT_RESULT_OPERATIONS, prepared.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return outcomes;
}

export async function createProClubFitnessResult(
  input: { clubId: string; input: ProClubFitnessResultCreateInput },
  ops: ProClubFitnessResultRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubFitnessResultCreateOutcome> {
  const [outcome] = await createProClubFitnessResults({
    clubId: input.clubId,
    inputs: [input.input],
  }, ops);
  if (!outcome) throw new Error("Pro Club Fitness result creation returned no outcome.");
  return outcome;
}

async function resolveActiveStaffForRead(
  clubId: string,
  ops: ProClubFitnessResultRepositoryOps,
): Promise<readonly string[]> {
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaffAuthority(authority);
  return resultCollectionPath(clubId);
}

export async function listProClubFitnessResultsForDate(input: {
  clubId: string;
  observedOn: string;
  definitions: readonly FitnessTestDefinition[];
}, ops: ProClubFitnessResultRepositoryOps = FIRESTORE_OPS): Promise<Record<string, Record<string, number>>> {
  const path = await resolveActiveStaffForRead(input.clubId, ops);
  if (typeof input.observedOn !== "string" || parseCanonicalDateOnly(input.observedOn) === null) {
    throw new Error("observedOn must be a valid calendar date in YYYY-MM-DD format.");
  }
  const snapshot = await ops.listDocuments(path, {
    field: "observedOn",
    value: input.observedOn,
  });
  return selectProClubFitnessResultsForDate({
    observedOn: input.observedOn,
    definitions: input.definitions,
    records: snapshot.documents
      .filter((document) => document.exists && isValidDocumentIdentifier(document.id))
      .map(({ id, data }) => ({ id, data })),
  });
}

export async function listProClubFitnessResultHistory(input: {
  clubId: string;
  playerKey: string;
  definitions: readonly FitnessTestDefinition[];
}, ops: ProClubFitnessResultRepositoryOps = FIRESTORE_OPS): Promise<ProClubFitnessResultHistoryEntry[]> {
  const path = await resolveActiveStaffForRead(input.clubId, ops);
  requirePlayerKey(input.playerKey);
  const snapshot = await ops.listDocuments(path, {
    field: "playerKey",
    value: input.playerKey,
  });
  return selectProClubFitnessResultHistory({
    playerKey: input.playerKey,
    definitions: input.definitions,
    records: snapshot.documents
      .filter((document) => document.exists && isValidDocumentIdentifier(document.id))
      .map(({ id, data }) => ({ id, data })),
  });
}

export interface ProClubFitnessResultsWeeklyTrainingReadRecord {
  readonly id: string;
  readonly organization: {
    readonly organizationType: "PRO_CLUB";
    readonly organizationId: string;
  };
  readonly data: unknown;
}

/** Lists the persisted result collection for the observational Weekly Training adapter. */
export async function listProClubFitnessResultsForWeeklyTrainingRead(
  input: { clubId: string },
  ops: ProClubFitnessResultRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubFitnessResultsWeeklyTrainingReadRecord[]> {
  const path = await resolveActiveStaffForRead(input.clubId, ops);
  const snapshot = await ops.listDocuments(path);

  return snapshot.documents
    .filter((document) => document.exists && isValidDocumentIdentifier(document.id))
    .map(({ id, data }) => ({
      id,
      organization: {
        organizationType: "PRO_CLUB",
        organizationId: input.clubId,
      },
      data,
    }));
}
