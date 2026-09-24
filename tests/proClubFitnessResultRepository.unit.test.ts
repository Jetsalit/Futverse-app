import assert from "node:assert/strict";
import test from "node:test";

import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../src/lib/fitnessTestFoundation";
import {
  proClubFitnessResultDocumentIdV1,
  PRO_CLUB_FITNESS_RESULT_SOURCE,
  validateProClubFitnessResultCreateInput,
} from "../src/lib/proClubFitnessResult";
import {
  createProClubFitnessResult,
  listProClubFitnessResultHistory,
  listProClubFitnessResultsForDate,
  type ProClubFitnessResultRepositoryOps,
} from "../src/lib/firestore/proClubFitnessResultRepository";

const CLUB_ID = "club-a";
const ACTOR_UID = "fitness-coach-a";
const PLAYER_KEY = "player-key-a";
const INPUT = {
  playerKey: PLAYER_KEY,
  definitionId: "football:speed_10m:v1",
  definitionVersion: 1,
  value: 1.82,
  observedOn: "2026-09-24",
};
const SERVER_TIMESTAMP = "server timestamp";

type StoredDocument = Record<string, unknown>;
type CreateBehavior = (
  path: readonly string[],
  data: StoredDocument,
  store: Map<string, StoredDocument>,
) => Promise<void>;

function createOps(overrides: {
  role?: string | null;
  resolveClubId?: string;
  createBehavior?: CreateBehavior;
} = {}) {
  const store = new Map<string, StoredDocument>();
  const writes: Array<{ path: readonly string[]; data: StoredDocument }> = [];
  const reads: readonly string[][] = [];
  const mutableReads = reads as string[][];
  const listCalls: Array<{ path: readonly string[]; field: string; value: string }> = [];
  const authority = {
    state: "FOUND" as const,
    value: {
      organizationId: overrides.resolveClubId ?? CLUB_ID,
      organizationType: "PRO_CLUB" as const,
      organizationName: "Test United",
      organizationLevel: "T1" as const,
      organizationStatus: "ACTIVE" as const,
      userId: ACTOR_UID,
      membershipAuthorizationRole: "MEMBER" as const,
      membershipStatus: "ACTIVE" as const,
      hasMembershipAuthority: true,
      staffRole: (overrides.role ?? "FITNESS_COACH") as "FITNESS_COACH",
    },
  };
  const ops: ProClubFitnessResultRepositoryOps = {
    getAuthenticatedUid: () => ACTOR_UID,
    resolveAuthority: async () => authority,
    async readDocument(path) {
      mutableReads.push([...path]);
      const id = path[path.length - 1] ?? "";
      const data = store.get(path.join("/"));
      return { id, exists: data !== undefined, data };
    },
    async listDocuments(path, filter) {
      listCalls.push({ path: [...path], field: filter.field, value: filter.value });
      return {
        documents: [...store.entries()]
          .filter(([documentPath, data]) =>
            documentPath.startsWith(`${path.join("/")}/`) && data[filter.field] === filter.value,
          )
          .map(([documentPath, data]) => ({
            id: documentPath.slice(documentPath.lastIndexOf("/") + 1),
            exists: true,
            data,
          })),
      };
    },
    async createDocument(path, data) {
      writes.push({ path: [...path], data });
      if (overrides.createBehavior) {
        await overrides.createBehavior(path, data, store);
        return;
      }
      store.set(path.join("/"), data);
    },
    serverTimestamp: () => SERVER_TIMESTAMP,
  };
  return { ops, store, writes, reads: mutableReads, listCalls };
}

function validStoredData(overrides: StoredDocument = {}): StoredDocument {
  return {
    schemaVersion: 1,
    playerKey: PLAYER_KEY,
    definitionId: INPUT.definitionId,
    definitionVersion: INPUT.definitionVersion,
    value: INPUT.value,
    observedOn: INPUT.observedOn,
    source: PRO_CLUB_FITNESS_RESULT_SOURCE,
    recordedAt: new Date("2026-09-24T12:00:00.000Z"),
    recordedBy: ACTOR_UID,
    ...overrides,
  };
}

async function resultPath(data: Record<string, unknown> = INPUT): Promise<string> {
  const valid = validateProClubFitnessResultCreateInput(data);
  assert.equal(valid.ok, true);
  if (!valid.ok) throw new Error("Test input must be valid.");
  const id = await proClubFitnessResultDocumentIdV1(valid.value);
  return `proClubs/${CLUB_ID}/fitnessResults/${id}`;
}

test("creates at the canonical path with server timestamp and authenticated actor", async () => {
  const { ops, writes } = createOps();
  const result = await createProClubFitnessResult({ clubId: CLUB_ID, input: INPUT }, ops);

  assert.equal(result.kind, "DEFINITELY_CREATED");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path.slice(0, 3).join("/"), "proClubs/club-a/fitnessResults");
  assert.equal(writes[0].data.recordedAt, SERVER_TIMESTAMP);
  assert.equal(writes[0].data.recordedBy, ACTOR_UID);
  assert.equal(writes[0].data.source, PRO_CLUB_FITNESS_RESULT_SOURCE);
  assert.equal(writes[0].data.playerKey, PLAYER_KEY);
});

test("an existing equivalent observation is idempotent success without another create", async () => {
  const { ops, store, writes } = createOps();
  store.set(await resultPath(), validStoredData());

  const result = await createProClubFitnessResult({ clubId: CLUB_ID, input: INPUT }, ops);

  assert.equal(result.kind, "ALREADY_COMMITTED_EQUIVALENT");
  assert.equal(writes.length, 0);
});

test("an existing observation with a different payload conflicts and is never overwritten", async () => {
  const { ops, store, writes } = createOps();
  const path = await resultPath();
  const existing = validStoredData({ value: 1.91 });
  store.set(path, existing);

  const result = await createProClubFitnessResult({ clubId: CLUB_ID, input: INPUT }, ops);

  assert.equal(result.kind, "OBSERVATION_CONFLICT");
  assert.equal(writes.length, 0);
  assert.equal(store.get(path)?.value, 1.91);
});

test("reads back an equivalent record after an ambiguous write failure", async () => {
  const { ops } = createOps({
    createBehavior: async (path, data, store) => {
      store.set(path.join("/"), data);
      throw Object.assign(new Error("connection lost after commit"), { code: "unavailable" });
    },
  });

  const result = await createProClubFitnessResult({ clubId: CLUB_ID, input: INPUT }, ops);
  assert.equal(result.kind, "ALREADY_COMMITTED_EQUIVALENT");
});

test("does not convert an ordinary permission failure into success", async () => {
  const { ops, reads } = createOps({
    createBehavior: async () => {
      throw Object.assign(new Error("permission denied"), { code: "permission-denied" });
    },
  });

  const result = await createProClubFitnessResult({ clubId: CLUB_ID, input: INPUT }, ops);
  assert.equal(result.kind, "WRITE_FAILED");
  assert.equal(reads.length, 1, "only the pre-create existence read is allowed");
});

test("create requires matching active FITNESS_COACH authority", async () => {
  const { ops, writes } = createOps({ role: "HEAD_COACH" });
  await assert.rejects(
    createProClubFitnessResult({ clubId: CLUB_ID, input: INPUT }, ops),
    /FITNESS_COACH/,
  );
  assert.equal(writes.length, 0);

  const mismatchedTenant = createOps({ resolveClubId: "club-b" });
  await assert.rejects(
    createProClubFitnessResult({ clubId: CLUB_ID, input: INPUT }, mismatchedTenant.ops),
    /identity mismatch/,
  );
});

test("date and player-history reads query the canonical club collection and select persisted data", async () => {
  const { ops, store, listCalls } = createOps();
  const datePath = await resultPath();
  store.set(datePath, validStoredData());

  const selected = await listProClubFitnessResultsForDate({
    clubId: CLUB_ID,
    observedOn: INPUT.observedOn,
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
  }, ops);
  assert.deepEqual(selected, { [PLAYER_KEY]: { speed_10m: INPUT.value } });

  const history = await listProClubFitnessResultHistory({
    clubId: CLUB_ID,
    playerKey: PLAYER_KEY,
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
  }, ops);
  assert.deepEqual(history.map(({ playerKey, definitionKey, value }) => ({ playerKey, definitionKey, value })), [
    { playerKey: PLAYER_KEY, definitionKey: "speed_10m", value: INPUT.value },
  ]);

  assert.deepEqual(listCalls, [
    { path: ["proClubs", CLUB_ID, "fitnessResults"], field: "observedOn", value: INPUT.observedOn },
    { path: ["proClubs", CLUB_ID, "fitnessResults"], field: "playerKey", value: PLAYER_KEY },
  ]);
});
