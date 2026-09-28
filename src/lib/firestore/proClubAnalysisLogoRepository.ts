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
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  validateProClubAnalysisLogoInput,
  type ProClubAnalysisLogoInput,
} from "../proClubAnalysisLogo";
import {
  canAccessProClubMatchAnalysis,
  type ProClubMatchAnalysisRepositorySnapshot,
} from "./proClubMatchAnalysisRepository";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export const PRO_CLUB_ANALYSIS_LOGO_SCHEMA_VERSION = 1 as const;

interface ProClubAnalysisLogoFields {
  readonly schemaVersion: typeof PRO_CLUB_ANALYSIS_LOGO_SCHEMA_VERSION;
  readonly logoUrl: string | null;
  readonly mimeType: "image/webp" | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number | null;
  readonly createdAt: unknown;
  readonly createdBy: string;
  readonly updatedAt: unknown;
  readonly updatedBy: string;
}

export interface ProClubAnalysisTeamLogoRecord extends ProClubAnalysisLogoFields {}

export interface ProClubAnalysisOpponentTeamRecord extends ProClubAnalysisLogoFields {
  readonly opponentId: string;
  readonly name: string;
}

export interface ProClubAnalysisLogoRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(clubId: string, uid: string): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(path: readonly string[]): Promise<ProClubMatchAnalysisRepositorySnapshot>;
  listDocuments(path: readonly string[]): Promise<{
    readonly documents: readonly ProClubMatchAnalysisRepositorySnapshot[];
  }>;
  setDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

const TEAM_LOGO_KEYS = [
  "schemaVersion", "logoUrl", "mimeType", "width", "height", "byteSize",
  "createdAt", "createdBy", "updatedAt", "updatedBy",
] as const;
const OPPONENT_KEYS = ["name", ...TEAM_LOGO_KEYS] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length && actual.join(",") === canonical.join(",");
}

function requireDocumentId(value: unknown, label: string): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(label + " must be an exact Firestore document ID.");
  }
}

export function proClubAnalysisTeamLogoDocumentPath(
  clubId: string,
): readonly ["proClubs", string, "teamLogos", "current"] {
  requireDocumentId(clubId, "clubId");
  return ["proClubs", clubId, "teamLogos", "current"];
}

export function proClubAnalysisOpponentTeamDocumentPath(
  clubId: string,
  opponentId: string,
): readonly ["proClubs", string, "opponentTeams", string] {
  requireDocumentId(clubId, "clubId");
  requireDocumentId(opponentId, "opponentId");
  return ["proClubs", clubId, "opponentTeams", opponentId];
}

function logoFields(input: ProClubAnalysisLogoInput | null): DocumentData {
  return input
    ? {
        schemaVersion: PRO_CLUB_ANALYSIS_LOGO_SCHEMA_VERSION,
        logoUrl: input.dataUrl,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        byteSize: input.byteSize,
      }
    : {
        schemaVersion: PRO_CLUB_ANALYSIS_LOGO_SCHEMA_VERSION,
        logoUrl: null,
        mimeType: null,
        width: null,
        height: null,
        byteSize: null,
      };
}

function validateLogoFields(raw: Record<string, unknown>): ProClubAnalysisLogoInput | null {
  if (raw.logoUrl === null) {
    if (
      raw.mimeType !== null || raw.width !== null ||
      raw.height !== null || raw.byteSize !== null
    ) {
      throw new Error("Stored Analysis logo has incomplete removal fields.");
    }
    return null;
  }
  const result = validateProClubAnalysisLogoInput({
    dataUrl: raw.logoUrl,
    mimeType: raw.mimeType,
    width: raw.width,
    height: raw.height,
    byteSize: raw.byteSize,
  });
  if (result.ok === false) {
    throw new Error("Stored Analysis logo is invalid: " + result.errors.join(" "));
  }
  return result.value;
}

function parseBaseRecord(raw: unknown, keys: readonly string[]): {
  fields: ProClubAnalysisLogoInput | null;
  audit: Pick<ProClubAnalysisLogoFields, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">;
} {
  if (!isPlainRecord(raw) || !hasExactKeys(raw, keys)) {
    throw new Error("Stored Analysis logo document has an invalid shape.");
  }
  if (raw.schemaVersion !== PRO_CLUB_ANALYSIS_LOGO_SCHEMA_VERSION) {
    throw new Error("Unsupported Analysis logo schemaVersion.");
  }
  if (
    raw.createdAt == null || raw.updatedAt == null ||
    typeof raw.createdBy !== "string" || !isValidDocumentIdentifier(raw.createdBy) ||
    typeof raw.updatedBy !== "string" || !isValidDocumentIdentifier(raw.updatedBy)
  ) {
    throw new Error("Stored Analysis logo audit fields are invalid.");
  }
  return {
    fields: validateLogoFields(raw),
    audit: {
      createdAt: raw.createdAt,
      createdBy: raw.createdBy,
      updatedAt: raw.updatedAt,
      updatedBy: raw.updatedBy,
    },
  };
}

function parseTeamLogo(raw: unknown): ProClubAnalysisTeamLogoRecord {
  const parsed = parseBaseRecord(raw, TEAM_LOGO_KEYS);
  return {
    schemaVersion: PRO_CLUB_ANALYSIS_LOGO_SCHEMA_VERSION,
    logoUrl: parsed.fields?.dataUrl ?? null,
    mimeType: parsed.fields?.mimeType ?? null,
    width: parsed.fields?.width ?? null,
    height: parsed.fields?.height ?? null,
    byteSize: parsed.fields?.byteSize ?? null,
    ...parsed.audit,
  };
}

function parseOpponent(opponentId: string, raw: unknown): ProClubAnalysisOpponentTeamRecord {
  requireDocumentId(opponentId, "opponentId");
  if (!isPlainRecord(raw) || typeof raw.name !== "string" || !raw.name.trim() ||
      raw.name.length > 120 || raw.name.trim() !== raw.name) {
    throw new Error("Stored Analysis opponent team name is invalid.");
  }
  const parsed = parseBaseRecord(raw, OPPONENT_KEYS);
  return {
    opponentId,
    name: raw.name,
    schemaVersion: PRO_CLUB_ANALYSIS_LOGO_SCHEMA_VERSION,
    logoUrl: parsed.fields?.dataUrl ?? null,
    mimeType: parsed.fields?.mimeType ?? null,
    width: parsed.fields?.width ?? null,
    height: parsed.fields?.height ?? null,
    byteSize: parsed.fields?.byteSize ?? null,
    ...parsed.audit,
  };
}

function createFirestoreOps(): ProClubAnalysisLogoRepositoryOps {
  return {
    getAuthenticatedUid: () => auth.currentUser?.uid ?? null,
    resolveAuthority: (clubId, uid) => resolveProClubOrganizationAuthority(clubId, uid),
    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Analysis logo path.");
      }
      const snapshot = await getDocFromServer(doc(db, path[0]!, ...path.slice(1)));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
    async listDocuments(path) {
      if (path.length < 1 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Analysis opponent collection path.");
      }
      const snapshot = await getDocsFromServer(collection(db, path[0]!, ...path.slice(1)));
      return {
        documents: snapshot.docs.map((item) => ({
          id: item.id,
          exists: true,
          data: item.data(),
        })),
      };
    },
    async setDocument(path, data) {
      await setDoc(doc(db, path[0]!, ...path.slice(1)), data);
    },
    async updateDocument(path, data) {
      await updateDoc(doc(db, path[0]!, ...path.slice(1)), data);
    },
    timestamp: () => serverTimestamp(),
  };
}

const FIRESTORE_OPS = createFirestoreOps();

async function requireAnalysisActor(
  clubId: string,
  ops: ProClubAnalysisLogoRepositoryOps,
): Promise<string> {
  requireDocumentId(clubId, "clubId");
  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  const result = await ops.resolveAuthority(clubId, uid);
  if (
    result.state !== "FOUND" ||
    result.value.organizationId !== clubId ||
    result.value.userId !== uid ||
    !canAccessProClubMatchAnalysis(result.value)
  ) {
    throw new Error("Active Pro Club Analysis staff authority is required.");
  }
  return uid;
}

function parseInput(input: unknown): ProClubAnalysisLogoInput | null {
  if (input === null) return null;
  const result = validateProClubAnalysisLogoInput(input);
  if (result.ok === false) throw new Error("Invalid Analysis logo: " + result.errors.join(" "));
  return result.value;
}

function persistedFields(input: ProClubAnalysisLogoInput | null): DocumentData {
  return logoFields(input);
}

export async function getProClubAnalysisTeamLogo(
  clubId: string,
  ops: ProClubAnalysisLogoRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAnalysisTeamLogoRecord | null> {
  await requireAnalysisActor(clubId, ops);
  const path = proClubAnalysisTeamLogoDocumentPath(clubId);
  const snapshot = await ops.readDocument(path);
  if (!snapshot.exists) return null;
  if (snapshot.id !== "current") throw new Error("Team logo read returned a mismatched document ID.");
  return parseTeamLogo(snapshot.data);
}

export async function saveProClubAnalysisTeamLogo(
  clubId: string,
  value: unknown,
  ops: ProClubAnalysisLogoRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAnalysisTeamLogoRecord | null> {
  const input = parseInput(value);
  const uid = await requireAnalysisActor(clubId, ops);
  const path = proClubAnalysisTeamLogoDocumentPath(clubId);
  const existing = await ops.readDocument(path);
  if (!existing.exists && input === null) return null;
  const timestamp = ops.timestamp();
  if (existing.exists) {
    if (existing.id !== "current") throw new Error("Team logo read returned a mismatched document ID.");
    const current = parseTeamLogo(existing.data);
    await ops.updateDocument(path, {
      ...persistedFields(input),
      updatedAt: timestamp,
      updatedBy: uid,
    });
    const readBack = await ops.readDocument(path);
    if (!readBack.exists) throw new Error("Team logo update read-back is unavailable.");
    const saved = parseTeamLogo(readBack.data);
    if (saved.createdBy !== current.createdBy || saved.updatedBy !== uid) {
      throw new Error("Team logo audit read-back mismatch.");
    }
    return saved;
  }
  await ops.setDocument(path, {
    ...persistedFields(input),
    createdAt: timestamp,
    createdBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
  });
  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== "current") {
    throw new Error("Team logo create read-back is unavailable.");
  }
  return parseTeamLogo(readBack.data);
}

export async function listProClubAnalysisOpponentTeams(
  clubId: string,
  ops: ProClubAnalysisLogoRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAnalysisOpponentTeamRecord[]> {
  await requireAnalysisActor(clubId, ops);
  const snapshot = await ops.listDocuments(["proClubs", clubId, "opponentTeams"]);
  return snapshot.documents.map((item) => {
    if (!item.exists) throw new Error("Opponent team list returned a missing document.");
    return parseOpponent(item.id, item.data);
  });
}

export async function saveProClubAnalysisOpponentTeam(
  clubId: string,
  opponentId: string,
  name: string,
  value: unknown,
  ops: ProClubAnalysisLogoRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubAnalysisOpponentTeamRecord> {
  const path = proClubAnalysisOpponentTeamDocumentPath(clubId, opponentId);
  if (typeof name !== "string" || !name.trim() || name.length > 120 || name.trim() !== name) {
    throw new Error("Opponent team name must be non-empty text up to 120 characters.");
  }
  const input = parseInput(value);
  const uid = await requireAnalysisActor(clubId, ops);
  const existing = await ops.readDocument(path);
  const timestamp = ops.timestamp();
  if (existing.exists) {
    if (existing.id !== opponentId) throw new Error("Opponent team read returned a mismatched document ID.");
    const current = parseOpponent(opponentId, existing.data);
    await ops.updateDocument(path, {
      name,
      ...persistedFields(input),
      updatedAt: timestamp,
      updatedBy: uid,
    });
    const readBack = await ops.readDocument(path);
    if (!readBack.exists) throw new Error("Opponent team update read-back is unavailable.");
    const saved = parseOpponent(opponentId, readBack.data);
    if (saved.createdBy !== current.createdBy || saved.updatedBy !== uid) {
      throw new Error("Opponent team audit read-back mismatch.");
    }
    return saved;
  }
  await ops.setDocument(path, {
    name,
    ...persistedFields(input),
    createdAt: timestamp,
    createdBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
  });
  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== opponentId) {
    throw new Error("Opponent team create read-back is unavailable.");
  }
  return parseOpponent(opponentId, readBack.data);
}
