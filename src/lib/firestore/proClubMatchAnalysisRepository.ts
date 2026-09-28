import {
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  completeProClubMatchAnalysis,
  validateProClubMatchAnalysis,
  type ProClubMatchAnalysis,
} from "../proClubMatchAnalysis";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";
import { canAccessProClubMatchAnalysis } from "../proClubMatchAnalysisAccess";

export { PRO_CLUB_MATCH_ANALYSIS_ROLES, canAccessProClubMatchAnalysis } from "../proClubMatchAnalysisAccess";


export interface ProClubMatchAnalysisRepositorySnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubMatchAnalysisRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(path: readonly string[]): Promise<ProClubMatchAnalysisRepositorySnapshot>;
  setDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireDocumentId(value: unknown, label: string): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(label + " must be an exact Firestore document ID.");
  }
}

function requireAnalysisAuthority(
  authority: ProClubOrganizationAuthority,
  clubId: string,
  uid: string,
): void {
  if (authority.organizationId !== clubId || authority.userId !== uid) {
    throw new Error("Resolved Analysis authority identity mismatch.");
  }
  if (!canAccessProClubMatchAnalysis(authority)) {
    throw new Error(
      "Active Analyst, Head Coach, Assistant Coach, or Technical Director authority is required for Match Analysis.",
    );
  }
}

async function resolveAnalysisAuthority(
  clubId: string,
  uid: string,
  ops: ProClubMatchAnalysisRepositoryOps,
): Promise<ProClubOrganizationAuthority> {
  const result = await ops.resolveAuthority(clubId, uid);
  if (result.state !== "FOUND") {
    throw new Error("Pro Club Analysis authority could not be resolved: " + result.state + ".");
  }
  requireAnalysisAuthority(result.value, clubId, uid);
  return result.value;
}

export function proClubMatchAnalysisDocumentPath(
  clubId: string,
  matchId: string,
): readonly ["proClubs", string, "matches", string, "analysis", "current"] {
  requireDocumentId(clubId, "clubId");
  requireDocumentId(matchId, "matchId");
  return ["proClubs", clubId, "matches", matchId, "analysis", "current"];
}

function parseRecord(
  raw: unknown,
  matchId: string,
): ProClubMatchAnalysis {
  if (!isPlainRecord(raw)) {
    throw new Error("Stored Pro Club Match Analysis is not an object.");
  }
  const validation = validateProClubMatchAnalysis(raw);
  if (!validation.ok) {
    throw new Error("Stored Pro Club Match Analysis is invalid: " + validation.errors.join(" "));
  }
  if (raw.matchId !== matchId) {
    throw new Error("Stored Pro Club Match Analysis path identity mismatch.");
  }
  if (
    typeof raw.revision !== "number" ||
    !Number.isInteger(raw.revision) ||
    raw.revision < 1 ||
    raw.createdAt == null ||
    raw.updatedAt == null ||
    typeof raw.createdBy !== "string" ||
    typeof raw.updatedBy !== "string"
  ) {
    throw new Error("Stored Pro Club Match Analysis audit fields are invalid.");
  }
  return raw as unknown as ProClubMatchAnalysis;
}

function createFirestoreOps(): ProClubMatchAnalysisRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Match Analysis path.");
      }
      const snapshot = await getDocFromServer(doc(db, path[0]!, ...path.slice(1)));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
    async setDocument(path, data) {
      await setDoc(doc(db, path[0]!, ...path.slice(1)), data);
    },
    async updateDocument(path, data) {
      await updateDoc(doc(db, path[0]!, ...path.slice(1)), data);
    },
    timestamp() {
      return serverTimestamp();
    },
  };
}

const FIRESTORE_OPS = createFirestoreOps();

export async function getProClubMatchAnalysis(
  clubId: string,
  matchId: string,
  ops: ProClubMatchAnalysisRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchAnalysis | null> {
  const path = proClubMatchAnalysisDocumentPath(clubId, matchId);
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  await resolveAnalysisAuthority(clubId, uid, ops);

  const snapshot = await ops.readDocument(path);
  if (!snapshot.exists) return null;
  if (snapshot.id !== "current") {
    throw new Error("Pro Club Match Analysis read returned an unexpected document ID.");
  }
  return parseRecord(snapshot.data, matchId);
}

function toPersistedData(
  analysis: ProClubMatchAnalysis,
  values: {
    revision: number;
    createdAt: unknown;
    createdBy: string;
    updatedAt: unknown;
    updatedBy: string;
    status: "DRAFT" | "COMPLETED";
  },
): DocumentData {
  return {
    schemaVersion: analysis.schemaVersion,
    matchId: analysis.matchId,
    status: values.status,
    revision: values.revision,
    teamSnapshot: { ...analysis.teamSnapshot },
    matchSnapshot: { ...analysis.matchSnapshot },
    opponentSnapshot: { ...analysis.opponentSnapshot },
    topicSnapshot: analysis.topicSnapshot.map((topic) => ({
      ...topic,
      choices: [...topic.choices],
    })),
    sections: structuredClone(analysis.sections),
    createdAt: values.createdAt,
    createdBy: values.createdBy,
    updatedAt: values.updatedAt,
    updatedBy: values.updatedBy,
  };
}

async function requireParentMatch(
  clubId: string,
  matchId: string,
  ops: ProClubMatchAnalysisRepositoryOps,
): Promise<void> {
  const parent = await ops.readDocument([
    "proClubs",
    clubId,
    "matches",
    matchId,
  ]);
  if (!parent.exists || parent.id !== matchId) {
    throw new Error("Pro Club Match does not exist.");
  }
}

function assertDraftPayload(
  analysis: ProClubMatchAnalysis,
  matchId: string,
): void {
  if (analysis.matchId !== matchId) {
    throw new Error("Analysis matchId does not match its Firestore path.");
  }
  if (analysis.status !== "DRAFT") {
    throw new Error("Only a DRAFT Match Analysis can be saved.");
  }
  const validation = validateProClubMatchAnalysis(analysis);
  if (!validation.ok) {
    throw new Error("Invalid Match Analysis: " + validation.errors.join(" "));
  }
}

export async function saveProClubMatchAnalysisDraft(
  clubId: string,
  matchId: string,
  analysis: ProClubMatchAnalysis,
  expectedRevision: number,
  ops: ProClubMatchAnalysisRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchAnalysis> {
  const path = proClubMatchAnalysisDocumentPath(clubId, matchId);
  requireDocumentId(clubId, "clubId");
  requireDocumentId(matchId, "matchId");
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("expectedRevision must be a non-negative integer.");
  }
  assertDraftPayload(analysis, matchId);

  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  await resolveAnalysisAuthority(clubId, uid, ops);
  await requireParentMatch(clubId, matchId, ops);

  const currentSnapshot = await ops.readDocument(path);
  const timestamp = ops.timestamp();
  let payload: DocumentData;

  if (!currentSnapshot.exists) {
    if (expectedRevision !== 0) {
      throw new Error("Stale Match Analysis revision.");
    }
    payload = toPersistedData(analysis, {
      revision: 1,
      createdAt: timestamp,
      createdBy: uid,
      updatedAt: timestamp,
      updatedBy: uid,
      status: "DRAFT",
    });
  } else {
    const current = parseRecord(currentSnapshot.data, matchId);
    if (current.status !== "DRAFT") {
      throw new Error("Completed Match Analysis is immutable.");
    }
    if (current.revision !== expectedRevision) {
      throw new Error("Stale Match Analysis revision.");
    }

    const preserved = {
      ...analysis,
      // The Game Model topic snapshot is immutable for this match. Team,
      // opponent, and match snapshots may change through an explicit draft save.
      topicSnapshot: current.topicSnapshot,
    };
    payload = toPersistedData(preserved, {
      revision: current.revision + 1,
      createdAt: current.createdAt,
      createdBy: current.createdBy!,
      updatedAt: timestamp,
      updatedBy: uid,
      status: "DRAFT",
    });
  }

  if (currentSnapshot.exists) {
    await ops.updateDocument(path, payload);
  } else {
    await ops.setDocument(path, payload);
  }

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== "current") {
    throw new Error("Match Analysis save outcome is ambiguous.");
  }
  const saved = parseRecord(readBack.data, matchId);
  if (saved.revision !== expectedRevision + 1 || saved.updatedBy !== uid) {
    throw new Error("Match Analysis save read-back did not match the expected revision.");
  }
  return saved;
}

export async function completeProClubMatchAnalysisRecord(
  clubId: string,
  matchId: string,
  analysis: ProClubMatchAnalysis,
  expectedRevision: number,
  ops: ProClubMatchAnalysisRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubMatchAnalysis> {
  const path = proClubMatchAnalysisDocumentPath(clubId, matchId);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("expectedRevision must be a positive integer.");
  }
  assertDraftPayload(analysis, matchId);
  const complete = completeProClubMatchAnalysis(analysis);

  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  await resolveAnalysisAuthority(clubId, uid, ops);
  const currentSnapshot = await ops.readDocument(path);
  if (!currentSnapshot.exists) {
    throw new Error("A saved DRAFT is required before completing Match Analysis.");
  }
  const current = parseRecord(currentSnapshot.data, matchId);
  if (current.status !== "DRAFT") {
    throw new Error("Completed Match Analysis is immutable.");
  }
  if (current.revision !== expectedRevision) {
    throw new Error("Stale Match Analysis revision.");
  }

  const preserved = {
    ...complete,
    topicSnapshot: current.topicSnapshot,
  };
  const timestamp = ops.timestamp();
  const payload = toPersistedData(preserved, {
    revision: current.revision + 1,
    createdAt: current.createdAt,
    createdBy: current.createdBy!,
    updatedAt: timestamp,
    updatedBy: uid,
    status: "COMPLETED",
  });
  await ops.updateDocument(path, payload);

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== "current") {
    throw new Error("Match Analysis completion outcome is ambiguous.");
  }
  const saved = parseRecord(readBack.data, matchId);
  if (saved.status !== "COMPLETED" || saved.revision !== expectedRevision + 1) {
    throw new Error("Match Analysis completion read-back did not match the expected revision.");
  }
  return saved;
}
