import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-weekly-training-atomic-create";
const CLUB_ID = "club-a";
const HEAD_COACH_UID = "hc-a";
const TECHNICAL_DIRECTOR_UID = "td-a";
const PLAN_ID = "atomic-plan-1";
const SESSION_ID = "2026-09-08-1600";
const BLOCK_ID = "block-01";

let testEnv: RulesTestEnvironment;

function authedDb(uid = HEAD_COACH_UID): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
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
    [`users/${HEAD_COACH_UID}`, { status: "ACTIVE" }],
    [`users/${TECHNICAL_DIRECTOR_UID}`, { status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}`, { name: "Club A", level: "T1", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${HEAD_COACH_UID}`, {
      authorizationRole: "MEMBER",
      status: "ACTIVE",
    }],
    [`proClubs/${CLUB_ID}/staff/${HEAD_COACH_UID}`, {
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
    }],
    [`proClubs/${CLUB_ID}/members/${TECHNICAL_DIRECTOR_UID}`, {
      authorizationRole: "MEMBER",
      status: "ACTIVE",
    }],
    [`proClubs/${CLUB_ID}/staff/${TECHNICAL_DIRECTOR_UID}`, {
      staffRole: "TECHNICAL_DIRECTOR",
      status: "ACTIVE",
    }],
    [`proClubs/${CLUB_ID}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TECHNICAL_DIRECTOR_UID,
      authorityRole: "TECHNICAL_DIRECTOR",
    }],
  ]);
}

function planPath(): string {
  return `proClubs/${CLUB_ID}/weeklyTrainingPlans/${PLAN_ID}`;
}

function sessionPath(): string {
  return `${planPath()}/sessions/${SESSION_ID}`;
}

function blockPath(blockId = BLOCK_ID): string {
  return `${sessionPath()}/blocks/${blockId}`;
}

function planData(): DocumentData {
  return {
    schemaVersion: 1,
    authorUid: HEAD_COACH_UID,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  };
}

function sessionData(): DocumentData {
  return {
    schemaVersion: 1,
    orderIndex: 0,
    sessionDate: "2026-09-08",
    startTime: "16:00",
    location: "Training Ground A",
    objective: "Progress through first and second line",
    phaseOfPlay: "IN_POSSESSION",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  };
}

function blockData(): DocumentData {
  return {
    schemaVersion: 1,
    orderIndex: 0,
    blockType: "TACTICAL",
    title: "Build-up 8v6",
    durationMinutes: 45,
    coachingPoints: ["Create the third-man option"],
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  };
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Atomic Rules proof must run through the Firestore Emulator.");

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

test("real root rules allow one atomic commit for a canonical fresh DRAFT hierarchy", async () => {
  const db = authedDb();
  const batch = writeBatch(db);

  batch.set(doc(db, planPath()), planData());
  batch.set(doc(db, sessionPath()), sessionData());
  batch.set(doc(db, blockPath()), blockData());

  await assertSucceeds(batch.commit());

  assert.equal((await getDoc(doc(db, planPath()))).exists(), true);
  assert.equal((await getDoc(doc(db, sessionPath()))).exists(), true);
  assert.equal((await getDoc(doc(db, blockPath()))).exists(), true);
});

test("a rejected atomic hierarchy leaves the entire fresh DRAFT absent", async () => {
  const db = authedDb();
  const batch = writeBatch(db);

  batch.set(doc(db, planPath()), planData());
  batch.set(doc(db, sessionPath()), sessionData());
  batch.set(doc(db, blockPath("block-02")), blockData());

  await assertFails(batch.commit());

  assert.equal((await getDoc(doc(db, planPath()))).exists(), false);
  assert.equal((await getDoc(doc(db, sessionPath()))).exists(), false);
  assert.equal((await getDoc(doc(db, blockPath("block-02")))).exists(), false);
});
