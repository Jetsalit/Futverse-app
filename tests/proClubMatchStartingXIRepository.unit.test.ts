import assert from "node:assert/strict";
import test from "node:test";

import {
  addProClubMatchRosterPlayer,
  createProClubMatch,
  getProClubShootout,
  getProClubStartingXI,
  listProClubMatches,
  listProClubMatchRoster,
  removeProClubMatchRosterPlayer,
  saveProClubShootout,
  saveProClubStartingXI,
  type ProClubMatchStartingXIAtomicWrite,
  type ProClubMatchStartingXIRepositoryOps,
} from "../src/lib/firestore/proClubMatchStartingXIRepository";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import { createProClubCustomFormationSlotsFromFixed } from "../src/lib/proClubStartingXI11v11.ts";
import type {
  ProClubMatchCoreData,
  ProClubPersistedShootoutPlan,
  ProClubPersistedStartingXIPlan,
} from "../src/lib/proClubMatchStartingXI";

const CLUB = "club-a";
const MATCH = "match-a";
const HEAD = "head-coach-a";

const AUTHORITY: ProClubOrganizationAuthority = {
  organizationId: CLUB,
  organizationType: "PRO_CLUB",
  organizationName: "Club A",
  organizationLevel: "T3",
  organizationStatus: "ACTIVE",
  userId: HEAD,
  membershipAuthorizationRole: "MEMBER",
  membershipStatus: "ACTIVE",
  hasMembershipAuthority: true,
  staffRole: "HEAD_COACH",
};

type Stored = {
  id: string;
  data: Record<string, unknown>;
};

function key(path: readonly string[]): string {
  return path.join("/");
}

function clone(value: unknown): unknown {
  return structuredClone(value);
}

function createHarness(
  authority: ProClubOrganizationAuthority = AUTHORITY,
): {
  ops: ProClubMatchStartingXIRepositoryOps;
  docs: Map<string, Stored>;
  atomicCalls: ProClubMatchStartingXIAtomicWrite[][];
} {
  const docs = new Map<string, Stored>();
  const atomicCalls: ProClubMatchStartingXIAtomicWrite[][] = [];
  let tick = 0;

  function applySet(path: readonly string[], data: Record<string, unknown>): void {
    docs.set(key(path), {
      id: path[path.length - 1]!,
      data: clone(data) as Record<string, unknown>,
    });
  }

  function applyUpdate(path: readonly string[], patch: Record<string, unknown>): void {
    const existing = docs.get(key(path));
    if (!existing) throw new Error("missing update target");
    docs.set(key(path), {
      id: existing.id,
      data: {
        ...existing.data,
        ...(clone(patch) as Record<string, unknown>),
      },
    });
  }

  const ops: ProClubMatchStartingXIRepositoryOps = {
    getAuthenticatedUid() {
      return HEAD;
    },
    async resolveAuthority(clubId, uid) {
      if (clubId !== CLUB || uid !== HEAD) return { state: "MISSING" };
      return { state: "FOUND", value: authority };
    },
    async readDocument(path) {
      const found = docs.get(key(path));
      return found
        ? { id: found.id, exists: true, data: clone(found.data) }
        : { id: path[path.length - 1]!, exists: false };
    },
    async listDocuments(path) {
      const prefix = key(path) + "/";
      const depth = path.length + 1;
      const documents = [...docs.entries()]
        .filter(([documentKey]) => {
          const segments = documentKey.split("/");
          return documentKey.startsWith(prefix) && segments.length === depth;
        })
        .map(([, stored]) => ({
          id: stored.id,
          exists: true,
          data: clone(stored.data),
        }));
      return { documents };
    },
    async setDocument(path, data) {
      applySet(path, data as Record<string, unknown>);
    },
    async updateDocument(path, data) {
      applyUpdate(path, data as Record<string, unknown>);
    },
    async commitAtomic(writes) {
      atomicCalls.push(writes.map((write) => clone(write) as ProClubMatchStartingXIAtomicWrite));
      for (const write of writes) {
        if (write.kind === "set") {
          applySet(write.path, write.data as Record<string, unknown>);
        } else if (write.kind === "update") {
          applyUpdate(write.path, write.data as Record<string, unknown>);
        } else {
          docs.delete(key(write.path));
        }
      }
    },
    timestamp() {
      tick += 1;
      return new Date(Date.UTC(2026, 8, 20, 10, 0, tick));
    },
  };

  return { ops, docs, atomicCalls };
}

const MATCH_CORE: ProClubMatchCoreData = {
  schemaVersion: 1,
  status: "DRAFT",
  squadLabel: "First Team",
  competitionName: "League",
  opponentName: null,
  kickoffAt: null,
  venueType: null,
};

function seedCanonicalRoster(
  docs: Map<string, Stored>,
  playerKey: string,
  jerseyNumber: number,
): void {
  docs.set(
    `proClubs/${CLUB}/players/${playerKey}`,
    {
      id: playerKey,
      data: {
        schemaVersion: 1,
        futId: null,
        firstName: `Player ${playerKey}`,
        lastName: "",
        position: "CM",
        additionalPositions: [],
        jerseyNumber,
        squadLabel: "First Team",
        status: "ACTIVE",
        createdAt: new Date(),
        createdBy: HEAD,
        updatedAt: new Date(),
        updatedBy: HEAD,
      },
    },
  );
}

function startingXIPlan(): ProClubPersistedStartingXIPlan {
  return {
    schemaVersion: 1,
    formation: "4-3-3",
    customFormationSlots: null,
    slotPlayerKeys: [
      "p1", "p2", "p3", "p4", "p5", "p6",
      "p7", "p8", "p9", "p10", "p11",
    ],
    substitutePlayerKeys: ["p12"],
    positionRoleAssignments: Array.from({ length: 11 }, () => null),
    setPieceAssignments: {
      CORNER_LEFT: "p1",
      CORNER_RIGHT: "p2",
      FREE_KICK_LEFT: null,
      FREE_KICK_RIGHT: null,
      THROW_IN_LEFT: null,
      THROW_IN_RIGHT: null,
      PENALTY: "p9",
    },
    coachNotes: "",
  };
}

const SHOOTOUT_PLAN: ProClubPersistedShootoutPlan = {
  schemaVersion: 1,
  primaryTakers: ["p9", "p10", "p11", "p8", "p7"],
  backupTakers: ["p12"],
};

async function createMatchWithRoster(
  count = 12,
): Promise<ReturnType<typeof createHarness>> {
  const harness = createHarness();
  await createProClubMatch(CLUB, MATCH, MATCH_CORE, harness.ops);

  for (let index = 1; index <= count; index += 1) {
    const playerKey = `p${index}`;
    seedCanonicalRoster(harness.docs, playerKey, index);
    const current = harness.docs.get(`proClubs/${CLUB}/matches/${MATCH}`)!;
    const expectedRevision = current.data.rosterRevision as number;
    await addProClubMatchRosterPlayer(
      CLUB,
      MATCH,
      playerKey,
      expectedRevision,
      harness.ops,
    );
  }

  return harness;
}

test("list Matches returns canonical tenant Match records", async () => {
  const { ops } = createHarness();
  await createProClubMatch(CLUB, "match-one", MATCH_CORE, ops);
  await createProClubMatch(
    CLUB,
    "match-two",
    { ...MATCH_CORE, competitionName: "Cup" },
    ops,
  );

  const matches = await listProClubMatches(CLUB, ops);

  assert.deepEqual(
    matches.map((item) => item.matchId).sort(),
    ["match-one", "match-two"],
  );
  assert.deepEqual(
    matches.map((item) => item.competitionName).sort(),
    ["Cup", "League"],
  );
});

test("create Match starts with empty roster revision zero and canonical audit", async () => {
  const { ops, docs } = createHarness();

  const created = await createProClubMatch(CLUB, MATCH, MATCH_CORE, ops);

  assert.equal(created.status, "DRAFT");
  assert.deepEqual(created.rosterPlayerKeys, []);
  assert.equal(created.rosterRevision, 0);
  assert.equal(created.createdBy, HEAD);
  assert.equal(created.createdByRole, "HEAD_COACH");

  const persisted = docs.get(`proClubs/${CLUB}/matches/${MATCH}`);
  assert.ok(persisted);
  assert.equal(persisted.data.rosterMutationPlayerKey, null);
  assert.equal(persisted.data.rosterMutationKind, null);
});

test("roster add is one atomic Match-index + canonical snapshot write", async () => {
  const { ops, docs, atomicCalls } = createHarness();
  await createProClubMatch(CLUB, MATCH, MATCH_CORE, ops);
  seedCanonicalRoster(docs, "p1", 1);

  const result = await addProClubMatchRosterPlayer(CLUB, MATCH, "p1", 0, ops);

  assert.equal(atomicCalls.length, 1);
  assert.equal(atomicCalls[0]!.length, 2);
  assert.deepEqual(
    atomicCalls[0]!.map((write) => write.kind),
    ["update", "set"],
  );
  assert.deepEqual(result.match.rosterPlayerKeys, ["p1"]);
  assert.equal(result.match.rosterRevision, 1);
  assert.equal(result.roster[0]!.playerKey, "p1");
  assert.equal(result.roster[0]!.firstName, "Player p1");
});

test("roster parser fails closed on malformed additionalPositions", async () => {
  const { ops, docs } = createHarness();
  await createProClubMatch(CLUB, MATCH, MATCH_CORE, ops);

  docs.set(
    `proClubs/${CLUB}/matches/${MATCH}`,
    {
      id: MATCH,
      data: {
        ...docs.get(`proClubs/${CLUB}/matches/${MATCH}`)!.data,
        rosterPlayerKeys: ["p1"],
        rosterRevision: 1,
        rosterMutationPlayerKey: "p1",
        rosterMutationKind: "ADD",
      },
    },
  );

  docs.set(
    `proClubs/${CLUB}/matches/${MATCH}/roster/p1`,
    {
      id: "p1",
      data: {
        schemaVersion: 1,
        playerKey: "p1",
        futId: null,
        firstName: "Player p1",
        lastName: "",
        jerseyNumber: 1,
        position: "CM",
        additionalPositions: "RW",
        createdAt: new Date(),
        createdBy: HEAD,
        createdByRole: "HEAD_COACH",
        updatedAt: new Date(),
        updatedBy: HEAD,
        updatedByRole: "HEAD_COACH",
      },
    },
  );

  await assert.rejects(
    listProClubMatchRoster(CLUB, MATCH, ops),
    /additionalPositions/,
  );
});

test("roster mutation rejects stale expected revision before any atomic write", async () => {
  const { ops, docs, atomicCalls } = createHarness();
  await createProClubMatch(CLUB, MATCH, MATCH_CORE, ops);
  seedCanonicalRoster(docs, "p1", 1);
  await addProClubMatchRosterPlayer(CLUB, MATCH, "p1", 0, ops);
  seedCanonicalRoster(docs, "p2", 2);

  await assert.rejects(
    addProClubMatchRosterPlayer(CLUB, MATCH, "p2", 0, ops),
    /Stale Match roster revision/,
  );
  assert.equal(atomicCalls.length, 1);
});

test("roster remove uses atomic index update plus snapshot delete", async () => {
  const { ops, docs, atomicCalls } = createHarness();
  await createProClubMatch(CLUB, MATCH, MATCH_CORE, ops);
  seedCanonicalRoster(docs, "p1", 1);
  await addProClubMatchRosterPlayer(CLUB, MATCH, "p1", 0, ops);

  const result = await removeProClubMatchRosterPlayer(CLUB, MATCH, "p1", 1, ops);

  assert.equal(atomicCalls.length, 2);
  assert.deepEqual(
    atomicCalls[1]!.map((write) => write.kind),
    ["update", "delete"],
  );
  assert.deepEqual(result.match.rosterPlayerKeys, []);
  assert.equal(result.match.rosterRevision, 2);
  assert.equal(result.roster.length, 0);
});

test("Starting XI fresh save writes revision 1 and stale update fails closed", async () => {
  const { ops } = await createMatchWithRoster();

  const first = await saveProClubStartingXI(
    CLUB,
    MATCH,
    startingXIPlan(),
    0,
    ops,
  );

  assert.equal(first.revision, 1);
  assert.equal(first.matchRosterRevision, 12);
  assert.equal(first.updatedBy, HEAD);

  await assert.rejects(
    saveProClubStartingXI(
      CLUB,
      MATCH,
      { ...startingXIPlan(), coachNotes: "stale write" },
      0,
      ops,
    ),
    /Stale Starting XI revision/,
  );

  const current = await getProClubStartingXI(CLUB, MATCH, ops);
  assert.equal(current?.revision, 1);
  assert.equal(current?.coachNotes, "");
});

test("Starting XI update advances exactly one revision", async () => {
  const { ops } = await createMatchWithRoster();
  await saveProClubStartingXI(CLUB, MATCH, startingXIPlan(), 0, ops);

  const updated = await saveProClubStartingXI(
    CLUB,
    MATCH,
    { ...startingXIPlan(), coachNotes: "Updated" },
    1,
    ops,
  );

  assert.equal(updated.revision, 2);
  assert.equal(updated.coachNotes, "Updated");
  assert.equal(updated.matchRosterRevision, 12);
});

test("Starting XI rejects a player outside the authoritative Match roster", async () => {
  const { ops } = await createMatchWithRoster(11);
  const invalid = startingXIPlan();

  await assert.rejects(
    saveProClubStartingXI(CLUB, MATCH, invalid, 0, ops),
    /outside the authoritative Match roster/,
  );
});

test("Starting XI is locked once Match is IN_PROGRESS", async () => {
  const { ops, docs } = await createMatchWithRoster();
  const matchKey = `proClubs/${CLUB}/matches/${MATCH}`;
  const stored = docs.get(matchKey)!;
  docs.set(matchKey, {
    id: MATCH,
    data: {
      ...stored.data,
      status: "IN_PROGRESS",
      opponentName: "Opponent",
      kickoffAt: new Date(Date.UTC(2026, 8, 20, 11, 0, 0)),
      venueType: "HOME",
    },
  });

  await assert.rejects(
    saveProClubStartingXI(CLUB, MATCH, startingXIPlan(), 0, ops),
    /Starting XI is locked/,
  );
});

test("shootout remains mutable IN_PROGRESS and uses independent revision guard", async () => {
  const { ops, docs } = await createMatchWithRoster();
  const matchKey = `proClubs/${CLUB}/matches/${MATCH}`;
  const stored = docs.get(matchKey)!;
  docs.set(matchKey, {
    id: MATCH,
    data: {
      ...stored.data,
      status: "IN_PROGRESS",
      opponentName: "Opponent",
      kickoffAt: new Date(Date.UTC(2026, 8, 20, 11, 0, 0)),
      venueType: "HOME",
    },
  });

  const first = await saveProClubShootout(CLUB, MATCH, SHOOTOUT_PLAN, 0, ops);
  assert.equal(first.revision, 1);

  await assert.rejects(
    saveProClubShootout(CLUB, MATCH, SHOOTOUT_PLAN, 0, ops),
    /Stale shootout revision/,
  );

  const current = await getProClubShootout(CLUB, MATCH, ops);
  assert.equal(current?.revision, 1);
});

test("non-football authority cannot mutate Match persistence", async () => {
  const blockedAuthority: ProClubOrganizationAuthority = {
    ...AUTHORITY,
    staffRole: "ASSISTANT_COACH",
  };
  const { ops } = createHarness(blockedAuthority);

  await assert.rejects(
    createProClubMatch(CLUB, MATCH, MATCH_CORE, ops),
    /HEAD_COACH or TECHNICAL_DIRECTOR/,
  );
});

test("CUSTOM Starting XI persists and reads back slot coordinates, positions and labels", async () => {
  const { ops } = await createMatchWithRoster();
  const customSlots = createProClubCustomFormationSlotsFromFixed("4-3-3").map(
    (slot, index) =>
      index === 6
        ? { ...slot, x: 58, y: 42, position: "AM" as const, label: "Free 10" }
        : slot,
  );

  const saved = await saveProClubStartingXI(
    CLUB,
    MATCH,
    {
      ...startingXIPlan(),
      formation: "CUSTOM",
      customFormationSlots: customSlots,
    },
    0,
    ops,
  );

  assert.equal(saved.formation, "CUSTOM");
  assert.equal(saved.customFormationSlots?.[6].x, 58);
  assert.equal(saved.customFormationSlots?.[6].y, 42);
  assert.equal(saved.customFormationSlots?.[6].position, "AM");
  assert.equal(saved.customFormationSlots?.[6].label, "Free 10");

  const read = await getProClubStartingXI(CLUB, MATCH, ops);
  assert.deepEqual(read?.customFormationSlots, customSlots);
});

test("fixed Starting XI normalizes customFormationSlots to null on persistence", async () => {
  const { ops } = await createMatchWithRoster();
  const saved = await saveProClubStartingXI(
    CLUB,
    MATCH,
    startingXIPlan(),
    0,
    ops,
  );
  assert.equal(saved.customFormationSlots, null);
});
