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
  buildProClubAttendanceSessionId,
  isEligibleProClubAttendanceRosterPlayer,
  isProClubAttendanceStatus,
  validateProClubAttendanceRecordInput,
  validateProClubAttendanceSessionInput,
  type ProClubAttendanceStatus,
  type ValidProClubAttendanceSessionInput,
} from "../proClubAttendance";
import { isExactPlayerKey } from "../playerIdentityFoundation";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export interface ProClubAttendanceDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubAttendanceListSnapshot {
  readonly documents: readonly ProClubAttendanceDocumentSnapshot[];
}

export interface ProClubAttendanceRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(path: readonly string[]): Promise<ProClubAttendanceDocumentSnapshot>;
  listDocuments(path: readonly string[]): Promise<ProClubAttendanceListSnapshot>;
  createDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

export interface ProClubAttendanceSessionRecord {
  attendanceSessionId: string;
  schemaVersion: 1;
  sessionDate: string;
  startTime: string;
  squadLabel: "First Team";
  sessionType: "TRAINING";
  createdAt: unknown;
  createdBy: string;
}

export interface ProClubAttendancePlayerRecord {
  playerKey: string;
  schemaVersion: 1;
  status: ProClubAttendanceStatus;
  createdAt: unknown;
  createdBy: string;
  updatedAt: unknown;
  updatedBy: string;
}

const SESSION_DOCUMENT_KEYS = [
  "createdAt",
  "createdBy",
  "schemaVersion",
  "sessionDate",
  "sessionType",
  "squadLabel",
  "startTime",
] as const;

const RECORD_DOCUMENT_KEYS = [
  "createdAt",
  "createdBy",
  "schemaVersion",
  "status",
  "updatedAt",
  "updatedBy",
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

function requireExactPathIdentity(value: unknown, label: string): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(`${label} must be an exact Firestore document ID.`);
  }
}

function requireExactPlayerKey(value: unknown): asserts value is string {
  if (!isExactPlayerKey(value)) {
    throw new Error("playerKey must be an exact Player Identity key.");
  }
}

function requireAuthenticatedUid(ops: ProClubAttendanceRepositoryOps): string {
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
    throw new Error("Active Pro Club Membership and active staff authority are required.");
  }
}

function assertHeadCoachAuthority(authority: ProClubOrganizationAuthority): void {
  assertActiveStaffAuthority(authority);
  if (authority.staffRole !== "HEAD_COACH") {
    throw new Error("Pro Club Attendance mutation requires an active HEAD_COACH.");
  }
}

async function resolveRequiredAuthority(
  clubId: string,
  uid: string,
  ops: ProClubAttendanceRepositoryOps,
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

function parseSessionDocument(
  attendanceSessionId: string,
  raw: unknown,
): ProClubAttendanceSessionRecord {
  requireExactPathIdentity(attendanceSessionId, "attendanceSessionId");
  if (!isPlainObject(raw) || !hasExactKeys(raw, SESSION_DOCUMENT_KEYS)) {
    throw new Error("Invalid Pro Club Attendance session document shape.");
  }

  const validation = validateProClubAttendanceSessionInput({
    sessionDate: raw.sessionDate,
    startTime: raw.startTime,
  });
  if (validation.ok === false) {
    throw new Error(`Invalid Pro Club Attendance session data: ${validation.errors.join(" ")}`);
  }

  if (
    raw.schemaVersion !== 1 ||
    raw.squadLabel !== "First Team" ||
    raw.sessionType !== "TRAINING" ||
    validation.value.attendanceSessionId !== attendanceSessionId ||
    !isValidDocumentIdentifier(raw.createdBy) ||
    raw.createdAt == null
  ) {
    throw new Error("Invalid Pro Club Attendance session invariants.");
  }

  return {
    attendanceSessionId,
    schemaVersion: 1,
    sessionDate: validation.value.sessionDate,
    startTime: validation.value.startTime,
    squadLabel: "First Team",
    sessionType: "TRAINING",
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
  };
}

function parseAttendanceRecord(
  playerKey: string,
  raw: unknown,
): ProClubAttendancePlayerRecord {
  requireExactPlayerKey(playerKey);
  if (!isPlainObject(raw) || !hasExactKeys(raw, RECORD_DOCUMENT_KEYS)) {
    throw new Error("Invalid Pro Club Attendance player record shape.");
  }
  if (
    raw.schemaVersion !== 1 ||
    !isProClubAttendanceStatus(raw.status) ||
    !isValidDocumentIdentifier(raw.createdBy) ||
    !isValidDocumentIdentifier(raw.updatedBy) ||
    raw.createdAt == null ||
    raw.updatedAt == null
  ) {
    throw new Error("Invalid Pro Club Attendance player record invariants.");
  }

  return {
    playerKey,
    schemaVersion: 1,
    status: raw.status,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
}

function cloneSessionFields(value: ValidProClubAttendanceSessionInput): DocumentData {
  return {
    schemaVersion: value.schemaVersion,
    sessionDate: value.sessionDate,
    startTime: value.startTime,
    squadLabel: value.squadLabel,
    sessionType: value.sessionType,
  };
}

function createFirestoreOps(): ProClubAttendanceRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Attendance read path.");
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
        throw new Error("Invalid Pro Club Attendance collection path.");
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
        throw new Error("Invalid Pro Club Attendance create path.");
      }
      const [first, ...rest] = path;
      await setDoc(doc(db, first, ...rest), data);
    },
    async updateDocument(path, data) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Attendance update path.");
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

export function createFirestoreProClubAttendanceRepositoryOps(): ProClubAttendanceRepositoryOps {
  return createFirestoreOps();
}

export async function listProClubAttendanceSessions(
  clubId: string,
  ops: ProClubAttendanceRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAttendanceSessionRecord[]> {
  requireExactPathIdentity(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaffAuthority(authority);

  const snapshot = await ops.listDocuments(["proClubs", clubId, "attendanceSessions"]);
  return snapshot.documents.map((item) => {
    if (!item.exists) throw new Error("Attendance session list returned a missing document.");
    return parseSessionDocument(item.id, item.data);
  });
}

export async function getProClubAttendanceSession(
  clubId: string,
  attendanceSessionId: string,
  ops: ProClubAttendanceRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAttendanceSessionRecord | null> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPathIdentity(attendanceSessionId, "attendanceSessionId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaffAuthority(authority);

  const snapshot = await ops.readDocument([
    "proClubs", clubId, "attendanceSessions", attendanceSessionId,
  ]);
  if (!snapshot.exists) return null;
  if (snapshot.id !== attendanceSessionId) {
    throw new Error("Attendance session read returned a mismatched document ID.");
  }
  return parseSessionDocument(attendanceSessionId, snapshot.data);
}

export async function createProClubAttendanceSession(
  clubId: string,
  input: unknown,
  ops: ProClubAttendanceRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAttendanceSessionRecord> {
  requireExactPathIdentity(clubId, "clubId");
  const validation = validateProClubAttendanceSessionInput(input);
  if (validation.ok === false) {
    throw new Error(`Invalid Pro Club Attendance session input: ${validation.errors.join(" ")}`);
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertHeadCoachAuthority(authority);

  const { attendanceSessionId } = validation.value;
  const path = ["proClubs", clubId, "attendanceSessions", attendanceSessionId] as const;
  const existing = await ops.readDocument(path);
  if (existing.exists) throw new Error("Pro Club Attendance session already exists.");

  await ops.createDocument(path, {
    ...cloneSessionFields(validation.value),
    createdAt: ops.timestamp(),
    createdBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== attendanceSessionId) {
    throw new Error("Attendance session create outcome is ambiguous: canonical read-back unavailable.");
  }
  const record = parseSessionDocument(attendanceSessionId, readBack.data);
  if (
    record.createdBy !== uid ||
    record.sessionDate !== validation.value.sessionDate ||
    record.startTime !== validation.value.startTime
  ) {
    throw new Error("Attendance session create read-back did not match canonical data.");
  }
  return record;
}

export async function listProClubAttendanceRecords(
  clubId: string,
  attendanceSessionId: string,
  ops: ProClubAttendanceRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAttendancePlayerRecord[]> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPathIdentity(attendanceSessionId, "attendanceSessionId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertActiveStaffAuthority(authority);

  const session = await ops.readDocument([
    "proClubs", clubId, "attendanceSessions", attendanceSessionId,
  ]);
  if (!session.exists || session.id !== attendanceSessionId) {
    throw new Error("Pro Club Attendance session does not exist.");
  }
  parseSessionDocument(attendanceSessionId, session.data);

  const snapshot = await ops.listDocuments([
    "proClubs", clubId, "attendanceSessions", attendanceSessionId, "records",
  ]);
  return snapshot.documents.map((item) => {
    if (!item.exists) throw new Error("Attendance record list returned a missing document.");
    return parseAttendanceRecord(item.id, item.data);
  });
}

export async function createProClubAttendanceRecord(
  clubId: string,
  attendanceSessionId: string,
  input: unknown,
  ops: ProClubAttendanceRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAttendancePlayerRecord> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPathIdentity(attendanceSessionId, "attendanceSessionId");
  const validation = validateProClubAttendanceRecordInput(input);
  if (validation.ok === false) {
    throw new Error(`Invalid Pro Club Attendance record input: ${validation.errors.join(" ")}`);
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertHeadCoachAuthority(authority);

  const sessionPath = ["proClubs", clubId, "attendanceSessions", attendanceSessionId] as const;
  const session = await ops.readDocument(sessionPath);
  if (!session.exists || session.id !== attendanceSessionId) {
    throw new Error("Pro Club Attendance session does not exist.");
  }
  parseSessionDocument(attendanceSessionId, session.data);

  const roster = await ops.readDocument([
    "proClubs", clubId, "players", validation.value.playerKey,
  ]);
  if (
    !roster.exists ||
    roster.id !== validation.value.playerKey ||
    !isEligibleProClubAttendanceRosterPlayer(validation.value.playerKey, roster.data)
  ) {
    throw new Error("Attendance record requires an ACTIVE First Team canonical roster player.");
  }

  const recordPath = [
    "proClubs", clubId, "attendanceSessions", attendanceSessionId,
    "records", validation.value.playerKey,
  ] as const;
  const existing = await ops.readDocument(recordPath);
  if (existing.exists) throw new Error("Pro Club Attendance player record already exists.");

  const timestamp = ops.timestamp();
  await ops.createDocument(recordPath, {
    ...validation.value.value,
    createdAt: timestamp,
    createdBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(recordPath);
  if (!readBack.exists || readBack.id !== validation.value.playerKey) {
    throw new Error("Attendance record create outcome is ambiguous: canonical read-back unavailable.");
  }
  const record = parseAttendanceRecord(validation.value.playerKey, readBack.data);
  if (
    record.status !== validation.value.value.status ||
    record.createdBy !== uid ||
    record.updatedBy !== uid
  ) {
    throw new Error("Attendance record create read-back did not match canonical data.");
  }
  return record;
}

export async function updateProClubAttendanceRecord(
  clubId: string,
  attendanceSessionId: string,
  playerKey: string,
  status: unknown,
  ops: ProClubAttendanceRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAttendancePlayerRecord> {
  requireExactPathIdentity(clubId, "clubId");
  requireExactPathIdentity(attendanceSessionId, "attendanceSessionId");
  requireExactPlayerKey(playerKey);
  const validation = validateProClubAttendanceRecordInput({ playerKey, status });
  if (validation.ok === false) {
    throw new Error(`Invalid Pro Club Attendance update: ${validation.errors.join(" ")}`);
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertHeadCoachAuthority(authority);

  const session = await ops.readDocument([
    "proClubs", clubId, "attendanceSessions", attendanceSessionId,
  ]);
  if (!session.exists || session.id !== attendanceSessionId) {
    throw new Error("Pro Club Attendance session does not exist.");
  }
  parseSessionDocument(attendanceSessionId, session.data);

  const path = [
    "proClubs", clubId, "attendanceSessions", attendanceSessionId,
    "records", playerKey,
  ] as const;
  const existing = await ops.readDocument(path);
  if (!existing.exists || existing.id !== playerKey) {
    throw new Error("Pro Club Attendance player record does not exist.");
  }
  const current = parseAttendanceRecord(playerKey, existing.data);

  await ops.updateDocument(path, {
    status: validation.value.value.status,
    updatedAt: ops.timestamp(),
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== playerKey) {
    throw new Error("Attendance record update outcome is ambiguous: canonical read-back unavailable.");
  }
  const record = parseAttendanceRecord(playerKey, readBack.data);
  if (
    record.status !== validation.value.value.status ||
    record.createdBy !== current.createdBy ||
    record.updatedBy !== uid
  ) {
    throw new Error("Attendance record update read-back did not preserve canonical audit data.");
  }
  return record;
}

export function expectedProClubAttendanceSessionId(
  sessionDate: string,
  startTime: string,
): string {
  const value = buildProClubAttendanceSessionId(sessionDate, startTime);
  if (!value) throw new Error("Invalid Pro Club Attendance session slot.");
  return value;
}
