import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";

const PROJECT_ID = "demo-futverse-weekly-training-mixed-schema-v1-v2";
const CLUB_ID = "club-a";
const HEAD_COACH_UID = "hc-a";
const TD_UID = "td-a";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const WEEK_START = "2026-09-07";
const SESSION_ID = "2026-09-07-0900";

let testEnv;

function authedDb() {
  return testEnv.authenticatedContext(HEAD_COACH_UID).firestore();
}

async function seedBaseline() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    const entries = [
      [`users/${HEAD_COACH_UID}`, { status: "ACTIVE" }],
      [`users/${TD_UID}`, { status: "ACTIVE" }],
      [`proClubs/${CLUB_ID}`, { name: "Club A", level: "T1", status: "ACTIVE" }],
      [`proClubs/${CLUB_ID}/members/${HEAD_COACH_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
      [`proClubs/${CLUB_ID}/staff/${HEAD_COACH_UID}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
      [`proClubs/${CLUB_ID}/members/${TD_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
      [`proClubs/${CLUB_ID}/staff/${TD_UID}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
      [`proClubs/${CLUB_ID}/technicalGovernance/current`, {
        schemaVersion: 1,
        status: "ACTIVE",
        authorityUid: TD_UID,
        authorityRole: "TECHNICAL_DIRECTOR",
      }],
    ];
    for (const [path, data] of entries) batch.set(doc(db, path), data);
    await batch.commit();
  });
}

function manifestPath() {
  return `proClubs/${CLUB_ID}/weeklyTrainingDraftCreateRequests/${PLAN_ID}`;
}
function planPath() {
  return `proClubs/${CLUB_ID}/weeklyTrainingPlans/${PLAN_ID}`;
}
function sessionPath() {
  return `${planPath()}/sessions/${SESSION_ID}`;
}
function blockPath() {
  return `${sessionPath()}/blocks/block-01`;
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Mixed-schema test must run through Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.equal(
    rules.split("match /proClubs/{clubId}/weeklyTrainingPlans/{planId} {").length - 1,
    1,
    "Root Rules must expose exactly one canonical Weekly Training match tree.",
  );
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port, rules } });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseline();
});

after(async () => {
  await testEnv.cleanup();
});

async function assertNothingPersisted() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const path of [manifestPath(), planPath(), sessionPath(), blockPath()]) {
      assert.equal((await getDoc(doc(db, path))).exists(), false, `${path} must roll back atomically`);
    }
  });
}

test("rejects V1 plan mixed with V2 manifest/session/block as one atomic batch", async () => {
  const db = authedDb();
  const batch = writeBatch(db);

  batch.set(doc(db, manifestPath()), {
    schemaVersion: 1,
    requestId: PLAN_ID,
    planId: PLAN_ID,
    actorUid: HEAD_COACH_UID,
    weekStartDate: WEEK_START,
    sessionCount: 1,
    documentCount: 4,
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
  });

  batch.set(doc(db, planPath()), {
    schemaVersion: 1,
    authorUid: HEAD_COACH_UID,
    status: "DRAFT",
    weekStartDate: WEEK_START,
    squadLabel: "First Team",
    mainObjective: "Mixed schema must fail",
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  });

  batch.set(doc(db, sessionPath()), {
    schemaVersion: 2,
    orderIndex: 0,
    sessionDate: WEEK_START,
    startTime: "09:00",
    location: "Training Ground A",
    objective: "Session",
    phaseOfPlay: "GENERAL",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    blockCount: 1,
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  });

  batch.set(doc(db, blockPath()), {
    schemaVersion: 2,
    orderIndex: 0,
    blockType: "GAME",
    title: "Block",
    durationMinutes: 30,
    coachingPoints: ["Point"],
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  });

  await assertFails(batch.commit());
  await assertNothingPersisted();
});

test("rejects V2 plan/session mixed with a V1 block and rolls back the whole batch", async () => {
  const db = authedDb();
  const batch = writeBatch(db);

  batch.set(doc(db, manifestPath()), {
    schemaVersion: 1,
    requestId: PLAN_ID,
    planId: PLAN_ID,
    actorUid: HEAD_COACH_UID,
    weekStartDate: WEEK_START,
    sessionCount: 1,
    documentCount: 4,
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
  });
  batch.set(doc(db, planPath()), {
    schemaVersion: 2,
    authorUid: HEAD_COACH_UID,
    status: "DRAFT",
    weekStartDate: WEEK_START,
    squadLabel: "First Team",
    mainObjective: "Mixed child schema must fail",
    sessionCount: 1,
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  });
  batch.set(doc(db, sessionPath()), {
    schemaVersion: 2,
    orderIndex: 0,
    sessionDate: WEEK_START,
    startTime: "09:00",
    location: "Training Ground A",
    objective: "Session",
    phaseOfPlay: "GENERAL",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    blockCount: 1,
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  });
  batch.set(doc(db, blockPath()), {
    schemaVersion: 1,
    orderIndex: 0,
    blockType: "GAME",
    title: "Legacy child",
    durationMinutes: 30,
    coachingPoints: ["Point"],
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  });

  await assertFails(batch.commit());
  await assertNothingPersisted();
});
