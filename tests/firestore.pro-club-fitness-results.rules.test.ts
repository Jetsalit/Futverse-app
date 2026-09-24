import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const PROJECT_ID = "demo-futverse-pro-club-fitness-results-v1";

const CLUB_ID = "club-a";
const CLUB_B_ID = "club-b";
const INACTIVE_CLUB_ID = "club-inactive";
const FITNESS_COACH = "fitness-coach-a";
const FITNESS_COACH_B = "fitness-coach-b";
const HEAD_COACH = "head-coach-a";
const TECHNICAL_DIRECTOR = "technical-director-a";
const ASSISTANT_COACH = "assistant-coach-a";
const GK_COACH = "gk-coach-a";
const ANALYST = "analyst-a";
const PHYSIO = "physio-a";
const MANAGER = "manager-a";
const TEAM_MANAGER = "team-manager-a";
const OTHER_STAFF = "other-staff-a";
const INACTIVE_ACCOUNT = "inactive-account";
const INACTIVE_MEMBERSHIP = "inactive-membership";
const INACTIVE_STAFF = "inactive-staff";
const INACTIVE_CLUB_STAFF = "inactive-club-staff";
const NONSTAFF_MEMBER = "nonstaff-member";
const PLAYER_KEY = "player-key-a";
const PLAYER_KEY_INACTIVE = "player-key-inactive";
const PLAYER_KEY_RELEASED = "player-key-released";
const PLAYER_KEY_B = "player-key-b";
const MALFORMED_PLAYER_KEY = " player-key-malformed";
const DEFINITION_ID = "football:speed_10m:v1";
const OBSERVED_ON = "2026-09-24";

const OTHER_STAFF_ACTORS = [
  { uid: TECHNICAL_DIRECTOR, staffRole: "TECHNICAL_DIRECTOR" },
  { uid: MANAGER, staffRole: "MANAGER" },
  { uid: HEAD_COACH, staffRole: "HEAD_COACH" },
  { uid: ASSISTANT_COACH, staffRole: "ASSISTANT_COACH" },
  { uid: GK_COACH, staffRole: "GK_COACH" },
  { uid: ANALYST, staffRole: "ANALYST" },
  { uid: PHYSIO, staffRole: "PHYSIO" },
  { uid: TEAM_MANAGER, staffRole: "TEAM_MANAGER" },
  { uid: OTHER_STAFF, staffRole: "STAFF" },
] as const;

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function anonymousDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

function resultDocumentId(data: Record<string, unknown>): string {
  const playerKey = data.playerKey;
  const observedOn = data.observedOn;
  const definitionId = data.definitionId;
  const definitionVersion = data.definitionVersion;
  if (
    typeof playerKey !== "string" ||
    typeof observedOn !== "string" ||
    typeof definitionId !== "string" ||
    (typeof definitionVersion !== "number" &&
      typeof definitionVersion !== "string")
  ) {
    throw new Error("Cannot calculate a Fitness result ID for invalid identity data.");
  }

  const seed =
    `fitness-result-v1|${Buffer.byteLength(playerKey, "utf8")}:${playerKey}|` +
    `${observedOn}|${Buffer.byteLength(definitionId, "utf8")}:${definitionId}|` +
    String(definitionVersion);
  return `fit-v1-${createHash("sha256").update(seed, "utf8").digest("hex")}`;
}

function rosterData(
  status: "ACTIVE" | "INACTIVE" | "RELEASED" = "ACTIVE",
): DocumentData {
  const createdAt = new Date("2026-09-01T00:00:00.000Z");
  return {
    schemaVersion: 1,
    futId: null,
    firstName: "Test",
    lastName: "Player",
    position: "CM",
    additionalPositions: ["DM", "AM"],
    jerseyNumber: 8,
    squadLabel: "First Team",
    status,
    createdAt,
    createdBy: FITNESS_COACH,
    updatedAt: createdAt,
    updatedBy: FITNESS_COACH,
  };
}

function userData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { role: "USER", status };
}

function clubData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { name: "Club", level: "T3", status };
}

function membershipData(status: "ACTIVE" | "INACTIVE" = "ACTIVE"): DocumentData {
  return { authorizationRole: "MEMBER", status };
}

function staffData(
  staffRole: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): DocumentData {
  return { staffRole, status };
}

function fitnessResultData(
  actorUid = FITNESS_COACH,
  overrides: Record<string, unknown> = {},
): DocumentData {
  return {
    schemaVersion: 1,
    playerKey: PLAYER_KEY,
    definitionId: DEFINITION_ID,
    definitionVersion: 1,
    value: 1.82,
    observedOn: OBSERVED_ON,
    source: "PRO_CLUB_FITNESS_ENTRY",
    recordedAt: serverTimestamp(),
    recordedBy: actorUid,
    ...overrides,
  };
}

function resultRef(db: Firestore, clubId: string, resultId: string) {
  return doc(db, "proClubs", clubId, "fitnessResults", resultId);
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(
      entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)),
    );
  });
}

async function seedStoredResult(
  clubId: string,
  data: DocumentData,
): Promise<string> {
  const resultId = resultDocumentId(data);
  await seed([
    [
      `proClubs/${clubId}/fitnessResults/${resultId}`,
      { ...data, recordedAt: new Date("2026-09-24T12:00:00.000Z") },
    ],
  ]);
  return resultId;
}

function createResult(
  actorUid: string,
  clubId: string,
  data: DocumentData,
  resultId = resultDocumentId(data),
) {
  return setDoc(resultRef(authedDb(actorUid), clubId, resultId), data);
}

async function seedBaseline(): Promise<void> {
  const entries: Array<[string, DocumentData]> = [
    [`proClubs/${CLUB_ID}`, clubData()],
    [`proClubs/${CLUB_B_ID}`, clubData()],
    [`proClubs/${INACTIVE_CLUB_ID}`, clubData("INACTIVE")],
  ];

  for (const actor of [
    { uid: FITNESS_COACH, staffRole: "FITNESS_COACH" },
    ...OTHER_STAFF_ACTORS,
  ]) {
    entries.push([`users/${actor.uid}`, userData()]);
    entries.push([
      `proClubs/${CLUB_ID}/members/${actor.uid}`,
      membershipData(),
    ]);
    entries.push([
      `proClubs/${CLUB_ID}/staff/${actor.uid}`,
      staffData(actor.staffRole),
    ]);
  }

  entries.push([`users/${INACTIVE_MEMBERSHIP}`, userData()]);
  entries.push([`users/${INACTIVE_STAFF}`, userData()]);
  entries.push([`users/${INACTIVE_ACCOUNT}`, userData("INACTIVE")]);
  entries.push([
    `proClubs/${CLUB_ID}/members/${INACTIVE_ACCOUNT}`,
    membershipData(),
  ]);
  entries.push([
    `proClubs/${CLUB_ID}/staff/${INACTIVE_ACCOUNT}`,
    staffData("FITNESS_COACH"),
  ]);

  entries.push([`proClubs/${CLUB_ID}/members/${INACTIVE_MEMBERSHIP}`, membershipData("INACTIVE")]);
  entries.push([`proClubs/${CLUB_ID}/staff/${INACTIVE_MEMBERSHIP}`, staffData("FITNESS_COACH")]);
  entries.push([`proClubs/${CLUB_ID}/members/${INACTIVE_STAFF}`, membershipData()]);
  entries.push([`proClubs/${CLUB_ID}/staff/${INACTIVE_STAFF}`, staffData("FITNESS_COACH", "INACTIVE")]);

  entries.push([`users/${FITNESS_COACH_B}`, userData()]);
  entries.push([`proClubs/${CLUB_B_ID}/members/${FITNESS_COACH_B}`, membershipData()]);
  entries.push([`proClubs/${CLUB_B_ID}/staff/${FITNESS_COACH_B}`, staffData("FITNESS_COACH")]);

  entries.push([`users/${INACTIVE_CLUB_STAFF}`, userData()]);
  entries.push([`proClubs/${INACTIVE_CLUB_ID}/members/${INACTIVE_CLUB_STAFF}`, membershipData()]);
  entries.push([`proClubs/${INACTIVE_CLUB_ID}/staff/${INACTIVE_CLUB_STAFF}`, staffData("FITNESS_COACH")]);

  entries.push([`users/${NONSTAFF_MEMBER}`, userData()]);
  entries.push([`proClubs/${CLUB_ID}/members/${NONSTAFF_MEMBER}`, membershipData()]);

  entries.push([`proClubs/${CLUB_ID}/players/${PLAYER_KEY}`, rosterData()]);
  entries.push([`proClubs/${CLUB_ID}/players/${PLAYER_KEY_INACTIVE}`, rosterData("INACTIVE")]);
  entries.push([`proClubs/${CLUB_ID}/players/${PLAYER_KEY_RELEASED}`, rosterData("RELEASED")]);
  entries.push([`proClubs/${CLUB_ID}/players/${MALFORMED_PLAYER_KEY}`, rosterData()]);
  entries.push([`proClubs/${CLUB_B_ID}/players/${PLAYER_KEY_B}`, rosterData()]);
  entries.push([`proClubs/${INACTIVE_CLUB_ID}/players/${PLAYER_KEY}`, rosterData()]);

  await seed(entries);
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

test("active Pro Club FITNESS_COACH can create a canonical Fitness result", async () => {
  const data = {
    schemaVersion: 1,
    playerKey: PLAYER_KEY,
    definitionId: DEFINITION_ID,
    definitionVersion: 1,
    value: 1.82,
    observedOn: OBSERVED_ON,
    source: "PRO_CLUB_FITNESS_ENTRY",
    recordedAt: serverTimestamp(),
    recordedBy: FITNESS_COACH,
  };
  const resultId = resultDocumentId({
    playerKey: data.playerKey,
    observedOn: data.observedOn,
    definitionId: data.definitionId,
    definitionVersion: data.definitionVersion,
  });

  await assertSucceeds(
    setDoc(
      doc(authedDb(FITNESS_COACH), "proClubs", CLUB_ID, "fitnessResults", resultId),
      data,
    ),
  );
});

test("active FITNESS_COACH can create a result for an INACTIVE roster player", async () => {
  const data = fitnessResultData(FITNESS_COACH, {
    playerKey: PLAYER_KEY_INACTIVE,
    definitionId: "football:inactive_player_test:v1",
  });

  await assertSucceeds(createResult(FITNESS_COACH, CLUB_ID, data));
});

test("active Pro Club staff can read results, including RELEASED-player history", async () => {
  const data = fitnessResultData(FITNESS_COACH, {
    playerKey: PLAYER_KEY_RELEASED,
  });
  const resultId = await seedStoredResult(CLUB_ID, data);

  for (const actorUid of [
    FITNESS_COACH,
    ...OTHER_STAFF_ACTORS.map((actor) => actor.uid),
  ]) {
    const db = authedDb(actorUid);
    const result = await assertSucceeds(
      getDoc(resultRef(db, CLUB_ID, resultId)),
    );
    assert.equal(result.exists(), true);

    const results = await assertSucceeds(
      getDocs(collection(db, "proClubs", CLUB_ID, "fitnessResults")),
    );
    assert.equal(results.size, 1);
  }
});

test("only active FITNESS_COACH staff may create results", async () => {
  for (const [index, actor] of OTHER_STAFF_ACTORS.entries()) {
    const data = fitnessResultData(actor.uid, {
      definitionId: `football:role-denial-${index}:v1`,
    });
    await assertFails(createResult(actor.uid, CLUB_ID, data));
  }
});

test("create and read require active account, club, Membership, and Staff", async () => {
  const cases = [
    { uid: INACTIVE_ACCOUNT, clubId: CLUB_ID, tag: "inactive-account" },
    { uid: INACTIVE_MEMBERSHIP, clubId: CLUB_ID, tag: "inactive-membership" },
    { uid: INACTIVE_STAFF, clubId: CLUB_ID, tag: "inactive-staff" },
    { uid: INACTIVE_CLUB_STAFF, clubId: INACTIVE_CLUB_ID, tag: "inactive-club" },
  ];

  for (const actor of cases) {
    const createData = fitnessResultData(actor.uid, {
      definitionId: `football:create-${actor.tag}:v1`,
    });
    await assertFails(createResult(actor.uid, actor.clubId, createData));

    const storedData = fitnessResultData(FITNESS_COACH, {
      definitionId: `football:read-${actor.tag}:v1`,
    });
    const resultId = await seedStoredResult(actor.clubId, storedData);
    await assertFails(
      getDoc(resultRef(authedDb(actor.uid), actor.clubId, resultId)),
    );
  }
});

test("Fitness result creates and reads are bound to their Pro Club", async () => {
  const crossClubCreate = fitnessResultData(FITNESS_COACH_B, {
    definitionId: "football:cross-club-create:v1",
  });
  await assertFails(createResult(FITNESS_COACH_B, CLUB_ID, crossClubCreate));

  const storedData = fitnessResultData(FITNESS_COACH_B, {
    playerKey: PLAYER_KEY_B,
    definitionId: "football:cross-club-read:v1",
  });
  const resultId = await seedStoredResult(CLUB_B_ID, storedData);
  await assertFails(
    getDoc(resultRef(authedDb(FITNESS_COACH), CLUB_B_ID, resultId)),
  );
});

test("create requires a valid existing non-RELEASED canonical roster player", async () => {
  const missingPlayer = fitnessResultData(FITNESS_COACH, {
    playerKey: "player-key-missing",
    definitionId: "football:missing-player:v1",
  });
  await assertFails(createResult(FITNESS_COACH, CLUB_ID, missingPlayer));

  const releasedPlayer = fitnessResultData(FITNESS_COACH, {
    playerKey: PLAYER_KEY_RELEASED,
    definitionId: "football:released-player:v1",
  });
  await assertFails(createResult(FITNESS_COACH, CLUB_ID, releasedPlayer));

  const malformedPlayerKey = fitnessResultData(FITNESS_COACH, {
    playerKey: MALFORMED_PLAYER_KEY,
    definitionId: "football:malformed-player-key:v1",
  });
  await assertFails(createResult(FITNESS_COACH, CLUB_ID, malformedPlayerKey));
});

test("create rejects invalid Fitness definitions, values, dates, and exact schema", async () => {
  const invalidCases: Array<[string, Record<string, unknown>]> = [
    ["malformed definitionId", { definitionId: " football:speed_10m:v1" }],
    ["zero definitionVersion", { definitionVersion: 0 }],
    ["negative definitionVersion", { definitionVersion: -1 }],
    ["fractional definitionVersion", { definitionVersion: 1.5 }],
    ["string definitionVersion", { definitionVersion: "1" }],
    ["NaN value", { value: Number.NaN }],
    ["positive Infinity value", { value: Number.POSITIVE_INFINITY }],
    ["negative Infinity value", { value: Number.NEGATIVE_INFINITY }],
    ["invalid calendar date", { observedOn: "2026-02-29" }],
    ["wrong source", { source: "ACADEMY_BULK_ENTRY" }],
    ["wrong schemaVersion", { schemaVersion: 2 }],
    ["extra field", { unexpectedField: true }],
    ["spoofed recordedBy", { recordedBy: HEAD_COACH }],
    ["spoofed recordedAt", { recordedAt: new Date("2026-09-24T12:00:00.000Z") }],
  ];

  for (const [index, [label, overrides]] of invalidCases.entries()) {
    const data = fitnessResultData(FITNESS_COACH, {
      definitionId: `football:invalid-contract-${index}:v1`,
      ...overrides,
    });
    await assertFails(createResult(FITNESS_COACH, CLUB_ID, data), label);
  }

  const missingField = fitnessResultData(FITNESS_COACH, {
    definitionId: "football:missing-field:v1",
  });
  delete missingField.source;
  await assertFails(createResult(FITNESS_COACH, CLUB_ID, missingField));
});

test("create rejects an incorrect deterministic result ID", async () => {
  const data = fitnessResultData(FITNESS_COACH, {
    definitionId: "football:incorrect-result-id:v1",
  });
  const correctId = resultDocumentId(data);
  const incorrectId = `${correctId.slice(0, -1)}${correctId.endsWith("0") ? "1" : "0"}`;

  await assertFails(createResult(FITNESS_COACH, CLUB_ID, data, incorrectId));
});

test("the same observation cannot be created twice", async () => {
  const data = fitnessResultData(FITNESS_COACH, {
    definitionId: "football:duplicate-observation:v1",
  });

  await assertSucceeds(createResult(FITNESS_COACH, CLUB_ID, data));
  await assertFails(createResult(FITNESS_COACH, CLUB_ID, data));
});

test("Fitness results cannot be updated or deleted", async () => {
  const updateData = fitnessResultData(FITNESS_COACH, {
    definitionId: "football:update-denied:v1",
  });
  const updateId = resultDocumentId(updateData);
  const updateRef = resultRef(authedDb(FITNESS_COACH), CLUB_ID, updateId);
  await assertSucceeds(createResult(FITNESS_COACH, CLUB_ID, updateData));
  await assertFails(updateDoc(updateRef, { value: 1.9 }));

  const deleteData = fitnessResultData(FITNESS_COACH, {
    definitionId: "football:delete-denied:v1",
  });
  const deleteId = resultDocumentId(deleteData);
  const deleteRef = resultRef(authedDb(FITNESS_COACH), CLUB_ID, deleteId);
  await assertSucceeds(createResult(FITNESS_COACH, CLUB_ID, deleteData));
  await assertFails(deleteDoc(deleteRef));
});

test("nonstaff members and anonymous users cannot read results", async () => {
  const resultId = await seedStoredResult(
    CLUB_ID,
    fitnessResultData(FITNESS_COACH, {
      definitionId: "football:read-denials:v1",
    }),
  );

  await assertFails(
    getDoc(resultRef(authedDb(NONSTAFF_MEMBER), CLUB_ID, resultId)),
  );
  await assertFails(
    getDoc(resultRef(anonymousDb(), CLUB_ID, resultId)),
  );
});
