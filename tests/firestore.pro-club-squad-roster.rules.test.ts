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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-squad-roster-v1";

const CLUB_A = "club-a";
const CLUB_B = "club-b";
const CLUB_INACTIVE = "club-inactive";

const HEAD_COACH = "head-coach-a";
const ASSISTANT = "assistant-a";
const OUTSIDER = "outsider";
const INACTIVE_USER = "inactive-user";
const INACTIVE_MEMBER = "inactive-member";
const INACTIVE_CLUB_HEAD = "inactive-club-head";

const PLAYER_1 = "player-1";
const PLAYER_2 = "player-2";
const PLAYER_3 = "player-3";
const PLAYER_4 = "player-4";
const FUT_1 = "FUT-PLAYER-001";
const FUT_2 = "FUT-PLAYER-002";
const FUT_3 = "FUT-PLAYER-003";
const FUT_4 = "FUT-PLAYER-004";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

function userData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return {
    role: "USER",
    status,
  };
}

function clubData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return {
    name: "Club",
    level: "T3",
    status,
  };
}

function membershipData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return {
    authorizationRole: "MEMBER",
    status,
  };
}

function staffData(
  staffRole: "HEAD_COACH" | "ASSISTANT_COACH",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): DocumentData {
  return {
    staffRole,
    status,
  };
}

function storedRosterData(
  status: "ACTIVE" | "INACTIVE" | "RELEASED" = "ACTIVE",
  futId: string | null = FUT_1,
): DocumentData {
  return {
    schemaVersion: 1,
    futId,
    firstName: "Max",
    lastName: "Coach",
    position: "CM",
    additionalPositions: ["DM", "AM"],
    jerseyNumber: 8,
    squadLabel: "First Team",
    status,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    createdBy: HEAD_COACH,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedBy: HEAD_COACH,
  };
}

function freshRosterData(
  futId: string | null = FUT_2,
  overrides: DocumentData = {},
): DocumentData {
  return {
    schemaVersion: 1,
    futId,
    firstName: "New",
    lastName: "Player",
    position: "CB",
    additionalPositions: ["RB"],
    jerseyNumber: 4,
    squadLabel: "First Team",
    status: "ACTIVE",
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
    ...overrides,
  };
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

async function seedBaseline(): Promise<void> {
  await seed([
    [`users/${HEAD_COACH}`, userData()],
    [`users/${ASSISTANT}`, userData()],
    [`users/${OUTSIDER}`, userData()],
    [`users/${INACTIVE_USER}`, userData("INACTIVE")],
    [`users/${INACTIVE_MEMBER}`, userData()],
    [`users/${INACTIVE_CLUB_HEAD}`, userData()],

    [`proClubs/${CLUB_A}`, clubData()],
    [`proClubs/${CLUB_B}`, clubData()],
    [`proClubs/${CLUB_INACTIVE}`, clubData("INACTIVE")],

    [`proClubs/${CLUB_A}/members/${HEAD_COACH}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${HEAD_COACH}`, staffData("HEAD_COACH")],

    [`proClubs/${CLUB_A}/members/${ASSISTANT}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${ASSISTANT}`, staffData("ASSISTANT_COACH")],

    [`proClubs/${CLUB_A}/members/${INACTIVE_USER}`, membershipData()],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_USER}`, staffData("HEAD_COACH")],

    [`proClubs/${CLUB_A}/members/${INACTIVE_MEMBER}`, membershipData("INACTIVE")],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_MEMBER}`, staffData("HEAD_COACH")],

    [`proClubs/${CLUB_INACTIVE}/members/${INACTIVE_CLUB_HEAD}`, membershipData()],
    [`proClubs/${CLUB_INACTIVE}/staff/${INACTIVE_CLUB_HEAD}`, staffData("HEAD_COACH")],

    [`futIdRegistry/${FUT_1}`, { schemaVersion: 1, futId: FUT_1, playerKey: PLAYER_1 }],
    [`futIdRegistry/${FUT_2}`, { schemaVersion: 1, futId: FUT_2, playerKey: PLAYER_2 }],
    [`futIdRegistry/${FUT_3}`, { schemaVersion: 1, futId: FUT_3, playerKey: PLAYER_3 }],
    [`futIdRegistry/${FUT_4}`, { schemaVersion: 1, futId: FUT_4, playerKey: PLAYER_4 }],

    [`proClubs/${CLUB_A}/players/${PLAYER_1}`, storedRosterData()],
  ]);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");

  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  assert.ok(host && Number.isInteger(port), "Invalid FIRESTORE_EMULATOR_HOST.");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
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

test("active Pro Club staff can get and list the canonical roster", async () => {
  for (const uid of [HEAD_COACH, ASSISTANT]) {
    const db = authedDb(uid);
    const player = await assertSucceeds(
      getDoc(doc(db, "proClubs", CLUB_A, "players", PLAYER_1)),
    );
    assert.equal(player.exists(), true);

    const roster = await assertSucceeds(
      getDocs(collection(db, "proClubs", CLUB_A, "players")),
    );
    assert.equal(roster.docs.length, 1);
  }
});

test("anonymous outsider inactive user inactive member and inactive club fail closed", async () => {
  await assertFails(
    getDoc(doc(anonymousDb(), "proClubs", CLUB_A, "players", PLAYER_1)),
  );

  for (const uid of [OUTSIDER, INACTIVE_USER, INACTIVE_MEMBER]) {
    await assertFails(
      getDoc(doc(authedDb(uid), "proClubs", CLUB_A, "players", PLAYER_1)),
    );
  }

  await assertFails(
    getDocs(collection(authedDb(INACTIVE_CLUB_HEAD), "proClubs", CLUB_INACTIVE, "players")),
  );
});

test("tenant authority does not cross club boundaries", async () => {
  await assertFails(
    getDocs(collection(authedDb(HEAD_COACH), "proClubs", CLUB_B, "players")),
  );
  await assertFails(
    setDoc(
      doc(authedDb(HEAD_COACH), "proClubs", CLUB_B, "players", PLAYER_2),
      freshRosterData(),
    ),
  );
});

test("Head Coach creates ACTIVE provisional roster record with null FUTID", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", "provisional-player"),
      freshRosterData(null),
    ),
  );
});

test("Head Coach creates roster record only when FUTID registry maps exact playerKey", async () => {
  await assertSucceeds(
    setDoc(
      doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", PLAYER_2),
      freshRosterData(FUT_2),
    ),
  );

  await assertFails(
    setDoc(
      doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", "wrong-player"),
      freshRosterData(FUT_3),
    ),
  );
});

test("create rejects non-ACTIVE status unknown fields and non-canonical positions", async () => {
  const db = authedDb(HEAD_COACH);

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "players", PLAYER_2),
      freshRosterData(FUT_2, { status: "INACTIVE" }),
    ),
  );

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "players", PLAYER_2),
      freshRosterData(FUT_2, { clubId: CLUB_A }),
    ),
  );

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "players", PLAYER_2),
      freshRosterData(FUT_2, { position: "MIDFIELDER" }),
    ),
  );
});

test("create rejects invalid additional positions and audit identity", async () => {
  const db = authedDb(HEAD_COACH);

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "players", PLAYER_2),
      freshRosterData(FUT_2, { additionalPositions: ["CB", "CB"] }),
    ),
  );

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "players", PLAYER_2),
      freshRosterData(FUT_2, { createdBy: ASSISTANT }),
    ),
  );
});

test("non-Head-Coach staff is read-only", async () => {
  const db = authedDb(ASSISTANT);

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "players", PLAYER_2),
      {
        ...freshRosterData(FUT_2),
        createdBy: ASSISTANT,
        updatedBy: ASSISTANT,
      },
    ),
  );

  await assertFails(
    updateDoc(doc(db, "proClubs", CLUB_A, "players", PLAYER_1), {
      jerseyNumber: 9,
      updatedAt: serverTimestamp(),
      updatedBy: ASSISTANT,
    }),
  );
});

test("Head Coach may move ACTIVE to INACTIVE and RELEASED", async () => {
  const db = authedDb(HEAD_COACH);

  await assertSucceeds(
    updateDoc(doc(db, "proClubs", CLUB_A, "players", PLAYER_1), {
      status: "INACTIVE",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );

  await assertSucceeds(
    updateDoc(doc(db, "proClubs", CLUB_A, "players", PLAYER_1), {
      status: "RELEASED",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("RELEASED is terminal", async () => {
  await seed([
    [`proClubs/${CLUB_A}/players/${PLAYER_3}`, storedRosterData("RELEASED", FUT_3)],
  ]);

  await assertFails(
    updateDoc(doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", PLAYER_3), {
      status: "ACTIVE",
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("null FUTID may bind once to exact canonical registry mapping", async () => {
  await seed([
    [`proClubs/${CLUB_A}/players/${PLAYER_4}`, storedRosterData("ACTIVE", null)],
  ]);

  await assertSucceeds(
    updateDoc(doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", PLAYER_4), {
      futId: FUT_4,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("existing non-null FUTID cannot be replaced and must retain canonical mapping", async () => {
  await assertFails(
    updateDoc(doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", PLAYER_1), {
      futId: FUT_2,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "futIdRegistry", FUT_1), {
      schemaVersion: 1,
      futId: FUT_1,
      playerKey: "different-player",
    });
  });

  await assertFails(
    updateDoc(doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", PLAYER_1), {
      jerseyNumber: 10,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("create audit fields are immutable and updates require current actor audit", async () => {
  const db = authedDb(HEAD_COACH);

  await assertFails(
    updateDoc(doc(db, "proClubs", CLUB_A, "players", PLAYER_1), {
      createdBy: ASSISTANT,
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );

  await assertFails(
    updateDoc(doc(db, "proClubs", CLUB_A, "players", PLAYER_1), {
      jerseyNumber: 9,
      updatedAt: serverTimestamp(),
      updatedBy: ASSISTANT,
    }),
  );
});

test("physical roster delete is forbidden", async () => {
  await assertFails(
    deleteDoc(doc(authedDb(HEAD_COACH), "proClubs", CLUB_A, "players", PLAYER_1)),
  );
});

test("FUTID registry remains non-readable to client roster actors", async () => {
  await assertFails(
    getDoc(doc(authedDb(HEAD_COACH), "futIdRegistry", FUT_1)),
  );
});

test("Head Coach may create and update roster records with a null unconfirmed primary position", async () => {
  const db = authedDb(HEAD_COACH);
  const pendingPath = doc(db, "proClubs", CLUB_A, "players", "position-pending");

  await assertSucceeds(
    setDoc(
      pendingPath,
      freshRosterData(null, {
        position: null,
        additionalPositions: [],
        jerseyNumber: 3,
      }),
    ),
  );

  await assertSucceeds(
    updateDoc(pendingPath, {
      position: "LB",
      additionalPositions: [],
      updatedAt: serverTimestamp(),
      updatedBy: HEAD_COACH,
    }),
  );
});

test("null primary position rejects additional positions and fake position sentinels", async () => {
  const db = authedDb(HEAD_COACH);

  await assertFails(
    setDoc(
      doc(db, "proClubs", CLUB_A, "players", "null-with-additional"),
      freshRosterData(null, {
        position: null,
        additionalPositions: ["LB"],
      }),
    ),
  );

  for (const position of ["", "UNKNOWN", "UNSPECIFIED", "MIDFIELDER"]) {
    await assertFails(
      setDoc(
        doc(db, "proClubs", CLUB_A, "players", `fake-${position || "empty"}`),
        freshRosterData(null, {
          position,
          additionalPositions: [],
        }),
      ),
    );
  }
});
