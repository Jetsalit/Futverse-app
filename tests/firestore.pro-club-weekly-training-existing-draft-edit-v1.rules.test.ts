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
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-existing-draft-edit-v1";
const CLUB_A = "club-a";
const CLUB_B = "club-b";
const HEAD_COACH = "hc-a";
const OTHER_HEAD_COACH = "hc-b";
const TECHNICAL_DIRECTOR = "td-a";
const SUPERADMIN = "superadmin-outsider";
const PLAN_ID = "existing-plan-a";
const FRESH_PLAN_ID = "fresh-plan-a";
const SESSION_ID = "2026-09-08-1600";
const BLOCK_ID = "block-01";
const CREATED_AT = Timestamp.fromMillis(1_757_280_100_000);

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function planPath(clubId = CLUB_A, planId = PLAN_ID): string {
  return `proClubs/${clubId}/weeklyTrainingPlans/${planId}`;
}

function sessionPath(clubId = CLUB_A, planId = PLAN_ID): string {
  return `${planPath(clubId, planId)}/sessions/${SESSION_ID}`;
}

function blockPath(clubId = CLUB_A, planId = PLAN_ID): string {
  return `${sessionPath(clubId, planId)}/blocks/${BLOCK_ID}`;
}

function manifestPath(planId = FRESH_PLAN_ID): string {
  return `proClubs/${CLUB_A}/weeklyTrainingDraftCreateRequests/${planId}`;
}

function planData(actorUid = HEAD_COACH, timestamp = CREATED_AT): DocumentData {
  return {
    schemaVersion: 2,
    authorUid: actorUid,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    sessionCount: 1,
    createdAt: timestamp,
    createdBy: actorUid,
    updatedAt: timestamp,
    updatedBy: actorUid,
  };
}

function sessionData(actorUid = HEAD_COACH, timestamp = CREATED_AT): DocumentData {
  return {
    schemaVersion: 2,
    orderIndex: 0,
    sessionDate: "2026-09-08",
    startTime: "16:00",
    location: "Training Ground A",
    objective: "Progress through two pressing lines",
    phaseOfPlay: "IN_POSSESSION",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    blockCount: 1,
    createdAt: timestamp,
    createdBy: actorUid,
    updatedAt: timestamp,
    updatedBy: actorUid,
  };
}

function blockData(actorUid = HEAD_COACH, timestamp = CREATED_AT): DocumentData {
  return {
    schemaVersion: 2,
    orderIndex: 0,
    blockType: "TACTICAL",
    title: "Build-up 8v6",
    durationMinutes: 45,
    coachingPoints: ["Create the third-player option"],
    createdAt: timestamp,
    createdBy: actorUid,
    updatedAt: timestamp,
    updatedBy: actorUid,
  };
}

function v1PlanData(): DocumentData {
  return {
    schemaVersion: 1,
    authorUid: HEAD_COACH,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "Legacy First Team",
    mainObjective: "Preserve schema-v1 behavior",
    createdAt: CREATED_AT,
    createdBy: HEAD_COACH,
    updatedAt: CREATED_AT,
    updatedBy: HEAD_COACH,
  };
}

async function seed(entries: readonly (readonly [string, DocumentData])[]): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore());
    for (const [path, data] of entries) batch.set(doc(context.firestore(), path), data);
    await batch.commit();
  });
}

async function remove(path: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), path));
  });
}

async function seedBaseline(): Promise<void> {
  await seed([
    [`users/${HEAD_COACH}`, { status: "ACTIVE" }],
    [`users/${OTHER_HEAD_COACH}`, { status: "ACTIVE" }],
    [`users/${TECHNICAL_DIRECTOR}`, { status: "ACTIVE" }],
    [`users/${SUPERADMIN}`, { status: "ACTIVE", role: "SUPERADMIN" }],
    [`proClubs/${CLUB_A}`, { name: "Club A", level: "T1", status: "ACTIVE" }],
    [`proClubs/${CLUB_B}`, { name: "Club B", level: "T1", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${HEAD_COACH}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${HEAD_COACH}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${OTHER_HEAD_COACH}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${OTHER_HEAD_COACH}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${TECHNICAL_DIRECTOR}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${TECHNICAL_DIRECTOR}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
    [`proClubs/${CLUB_B}/members/${HEAD_COACH}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_B}/staff/${HEAD_COACH}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: HEAD_COACH,
      authorityRole: "HEAD_COACH",
    }],
  ]);
}

async function seedDraft(
  actorUid = HEAD_COACH,
  clubId = CLUB_A,
  planId = PLAN_ID,
): Promise<void> {
  await seed([
    [planPath(clubId, planId), planData(actorUid)],
    [sessionPath(clubId, planId), sessionData(actorUid)],
    [blockPath(clubId, planId), blockData(actorUid)],
  ]);
}

function buildEditBatch(
  db: Firestore,
  input: {
    actorUid?: string;
    clubId?: string;
    planId?: string;
    plan?: DocumentData;
    session?: DocumentData;
    block?: DocumentData;
  } = {},
) {
  const actorUid = input.actorUid ?? HEAD_COACH;
  const clubId = input.clubId ?? CLUB_A;
  const planId = input.planId ?? PLAN_ID;
  const batch = writeBatch(db);
  batch.update(doc(db, planPath(clubId, planId)), {
    squadLabel: "First Team Updated",
    mainObjective: "Updated build through pressure",
    secondaryObjective: "Protect rest defence",
    headCoachNote: "Reviewed by the Head Coach",
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    ...input.plan,
  });
  batch.update(doc(db, sessionPath(clubId, planId)), {
    location: "Training Ground B",
    objective: "Updated session objective",
    phaseOfPlay: "TRANSITION_TO_ATTACK",
    plannedLoad: "HIGH",
    durationMinutes: 100,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    ...input.session,
  });
  batch.update(doc(db, blockPath(clubId, planId)), {
    blockType: "GAME",
    title: "Updated conditioned game",
    durationMinutes: 50,
    drillReference: "drill-existing-draft-edit",
    coachingPoints: ["React immediately after possession changes"],
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
    ...input.block,
  });
  return batch;
}

function buildFreshDraftBatch(db: Firestore) {
  const batch = writeBatch(db);
  const documentCount = 4;
  batch.set(doc(db, manifestPath()), {
    schemaVersion: 1,
    requestId: FRESH_PLAN_ID,
    planId: FRESH_PLAN_ID,
    actorUid: HEAD_COACH,
    weekStartDate: "2026-09-07",
    sessionCount: 1,
    documentCount,
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH,
  });
  batch.set(doc(db, planPath(CLUB_A, FRESH_PLAN_ID)), planData(HEAD_COACH, serverTimestamp() as never));
  batch.set(doc(db, sessionPath(CLUB_A, FRESH_PLAN_ID)), sessionData(HEAD_COACH, serverTimestamp() as never));
  batch.set(doc(db, blockPath(CLUB_A, FRESH_PLAN_ID)), blockData(HEAD_COACH, serverTimestamp() as never));
  return batch;
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
  await seedDraft();
});

after(async () => {
  await testEnv.cleanup();
});

test("own current Head Coach cannot directly edit a complete schema-v2 hierarchy", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(buildEditBatch(db).commit());
  assert.equal((await getDoc(doc(db, planPath()))).data()?.mainObjective, "Build through pressure");
  assert.equal((await getDoc(doc(db, sessionPath()))).data()?.location, "Training Ground A");
  assert.equal((await getDoc(doc(db, blockPath()))).data()?.title, "Build-up 8v6");
});

test("a second direct schema-v2 edit stays denied after a prior trusted audit advancement", async () => {
  const priorUpdatedAt = Timestamp.fromMillis(CREATED_AT.toMillis() + 1_000);
  await seed([
    [planPath(), { ...planData(), mainObjective: "Prior trusted plan edit", updatedAt: priorUpdatedAt }],
    [sessionPath(), { ...sessionData(), objective: "Prior trusted session edit", updatedAt: priorUpdatedAt }],
    [blockPath(), { ...blockData(), title: "Prior trusted block edit", updatedAt: priorUpdatedAt }],
  ]);
  const db = authedDb(HEAD_COACH);
  await assertFails(buildEditBatch(db, {
    plan: { mainObjective: "Second coherent plan edit" },
    session: { objective: "Second coherent session edit" },
    block: { title: "Second coherent block edit" },
  }).commit());
});

test("unauthenticated another Head Coach and cross-club attempts are denied", async () => {
  await assertFails(buildEditBatch(testEnv.unauthenticatedContext().firestore() as unknown as Firestore).commit());
  await assertFails(buildEditBatch(authedDb(OTHER_HEAD_COACH), { actorUid: OTHER_HEAD_COACH }).commit());
  await seedDraft(HEAD_COACH, CLUB_B);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH), { clubId: CLUB_B }).commit());
});

test("Technical Director and SUPERADMIN labels grant no edit bypass", async () => {
  await seedDraft(TECHNICAL_DIRECTOR);
  await seed([[`proClubs/${CLUB_A}/technicalGovernance/current`, {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TECHNICAL_DIRECTOR,
    authorityRole: "TECHNICAL_DIRECTOR",
  }]]);
  await assertFails(buildEditBatch(authedDb(TECHNICAL_DIRECTOR), { actorUid: TECHNICAL_DIRECTOR }).commit());
  await assertFails(buildEditBatch(authedDb(SUPERADMIN), { actorUid: SUPERADMIN }).commit());
});

test("inactive club membership or staff denies the complete edit batch", async () => {
  await seed([[`proClubs/${CLUB_A}`, { name: "Club A", level: "T1", status: "INACTIVE" }]]);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH)).commit());

  await testEnv.clearFirestore();
  await seedBaseline();
  await seedDraft();
  await seed([[`proClubs/${CLUB_A}/members/${HEAD_COACH}`, {
    authorizationRole: "MEMBER",
    status: "INACTIVE",
  }]]);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH)).commit());

  await testEnv.clearFirestore();
  await seedBaseline();
  await seedDraft();
  await seed([[`proClubs/${CLUB_A}/staff/${HEAD_COACH}`, {
    staffRole: "HEAD_COACH",
    status: "INACTIVE",
  }]]);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH)).commit());
});

test("inactive revoked or role-mismatched current authority denies editing", async () => {
  await seed([[`proClubs/${CLUB_A}/technicalGovernance/current`, {
    schemaVersion: 1,
    status: "INACTIVE",
    authorityUid: HEAD_COACH,
    authorityRole: "HEAD_COACH",
  }]]);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH)).commit());

  await testEnv.clearFirestore();
  await seedBaseline();
  await seedDraft();
  await remove(`proClubs/${CLUB_A}/technicalGovernance/current`);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH)).commit());

  await testEnv.clearFirestore();
  await seedBaseline();
  await seedDraft();
  await seed([[`proClubs/${CLUB_A}/technicalGovernance/current`, {
    schemaVersion: 1,
    status: "REVOKED",
    authorityUid: HEAD_COACH,
    authorityRole: "HEAD_COACH",
  }]]);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH)).commit());
});

test("current Head Coach cannot edit another author's schema-v2 draft", async () => {
  await seedDraft(OTHER_HEAD_COACH);
  await assertFails(buildEditBatch(authedDb(HEAD_COACH)).commit());
});

test("immutable plan identity lifecycle cardinality and creation fields cannot drift", async () => {
  const db = authedDb(HEAD_COACH);
  for (const plan of [
    { schemaVersion: 1 },
    { status: "SUBMITTED" },
    { authorUid: OTHER_HEAD_COACH },
    { weekStartDate: "2026-09-14" },
    { sessionCount: 2 },
    { createdBy: OTHER_HEAD_COACH },
    { createdAt: serverTimestamp() },
  ]) {
    await assertFails(buildEditBatch(db, { plan }).commit());
  }
});

test("immutable session identity order cardinality and creation fields cannot drift", async () => {
  const db = authedDb(HEAD_COACH);
  for (const session of [
    { schemaVersion: 1 },
    { orderIndex: 1 },
    { sessionDate: "2026-09-09" },
    { startTime: "17:00" },
    { blockCount: 2 },
    { createdBy: OTHER_HEAD_COACH },
    { createdAt: serverTimestamp() },
  ]) {
    await assertFails(buildEditBatch(db, { session }).commit());
  }
});

test("immutable block identity order and creation fields cannot drift", async () => {
  const db = authedDb(HEAD_COACH);
  for (const block of [
    { schemaVersion: 1 },
    { orderIndex: 1 },
    { createdBy: OTHER_HEAD_COACH },
    { createdAt: serverTimestamp() },
  ]) {
    await assertFails(buildEditBatch(db, { block }).commit());
  }
  await assertFails(setDoc(doc(db, `${sessionPath()}/blocks/block-02`), blockData()));
  await assertFails(deleteDoc(doc(db, blockPath())));
});

test("createdBy createdAt and hierarchy creation coherence cannot be spoofed", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(buildEditBatch(db, { plan: { createdBy: OTHER_HEAD_COACH } }).commit());
  await assertFails(buildEditBatch(db, { session: { createdAt: Timestamp.fromMillis(CREATED_AT.toMillis() + 1) } }).commit());
  await assertFails(buildEditBatch(db, { block: { createdAt: Timestamp.fromMillis(CREATED_AT.toMillis() + 1) } }).commit());
});

test("updatedBy spoof and non-server or regressing update timestamps are denied", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(buildEditBatch(db, { block: { updatedBy: OTHER_HEAD_COACH } }).commit());
  await assertFails(buildEditBatch(db, { plan: { updatedAt: Timestamp.fromMillis(CREATED_AT.toMillis() - 1) } }).commit());
  await assertFails(buildEditBatch(db, { session: { updatedAt: CREATED_AT } }).commit());
});

test("session-only and block-only updates fail without projected parent audit advancement", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(updateDoc(doc(db, sessionPath()), {
    location: "Session only",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  }));
  await assertFails(updateDoc(doc(db, blockPath()), {
    title: "Block only",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  }));
});

test("plan-only schema-v2 update is denied without coherent child hierarchy advancement", async () => {
  const db = authedDb(HEAD_COACH);
  await assertFails(updateDoc(doc(db, planPath()), {
    squadLabel: "Plan only",
    mainObjective: "This partial edit must not be accepted",
    secondaryObjective: "All saved children must advance coherently",
    headCoachNote: "Negative complete-hierarchy proof",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  }));
});

test("plan plus only one child subset cannot create a mixed audit hierarchy", async () => {
  const db = authedDb(HEAD_COACH);
  const planAndSession = writeBatch(db);
  planAndSession.update(doc(db, planPath()), {
    mainObjective: "Plan and session only",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  });
  planAndSession.update(doc(db, sessionPath()), {
    objective: "The block audit must not remain stale",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  });
  await assertFails(planAndSession.commit());

  const planAndBlock = writeBatch(db);
  planAndBlock.update(doc(db, planPath()), {
    mainObjective: "Plan and block only",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  });
  planAndBlock.update(doc(db, blockPath()), {
    title: "The session audit must not remain stale",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  });
  await assertFails(planAndBlock.commit());
});

test("schema-v2 Fresh-DRAFT atomic create remains accepted unchanged", async () => {
  await assertSucceeds(buildFreshDraftBatch(authedDb(HEAD_COACH)).commit());
  assert.equal((await getDoc(doc(authedDb(HEAD_COACH), planPath(CLUB_A, FRESH_PLAN_ID)))).exists(), true);
});

test("legacy schema-v1 own-DRAFT update behavior remains available", async () => {
  const legacyPlanId = "legacy-plan-a";
  await seed([[planPath(CLUB_A, legacyPlanId), v1PlanData()]]);
  await assertSucceeds(updateDoc(doc(authedDb(HEAD_COACH), planPath(CLUB_A, legacyPlanId)), {
    mainObjective: "Legacy behavior remains unchanged",
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH,
  }));
});
