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
  createEmptyProClubMatchAnalysis,
  validateProClubAnalysisTopic,
  validateProClubAnalysisTopicValue,
  validateProClubMatchAnalysis,
  type ProClubAnalysisTopicValue,
  type ProClubAnalysisTopicSnapshot,
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

interface ParsedProClubMatchAnalysis {
  readonly analysis: ProClubMatchAnalysis;
  readonly rawTopicSnapshot: unknown;
  readonly rawTopicSnapshotPassesRulesGuard: boolean;
  readonly rawTopicSnapshotCanRepairToEmpty: boolean;
}

function topicSnapshotPassesRulesGuard(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 40) return false;
  if (value.length === 0) return true;
  const first = value[0];
  return isPlainRecord(first) &&
    typeof first.id === "string" &&
    first.id.length > 0 &&
    !first.id.includes("/");
}

function topicSnapshotCanRepairToEmpty(value: unknown): boolean {
  return Array.isArray(value) && value.length === 1 && value[0] === null;
}

function normalizeStoredTopicSnapshot(value: unknown): {
  readonly topics: ProClubAnalysisTopicSnapshot[];
  readonly recovered: boolean;
} {
  if (!Array.isArray(value)) return { topics: [], recovered: true };
  let recovered = value.length > 40;
  const topics: ProClubAnalysisTopicSnapshot[] = [];
  const ids = new Set<string>();
  for (const entry of value.slice(0, 40)) {
    if (!isPlainRecord(entry)) {
      recovered = true;
      continue;
    }
    const validation = validateProClubAnalysisTopic({
      ...entry,
      enabled: true,
      archived: false,
    });
    if (!validation.ok || typeof entry.id !== "string" || ids.has(entry.id)) {
      recovered = true;
      continue;
    }
    const { enabled: _enabled, archived: _archived, ...snapshot } = entry;
    topics.push(snapshot as unknown as ProClubAnalysisTopicSnapshot);
    ids.add(entry.id);
  }
  if (topics.length !== value.length) recovered = true;
  return { topics, recovered };
}

function parseRecord(
  raw: unknown,
  matchId: string,
): ParsedProClubMatchAnalysis {
  if (!isPlainRecord(raw)) {
    throw new Error("Stored Pro Club Match Analysis is not an object.");
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

  const normalizedTopics = normalizeStoredTopicSnapshot(raw.topicSnapshot);
  const rawTeamSnapshot = isPlainRecord(raw.teamSnapshot) ? raw.teamSnapshot : {};
  const rawMatchSnapshot = isPlainRecord(raw.matchSnapshot) ? raw.matchSnapshot : {};
  const rawOpponentSnapshot = isPlainRecord(raw.opponentSnapshot) ? raw.opponentSnapshot : {};
  const teamSnapshot = {
    name: rawTeamSnapshot.name,
    logoUrl: rawTeamSnapshot.logoUrl,
  };
  const matchSnapshot = {
    competitionName: rawMatchSnapshot.competitionName,
    opponentName: rawMatchSnapshot.opponentName,
    kickoffAt: rawMatchSnapshot.kickoffAt,
  };
  const opponentSnapshot = {
    teamId: rawOpponentSnapshot.teamId,
    name: rawOpponentSnapshot.name,
    logoUrl: rawOpponentSnapshot.logoUrl,
  };
  const hasExactKeys = (record: Record<string, unknown>, keys: readonly string[]) =>
    Object.keys(record).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
  const rootShapeRecovered =
    !hasExactKeys(rawTeamSnapshot, ["name", "logoUrl"]) ||
    !hasExactKeys(rawMatchSnapshot, ["competitionName", "opponentName", "kickoffAt"]) ||
    !hasExactKeys(rawOpponentSnapshot, ["teamId", "name", "logoUrl"]) ||
    Object.keys(raw).some((key) => ![
      "schemaVersion", "matchId", "status", "revision", "teamSnapshot",
      "matchSnapshot", "opponentSnapshot", "topicSnapshot", "sections",
      "createdAt", "createdBy", "updatedAt", "updatedBy",
    ].includes(key));
  const rawClubLogoUrl = rawTeamSnapshot.logoUrl;
  const rawKickoffAt = rawMatchSnapshot.kickoffAt;
  const defaults = createEmptyProClubMatchAnalysis({
    matchId,
    clubName: typeof teamSnapshot.name === "string"
      ? teamSnapshot.name
      : "Club",
    clubLogoUrl: typeof rawClubLogoUrl === "string" || rawClubLogoUrl === null
      ? rawClubLogoUrl as string | null
      : null,
    competitionName: typeof matchSnapshot.competitionName === "string"
      ? matchSnapshot.competitionName
      : "Competition",
    opponentName: typeof matchSnapshot.opponentName === "string"
      ? matchSnapshot.opponentName
      : "Opponent",
    kickoffAt: typeof rawKickoffAt === "string" || rawKickoffAt === null
      ? rawKickoffAt as string | null
      : null,
    topicSnapshot: normalizedTopics.topics,
  });
  const root = {
    schemaVersion: raw.schemaVersion,
    matchId: raw.matchId,
    status: raw.status,
    revision: raw.revision,
    teamSnapshot,
    matchSnapshot,
    opponentSnapshot,
    topicSnapshot: normalizedTopics.topics,
    sections: defaults.sections,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
  const rootValidation = validateProClubMatchAnalysis(root);
  if (!rootValidation.ok) {
    throw new Error("Stored Pro Club Match Analysis has invalid match or team snapshots: " + rootValidation.errors.join(" "));
  }

  let recovered = normalizedTopics.recovered || rootShapeRecovered;
  let sectionsRecovered = rootShapeRecovered || !topicSnapshotPassesRulesGuard(raw.topicSnapshot);
  const normalizedSections: Record<string, unknown> = { ...defaults.sections };
  const rawSections = isPlainRecord(raw.sections) ? raw.sections : {};
  const sectionIds = [
    "FORMATION_LINEUP",
    "IN_POSSESSION_ATT",
    "OUT_DEF",
    "KEY_MAN",
    "ANALYSIS",
    "SET_PIECES",
    "ATTACKING_PATTERNS",
  ] as const;
  const sectionFields: Record<(typeof sectionIds)[number], readonly string[]> = {
    FORMATION_LINEUP: ["formation", "customFormationSlots", "slots", "notes"],
    IN_POSSESSION_ATT: ["topicValues", "notes"],
    OUT_DEF: ["topicValues", "notes"],
    KEY_MAN: ["players"],
    ANALYSIS: [
      "strengths", "weaknesses", "keyObservations", "keyThreats",
      "areasToExploit", "tacticalNotes",
    ],
    SET_PIECES: ["attackingCorners", "defendingCorners", "freeKicks", "throwIns", "penalties"],
    ATTACKING_PATTERNS: ["selected", "notes"],
  };
  if (!isPlainRecord(raw.sections)) {
    recovered = true;
    sectionsRecovered = true;
  }
  if (Object.keys(rawSections).length !== sectionIds.length ||
      sectionIds.some((id) => !Object.prototype.hasOwnProperty.call(rawSections, id))) {
    recovered = true;
    sectionsRecovered = true;
  }

  function isValidSection(
    sectionId: (typeof sectionIds)[number],
    section: unknown,
  ): boolean {
    const candidate = {
      ...root,
      sections: { ...normalizedSections, [sectionId]: section },
    };
    return validateProClubMatchAnalysis(candidate).ok;
  }

  for (const sectionId of sectionIds) {
    const fallback = defaults.sections[sectionId];
    const rawSection = rawSections[sectionId];
    if (sectionId === "IN_POSSESSION_ATT" || sectionId === "OUT_DEF") {
      const section = isPlainRecord(rawSection) ? rawSection : {};
      const topicValues = isPlainRecord(section.topicValues) ? section.topicValues : {};
      const topics = normalizedTopics.topics.filter((topic) => topic.section === sectionId);
      const repairedValues: Record<string, ProClubAnalysisTopicValue> = {};
      for (const topic of topics) {
        const candidateValue = topicValues[topic.id];
        if (Object.prototype.hasOwnProperty.call(topicValues, topic.id) &&
            validateProClubAnalysisTopicValue(topic, candidateValue)) {
          repairedValues[topic.id] = candidateValue as ProClubAnalysisTopicValue;
        } else {
          recovered = true;
          sectionsRecovered = true;
          repairedValues[topic.id] = topic.inputType === "CHECKBOX"
            ? false
            : topic.inputType === "NOTES"
              ? ""
              : null;
        }
      }
      if (
        Object.keys(topicValues).length !== topics.length ||
        !isPlainRecord(rawSection) ||
        !hasExactKeys(section, ["topicValues", "notes"])
      ) {
        recovered = true;
        sectionsRecovered = true;
      }
      const topicFallback = fallback as typeof defaults.sections.IN_POSSESSION_ATT;
      const notes = typeof section.notes === "string" ? section.notes : topicFallback.notes;
      if (notes !== section.notes) {
        recovered = true;
        sectionsRecovered = true;
      }
      const repairedSection = { topicValues: repairedValues, notes };
      if (isValidSection(sectionId, repairedSection)) {
        normalizedSections[sectionId] = repairedSection;
      } else {
        normalizedSections[sectionId] = fallback;
        recovered = true;
        sectionsRecovered = true;
      }
      continue;
    }
    const expectedFields = sectionFields[sectionId];
    const rawSectionRecord = isPlainRecord(rawSection) ? rawSection : {};
    const normalizedSection = Object.fromEntries(
      expectedFields
        .filter((key) => Object.prototype.hasOwnProperty.call(rawSectionRecord, key))
        .map((key) => [key, rawSectionRecord[key]]),
    );
    if (!hasExactKeys(rawSectionRecord, expectedFields)) {
      recovered = true;
      sectionsRecovered = true;
    }
    if (isValidSection(sectionId, normalizedSection)) {
      normalizedSections[sectionId] = normalizedSection;
    } else {
      normalizedSections[sectionId] = fallback;
      recovered = true;
      sectionsRecovered = true;
    }
  }

  const analysis = {
    ...root,
    sections: normalizedSections,
  } as unknown as ProClubMatchAnalysis;
  const finalValidation = validateProClubMatchAnalysis(analysis);
  if (!finalValidation.ok) {
    throw new Error("Stored Pro Club Match Analysis could not be recovered: " + finalValidation.errors.join(" "));
  }
  return {
    analysis: {
      ...(recovered ? { ...analysis, recoveryWarning: true as const } : analysis),
      ...(sectionsRecovered ? { recoverySaveRequired: true as const } : {}),
    },
    rawTopicSnapshot: raw.topicSnapshot,
    rawTopicSnapshotPassesRulesGuard: topicSnapshotPassesRulesGuard(raw.topicSnapshot),
    rawTopicSnapshotCanRepairToEmpty: topicSnapshotCanRepairToEmpty(raw.topicSnapshot),
  };
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
  return parseRecord(snapshot.data, matchId).analysis;
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
  topicSnapshotOverride?: unknown,
): DocumentData {
  return {
    schemaVersion: analysis.schemaVersion,
    matchId: analysis.matchId,
    status: values.status,
    revision: values.revision,
    teamSnapshot: { ...analysis.teamSnapshot },
    matchSnapshot: { ...analysis.matchSnapshot },
    opponentSnapshot: { ...analysis.opponentSnapshot },
    topicSnapshot: topicSnapshotOverride === undefined
      ? analysis.topicSnapshot.map((topic) => ({
          ...topic,
          choices: [...topic.choices],
        }))
      : structuredClone(topicSnapshotOverride),
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
    if (current.analysis.status !== "DRAFT") {
      throw new Error("Completed Match Analysis is immutable.");
    }
    if (current.analysis.revision !== expectedRevision) {
      throw new Error("Stale Match Analysis revision.");
    }

    const canKeepTopicSnapshot = current.rawTopicSnapshotPassesRulesGuard;
    if (!canKeepTopicSnapshot && !current.rawTopicSnapshotCanRepairToEmpty) {
      throw new Error("This malformed legacy topic snapshot cannot be safely repaired under the current Firestore Rules.");
    }
    const recoveredPayload = canKeepTopicSnapshot
      ? analysis
      : {
          ...analysis,
          topicSnapshot: [],
          sections: {
            ...analysis.sections,
            IN_POSSESSION_ATT: {
              ...analysis.sections.IN_POSSESSION_ATT,
              topicValues: {},
            },
            OUT_DEF: {
              ...analysis.sections.OUT_DEF,
              topicValues: {},
            },
          },
        };
    const preserved = {
      ...recoveredPayload,
      // The Game Model topic snapshot is immutable for this match. Team,
      // opponent, and match snapshots may change through an explicit draft save.
      // A legacy snapshot failing Rules' bounded guard can only be repaired to empty.
      topicSnapshot: canKeepTopicSnapshot ? current.analysis.topicSnapshot : [],
    };
    payload = toPersistedData(preserved, {
      revision: current.analysis.revision + 1,
      createdAt: current.analysis.createdAt,
      createdBy: current.analysis.createdBy!,
      updatedAt: timestamp,
      updatedBy: uid,
      status: "DRAFT",
    }, canKeepTopicSnapshot
      ? current.rawTopicSnapshot
      : []);
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
  const saved = parseRecord(readBack.data, matchId).analysis;
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
  if (analysis.recoverySaveRequired) {
    throw new Error("Review and save the recovered draft before completing Match Analysis.");
  }
  const complete = completeProClubMatchAnalysis(analysis);

  const uid = ops.getAuthenticatedUid();
  requireDocumentId(uid, "Authenticated actor UID");
  await resolveAnalysisAuthority(clubId, uid, ops);
  const currentSnapshot = await ops.readDocument(path);
  if (!currentSnapshot.exists) {
    throw new Error("A saved DRAFT is required before completing Match Analysis.");
  }
  const current = parseRecord(currentSnapshot.data, matchId);
  if (current.analysis.status !== "DRAFT") {
    throw new Error("Completed Match Analysis is immutable.");
  }
  if (current.analysis.recoverySaveRequired) {
    throw new Error("Review and save the recovered draft before completing Match Analysis.");
  }
  if (current.analysis.revision !== expectedRevision) {
    throw new Error("Stale Match Analysis revision.");
  }

  const preserved = {
    ...complete,
    topicSnapshot: current.analysis.topicSnapshot,
  };
  const timestamp = ops.timestamp();
  const payload = toPersistedData(preserved, {
    revision: current.analysis.revision + 1,
    createdAt: current.analysis.createdAt,
    createdBy: current.analysis.createdBy!,
    updatedAt: timestamp,
    updatedBy: uid,
    status: "COMPLETED",
  }, current.rawTopicSnapshotPassesRulesGuard
    ? current.rawTopicSnapshot
    : current.analysis.topicSnapshot);
  await ops.updateDocument(path, payload);

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== "current") {
    throw new Error("Match Analysis completion outcome is ambiguous.");
  }
  const saved = parseRecord(readBack.data, matchId).analysis;
  if (saved.status !== "COMPLETED" || saved.revision !== expectedRevision + 1) {
    throw new Error("Match Analysis completion read-back did not match the expected revision.");
  }
  return saved;
}
