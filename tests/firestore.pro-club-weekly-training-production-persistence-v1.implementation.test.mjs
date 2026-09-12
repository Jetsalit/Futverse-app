import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-weekly-training-production-persistence-implementation-v1";
const CLUB_ID = "club-a";
const HEAD_COACH_UID = "hc-a";
const TD_UID = "td-a";
const ASSISTANT_UID = "assistant-a";
const SUPERADMIN_UID = "superadmin-outsider";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_PLAN_ID = "22222222-2222-4222-8222-222222222222";
const WEEK_START = "2026-09-07";

let testEnv;

function authedDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seed(entries) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (const [path, data] of entries) batch.set(doc(db, path), data);
    await batch.commit();
  });
}

async function seedBaseline() {
  await seed([
    [`users/${HEAD_COACH_UID}`, { status: "ACTIVE" }],
    [`users/${TD_UID}`, { status: "ACTIVE" }],
    [`users/${ASSISTANT_UID}`, { status: "ACTIVE" }],
    [`users/${SUPERADMIN_UID}`, { status: "ACTIVE", role: "SUPERADMIN" }],
    [`proClubs/${CLUB_ID}`, { name: "Club A", level: "T1", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${HEAD_COACH_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${HEAD_COACH_UID}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${TD_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${TD_UID}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${ASSISTANT_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${ASSISTANT_UID}`, { staffRole: "ASSISTANT_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TD_UID,
      authorityRole: "TECHNICAL_DIRECTOR",
    }],
  ]);
}

function manifestPath(planId = PLAN_ID) {
  return `proClubs/${CLUB_ID}/weeklyTrainingDraftCreateRequests/${planId}`;
}
function planPath(planId = PLAN_ID) {
  return `proClubs/${CLUB_ID}/weeklyTrainingPlans/${planId}`;
}
function sessionId(index) {
  const day = 7 + Math.floor(index / 2);
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  const time = index % 2 === 0 ? "0900" : "1600";
  return `${date}-${time}`;
}
function sessionPath(index, planId = PLAN_ID) {
  return `${planPath(planId)}/sessions/${sessionId(index)}`;
}
function blockPath(sessionIndex, blockIndex, planId = PLAN_ID) {
  return `${sessionPath(sessionIndex, planId)}/blocks/block-${String(blockIndex + 1).padStart(2, "0")}`;
}

function planData(actorUid = HEAD_COACH_UID, sessionCount = 1) {
  return {
    schemaVersion: 2,
    authorUid: actorUid,
    status: "DRAFT",
    weekStartDate: WEEK_START,
    squadLabel: "First Team",
    mainObjective: "Production persistence implementation",
    sessionCount,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}
function manifestData(actorUid = HEAD_COACH_UID, planId = PLAN_ID, sessionCount = 1, documentCount = 4) {
  return {
    schemaVersion: 1,
    requestId: planId,
    planId,
    actorUid,
    weekStartDate: WEEK_START,
    sessionCount,
    documentCount,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
  };
}
function sessionData(index, actorUid = HEAD_COACH_UID, blockCount = 1) {
  const day = 7 + Math.floor(index / 2);
  return {
    schemaVersion: 2,
    orderIndex: index,
    sessionDate: `2026-09-${String(day).padStart(2, "0")}`,
    startTime: index % 2 === 0 ? "09:00" : "16:00",
    location: "Training Ground A",
    objective: `Session ${index + 1}`,
    phaseOfPlay: "GENERAL",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    blockCount,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}
function blockData(index, actorUid = HEAD_COACH_UID, blockType = "GAME") {
  return {
    schemaVersion: 2,
    orderIndex: index,
    blockType,
    title: `Block ${index + 1}`,
    durationMinutes: 30,
    coachingPoints: ["Canonical coaching point"],
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function buildFreshDraftBatch(db, options = {}) {
  const actorUid = options.actorUid ?? HEAD_COACH_UID;
  const planId = options.planId ?? PLAN_ID;
  const sessionCount = options.sessionCount ?? 1;
  const blocksPerSession = options.blocksPerSession ?? 1;
  const blockType = options.blockType ?? "GAME";
  const documentCount = 2 + sessionCount + sessionCount * blocksPerSession;
  const mutate = options.mutate ?? ((_path, value) => value);
  const batch = writeBatch(db);
  batch.set(doc(db, manifestPath(planId)), mutate(manifestPath(planId), manifestData(actorUid, planId, sessionCount, documentCount)));
  batch.set(doc(db, planPath(planId)), mutate(planPath(planId), planData(actorUid, sessionCount)));
  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const sPath = sessionPath(sessionIndex, planId);
    batch.set(doc(db, sPath), mutate(sPath, sessionData(sessionIndex, actorUid, blocksPerSession)));
    for (let blockIndex = 0; blockIndex < blocksPerSession; blockIndex += 1) {
      const bPath = blockPath(sessionIndex, blockIndex, planId);
      batch.set(doc(db, bPath), mutate(bPath, blockData(blockIndex, actorUid, blockType)));
    }
  }
  return { batch, documentCount };
}

async function assertHierarchyMissing(planId = PLAN_ID) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, manifestPath(planId)))).exists(), false);
    assert.equal((await getDoc(doc(db, planPath(planId)))).exists(), false);
  });
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Integrated root Rules test must run through Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.match(rules, /Production Persistence V1 — schema-v2 create-only/);
  assert.match(rules, /'GAME',\s*'CONDITIONING'/);
  assert.doesNotMatch(rules, /'PHYSICAL',\s*'SMALL_SIDED_GAME'/);
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host, port, rules } });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseline();
});

after(async () => {
  await testEnv.cleanup();
});

test("integrated root accepts canonical GAME and CONDITIONING values", async () => {
  for (const [index, blockType] of ["GAME", "CONDITIONING"].entries()) {
    const planId = index === 0 ? PLAN_ID : SECOND_PLAN_ID;
    await assertSucceeds(buildFreshDraftBatch(authedDb(HEAD_COACH_UID), { planId, blockType }).batch.commit());
  }
});

test("integrated root rejects stale candidate-only block enums", async () => {
  for (const [index, blockType] of ["PHYSICAL", "SMALL_SIDED_GAME", "SET_PIECE"].entries()) {
    const planId = `stale-${index}`;
    await assertFails(buildFreshDraftBatch(authedDb(HEAD_COACH_UID), { planId, blockType }).batch.commit());
    await assertHierarchyMissing(planId);
  }
});

test("max 14 x 12 hierarchy plus manifest commits atomically as 184 writes", async () => {
  const db = authedDb(HEAD_COACH_UID);
  const { batch, documentCount } = buildFreshDraftBatch(db, { sessionCount: 14, blocksPerSession: 12 });
  assert.equal(documentCount, 184);
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db, planPath()))).data()?.sessionCount, 14);
  assert.equal((await getDoc(doc(db, sessionPath(13)))).data()?.blockCount, 12);
  assert.equal((await getDoc(doc(db, blockPath(13, 11)))).exists(), true);
});

test("Assistant Coach and SUPERADMIN outsider cannot create schema-v2 fresh DRAFT", async () => {
  for (const [uid, planId] of [[ASSISTANT_UID, PLAN_ID], [SUPERADMIN_UID, SECOND_PLAN_ID]]) {
    await assertFails(buildFreshDraftBatch(authedDb(uid), { actorUid: uid, planId }).batch.commit());
    await assertHierarchyMissing(planId);
  }
});

test("inactive account, inactive club and invalid governance fail closed", async () => {
  const scenarios = [
    [`users/${HEAD_COACH_UID}`, { status: "INACTIVE" }],
    [`proClubs/${CLUB_ID}`, { name: "Club A", level: "T1", status: "INACTIVE" }],
    [`proClubs/${CLUB_ID}/technicalGovernance/current`, { schemaVersion: 1, status: "INACTIVE", authorityUid: TD_UID, authorityRole: "TECHNICAL_DIRECTOR" }],
  ];
  for (const [index, [path, value]] of scenarios.entries()) {
    await testEnv.clearFirestore();
    await seedBaseline();
    await seed([[path, value]]);
    const planId = `blocked-${index}`;
    await assertFails(buildFreshDraftBatch(authedDb(HEAD_COACH_UID), { planId }).batch.commit());
    await assertHierarchyMissing(planId);
  }
});

test("forged child audit rejects the whole batch and rolls back manifest/plan", async () => {
  const { batch } = buildFreshDraftBatch(authedDb(HEAD_COACH_UID), {
    mutate: (path, value) => path.includes("/blocks/") ? { ...value, createdBy: "forged-actor" } : value,
  });
  await assertFails(batch.commit());
  await assertHierarchyMissing();
});

test("accepted schema-v2 plan/session/block are create-only and old manifest cannot authorize later append", async () => {
  const db = authedDb(HEAD_COACH_UID);
  await assertSucceeds(buildFreshDraftBatch(db).batch.commit());
  await assertFails(updateDoc(doc(db, planPath()), { mainObjective: "Forbidden", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH_UID }));
  await assertFails(updateDoc(doc(db, sessionPath(0)), { location: "Forbidden", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH_UID }));
  await assertFails(updateDoc(doc(db, blockPath(0, 0)), { title: "Forbidden", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH_UID }));
  await assertFails(deleteDoc(doc(db, planPath())));
  await assertFails(deleteDoc(doc(db, sessionPath(0))));
  await assertFails(deleteDoc(doc(db, blockPath(0, 0))));
  await assertFails(setDoc(doc(db, `${sessionPath(0)}/blocks/block-02`), blockData(1)));
});

test("same request cannot overwrite either identical or changed accepted payload", async () => {
  const db = authedDb(HEAD_COACH_UID);
  await assertSucceeds(buildFreshDraftBatch(db).batch.commit());
  await assertFails(buildFreshDraftBatch(db).batch.commit());
  await assertFails(buildFreshDraftBatch(db, {
    mutate: (path, value) => path === planPath() ? { ...value, mainObjective: "Changed payload" } : value,
  }).batch.commit());
  assert.equal((await getDoc(doc(db, planPath()))).data()?.mainObjective, "Production persistence implementation");
});
