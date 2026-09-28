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
  createDefaultProClubAnalysisTopics,
  validateProClubAnalysisTopic,
  type ProClubAnalysisTopic,
} from "../proClubMatchAnalysis";
import {
  canAccessProClubMatchAnalysis,
  type ProClubMatchAnalysisRepositorySnapshot,
} from "./proClubMatchAnalysisRepository";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export const PRO_CLUB_ANALYSIS_GAME_MODEL_SCHEMA_VERSION = 1 as const;

export interface ProClubAnalysisGameModelRecord {
  readonly schemaVersion: typeof PRO_CLUB_ANALYSIS_GAME_MODEL_SCHEMA_VERSION;
  readonly topics: readonly ProClubAnalysisTopic[];
  readonly invalidTopicCount?: number;
  readonly revision: number;
  readonly createdAt: unknown;
  readonly createdBy: string | null;
  readonly updatedAt: unknown;
  readonly updatedBy: string | null;
}

export interface ProClubAnalysisGameModelRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(
    path: readonly string[],
  ): Promise<ProClubMatchAnalysisRepositorySnapshot>;
  setDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
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
    throw new Error(label + " must be an exact Firestore document ID.");
  }
}

export function proClubAnalysisGameModelDocumentPath(
  clubId: string,
): readonly ["proClubs", string, "analysisGameModel", "current"] {
  requireDocumentId(clubId, "clubId");
  return ["proClubs", clubId, "analysisGameModel", "current"];
}

function validateTopics(value: unknown): value is ProClubAnalysisTopic[] {
  if (!Array.isArray(value) || value.length > 40) return false;
  const ids = new Set<string>();
  return value.every((topic) => {
    if (!isPlainRecord(topic)) return false;
    const result = validateProClubAnalysisTopic(topic);
    if (!result.ok || typeof topic.id !== "string" || ids.has(topic.id)) return false;
    ids.add(topic.id);
    return true;
  });
}

function parseStoredTopics(value: unknown): {
  readonly topics: ProClubAnalysisTopic[];
  readonly invalidTopicCount: number;
} {
  if (!Array.isArray(value) || value.length > 40) {
    throw new Error("Stored Analysis Game Model topics are invalid.");
  }
  const topics: ProClubAnalysisTopic[] = [];
  const ids = new Set<string>();
  let invalidTopicCount = 0;
  for (const topic of value) {
    if (!isPlainRecord(topic)) {
      invalidTopicCount += 1;
      continue;
    }
    const validation = validateProClubAnalysisTopic(topic);
    if (!validation.ok || typeof topic.id !== "string" || ids.has(topic.id)) {
      invalidTopicCount += 1;
      continue;
    }
    ids.add(topic.id);
    topics.push(topic as unknown as ProClubAnalysisTopic);
  }
  return { topics, invalidTopicCount };
}

function cloneTopics(
  topics: readonly ProClubAnalysisTopic[],
): ProClubAnalysisTopic[] {
  return topics.map((topic) => ({ ...topic, choices: [...topic.choices] }));
}

function parseStoredRecord(raw: unknown): ProClubAnalysisGameModelRecord {
  if (
    !isPlainRecord(raw) ||
    !hasExactKeys(raw, [
      "schemaVersion",
      "topics",
      "revision",
      "createdAt",
      "createdBy",
      "updatedAt",
      "updatedBy",
    ])
  ) {
    throw new Error("Stored Analysis Game Model document has an invalid shape.");
  }
  if (raw.schemaVersion !== PRO_CLUB_ANALYSIS_GAME_MODEL_SCHEMA_VERSION) {
    throw new Error("Unsupported Analysis Game Model schemaVersion.");
  }
  const parsedTopics = parseStoredTopics(raw.topics);
  if (
    typeof raw.revision !== "number" ||
    !Number.isInteger(raw.revision) ||
    raw.revision < 1 ||
    raw.createdAt == null ||
    raw.updatedAt == null ||
    typeof raw.createdBy !== "string" ||
    typeof raw.updatedBy !== "string"
  ) {
    throw new Error("Stored Analysis Game Model audit fields are invalid.");
  }
  return {
    schemaVersion: PRO_CLUB_ANALYSIS_GAME_MODEL_SCHEMA_VERSION,
    topics: cloneTopics(parsedTopics.topics),
    ...(parsedTopics.invalidTopicCount > 0
      ? { invalidTopicCount: parsedTopics.invalidTopicCount }
      : {}),
    revision: raw.revision,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
}

function createFirestoreOps(): ProClubAnalysisGameModelRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Analysis Game Model path.");
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

async function requireAuthorizedActor(
  clubId: string,
  ops: ProClubAnalysisGameModelRepositoryOps,
): Promise<string> {
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  const result = await ops.resolveAuthority(clubId, uid);
  if (result.state !== "FOUND") {
    throw new Error("Pro Club Analysis authority could not be resolved: " + result.state + ".");
  }
  if (
    result.value.organizationId !== clubId ||
    result.value.userId !== uid ||
    !canAccessProClubMatchAnalysis(result.value)
  ) {
    throw new Error("Active Pro Club Analysis staff authority is required.");
  }
  return uid;
}

export async function getProClubAnalysisGameModel(
  clubId: string,
  ops: ProClubAnalysisGameModelRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAnalysisGameModelRecord> {
  const path = proClubAnalysisGameModelDocumentPath(clubId);
  await requireAuthorizedActor(clubId, ops);
  const snapshot = await ops.readDocument(path);
  if (!snapshot.exists) {
    return {
      schemaVersion: PRO_CLUB_ANALYSIS_GAME_MODEL_SCHEMA_VERSION,
      topics: createDefaultProClubAnalysisTopics(),
      revision: 0,
      createdAt: null,
      createdBy: null,
      updatedAt: null,
      updatedBy: null,
    };
  }
  if (snapshot.id !== "current") {
    throw new Error("Analysis Game Model read returned an unexpected document ID.");
  }
  return parseStoredRecord(snapshot.data);
}

export async function saveProClubAnalysisGameModel(
  clubId: string,
  topics: readonly ProClubAnalysisTopic[],
  expectedRevision: number,
  ops: ProClubAnalysisGameModelRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAnalysisGameModelRecord> {
  const path = proClubAnalysisGameModelDocumentPath(clubId);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("expectedRevision must be a non-negative integer.");
  }
  if (!validateTopics(topics)) {
    throw new Error("Analysis Game Model topics are invalid.");
  }

  const uid = await requireAuthorizedActor(clubId, ops);
  const existing = await ops.readDocument(path);
  const timestamp = ops.timestamp();
  const copiedTopics = cloneTopics(topics);
  let write: DocumentData;

  if (!existing.exists) {
    if (expectedRevision !== 0) {
      throw new Error("Stale Analysis Game Model revision.");
    }
    write = {
      schemaVersion: PRO_CLUB_ANALYSIS_GAME_MODEL_SCHEMA_VERSION,
      topics: copiedTopics,
      revision: 1,
      createdAt: timestamp,
      createdBy: uid,
      updatedAt: timestamp,
      updatedBy: uid,
    };
    await ops.setDocument(path, write);
  } else {
    if (existing.id !== "current") {
      throw new Error("Analysis Game Model read returned an unexpected document ID.");
    }
    const current = parseStoredRecord(existing.data);
    if (current.revision !== expectedRevision) {
      throw new Error("Stale Analysis Game Model revision.");
    }
    write = {
      topics: copiedTopics,
      revision: expectedRevision + 1,
      updatedAt: timestamp,
      updatedBy: uid,
    };
    await ops.updateDocument(path, write);
  }

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== "current") {
    throw new Error("Analysis Game Model save outcome is ambiguous.");
  }
  const saved = parseStoredRecord(readBack.data);
  if (saved.revision !== expectedRevision + 1 || saved.updatedBy !== uid) {
    throw new Error("Analysis Game Model read-back did not match the expected revision.");
  }
  return saved;
}
