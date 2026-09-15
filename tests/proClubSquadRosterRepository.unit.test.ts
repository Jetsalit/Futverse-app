import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentData } from "firebase/firestore";

import {
  createProClubSquadRosterPlayer,
  getProClubSquadRosterPlayer,
  listProClubSquadRoster,
  updateProClubSquadRosterPlayer,
  type ProClubSquadRosterRepositoryOps,
} from "../src/lib/firestore/proClubSquadRosterRepository";
import type {
  ProClubOrganizationAuthority,
} from "../src/lib/firestore/proClubOrganizationAdapter";

const CLUB_ID = "club-a";
const HEAD_COACH_UID = "head-coach-a";
const PLAYER_KEY = "player-1";
const FUT_ID = "FUT-PLAYER-001";

const activeHeadCoachAuthority: ProClubOrganizationAuthority = {
  organizationId: CLUB_ID,
  organizationType: "PRO_CLUB",
  organizationName: "Club A",
  organizationLevel: "T3",
  organizationStatus: "ACTIVE",
  userId: HEAD_COACH_UID,
  membershipAuthorizationRole: "MEMBER",
  membershipStatus: "ACTIVE",
  hasMembershipAuthority: true,
  staffRole: "HEAD_COACH",
};

const validInput = {
  futId: FUT_ID,
  firstName: "Max",
  lastName: "Coach",
  position: "CM",
  additionalPositions: ["DM", "AM"],
  jerseyNumber: 8,
  squadLabel: "First Team",
  status: "ACTIVE",
} as const;

function key(path: readonly string[]): string {
  return path.join("/");
}

function makeOps(options?: {
  authority?: ProClubOrganizationAuthority;
  uid?: string | null;
  initial?: Record<string, DocumentData>;
}) {
  const documents = new Map<string, DocumentData>(
    Object.entries(options?.initial ?? {}),
  );
  const writes: Array<{
    kind: "create" | "update";
    path: string;
    data: DocumentData;
  }> = [];
  let tick = 0;

  const ops: ProClubSquadRosterRepositoryOps = {
    getAuthenticatedUid() {
      return options?.uid === undefined
        ? HEAD_COACH_UID
        : options.uid;
    },

    async resolveAuthority() {
      return {
        state: "FOUND",
        value: options?.authority ?? activeHeadCoachAuthority,
      };
    },

    async readDocument(path) {
      const pathKey = key(path);
      const data = documents.get(pathKey);
      return {
        id: path[path.length - 1] ?? "",
        exists: data !== undefined,
        data,
      };
    },

    async listDocuments(path) {
      const prefix = `${key(path)}/`;
      const documentsInCollection = [...documents.entries()]
        .filter(([pathKey]) => {
          if (!pathKey.startsWith(prefix)) return false;
          return !pathKey.slice(prefix.length).includes("/");
        })
        .map(([pathKey, data]) => ({
          id: pathKey.slice(prefix.length),
          exists: true,
          data,
        }));

      return { documents: documentsInCollection };
    },

    async createDocument(path, data) {
      const pathKey = key(path);
      writes.push({ kind: "create", path: pathKey, data });
      documents.set(pathKey, { ...data });
    },

    async updateDocument(path, data) {
      const pathKey = key(path);
      const existing = documents.get(pathKey);
      assert.ok(existing, "test setup requires an existing roster document");
      writes.push({ kind: "update", path: pathKey, data });
      documents.set(pathKey, {
        ...existing,
        ...data,
      });
    },

    timestamp() {
      tick += 1;
      return { testTimestamp: tick };
    },
  };

  return { ops, documents, writes };
}

function rosterDocument(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    futId: FUT_ID,
    firstName: "Max",
    lastName: "Coach",
    position: "CM",
    additionalPositions: ["DM", "AM"],
    jerseyNumber: 8,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: { logical: "created" },
    createdBy: HEAD_COACH_UID,
    updatedAt: { logical: "updated" },
    updatedBy: HEAD_COACH_UID,
    ...overrides,
  };
}

test("active Pro Club staff can list the canonical club roster", async () => {
  const { ops } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: rosterDocument(),
    },
  });

  const records = await listProClubSquadRoster(CLUB_ID, ops);

  assert.equal(records.length, 1);
  assert.equal(records[0]?.playerKey, PLAYER_KEY);
  assert.equal(records[0]?.position, "CM");
});

test("roster read fails closed without active staff authority", async () => {
  const { ops } = makeOps({
    authority: {
      ...activeHeadCoachAuthority,
      staffRole: null,
    },
  });

  await assert.rejects(
    () => getProClubSquadRosterPlayer(CLUB_ID, PLAYER_KEY, ops),
    /active staff authority/i,
  );
});

test("Head Coach creates an ACTIVE roster player and read-back verifies it", async () => {
  const { ops, writes } = makeOps({
    initial: {
      [`futIdRegistry/${FUT_ID}`]: {
        schemaVersion: 1,
        futId: FUT_ID,
        playerKey: PLAYER_KEY,
      },
    },
  });

  const created = await createProClubSquadRosterPlayer(
    CLUB_ID,
    PLAYER_KEY,
    validInput,
    ops,
  );

  assert.equal(created.playerKey, PLAYER_KEY);
  assert.equal(created.futId, FUT_ID);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.kind, "create");
  assert.equal(
    writes[0]?.path,
    `proClubs/${CLUB_ID}/players/${PLAYER_KEY}`,
  );
});

test("create rejects a FUTID registry mapping for another playerKey", async () => {
  const { ops, writes } = makeOps({
    initial: {
      [`futIdRegistry/${FUT_ID}`]: {
        schemaVersion: 1,
        futId: FUT_ID,
        playerKey: "player-2",
      },
    },
  });

  await assert.rejects(
    () => createProClubSquadRosterPlayer(
      CLUB_ID,
      PLAYER_KEY,
      validInput,
      ops,
    ),
    /FUTID is not compatible/i,
  );
  assert.equal(writes.length, 0);
});

test("non-Head-Coach cannot create or update roster records", async () => {
  const assistantAuthority: ProClubOrganizationAuthority = {
    ...activeHeadCoachAuthority,
    staffRole: "ASSISTANT_COACH",
  };
  const { ops, writes } = makeOps({
    authority: assistantAuthority,
    initial: {
      [`futIdRegistry/${FUT_ID}`]: {
        schemaVersion: 1,
        futId: FUT_ID,
        playerKey: PLAYER_KEY,
      },
      [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: rosterDocument(),
    },
  });

  await assert.rejects(
    () => createProClubSquadRosterPlayer(
      CLUB_ID,
      "player-2",
      { ...validInput, futId: null },
      ops,
    ),
    /HEAD_COACH/,
  );

  await assert.rejects(
    () => updateProClubSquadRosterPlayer(
      CLUB_ID,
      PLAYER_KEY,
      validInput,
      ops,
    ),
    /HEAD_COACH/,
  );

  assert.equal(writes.length, 0);
});

test("update permits ACTIVE to INACTIVE while preserving create audit fields", async () => {
  const originalCreatedAt = { logical: "created" };
  const { ops, documents, writes } = makeOps({
    initial: {
      [`futIdRegistry/${FUT_ID}`]: {
        schemaVersion: 1,
        futId: FUT_ID,
        playerKey: PLAYER_KEY,
      },
      [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: rosterDocument({
        createdAt: originalCreatedAt,
      }),
    },
  });

  const updated = await updateProClubSquadRosterPlayer(
    CLUB_ID,
    PLAYER_KEY,
    {
      ...validInput,
      status: "INACTIVE",
    },
    ops,
  );

  assert.equal(updated.status, "INACTIVE");
  assert.equal(updated.createdBy, HEAD_COACH_UID);
  assert.deepEqual(updated.createdAt, originalCreatedAt);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.kind, "update");
  assert.equal(
    Object.prototype.hasOwnProperty.call(writes[0]?.data ?? {}, "createdAt"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(writes[0]?.data ?? {}, "createdBy"),
    false,
  );
  assert.equal(
    documents.get(`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`)?.status,
    "INACTIVE",
  );
});

test("RELEASED roster player cannot return to ACTIVE", async () => {
  const { ops, writes } = makeOps({
    initial: {
      [`futIdRegistry/${FUT_ID}`]: {
        schemaVersion: 1,
        futId: FUT_ID,
        playerKey: PLAYER_KEY,
      },
      [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: rosterDocument({
        status: "RELEASED",
      }),
    },
  });

  await assert.rejects(
    () => updateProClubSquadRosterPlayer(
      CLUB_ID,
      PLAYER_KEY,
      validInput,
      ops,
    ),
    /status transition/i,
  );
  assert.equal(writes.length, 0);
});

test("existing non-null FUTID cannot be replaced", async () => {
  const { ops, writes } = makeOps({
    initial: {
      [`futIdRegistry/FUT-PLAYER-002`]: {
        schemaVersion: 1,
        futId: "FUT-PLAYER-002",
        playerKey: PLAYER_KEY,
      },
      [`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`]: rosterDocument(),
    },
  });

  await assert.rejects(
    () => updateProClubSquadRosterPlayer(
      CLUB_ID,
      PLAYER_KEY,
      {
        ...validInput,
        futId: "FUT-PLAYER-002",
      },
      ops,
    ),
    /FUTID is not compatible/i,
  );
  assert.equal(writes.length, 0);
});
