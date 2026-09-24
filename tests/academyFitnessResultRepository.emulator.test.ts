import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../src/lib/fitnessTestFoundation.ts";

const PROJECT_ID = "demo-futverse-academy-fitness-results-rules-v1";
const ACADEMY_ID = "academy-a";
const COACH_UID = "coach-a";
const PLAYER_ID = "player-a";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seedAuthority() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", COACH_UID), { status: "ACTIVE" }),
      setDoc(doc(db, "academies", ACADEMY_ID, "members", COACH_UID), {
        userId: COACH_UID,
        academyId: ACADEMY_ID,
        role: "COACH",
        status: "ACTIVE",
      }),
      setDoc(doc(db, "academies", ACADEMY_ID, "players", PLAYER_ID), {
        firstName: "Player",
        lastName: "A",
      }),
    ]);
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
  await seedAuthority();
});

after(async () => {
  await testEnv.cleanup();
});

test("repository writes server audit fields and exact V1 results", async () => {
  const repository = await import("../src/lib/firestore/academyFitnessResultRepository.ts");
  const db = authedDb(COACH_UID);
  const committed: number[] = [];

  await assertSucceeds(repository.createAcademyFitnessResultEntries({
    firestore: db,
    academyId: ACADEMY_ID,
    actorUid: COACH_UID,
    entries: [
      {
        playerId: PLAYER_ID,
        definitionKey: "speed_10m",
        input: {
          playerId: PLAYER_ID,
          definitionId: "football:speed_10m:v1",
          definitionVersion: 1,
          value: 1.82,
          observedOn: "2026-09-24",
        },
      },
      {
        playerId: PLAYER_ID,
        definitionKey: "vertical_jump",
        input: {
          playerId: PLAYER_ID,
          definitionId: "football:vertical_jump:v1",
          definitionVersion: 1,
          value: 43,
          observedOn: "2026-09-24",
        },
      },
    ],
    onCommitted: (entries) => committed.push(entries.length),
  }));

  const snapshot = await getDocs(collection(db, "academies", ACADEMY_ID, "fitnessResults"));
  assert.equal(snapshot.size, 2);
  assert.deepEqual(committed, [2]);
  assert.deepEqual(
    snapshot.docs.map((document) => document.data()).map(({ recordedAt, ...data }) => data)
      .sort((a, b) => String(a.definitionId).localeCompare(String(b.definitionId))),
    [
      {
        schemaVersion: 1,
        playerId: PLAYER_ID,
        definitionId: "football:speed_10m:v1",
        definitionVersion: 1,
        value: 1.82,
        observedOn: "2026-09-24",
        source: "ACADEMY_BULK_ENTRY",
        recordedBy: COACH_UID,
      },
      {
        schemaVersion: 1,
        playerId: PLAYER_ID,
        definitionId: "football:vertical_jump:v1",
        definitionVersion: 1,
        value: 43,
        observedOn: "2026-09-24",
        source: "ACADEMY_BULK_ENTRY",
        recordedBy: COACH_UID,
      },
    ],
  );
  for (const document of snapshot.docs) {
    assert.ok(document.data().recordedAt.toMillis() > 0);
  }
});

test("repository reads the selected date and player history from persisted tenant results", async () => {
  const repository = await import("../src/lib/firestore/academyFitnessResultRepository.ts");
  const db = authedDb(COACH_UID);
  await assertSucceeds(repository.createAcademyFitnessResultEntries({
    firestore: db,
    academyId: ACADEMY_ID,
    actorUid: COACH_UID,
    entries: [
      {
        playerId: PLAYER_ID,
        definitionKey: "speed_10m",
        input: {
          playerId: PLAYER_ID,
          definitionId: "football:speed_10m:v1",
          definitionVersion: 1,
          value: 1.82,
          observedOn: "2026-09-24",
        },
      },
      {
        playerId: PLAYER_ID,
        definitionKey: "speed_10m",
        input: {
          playerId: PLAYER_ID,
          definitionId: "football:speed_10m:v1",
          definitionVersion: 1,
          value: 1.9,
          observedOn: "2026-09-20",
        },
      },
    ],
  }));

  const dateResults = await new Promise<Record<string, Record<string, number>>>((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out reading Academy Fitness results by date."));
    }, 10000);
    unsubscribe = repository.watchAcademyFitnessResultsForDate({
      firestore: db,
      academyId: ACADEMY_ID,
      observedOn: "2026-09-24",
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
      onResults: (results) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(results);
      },
      onError: (error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      },
    });
  });
  assert.deepEqual(dateResults, { [PLAYER_ID]: { speed_10m: 1.82 } });

  const history = await new Promise<Array<{ observedOn: string; definitionKey: string; value: number }>>((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out reading Academy Fitness player history."));
    }, 10000);
    unsubscribe = repository.watchAcademyFitnessResultHistory({
      firestore: db,
      academyId: ACADEMY_ID,
      playerId: PLAYER_ID,
      definitions: FOOTBALL_FITNESS_TEST_CATALOGUE,
      onResults: (results) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(results.map(({ observedOn, definitionKey, value }) => ({ observedOn, definitionKey, value })));
      },
      onError: (error) => {
        clearTimeout(timeout);
        unsubscribe();
        reject(error);
      },
    });
  });
  assert.deepEqual(history, [
    { observedOn: "2026-09-24", definitionKey: "speed_10m", value: 1.82 },
    { observedOn: "2026-09-20", definitionKey: "speed_10m", value: 1.9 },
  ]);
});

test("repository retries cannot create a duplicate player and test observation", async () => {
  const repository = await import("../src/lib/firestore/academyFitnessResultRepository.ts");
  const db = authedDb(COACH_UID);
  const entry = {
    playerId: PLAYER_ID,
    definitionKey: "speed_10m",
    input: {
      playerId: PLAYER_ID,
      definitionId: "football:speed_10m:v1",
      definitionVersion: 1,
      value: 1.82,
      observedOn: "2026-09-24",
    },
  };

  await assertSucceeds(repository.createAcademyFitnessResultEntries({
    firestore: db,
    academyId: ACADEMY_ID,
    actorUid: COACH_UID,
    entries: [entry],
  }));
  await assert.rejects(repository.createAcademyFitnessResultEntries({
    firestore: db,
    academyId: ACADEMY_ID,
    actorUid: COACH_UID,
    entries: [entry],
  }), (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && error.code === "permission-denied"),
  );
  assert.equal(
    (await getDocs(collection(db, "academies", ACADEMY_ID, "fitnessResults"))).size,
    1,
  );
});

test("repository rejects malformed entries before any write", async () => {
  const repository = await import("../src/lib/firestore/academyFitnessResultRepository.ts");
  const db = authedDb(COACH_UID);

  await assert.rejects(repository.createAcademyFitnessResultEntries({
    firestore: db,
    academyId: ACADEMY_ID,
    actorUid: COACH_UID,
    entries: [
      {
        playerId: PLAYER_ID,
        definitionKey: "speed_10m",
        input: {
          playerId: PLAYER_ID,
          definitionId: "football:speed_10m:v1",
          definitionVersion: 1,
          value: 1.82,
          observedOn: "2026-09-24",
        },
      },
      {
        playerId: PLAYER_ID,
        definitionKey: "vertical_jump",
        input: {
          playerId: PLAYER_ID,
          definitionId: "football:vertical_jump:v1",
          definitionVersion: 1,
          value: Number.POSITIVE_INFINITY,
          observedOn: "2026-09-24",
        },
      },
    ],
  }), /Invalid Fitness result/);

  assert.equal(
    (await getDocs(collection(db, "academies", ACADEMY_ID, "fitnessResults"))).size,
    0,
  );
});
