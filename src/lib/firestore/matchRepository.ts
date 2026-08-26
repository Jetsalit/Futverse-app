import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import {
  MATCH_SCHEMA_VERSION,
  canTransitionMatchStatus,
  isExactMatchPathSegment,
  isTerminalMatchStatus,
  validateMatchCoreData,
  validateMatchRosterSnapshotData,
  type MatchCoreData,
  type MatchRosterSnapshotData,
  type MatchStatus,
} from "../matchFoundation";

import { auth, db } from "../firebase";

const MATCH_PERSISTED_KEYS = [
  "schemaVersion",
  "status",
  "squadLabel",
  "competitionName",
  "opponentName",
  "kickoffAt",
  "venueType",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
] as const;

const ROSTER_PERSISTED_KEYS = [
  "schemaVersion",
  "futId",
  "firstName",
  "lastName",
  "position",
  "jerseyNumber",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
] as const;

export interface AcademyMatchRecord extends MatchCoreData {
  id: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface AcademyMatchRosterRecord
  extends MatchRosterSnapshotData {
  id: string;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface CreateAcademyMatchInput {
  academyId: string;
  matchId?: string;
  data: MatchCoreData;
}

export interface UpdateAcademyMatchInput {
  academyId: string;
  matchId: string;
  expectedData: MatchCoreData;
  data: MatchCoreData;
}

export interface TransitionAcademyMatchStatusInput {
  academyId: string;
  matchId: string;
  expectedData: MatchCoreData;
  targetStatus: MatchStatus;
}

export interface MatchRosterMutationInput {
  academyId: string;
  matchId: string;
  playerId: string;
  position: string;
  jerseyNumber: number;
}

export interface MatchRepositoryDocumentSnapshotLike {
  readonly id: string;
  exists(): boolean;
  data(): DocumentData | undefined;
}

export interface MatchRepositoryQuerySnapshotLike {
  readonly docs: readonly MatchRepositoryDocumentSnapshotLike[];
}

export interface MatchRepositoryDependencies {
  getAuthenticatedUid(): string | null;

  createMatchId(
    academyId: string,
  ): string;

  getMatch(
    academyId: string,
    matchId: string,
  ): Promise<MatchRepositoryDocumentSnapshotLike>;

  listMatches(
    academyId: string,
  ): Promise<MatchRepositoryQuerySnapshotLike>;

  setMatch(
    academyId: string,
    matchId: string,
    data: Record<string, unknown>,
  ): Promise<void>;

  updateMatch(
    academyId: string,
    matchId: string,
    data: Record<string, unknown>,
  ): Promise<void>;

  runMatchTransaction(
    academyId: string,
    matchId: string,
    buildPatch: (
      snapshot: MatchRepositoryDocumentSnapshotLike,
      timestamp: unknown,
    ) => Record<string, unknown>,
  ): Promise<void>;

  getPlayer(
    academyId: string,
    playerId: string,
  ): Promise<MatchRepositoryDocumentSnapshotLike>;

  getRosterPlayer(
    academyId: string,
    matchId: string,
    playerId: string,
  ): Promise<MatchRepositoryDocumentSnapshotLike>;

  listRoster(
    academyId: string,
    matchId: string,
  ): Promise<MatchRepositoryQuerySnapshotLike>;

  setRosterPlayer(
    academyId: string,
    matchId: string,
    playerId: string,
    data: Record<string, unknown>,
  ): Promise<void>;

  updateRosterPlayer(
    academyId: string,
    matchId: string,
    playerId: string,
    data: Record<string, unknown>,
  ): Promise<void>;

  deleteRosterPlayer(
    academyId: string,
    matchId: string,
    playerId: string,
  ): Promise<void>;

  timestamp(): unknown;
}

function createFirestoreDependencies(
  firestore: Firestore,
  getAuthenticatedUid: () => string | null,
): MatchRepositoryDependencies {
  return {
    getAuthenticatedUid,

    createMatchId(academyId) {
      return doc(
        collection(
          firestore,
          "academies",
          academyId,
          "matches",
        ),
      ).id;
    },

    async getMatch(academyId, matchId) {
      return getDocFromServer(
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
        ),
      );
    },

    async listMatches(academyId) {
      return getDocsFromServer(
        collection(
          firestore,
          "academies",
          academyId,
          "matches",
        ),
      );
    },

    async setMatch(
      academyId,
      matchId,
      data,
    ) {
      await setDoc(
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
        ),
        data,
      );
    },

    async updateMatch(
      academyId,
      matchId,
      data,
    ) {
      await updateDoc(
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
        ),
        data,
      );
    },

    async runMatchTransaction(
      academyId,
      matchId,
      buildPatch,
    ) {
      const matchRef =
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
        );

      await runTransaction(
        firestore,
        async (transaction) => {
          const snapshot =
            await transaction.get(
              matchRef,
            );

          const patch =
            buildPatch(
              snapshot,
              serverTimestamp(),
            );

          transaction.update(
            matchRef,
            patch,
          );
        },
      );
    },

    async getPlayer(
      academyId,
      playerId,
    ) {
      return getDocFromServer(
        doc(
          firestore,
          "academies",
          academyId,
          "players",
          playerId,
        ),
      );
    },

    async getRosterPlayer(
      academyId,
      matchId,
      playerId,
    ) {
      return getDocFromServer(
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
          "roster",
          playerId,
        ),
      );
    },

    async listRoster(
      academyId,
      matchId,
    ) {
      return getDocsFromServer(
        collection(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
          "roster",
        ),
      );
    },

    async setRosterPlayer(
      academyId,
      matchId,
      playerId,
      data,
    ) {
      await setDoc(
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
          "roster",
          playerId,
        ),
        data,
      );
    },

    async updateRosterPlayer(
      academyId,
      matchId,
      playerId,
      data,
    ) {
      await updateDoc(
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
          "roster",
          playerId,
        ),
        data,
      );
    },

    async deleteRosterPlayer(
      academyId,
      matchId,
      playerId,
    ) {
      await deleteDoc(
        doc(
          firestore,
          "academies",
          academyId,
          "matches",
          matchId,
          "roster",
          playerId,
        ),
      );
    },

    timestamp() {
      return serverTimestamp();
    },
  };
}

export function createFirestoreMatchRepositoryDependencies(
  firestore: Firestore,
  getAuthenticatedUid:
    () => string | null =
      () => auth.currentUser?.uid ?? null,
): MatchRepositoryDependencies {
  return createFirestoreDependencies(
    firestore,
    getAuthenticatedUid,
  );
}

const FIRESTORE_DEPENDENCIES =
  createFirestoreDependencies(
    db,
    () => auth.currentUser?.uid ?? null,
  );

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null
    && typeof value === "object"
    && !Array.isArray(value)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const frozen = [...expected].sort();

  return (
    actual.length === frozen.length
    && actual.every(
      (key, index) => key === frozen[index],
    )
  );
}

function requireExactDocumentId(
  value: unknown,
  label: string,
): string {
  if (!isExactMatchPathSegment(value)) {
    throw new Error(
      `${label} must be an exact Firestore document ID.`,
    );
  }

  return value;
}

function requireAuthenticatedUid(
  dependencies: MatchRepositoryDependencies,
): string {
  return requireExactDocumentId(
    dependencies.getAuthenticatedUid(),
    "Authenticated UID",
  );
}

function copyMatchCoreData(
  data: MatchCoreData,
): MatchCoreData {
  const validation =
    validateMatchCoreData(data);

  if (!validation.valid) {
    throw new Error(
      `Invalid Match core data: ${validation.errors.join(" ")}`,
    );
  }

  return {
    schemaVersion: data.schemaVersion,
    status: data.status,
    squadLabel: data.squadLabel,
    competitionName: data.competitionName,
    opponentName: data.opponentName,
    kickoffAt:
      data.kickoffAt === null
        ? null
        : new Date(data.kickoffAt.getTime()),
    venueType: data.venueType,
  };
}

function matchCoreDataFromRecord(
  match: AcademyMatchRecord,
): MatchCoreData {
  return {
    schemaVersion: match.schemaVersion,
    status: match.status,
    squadLabel: match.squadLabel,
    competitionName: match.competitionName,
    opponentName: match.opponentName,
    kickoffAt:
      match.kickoffAt === null
        ? null
        : new Date(
            match.kickoffAt.getTime(),
          ),
    venueType: match.venueType,
  };
}

function matchCoreDataEquals(
  left: MatchCoreData,
  right: MatchCoreData,
): boolean {
  const kickoffMatches =
    left.kickoffAt === null
      ? right.kickoffAt === null
      : right.kickoffAt !== null
        && left.kickoffAt.getTime() ===
          right.kickoffAt.getTime();

  return (
    left.schemaVersion === right.schemaVersion
    && left.status === right.status
    && left.squadLabel === right.squadLabel
    && left.competitionName === right.competitionName
    && left.opponentName === right.opponentName
    && kickoffMatches
    && left.venueType === right.venueType
  );
}

function copyRosterData(
  playerId: string,
  data: MatchRosterSnapshotData,
): MatchRosterSnapshotData {
  const validation =
    validateMatchRosterSnapshotData(
      playerId,
      data,
    );

  if (!validation.valid) {
    throw new Error(
      `Invalid Match roster snapshot: ${validation.errors.join(" ")}`,
    );
  }

  return {
    schemaVersion: data.schemaVersion,
    futId: data.futId,
    firstName: data.firstName,
    lastName: data.lastName,
    position: data.position,
    jerseyNumber: data.jerseyNumber,
  };
}

function toDate(
  value: unknown,
  label: string,
): Date {
  let date: Date | null = null;

  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (
    isRecord(value)
    && typeof value.toDate === "function"
  ) {
    const resolved =
      (value.toDate as () => unknown)();

    if (resolved instanceof Date) {
      date = new Date(resolved.getTime());
    }
  }

  if (
    date === null
    || !Number.isFinite(date.getTime())
  ) {
    throw new Error(
      `${label} must be a Firestore timestamp.`,
    );
  }

  return date;
}

function nullableKickoffDate(
  value: unknown,
): Date | null {
  if (value === null) {
    return null;
  }

  return toDate(
    value,
    "kickoffAt",
  );
}

function requireSnapshotData(
  snapshot: MatchRepositoryDocumentSnapshotLike,
  label: string,
): Record<string, unknown> {
  const data = snapshot.data();

  if (!isRecord(data)) {
    throw new Error(
      `${label} has no valid Firestore document data.`,
    );
  }

  return data;
}

function mapStoredMatchSnapshot(
  snapshot: MatchRepositoryDocumentSnapshotLike,
): AcademyMatchRecord {
  const id =
    requireExactDocumentId(
      snapshot.id,
      "Match ID",
    );

  const data =
    requireSnapshotData(
      snapshot,
      "Match",
    );

  if (
    !hasExactKeys(
      data,
      MATCH_PERSISTED_KEYS,
    )
  ) {
    throw new Error(
      "Stored Match contains missing or unsupported fields.",
    );
  }

  const core = {
    schemaVersion: data.schemaVersion,
    status: data.status,
    squadLabel: data.squadLabel,
    competitionName: data.competitionName,
    opponentName: data.opponentName,
    kickoffAt:
      nullableKickoffDate(
        data.kickoffAt,
      ),
    venueType: data.venueType,
  } as MatchCoreData;

  const safeCore =
    copyMatchCoreData(core);

  return {
    id,
    ...safeCore,
    createdAt:
      toDate(
        data.createdAt,
        "createdAt",
      ),
    createdBy:
      requireExactDocumentId(
        data.createdBy,
        "createdBy",
      ),
    updatedAt:
      toDate(
        data.updatedAt,
        "updatedAt",
      ),
    updatedBy:
      requireExactDocumentId(
        data.updatedBy,
        "updatedBy",
      ),
  };
}

function mapStoredRosterSnapshot(
  snapshot: MatchRepositoryDocumentSnapshotLike,
): AcademyMatchRosterRecord {
  const playerId =
    requireExactDocumentId(
      snapshot.id,
      "Roster player ID",
    );

  const data =
    requireSnapshotData(
      snapshot,
      "Match roster player",
    );

  if (
    !hasExactKeys(
      data,
      ROSTER_PERSISTED_KEYS,
    )
  ) {
    throw new Error(
      "Stored Match roster player contains missing or unsupported fields.",
    );
  }

  const rosterData = {
    schemaVersion: data.schemaVersion,
    futId: data.futId,
    firstName: data.firstName,
    lastName: data.lastName,
    position: data.position,
    jerseyNumber: data.jerseyNumber,
  } as MatchRosterSnapshotData;

  const safeRoster =
    copyRosterData(
      playerId,
      rosterData,
    );

  return {
    id: playerId,
    ...safeRoster,
    createdAt:
      toDate(
        data.createdAt,
        "createdAt",
      ),
    createdBy:
      requireExactDocumentId(
        data.createdBy,
        "createdBy",
      ),
    updatedAt:
      toDate(
        data.updatedAt,
        "updatedAt",
      ),
    updatedBy:
      requireExactDocumentId(
        data.updatedBy,
        "updatedBy",
      ),
  };
}

function normalizeStoredFutId(
  value: unknown,
  label: string,
): string | null {
  if (
    value === undefined
    || value === null
  ) {
    return null;
  }

  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 64
    || value.trim() !== value
  ) {
    throw new Error(
      `${label} is not a valid stored FUTID.`,
    );
  }

  return value;
}

function buildRosterSnapshotFromPlayer(
  playerId: string,
  playerSnapshot:
    MatchRepositoryDocumentSnapshotLike,
  position: string,
  jerseyNumber: number,
): MatchRosterSnapshotData {
  if (!playerSnapshot.exists()) {
    throw new Error(
      "Canonical Academy Player does not exist.",
    );
  }

  if (playerSnapshot.id !== playerId) {
    throw new Error(
      "Canonical Academy Player path identity mismatch.",
    );
  }

  const playerData =
    requireSnapshotData(
      playerSnapshot,
      "Academy Player",
    );

  const canonicalFutId =
    normalizeStoredFutId(
      playerData.futId,
      "Academy Player futId",
    );

  const legacyFutId =
    normalizeStoredFutId(
      playerData.futID,
      "Academy Player futID",
    );

  if (
    canonicalFutId !== null
    && legacyFutId !== null
    && canonicalFutId !== legacyFutId
  ) {
    throw new Error(
      "Academy Player canonical futId conflicts with legacy futID.",
    );
  }

  const rosterData = {
    schemaVersion:
      MATCH_SCHEMA_VERSION,

    futId:
      canonicalFutId
      ?? legacyFutId
      ?? null,

    firstName:
      playerData.firstName,

    lastName:
      playerData.lastName,

    position,

    jerseyNumber,
  } as MatchRosterSnapshotData;

  return copyRosterData(
    playerId,
    rosterData,
  );
}

async function requireExistingMatch(
  academyId: string,
  matchId: string,
  dependencies: MatchRepositoryDependencies,
): Promise<AcademyMatchRecord> {
  const snapshot =
    await dependencies.getMatch(
      academyId,
      matchId,
    );

  if (!snapshot.exists()) {
    throw new Error(
      "Match does not exist.",
    );
  }

  return mapStoredMatchSnapshot(
    snapshot,
  );
}

async function requireMutableMatch(
  academyId: string,
  matchId: string,
  dependencies: MatchRepositoryDependencies,
): Promise<AcademyMatchRecord> {
  const match =
    await requireExistingMatch(
      academyId,
      matchId,
      dependencies,
    );

  if (
    match.status !== "DRAFT"
    && match.status !== "SCHEDULED"
    && match.status !== "IN_PROGRESS"
  ) {
    throw new Error(
      "Match roster evidence is locked for terminal Match status.",
    );
  }

  return match;
}

export async function readAcademyMatch(
  academyId: string,
  matchId: string,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<AcademyMatchRecord | null> {
  const safeAcademyId =
    requireExactDocumentId(
      academyId,
      "Academy ID",
    );

  const safeMatchId =
    requireExactDocumentId(
      matchId,
      "Match ID",
    );

  const snapshot =
    await dependencies.getMatch(
      safeAcademyId,
      safeMatchId,
    );

  if (!snapshot.exists()) {
    return null;
  }

  return mapStoredMatchSnapshot(
    snapshot,
  );
}

export async function listAcademyMatches(
  academyId: string,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<AcademyMatchRecord[]> {
  const safeAcademyId =
    requireExactDocumentId(
      academyId,
      "Academy ID",
    );

  const snapshot =
    await dependencies.listMatches(
      safeAcademyId,
    );

  return snapshot.docs.map(
    (matchSnapshot) =>
      mapStoredMatchSnapshot(
        matchSnapshot,
      ),
  );
}

export async function createAcademyMatch(
  input: CreateAcademyMatchInput,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<string> {
  const academyId =
    requireExactDocumentId(
      input.academyId,
      "Academy ID",
    );

  const actorUid =
    requireAuthenticatedUid(
      dependencies,
    );

  const safeData =
    copyMatchCoreData(
      input.data,
    );

  const generatedMatchId =
    input.matchId
    ?? dependencies.createMatchId(
      academyId,
    );

  const matchId =
    requireExactDocumentId(
      generatedMatchId,
      "Match ID",
    );

  const existing =
    await dependencies.getMatch(
      academyId,
      matchId,
    );

  if (existing.exists()) {
    throw new Error(
      "Match already exists.",
    );
  }

  const timestamp =
    dependencies.timestamp();

  await dependencies.setMatch(
    academyId,
    matchId,
    {
      ...safeData,
      createdAt: timestamp,
      createdBy: actorUid,
      updatedAt: timestamp,
      updatedBy: actorUid,
    },
  );

  return matchId;
}

export async function updateAcademyMatch(
  input: UpdateAcademyMatchInput,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<void> {
  const academyId =
    requireExactDocumentId(
      input.academyId,
      "Academy ID",
    );

  const matchId =
    requireExactDocumentId(
      input.matchId,
      "Match ID",
    );

  const actorUid =
    requireAuthenticatedUid(
      dependencies,
    );

  const safeExpectedData =
    copyMatchCoreData(
      input.expectedData,
    );

  const safeData =
    copyMatchCoreData(
      input.data,
    );

  if (
    safeExpectedData.status !==
    safeData.status
  ) {
    throw new Error(
      "Match lifecycle transitions require transitionAcademyMatchStatus().",
    );
  }

  await dependencies.runMatchTransaction(
    academyId,
    matchId,
    (snapshot, timestamp) => {
      if (!snapshot.exists()) {
        throw new Error(
          "Match does not exist.",
        );
      }

      const storedMatch =
        mapStoredMatchSnapshot(
          snapshot,
        );

      if (
        isTerminalMatchStatus(
          storedMatch.status,
        )
      ) {
        throw new Error(
          "Terminal Match evidence cannot be updated.",
        );
      }

      const storedCore =
        matchCoreDataFromRecord(
          storedMatch,
        );

      if (
        !matchCoreDataEquals(
          storedCore,
          safeExpectedData,
        )
      ) {
        throw new Error(
          "Match changed since it was loaded. Refresh the workspace and try again.",
        );
      }

      return {
        ...safeData,
        updatedAt: timestamp,
        updatedBy: actorUid,
      };
    },
  );
}

export async function transitionAcademyMatchStatus(
  input: TransitionAcademyMatchStatusInput,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<void> {
  const academyId =
    requireExactDocumentId(
      input.academyId,
      "Academy ID",
    );

  const matchId =
    requireExactDocumentId(
      input.matchId,
      "Match ID",
    );

  const actorUid =
    requireAuthenticatedUid(
      dependencies,
    );

  const safeExpectedData =
    copyMatchCoreData(
      input.expectedData,
    );

  const targetStatus =
    input.targetStatus;

  if (
    !canTransitionMatchStatus(
      safeExpectedData.status,
      targetStatus,
    )
  ) {
    throw new Error(
      `Invalid Match lifecycle transition: ${safeExpectedData.status} -> ${targetStatus}.`,
    );
  }

  await dependencies.runMatchTransaction(
    academyId,
    matchId,
    (snapshot, timestamp) => {
      if (!snapshot.exists()) {
        throw new Error(
          "Match does not exist.",
        );
      }

      const storedMatch =
        mapStoredMatchSnapshot(
          snapshot,
        );

      if (
        isTerminalMatchStatus(
          storedMatch.status,
        )
      ) {
        throw new Error(
          "Terminal Match evidence cannot be updated.",
        );
      }

      const storedCore =
        matchCoreDataFromRecord(
          storedMatch,
        );

      if (
        !matchCoreDataEquals(
          storedCore,
          safeExpectedData,
        )
      ) {
        throw new Error(
          "Match changed since it was loaded. Refresh the workspace and try again.",
        );
      }

      if (
        !canTransitionMatchStatus(
          storedMatch.status,
          targetStatus,
        )
      ) {
        throw new Error(
          `Invalid Match lifecycle transition: ${storedMatch.status} -> ${targetStatus}.`,
        );
      }

      const targetData =
        copyMatchCoreData({
          ...storedCore,
          status: targetStatus,
        });

      return {
        status: targetData.status,
        updatedAt: timestamp,
        updatedBy: actorUid,
      };
    },
  );
}

export async function readAcademyMatchRoster(
  academyId: string,
  matchId: string,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<AcademyMatchRosterRecord[]> {
  const safeAcademyId =
    requireExactDocumentId(
      academyId,
      "Academy ID",
    );

  const safeMatchId =
    requireExactDocumentId(
      matchId,
      "Match ID",
    );

  await requireExistingMatch(
    safeAcademyId,
    safeMatchId,
    dependencies,
  );

  const snapshot =
    await dependencies.listRoster(
      safeAcademyId,
      safeMatchId,
    );

  return snapshot.docs.map(
    (rosterSnapshot) =>
      mapStoredRosterSnapshot(
        rosterSnapshot,
      ),
  );
}

export async function createAcademyMatchRosterPlayer(
  input: MatchRosterMutationInput,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<void> {
  const academyId =
    requireExactDocumentId(
      input.academyId,
      "Academy ID",
    );

  const matchId =
    requireExactDocumentId(
      input.matchId,
      "Match ID",
    );

  const playerId =
    requireExactDocumentId(
      input.playerId,
      "Player ID",
    );

  const actorUid =
    requireAuthenticatedUid(
      dependencies,
    );

  await requireMutableMatch(
    academyId,
    matchId,
    dependencies,
  );

  const existingRoster =
    await dependencies.getRosterPlayer(
      academyId,
      matchId,
      playerId,
    );

  if (existingRoster.exists()) {
    throw new Error(
      "Match roster player already exists.",
    );
  }

  const playerSnapshot =
    await dependencies.getPlayer(
      academyId,
      playerId,
    );

  const rosterData =
    buildRosterSnapshotFromPlayer(
      playerId,
      playerSnapshot,
      input.position,
      input.jerseyNumber,
    );

  const timestamp =
    dependencies.timestamp();

  await dependencies.setRosterPlayer(
    academyId,
    matchId,
    playerId,
    {
      ...rosterData,
      createdAt: timestamp,
      createdBy: actorUid,
      updatedAt: timestamp,
      updatedBy: actorUid,
    },
  );
}

export async function updateAcademyMatchRosterPlayer(
  input: MatchRosterMutationInput,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<void> {
  const academyId =
    requireExactDocumentId(
      input.academyId,
      "Academy ID",
    );

  const matchId =
    requireExactDocumentId(
      input.matchId,
      "Match ID",
    );

  const playerId =
    requireExactDocumentId(
      input.playerId,
      "Player ID",
    );

  const actorUid =
    requireAuthenticatedUid(
      dependencies,
    );

  await requireMutableMatch(
    academyId,
    matchId,
    dependencies,
  );

  const existingRoster =
    await dependencies.getRosterPlayer(
      academyId,
      matchId,
      playerId,
    );

  if (!existingRoster.exists()) {
    throw new Error(
      "Match roster player does not exist.",
    );
  }

  mapStoredRosterSnapshot(
    existingRoster,
  );

  const playerSnapshot =
    await dependencies.getPlayer(
      academyId,
      playerId,
    );

  const rosterData =
    buildRosterSnapshotFromPlayer(
      playerId,
      playerSnapshot,
      input.position,
      input.jerseyNumber,
    );

  const timestamp =
    dependencies.timestamp();

  await dependencies.updateRosterPlayer(
    academyId,
    matchId,
    playerId,
    {
      ...rosterData,
      updatedAt: timestamp,
      updatedBy: actorUid,
    },
  );
}

export async function removeAcademyMatchRosterPlayer(
  academyId: string,
  matchId: string,
  playerId: string,
  dependencies:
    MatchRepositoryDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<void> {
  const safeAcademyId =
    requireExactDocumentId(
      academyId,
      "Academy ID",
    );

  const safeMatchId =
    requireExactDocumentId(
      matchId,
      "Match ID",
    );

  const safePlayerId =
    requireExactDocumentId(
      playerId,
      "Player ID",
    );

  requireAuthenticatedUid(
    dependencies,
  );

  await requireMutableMatch(
    safeAcademyId,
    safeMatchId,
    dependencies,
  );

  const existingRoster =
    await dependencies.getRosterPlayer(
      safeAcademyId,
      safeMatchId,
      safePlayerId,
    );

  if (!existingRoster.exists()) {
    throw new Error(
      "Match roster player does not exist.",
    );
  }

  mapStoredRosterSnapshot(
    existingRoster,
  );

  await dependencies.deleteRosterPlayer(
    safeAcademyId,
    safeMatchId,
    safePlayerId,
  );
}