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

const PROJECT_ID = "demo-futverse-weekly-training-production-persistence-v1";
const CLUB_ID = "club-a";
const HEAD_COACH_UID = "hc-a";
const TD_UID = "td-a";
const ASSISTANT_UID = "assistant-a";
const SUPERADMIN_UID = "superadmin-outsider";
const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_PLAN_ID = "22222222-2222-4222-8222-222222222222";
const WEEK_START = "2026-09-07";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore() as unknown as Firestore);
    for (const [path, data] of entries) batch.set(doc(context.firestore() as unknown as Firestore, path), data);
    await batch.commit();
  });
}

async function seedBaseline(): Promise<void> {
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

function manifestPath(planId = PLAN_ID): string {
  return `proClubs/${CLUB_ID}/weeklyTrainingDraftCreateRequests/${planId}`;
}

function planPath(planId = PLAN_ID): string {
  return `proClubs/${CLUB_ID}/weeklyTrainingPlans/${planId}`;
}

function sessionId(index: number): string {
  const day = 7 + Math.floor(index / 2);
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  const time = index % 2 === 0 ? "0900" : "1600";
  return `${date}-${time}`;
}

function sessionPath(index: number, planId = PLAN_ID): string {
  return `${planPath(planId)}/sessions/${sessionId(index)}`;
}

function blockPath(sessionIndex: number, blockIndex: number, planId = PLAN_ID): string {
  return `${sessionPath(sessionIndex, planId)}/blocks/block-${String(blockIndex + 1).padStart(2, "0")}`;
}

function planData(actorUid = HEAD_COACH_UID, sessionCount = 14): DocumentData {
  return {
    schemaVersion: 2,
    authorUid: actorUid,
    status: "DRAFT",
    weekStartDate: WEEK_START,
    squadLabel: "First Team",
    mainObjective: "Maximum-shape production persistence feasibility",
    sessionCount,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function manifestData(actorUid = HEAD_COACH_UID, planId = PLAN_ID, sessionCount = 14, documentCount = 184): DocumentData {
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

function sessionData(index: number, actorUid = HEAD_COACH_UID, blockCount = 12): DocumentData {
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
    durationMinutes: 360,
    blockCount,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function blockData(index: number, actorUid = HEAD_COACH_UID): DocumentData {
  return {
    schemaVersion: 2,
    orderIndex: index,
    blockType: index === 0 ? "WARM_UP" : "TACTICAL",
    title: `Block ${index + 1}`,
    durationMinutes: 30,
    coachingPoints: ["Canonical coaching point"],
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function buildFreshDraftBatch(
  db: Firestore,
  options: {
    actorUid?: string;
    planId?: string;
    sessionCount?: number;
    blocksPerSession?: number;
    mutate?: (path: string, value: DocumentData) => DocumentData;
  } = {},
) {
  const actorUid = options.actorUid ?? HEAD_COACH_UID;
  const planId = options.planId ?? PLAN_ID;
  const sessionCount = options.sessionCount ?? 14;
  const blocksPerSession = options.blocksPerSession ?? 12;
  const documentCount = 2 + sessionCount + sessionCount * blocksPerSession;
  const mutate = options.mutate ?? ((_path: string, value: DocumentData) => value);
  const batch = writeBatch(db);

  batch.set(
    doc(db, manifestPath(planId)),
    mutate(manifestPath(planId), manifestData(actorUid, planId, sessionCount, documentCount)),
  );
  batch.set(
    doc(db, planPath(planId)),
    mutate(planPath(planId), planData(actorUid, sessionCount)),
  );

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const sPath = sessionPath(sessionIndex, planId);
    batch.set(doc(db, sPath), mutate(sPath, sessionData(sessionIndex, actorUid, blocksPerSession)));
    for (let blockIndex = 0; blockIndex < blocksPerSession; blockIndex += 1) {
      const bPath = blockPath(sessionIndex, blockIndex, planId);
      batch.set(doc(db, bPath), mutate(bPath, blockData(blockIndex, actorUid)));
    }
  }

  return { batch, documentCount };
}

async function assertHierarchyMissing(planId = PLAN_ID): Promise<void> {
  const db = authedDb(HEAD_COACH_UID);
  assert.equal((await getDoc(doc(db, manifestPath(planId)))).exists(), false);
  assert.equal((await getDoc(doc(db, planPath(planId)))).exists(), false);
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Feasibility test must run through Firestore Emulator.");
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
        new URL("./fixtures/firestore.pro-club-weekly-training.production-persistence-foundation-v1.rules", import.meta.url),
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

test("max 14 x 12 hierarchy plus manifest commits as one 184-write batch", async () => {
  const db = authedDb(HEAD_COACH_UID);
  const { batch, documentCount } = buildFreshDraftBatch(db);
  assert.equal(documentCount, 184);
  await assertSucceeds(batch.commit());

  assert.equal((await getDoc(doc(db, manifestPath()))).exists(), true);
  assert.equal((await getDoc(doc(db, planPath()))).data()?.sessionCount, 14);
  assert.equal((await getDoc(doc(db, sessionPath(13)))).data()?.blockCount, 12);
  assert.equal((await getDoc(doc(db, blockPath(13, 11)))).exists(), true);
});

test("Assistant Coach and SUPERADMIN outsider cannot create a fresh DRAFT", async () => {
  for (const uid of [ASSISTANT_UID, SUPERADMIN_UID]) {
    const db = authedDb(uid);
    const { batch } = buildFreshDraftBatch(db, { actorUid: uid, planId: uid === ASSISTANT_UID ? PLAN_ID : SECOND_PLAN_ID, sessionCount: 1, blocksPerSession: 1 });
    await assertFails(batch.commit());
  }
  await assertHierarchyMissing(PLAN_ID);
  await assertHierarchyMissing(SECOND_PLAN_ID);
});

test("inactive Head Coach account, inactive club, or broken governance fails closed", async () => {
  const scenarios: Array<[string, string, DocumentData]> = [
    [`users/${HEAD_COACH_UID}`, "account", { status: "INACTIVE" }],
    [`proClubs/${CLUB_ID}`, "club", { name: "Club A", level: "T1", status: "INACTIVE" }],
    [`proClubs/${CLUB_ID}/technicalGovernance/current`, "governance", {
      schemaVersion: 1,
      status: "INACTIVE",
      authorityUid: TD_UID,
      authorityRole: "TECHNICAL_DIRECTOR",
    }],
  ];

  for (let index = 0; index < scenarios.length; index += 1) {
    await testEnv.clearFirestore();
    await seedBaseline();
    const [path, , data] = scenarios[index]!;
    await seed([[path, data]]);
    const planId = `blocked-${index}`;
    const { batch } = buildFreshDraftBatch(authedDb(HEAD_COACH_UID), { planId, sessionCount: 1, blocksPerSession: 1 });
    await assertFails(batch.commit());
    await assertHierarchyMissing(planId);
  }
});

test("wrong child audit rejects the whole batch with no manifest or plan", async () => {
  const db = authedDb(HEAD_COACH_UID);
  const { batch } = buildFreshDraftBatch(db, {
    sessionCount: 1,
    blocksPerSession: 1,
    mutate: (path, value) => path.includes("/blocks/") ? { ...value, createdBy: "forged-actor" } : value,
  });
  await assertFails(batch.commit());
  await assertHierarchyMissing();
});

test("schema-v2 plan, session and block are create-only after accepted save", async () => {
  const db = authedDb(HEAD_COACH_UID);
  await assertSucceeds(buildFreshDraftBatch(db, { sessionCount: 1, blocksPerSession: 1 }).batch.commit());

  await assertFails(updateDoc(doc(db, planPath()), { mainObjective: "Forbidden edit", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH_UID }));
  await assertFails(updateDoc(doc(db, sessionPath(0)), { location: "Forbidden edit", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH_UID }));
  await assertFails(updateDoc(doc(db, blockPath(0, 0)), { title: "Forbidden edit", updatedAt: serverTimestamp(), updatedBy: HEAD_COACH_UID }));
  await assertFails(deleteDoc(doc(db, planPath())));
  await assertFails(deleteDoc(doc(db, sessionPath(0))));
  await assertFails(deleteDoc(doc(db, blockPath(0, 0))));
});

test("later child append cannot reuse the old manifest", async () => {
  const db = authedDb(HEAD_COACH_UID);
  await assertSucceeds(buildFreshDraftBatch(db, { sessionCount: 1, blocksPerSession: 1 }).batch.commit());
  const laterPath = `${sessionPath(0)}/blocks/block-02`;
  await assertFails(setDoc(doc(db, laterPath), blockData(1)));
  assert.equal((await getDoc(doc(db, laterPath))).exists(), false);
});

test("duplicate same-request batch cannot overwrite an accepted DRAFT", async () => {
  const db = authedDb(HEAD_COACH_UID);
  await assertSucceeds(buildFreshDraftBatch(db, { sessionCount: 1, blocksPerSession: 1 }).batch.commit());
  await assertFails(buildFreshDraftBatch(db, { sessionCount: 1, blocksPerSession: 1 }).batch.commit());
  assert.equal((await getDoc(doc(db, planPath()))).data()?.mainObjective, "Maximum-shape production persistence feasibility");
});

test("changed payload under the same request cannot overwrite accepted data", async () => {
  const db = authedDb(HEAD_COACH_UID);
  await assertSucceeds(buildFreshDraftBatch(db, { sessionCount: 1, blocksPerSession: 1 }).batch.commit());

  const changed = buildFreshDraftBatch(db, {
    sessionCount: 1,
    blocksPerSession: 1,
    mutate: (path, value) => path === planPath() ? { ...value, mainObjective: "Changed after ambiguous outcome" } : value,
  });
  await assertFails(changed.batch.commit());
  assert.equal((await getDoc(doc(db, planPath()))).data()?.mainObjective, "Maximum-shape production persistence feasibility");
});
