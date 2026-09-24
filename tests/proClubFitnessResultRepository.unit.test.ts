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
  createProClubFitnessResults,
  MAX_IN_FLIGHT_RESULT_OPERATIONS,
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
  const calls = { authenticatedUid: 0, authority: 0 };
  const networkOperations = { active: 0, maxActive: 0 };
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
    getAuthenticatedUid: () => {
      calls.authenticatedUid += 1;
      return ACTOR_UID;
    },
    resolveAuthority: async () => {
      calls.authority += 1;
      return authority;
    },
    async readDocument(path) {
      networkOperations.active += 1;
      networkOperations.maxActive = Math.max(networkOperations.maxActive, networkOperations.active);
      try {
        await Promise.resolve();
        mutableReads.push([...path]);
        const id = path[path.length - 1] ?? "";
        const data = store.get(path.join("/"));
        return { id, exists: data !== undefined, data };
      } finally {
        networkOperations.active -= 1;
      }
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
      networkOperations.active += 1;
      networkOperations.maxActive = Math.max(networkOperations.maxActive, networkOperations.active);
      try {
        if (overrides.createBehavior) {
          await overrides.createBehavior(path, data, store);
          return;
        }
        await Promise.resolve();
        store.set(path.join("/"), data);
      } finally {
        networkOperations.active -= 1;
      }
    },
    serverTimestamp: () => SERVER_TIMESTAMP,
  };
  return { ops, store, writes, reads: mutableReads, listCalls, calls, networkOperations };
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

test("bulk create resolves actor and authority once, persists multiple results, and preserves input order", async () => {
  const { ops, writes, calls } = createOps();
  const inputs = [
    INPUT,
    { ...INPUT, definitionId: "football:vertical_jump:v1", value: 43 },
    { ...INPUT, definitionId: "football:speed_30m:v1", value: 4.2 },
  ];

  const outcomes = await createProClubFitnessResults({ clubId: CLUB_ID, inputs }, ops);
  const expectedIds: string[] = [];
  for (const input of inputs) {
    const validated = validateProClubFitnessResultCreateInput(input);
    assert.equal(validated.ok, true);
    if (!validated.ok) throw new Error("Test input must be valid.");
    expectedIds.push(await proClubFitnessResultDocumentIdV1(validated.value));
  }

  assert.equal(calls.authenticatedUid, 1);
  assert.equal(calls.authority, 1);
  assert.deepEqual(outcomes.map(({ kind }) => kind), [
    "DEFINITELY_CREATED",
    "DEFINITELY_CREATED",
    "DEFINITELY_CREATED",
  ]);
  assert.deepEqual(outcomes.map(({ resultId }) => resultId), expectedIds);
  assert.equal(writes.length, inputs.length);
  assert.ok(writes.every(({ path }) => path.slice(0, 3).join("/") === "proClubs/club-a/fitnessResults"));
});

test("bulk preflight rejects invalid inputs and duplicate deterministic identities before writes", async () => {
  const invalidClubOps = createOps();
  await assert.rejects(
    createProClubFitnessResults({ clubId: "club/a", inputs: [INPUT] }, invalidClubOps.ops),
    /clubId/,
  );
  assert.equal(invalidClubOps.calls.authenticatedUid, 0);
  assert.equal(invalidClubOps.calls.authority, 0);
  assert.equal(invalidClubOps.writes.length, 0);

  const invalidOps = createOps();
  await assert.rejects(
    createProClubFitnessResults({
      clubId: CLUB_ID,
      inputs: [INPUT, { ...INPUT, value: Number.NaN }],
    }, invalidOps.ops),
    /Invalid Pro Club Fitness result/,
  );
  assert.equal(invalidOps.writes.length, 0);

  const duplicateOps = createOps();
  await assert.rejects(
    createProClubFitnessResults({ clubId: CLUB_ID, inputs: [INPUT, { ...INPUT }] }, duplicateOps.ops),
    /duplicate deterministic identity/i,
  );
  assert.equal(duplicateOps.writes.length, 0);
});

test("bulk outcomes preserve equivalent, conflict, and create results without overwriting", async () => {
  const { ops, store, writes } = createOps();
  const equivalentInput = INPUT;
  const conflictInput = { ...INPUT, definitionId: "football:vertical_jump:v1", value: 43 };
  const newInput = { ...INPUT, definitionId: "football:speed_30m:v1", value: 4.2 };
  const equivalentPath = await resultPath(equivalentInput);
  const conflictPath = await resultPath(conflictInput);
  store.set(equivalentPath, validStoredData());
  store.set(conflictPath, validStoredData({ definitionId: conflictInput.definitionId, value: 99 }));

  const outcomes = await createProClubFitnessResults({
    clubId: CLUB_ID,
    inputs: [equivalentInput, conflictInput, newInput],
  }, ops);

  assert.deepEqual(outcomes.map(({ kind }) => kind), [
    "ALREADY_COMMITTED_EQUIVALENT",
    "OBSERVATION_CONFLICT",
    "DEFINITELY_CREATED",
  ]);
  assert.equal(writes.length, 1);
  assert.equal(store.get(conflictPath)?.value, 99);
});

test("bulk create reports an ordinary denied write without converting it to success", async () => {
  const { ops, writes, reads } = createOps({
    createBehavior: async (path, data, store) => {
      if (data.value === INPUT.value) {
        throw Object.assign(new Error("permission denied"), { code: "permission-denied" });
      }
      store.set(path.join("/"), data);
    },
  });
  const outcomes = await createProClubFitnessResults({
    clubId: CLUB_ID,
    inputs: [INPUT, { ...INPUT, definitionId: "football:vertical_jump:v1", value: 43 }],
  }, ops);

  assert.deepEqual(outcomes.map(({ kind }) => kind), ["WRITE_FAILED", "DEFINITELY_CREATED"]);
  assert.equal(writes.length, 2);
  assert.equal(reads.length, 2, "ordinary permission failures do not trigger ambiguous-write read-back");
});

test("bulk create retains ambiguous-write read-back and idempotent success semantics", async () => {
  const { ops, store, reads } = createOps({
    createBehavior: async (path, data, target) => {
      target.set(path.join("/"), data);
      if (data.value === INPUT.value) {
        throw Object.assign(new Error("connection lost after commit"), { code: "unavailable" });
      }
    },
  });
  const outcomes = await createProClubFitnessResults({
    clubId: CLUB_ID,
    inputs: [INPUT, { ...INPUT, definitionId: "football:vertical_jump:v1", value: 43 }],
  }, ops);

  assert.deepEqual(outcomes.map(({ kind }) => kind), [
    "ALREADY_COMMITTED_EQUIVALENT",
    "DEFINITELY_CREATED",
  ]);
  assert.equal(reads.length, 3, "only the ambiguous write gets a deterministic read-back");
  assert.equal(store.size, 2);
});

test("bulk create caps concurrent result operations at four and keeps outcomes in request order", async () => {
  const { ops, networkOperations } = createOps({
    createBehavior: async (path, data, store) => {
      await Promise.resolve();
      store.set(path.join("/"), data);
    },
  });
  const inputs = Array.from({ length: 9 }, (_, index) => ({
    ...INPUT,
    observedOn: `2026-09-${String(index + 1).padStart(2, "0")}`,
  }));
  const expectedIds: string[] = [];
  for (const input of inputs) {
    const validated = validateProClubFitnessResultCreateInput(input);
    assert.equal(validated.ok, true);
    if (!validated.ok) throw new Error("Test input must be valid.");
    expectedIds.push(await proClubFitnessResultDocumentIdV1(validated.value));
  }

  const outcomes = await createProClubFitnessResults({ clubId: CLUB_ID, inputs }, ops);

  assert.equal(MAX_IN_FLIGHT_RESULT_OPERATIONS, 4);
  assert.equal(networkOperations.maxActive, MAX_IN_FLIGHT_RESULT_OPERATIONS);
  assert.deepEqual(outcomes.map(({ kind }) => kind), Array(9).fill("DEFINITELY_CREATED"));
  assert.deepEqual(outcomes.map(({ resultId }) => resultId), expectedIds);
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
