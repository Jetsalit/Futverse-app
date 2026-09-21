import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-match-starting-xi-rules-v1";
const CLUB_A = "club-a";
const CLUB_B = "club-b";

const HEAD = "head-a";
const TECHNICAL_DIRECTOR = "technical-director-a";
const OWNER_ONLY = "owner-only-a";
const ASSISTANT = "assistant-a";
const WRONG_CLUB_HEAD = "head-b";
const OUTSIDER = "outsider";

const PLAYER_KEYS = Array.from({ length: 14 }, (_, index) => `p${index + 1}`);
const MATCH_ROSTER_KEYS = PLAYER_KEYS.slice(0, 13);
const FIXED_TIME = Timestamp.fromDate(new Date("2026-09-20T00:00:00.000Z"));

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv
    .authenticatedContext(uid)
    .firestore() as unknown as Firestore;
}

function clubData(name: string): DocumentData {
  return {
    name,
    level: "T3",
    status: "ACTIVE",
  };
}

function membershipData(
  authorizationRole: "OWNER" | "ADMIN" | "MEMBER" = "MEMBER",
): DocumentData {
  return {
    authorizationRole,
    status: "ACTIVE",
  };
}

function staffData(
  staffRole:
    | "TECHNICAL_DIRECTOR"
    | "HEAD_COACH"
    | "ASSISTANT_COACH",
): DocumentData {
  return {
    staffRole,
    status: "ACTIVE",
  };
}

function canonicalPlayerData(playerKey: string, index: number): DocumentData {
  return {
    schemaVersion: 1,
    futId: null,
    firstName: `Player${index + 1}`,
    lastName: "Test",
    position: index === 0 ? "GK" : null,
    additionalPositions: [],
    jerseyNumber: index + 1,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: FIXED_TIME,
    createdBy: "seed",
    updatedAt: FIXED_TIME,
    updatedBy: "seed",
  };
}

function matchData(
  status: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  rosterPlayerKeys: readonly string[] = MATCH_ROSTER_KEYS,
  rosterRevision = rosterPlayerKeys.length,
): DocumentData {
  const scheduled =
    status === "SCHEDULED" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED";

  return {
    schemaVersion: 1,
    status,
    squadLabel: "First Team",
    competitionName: "Thai League 3",
    opponentName: scheduled ? "Opponent FC" : null,
    kickoffAt: scheduled ? FIXED_TIME : null,
    venueType: scheduled ? "HOME" : null,
    rosterPlayerKeys: [...rosterPlayerKeys],
    rosterRevision,
    rosterMutationPlayerKey:
      rosterRevision === 0 ? null : rosterPlayerKeys.at(-1) ?? "p1",
    rosterMutationKind: rosterRevision === 0 ? null : "ADD",
    createdAt: FIXED_TIME,
    createdBy: HEAD,
    createdByRole: "HEAD_COACH",
    updatedAt: FIXED_TIME,
    updatedBy: HEAD,
    updatedByRole: "HEAD_COACH",
  };
}

function rosterSnapshotData(
  playerKey: string,
  index: number,
  actor = HEAD,
  actorRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR" = "HEAD_COACH",
  withServerTime = false,
): DocumentData {
  const timeValue = withServerTime ? serverTimestamp() : FIXED_TIME;
  const canonical = canonicalPlayerData(playerKey, index);

  return {
    schemaVersion: 1,
    playerKey,
    futId: canonical.futId,
    firstName: canonical.firstName,
    lastName: canonical.lastName,
    jerseyNumber: canonical.jerseyNumber,
    position: canonical.position,
    additionalPositions: canonical.additionalPositions,
    createdAt: timeValue,
    createdBy: actor,
    createdByRole: actorRole,
    updatedAt: timeValue,
    updatedBy: actor,
    updatedByRole: actorRole,
  };
}

function emptySetPieces(): DocumentData {
  return {
    CORNER_LEFT: null,
    CORNER_RIGHT: null,
    FREE_KICK_LEFT: null,
    FREE_KICK_RIGHT: null,
    THROW_IN_LEFT: null,
    THROW_IN_RIGHT: null,
    PENALTY: null,
  };
}

function startingXIData(
  actor: string,
  actorRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR",
  overrides: Partial<DocumentData> = {},
): DocumentData {
  return {
    schemaVersion: 1,
    formation: "4-3-3",
    slotPlayerKeys: PLAYER_KEYS.slice(0, 11),
    substitutePlayerKeys: PLAYER_KEYS.slice(11, 13),
    positionRoleAssignments: Array.from({ length: 11 }, () => null),
    setPieceAssignments: {
      ...emptySetPieces(),
      PENALTY: "p9",
    },
    gameModelSnapshot: {
      IN_POSSESSION: "Build through the first line",
      OUT_OF_POSSESSION: "Protect central space",
      TRANSITION_TO_ATTACK: "Attack forward when available",
      TRANSITION_TO_DEFEND: "Counter-press nearest options",
    },
    coachNotes: "",
    matchRosterRevision: 13,
    revision: 1,
    createdAt: serverTimestamp(),
    createdBy: actor,
    createdByRole: actorRole,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    updatedByRole: actorRole,
    ...overrides,
  };
}


function gameModelData(
  actor: string,
  actorRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR",
  revision = 1,
): DocumentData {
  return {
    schemaVersion: 1,
    phases: {
      IN_POSSESSION: "Build through midfield",
      OUT_OF_POSSESSION: "Protect central space",
      TRANSITION_TO_ATTACK: "Attack quickly",
      TRANSITION_TO_DEFEND: "Counter-press",
    },
    revision,
    createdAt: serverTimestamp(),
    createdBy: actor,
    createdByRole: actorRole,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    updatedByRole: actorRole,
  };
}

function shootoutData(
  actor: string,
  actorRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR",
  overrides: Partial<DocumentData> = {},
): DocumentData {
  return {
    schemaVersion: 1,
    primaryTakers: ["p1", "p2", "p3", "p4", "p5"],
    backupTakers: ["p6", "p7"],
    matchRosterRevision: 13,
    revision: 1,
    createdAt: serverTimestamp(),
    createdBy: actor,
    createdByRole: actorRole,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    updatedByRole: actorRole,
    ...overrides,
  };
}

function freshMatchCreateData(
  actor: string,
  actorRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR",
): DocumentData {
  return {
    schemaVersion: 1,
    status: "DRAFT",
    squadLabel: "First Team",
    competitionName: "Thai League 3",
    opponentName: null,
    kickoffAt: null,
    venueType: null,
    rosterPlayerKeys: [],
    rosterRevision: 0,
    rosterMutationPlayerKey: null,
    rosterMutationKind: null,
    createdAt: serverTimestamp(),
    createdBy: actor,
    createdByRole: actorRole,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    updatedByRole: actorRole,
  };
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) =>
        setDoc(doc(context.firestore(), path), data),
      ),
    );
  });
}

async function seedBaseline(): Promise<void> {
  const entries: Array<[string, DocumentData]> = [
    [`proClubs/${CLUB_A}`, clubData("Club A")],
    [`proClubs/${CLUB_B}`, clubData("Club B")],

    [`users/${HEAD}`, { role: "USER", status: "ACTIVE" }],
    [`users/${TECHNICAL_DIRECTOR}`, { role: "USER", status: "ACTIVE" }],
    [`users/${OWNER_ONLY}`, { role: "USER", status: "ACTIVE" }],
    [`users/${ASSISTANT}`, { role: "USER", status: "ACTIVE" }],
    [`users/${WRONG_CLUB_HEAD}`, { role: "USER", status: "ACTIVE" }],
    [`users/${OUTSIDER}`, { role: "USER", status: "ACTIVE" }],

    [`proClubs/${CLUB_A}/members/${HEAD}`, membershipData("MEMBER")],
    [`proClubs/${CLUB_A}/staff/${HEAD}`, staffData("HEAD_COACH")],

    [
      `proClubs/${CLUB_A}/members/${TECHNICAL_DIRECTOR}`,
      membershipData("MEMBER"),
    ],
    [
      `proClubs/${CLUB_A}/staff/${TECHNICAL_DIRECTOR}`,
      staffData("TECHNICAL_DIRECTOR"),
    ],

    [
      `proClubs/${CLUB_A}/members/${OWNER_ONLY}`,
      membershipData("OWNER"),
    ],

    [`proClubs/${CLUB_A}/members/${ASSISTANT}`, membershipData("MEMBER")],
    [
      `proClubs/${CLUB_A}/staff/${ASSISTANT}`,
      staffData("ASSISTANT_COACH"),
    ],

    [
      `proClubs/${CLUB_B}/members/${WRONG_CLUB_HEAD}`,
      membershipData("MEMBER"),
    ],
    [
      `proClubs/${CLUB_B}/staff/${WRONG_CLUB_HEAD}`,
      staffData("HEAD_COACH"),
    ],
  ];

  PLAYER_KEYS.forEach((playerKey, index) => {
    entries.push([
      `proClubs/${CLUB_A}/players/${playerKey}`,
      canonicalPlayerData(playerKey, index),
    ]);
  });

  await seed(entries);
}

async function seedMatch(
  matchId: string,
  status: "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  rosterKeys: readonly string[] = MATCH_ROSTER_KEYS,
): Promise<void> {
  const entries: Array<[string, DocumentData]> = [
    [
      `proClubs/${CLUB_A}/matches/${matchId}`,
      matchData(status, rosterKeys, rosterKeys.length),
    ],
  ];

  rosterKeys.forEach((playerKey) => {
    const index = PLAYER_KEYS.indexOf(playerKey);
    entries.push([
      `proClubs/${CLUB_A}/matches/${matchId}/roster/${playerKey}`,
      rosterSnapshotData(playerKey, index),
    ]);
  });

  await seed(entries);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  assert.ok(
    emulatorHost,
    "Rules tests must run through the Firestore Emulator.",
  );

  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));

  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(
        new URL("../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseline();
});

after(async () => {
  await testEnv.cleanup();
});

test("Head Coach and Technical Director can create DRAFT Match; OWNER-only and Assistant cannot", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(HEAD), "proClubs", CLUB_A, "matches", "match-head"),
      freshMatchCreateData(HEAD, "HEAD_COACH"),
    ),
  );

  await assertSucceeds(
    setDoc(
      doc(
        authedDb(TECHNICAL_DIRECTOR),
        "proClubs",
        CLUB_A,
        "matches",
        "match-td",
      ),
      freshMatchCreateData(TECHNICAL_DIRECTOR, "TECHNICAL_DIRECTOR"),
    ),
  );

  await assertFails(
    setDoc(
      doc(
        authedDb(OWNER_ONLY),
        "proClubs",
        CLUB_A,
        "matches",
        "match-owner-only",
      ),
      freshMatchCreateData(OWNER_ONLY, "HEAD_COACH"),
    ),
  );

  await assertFails(
    setDoc(
      doc(
        authedDb(ASSISTANT),
        "proClubs",
        CLUB_A,
        "matches",
        "match-assistant",
      ),
      freshMatchCreateData(ASSISTANT, "HEAD_COACH"),
    ),
  );
});

test("roster index cannot be changed without the matching atomic roster snapshot", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/matches/match-roster-add`,
      matchData("DRAFT", [], 0),
    ],
  ]);

  await assertFails(
    updateDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-roster-add",
      ),
      {
        rosterPlayerKeys: ["p1"],
        rosterRevision: 1,
        rosterMutationPlayerKey: "p1",
        rosterMutationKind: "ADD",
        updatedAt: serverTimestamp(),
        updatedBy: HEAD,
        updatedByRole: "HEAD_COACH",
      },
    ),
  );
});

test("atomic roster ADD succeeds only with a canonical active Pro Club snapshot", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/matches/match-roster-add`,
      matchData("DRAFT", [], 0),
    ],
  ]);

  const db = authedDb(HEAD);
  const batch = writeBatch(db);

  batch.update(
    doc(db, "proClubs", CLUB_A, "matches", "match-roster-add"),
    {
      rosterPlayerKeys: ["p1"],
      rosterRevision: 1,
      rosterMutationPlayerKey: "p1",
      rosterMutationKind: "ADD",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD,
      updatedByRole: "HEAD_COACH",
    },
  );

  batch.set(
    doc(
      db,
      "proClubs",
      CLUB_A,
      "matches",
      "match-roster-add",
      "roster",
      "p1",
    ),
    rosterSnapshotData("p1", 0, HEAD, "HEAD_COACH", true),
  );

  await assertSucceeds(batch.commit());

  const stored = await assertSucceeds(
    getDoc(
      doc(
        db,
        "proClubs",
        CLUB_A,
        "matches",
        "match-roster-add",
      ),
    ),
  );

  assert.deepEqual(stored.data()?.rosterPlayerKeys, ["p1"]);
});

test("atomic roster ADD rejects a fabricated player that is not in canonical Pro Club roster", async () => {
  await seed([
    [
      `proClubs/${CLUB_A}/matches/match-fake-player`,
      matchData("DRAFT", [], 0),
    ],
  ]);

  const db = authedDb(HEAD);
  const batch = writeBatch(db);

  batch.update(
    doc(db, "proClubs", CLUB_A, "matches", "match-fake-player"),
    {
      rosterPlayerKeys: ["p99"],
      rosterRevision: 1,
      rosterMutationPlayerKey: "p99",
      rosterMutationKind: "ADD",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD,
      updatedByRole: "HEAD_COACH",
    },
  );

  batch.set(
    doc(
      db,
      "proClubs",
      CLUB_A,
      "matches",
      "match-fake-player",
      "roster",
      "p99",
    ),
    {
      schemaVersion: 1,
      playerKey: "p99",
      futId: null,
      firstName: "Fabricated",
      lastName: "Player",
      jerseyNumber: 99,
      position: null,
      additionalPositions: [],
      createdAt: serverTimestamp(),
      createdBy: HEAD,
      createdByRole: "HEAD_COACH",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD,
      updatedByRole: "HEAD_COACH",
    },
  );

  await assertFails(batch.commit());
});

test("11-player Starting XI plus substitutes succeeds without per-player Rules reads", async () => {
  await seedMatch("match-xi", "DRAFT");

  await assertSucceeds(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-xi",
        "startingXI",
        "current",
      ),
      startingXIData(HEAD, "HEAD_COACH"),
    ),
  );
});

test("Starting XI fails closed for a canonical player outside the Match roster and for duplicate overlap", async () => {
  await seedMatch("match-xi-invalid", "DRAFT");

  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-xi-invalid",
        "startingXI",
        "current",
      ),
      startingXIData(HEAD, "HEAD_COACH", {
        slotPlayerKeys: [
          "p1", "p2", "p3", "p4", "p5", "p6",
          "p7", "p8", "p9", "p10", "p14",
        ],
      }),
    ),
  );

  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-xi-invalid",
        "startingXI",
        "current",
      ),
      startingXIData(HEAD, "HEAD_COACH", {
        substitutePlayerKeys: ["p11", "p12"],
      }),
    ),
  );
});

test("Starting XI rejects invalid Position Role Assignment values", async () => {
  await seedMatch("match-role-valid", "DRAFT");

  // Positive pair: a trimmed non-empty role value is contract-valid.
  await assertSucceeds(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-role-valid",
        "startingXI",
        "current",
      ),
      startingXIData(HEAD, "HEAD_COACH", {
        positionRoleAssignments: [
          "Build Up",
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      }),
    ),
  );

  await seedMatch("match-role-invalid", "DRAFT");

  // Negative pair: the same field fails on the explicit trim predicate.
  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-role-invalid",
        "startingXI",
        "current",
      ),
      startingXIData(HEAD, "HEAD_COACH", {
        positionRoleAssignments: [
          "Build Up",
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          "  not-trimmed  ",
        ],
      }),
    ),
  );
});

test("Technical Director can author Starting XI but wrong-club Head Coach and outsider cannot", async () => {
  await seedMatch("match-authority", "DRAFT");

  await assertSucceeds(
    setDoc(
      doc(
        authedDb(TECHNICAL_DIRECTOR),
        "proClubs",
        CLUB_A,
        "matches",
        "match-authority",
        "startingXI",
        "current",
      ),
      startingXIData(TECHNICAL_DIRECTOR, "TECHNICAL_DIRECTOR"),
    ),
  );

  await seedMatch("match-wrong-club", "DRAFT");

  await assertFails(
    setDoc(
      doc(
        authedDb(WRONG_CLUB_HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-wrong-club",
        "startingXI",
        "current",
      ),
      startingXIData(WRONG_CLUB_HEAD, "HEAD_COACH"),
    ),
  );

  await assertFails(
    setDoc(
      doc(
        authedDb(OUTSIDER),
        "proClubs",
        CLUB_A,
        "matches",
        "match-wrong-club",
        "shootout",
        "current",
      ),
      shootoutData(OUTSIDER, "HEAD_COACH"),
    ),
  );
});

test("Starting XI locks at IN_PROGRESS while shootout remains mutable until terminal Match state", async () => {
  await seedMatch("match-live", "IN_PROGRESS");
  await seedMatch("match-completed", "COMPLETED");

  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-live",
        "startingXI",
        "current",
      ),
      startingXIData(HEAD, "HEAD_COACH"),
    ),
  );

  await assertSucceeds(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-live",
        "shootout",
        "current",
      ),
      shootoutData(HEAD, "HEAD_COACH"),
    ),
  );

  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-completed",
        "shootout",
        "current",
      ),
      shootoutData(HEAD, "HEAD_COACH"),
    ),
  );
});

test("shootout rejects duplicate takers and players outside the Match roster", async () => {
  await seedMatch("match-shootout-invalid", "IN_PROGRESS");

  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-shootout-invalid",
        "shootout",
        "current",
      ),
      shootoutData(HEAD, "HEAD_COACH", {
        primaryTakers: ["p1", "p1"],
      }),
    ),
  );

  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-shootout-invalid",
        "shootout",
        "current",
      ),
      shootoutData(HEAD, "HEAD_COACH", {
        backupTakers: ["p14"],
      }),
    ),
  );
});

test("roster REMOVE fails while the player is still referenced by Starting XI", async () => {
  await seedMatch("match-remove", "DRAFT", ["p1"]);

  await seed([
    [
      `proClubs/${CLUB_A}/matches/match-remove/startingXI/current`,
      {
        schemaVersion: 1,
        formation: "4-3-3",
        slotPlayerKeys: [
          "p1", null, null, null, null, null,
          null, null, null, null, null,
        ],
        substitutePlayerKeys: [],
        positionRoleAssignments: Array.from({ length: 11 }, () => null),
        setPieceAssignments: emptySetPieces(),
        coachNotes: "",
        matchRosterRevision: 1,
        revision: 1,
        createdAt: FIXED_TIME,
        createdBy: HEAD,
        createdByRole: "HEAD_COACH",
        updatedAt: FIXED_TIME,
        updatedBy: HEAD,
        updatedByRole: "HEAD_COACH",
      },
    ],
  ]);

  const db = authedDb(HEAD);
  const batch = writeBatch(db);

  batch.update(
    doc(db, "proClubs", CLUB_A, "matches", "match-remove"),
    {
      rosterPlayerKeys: [],
      rosterRevision: 2,
      rosterMutationPlayerKey: "p1",
      rosterMutationKind: "REMOVE",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD,
      updatedByRole: "HEAD_COACH",
    },
  );

  batch.delete(
    doc(
      db,
      "proClubs",
      CLUB_A,
      "matches",
      "match-remove",
      "roster",
      "p1",
    ),
  );

  await assertFails(batch.commit());
});

test("Starting XI and shootout documents cannot be hard-deleted", async () => {
  await seedMatch("match-delete", "DRAFT");

  await seed([
    [
      `proClubs/${CLUB_A}/matches/match-delete/startingXI/current`,
      {
        ...startingXIData(HEAD, "HEAD_COACH"),
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
      },
    ],
    [
      `proClubs/${CLUB_A}/matches/match-delete/shootout/current`,
      {
        ...shootoutData(HEAD, "HEAD_COACH"),
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
      },
    ],
  ]);

  await assertFails(
    deleteDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-delete",
        "startingXI",
        "current",
      ),
    ),
  );

  await assertFails(
    deleteDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-delete",
        "shootout",
        "current",
      ),
    ),
  );
});

test("Game Model master is readable by active staff and writable only by Head Coach or Technical Director", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(HEAD), "proClubs", CLUB_A, "gameModel", "current"),
      gameModelData(HEAD, "HEAD_COACH"),
    ),
  );

  await assertSucceeds(
    getDoc(
      doc(authedDb(ASSISTANT), "proClubs", CLUB_A, "gameModel", "current"),
    ),
  );

  await seed([
    [
      `proClubs/${CLUB_A}/gameModel/current`,
      {
        ...gameModelData(HEAD, "HEAD_COACH"),
        createdAt: FIXED_TIME,
        updatedAt: FIXED_TIME,
      },
    ],
  ]);

  await assertSucceeds(
    updateDoc(
      doc(authedDb(TECHNICAL_DIRECTOR), "proClubs", CLUB_A, "gameModel", "current"),
      {
        phases: {
          IN_POSSESSION: "Updated",
          OUT_OF_POSSESSION: "",
          TRANSITION_TO_ATTACK: "",
          TRANSITION_TO_DEFEND: "",
        },
        revision: 2,
        updatedAt: serverTimestamp(),
        updatedBy: TECHNICAL_DIRECTOR,
        updatedByRole: "TECHNICAL_DIRECTOR",
      },
    ),
  );

  await assertFails(
    updateDoc(
      doc(authedDb(ASSISTANT), "proClubs", CLUB_A, "gameModel", "current"),
      {
        phases: {
          IN_POSSESSION: "Assistant edit",
          OUT_OF_POSSESSION: "",
          TRANSITION_TO_ATTACK: "",
          TRANSITION_TO_DEFEND: "",
        },
        revision: 3,
        updatedAt: serverTimestamp(),
        updatedBy: ASSISTANT,
        updatedByRole: "HEAD_COACH",
      },
    ),
  );
});

test("Game Model rejects extra phases and Starting XI requires an exact four-phase snapshot", async () => {
  await assertFails(
    setDoc(
      doc(authedDb(HEAD), "proClubs", CLUB_A, "gameModel", "current"),
      {
        ...gameModelData(HEAD, "HEAD_COACH"),
        phases: {
          IN_POSSESSION: "",
          OUT_OF_POSSESSION: "",
          TRANSITION_TO_ATTACK: "",
          TRANSITION_TO_DEFEND: "",
          SET_PIECES: "",
        },
      },
    ),
  );

  await seedMatch("match-game-model-invalid", "DRAFT");

  await assertFails(
    setDoc(
      doc(
        authedDb(HEAD),
        "proClubs",
        CLUB_A,
        "matches",
        "match-game-model-invalid",
        "startingXI",
        "current",
      ),
      startingXIData(HEAD, "HEAD_COACH", {
        gameModelSnapshot: {
          IN_POSSESSION: "",
          OUT_OF_POSSESSION: "",
          TRANSITION_TO_ATTACK: "",
        },
      }),
    ),
  );
});
