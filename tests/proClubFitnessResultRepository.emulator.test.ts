import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";

import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../src/lib/fitnessTestFoundation";
import {
  createFirestoreProClubFitnessResultRepositoryOps,
  createProClubFitnessResult,
  listProClubFitnessResultHistory,
  listProClubFitnessResultsForDate,
} from "../src/lib/firestore/proClubFitnessResultRepository";
import type { ProClubOrganizationAuthorityResult } from "../src/lib/firestore/proClubOrganizationAdapter";

const PROJECT_ID = "demo-futverse-pro-club-fitness-results-runtime-v1";
const CLUB_ID = "club-a";
const FITNESS_COACH = "fitness-coach-a";
const PLAYER_KEY = "player-key-a";
const OBSERVED_ON = "2026-09-24";

let testEnv: RulesTestEnvironment;

function authenticatedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function authority(uid: string, clubId = CLUB_ID): ProClubOrganizationAuthorityResult {
  return {
    state: "FOUND",
    value: {
      organizationId: clubId,
      organizationType: "PRO_CLUB",
      organizationName: "Test United",
      organizationLevel: "T1",
      organizationStatus: "ACTIVE",
      userId: uid,
      membershipAuthorizationRole: "MEMBER",
      membershipStatus: "ACTIVE",
      hasMembershipAuthority: true,
      staffRole: "FITNESS_COACH",
    },
  };
}

function rosterPlayer(status: "ACTIVE" | "INACTIVE" | "RELEASED" = "ACTIVE"): DocumentData {
  const timestamp = new Date("2026-09-01T00:00:00.000Z");
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
    createdAt: timestamp,
    createdBy: FITNESS_COACH,
    updatedAt: timestamp,
    updatedBy: FITNESS_COACH,
  };
}

async function seedAuthorityAndPlayer(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", FITNESS_COACH), { role: "USER", status: "ACTIVE" }),
      setDoc(doc(db, "proClubs", CLUB_ID), { name: "Test United", level: "T1", status: "ACTIVE" }),
      setDoc(doc(db, "proClubs", CLUB_ID, "members", FITNESS_COACH), {
        authorizationRole: "MEMBER",
        status: "ACTIVE",
      }),
      setDoc(doc(db, "proClubs", CLUB_ID, "staff", FITNESS_COACH), {
        staffRole: "FITNESS_COACH",
        status: "ACTIVE",
      }),
      setDoc(doc(db, "proClubs", CLUB_ID, "players", PLAYER_KEY), rosterPlayer()),
    ]);
  });
}

function repositoryOps(db: Firestore) {
  return createFirestoreProClubFitnessResultRepositoryOps({
    firestore: db,
    getAuthenticatedUid: () => FITNESS_COACH,
    resolveAuthority: async (clubId, uid) => authority(uid, clubId),
  });
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Repository tests must run through the Firestore Emulator.");
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
  await seedAuthorityAndPlayer();
});

after(async () => {
  await testEnv.cleanup();
});

test("repository persists server-bound results under the Rules-protected Pro Club path", async () => {
  const db = authenticatedDb(FITNESS_COACH);
  const ops = repositoryOps(db);
  const input = {
    playerKey: PLAYER_KEY,
    definitionId: "football:speed_10m:v1",
    definitionVersion: 1,
    value: 1.82,
    observedOn: OBSERVED_ON,
  };

  const created = await createProClubFitnessResult({ clubId: CLUB_ID, input }, ops);
  assert.equal(created.kind, "DEFINITELY_CREATED");
  assert.match(created.resultId, /^fit-v1-[0-9a-f]{64}$/);

  const stored = await getDocs(collection(db, "proClubs", CLUB_ID, "fitnessResults"));
  assert.equal(stored.size, 1);
  assert.equal(stored.docs[0].id, created.resultId);
  assert.deepEqual(
    Object.keys(stored.docs[0].data()).sort(),
    [
      "definitionId",
      "definitionVersion",
      "observedOn",
      "playerKey",
      "recordedAt",
      "recordedBy",
      "schemaVersion",
      "source",
      "value",
    ].sort(),
  );
  assert.equal(stored.docs[0].data().recordedBy, FITNESS_COACH);
  assert.ok(stored.docs[0].data().recordedAt.toMillis() > 0);

  const dateResults = await listProClubFitnessResultsForDate({
    clubId: CLUB_ID,
    observedOn: OBSERVED_ON,
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
  }, ops);
  assert.deepEqual(dateResults, { [PLAYER_KEY]: { speed_10m: 1.82 } });

  const history = await listProClubFitnessResultHistory({
    clubId: CLUB_ID,
    playerKey: PLAYER_KEY,
    definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
  }, ops);
  assert.deepEqual(history.map(({ id, observedOn, value }) => ({ id, observedOn, value })), [
    { id: created.resultId, observedOn: OBSERVED_ON, value: 1.82 },
  ]);
});

test("repository retry recognizes the persisted deterministic identity without rewriting it", async () => {
  const db = authenticatedDb(FITNESS_COACH);
  const ops = repositoryOps(db);
  const input = {
    playerKey: PLAYER_KEY,
    definitionId: "football:speed_10m:v1",
    definitionVersion: 1,
    value: 1.82,
    observedOn: OBSERVED_ON,
  };

  const first = await createProClubFitnessResult({ clubId: CLUB_ID, input }, ops);
  assert.equal(first.kind, "DEFINITELY_CREATED");
  const second = await createProClubFitnessResult({ clubId: CLUB_ID, input }, ops);
  assert.equal(second.kind, "ALREADY_COMMITTED_EQUIVALENT");
  assert.equal(second.resultId, first.resultId);

  const stored = await getDocs(collection(db, "proClubs", CLUB_ID, "fitnessResults"));
  assert.equal(stored.size, 1);
});
