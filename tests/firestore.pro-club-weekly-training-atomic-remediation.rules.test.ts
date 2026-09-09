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

const PROJECT_ID = "demo-futverse-pro-club-weekly-training-atomic-remediation";
const CLUB = "club-a";
const HC = "hc-a";
const TD = "td-a";
const ASSISTANT = "assistant-a";
const PLAN = "plan-atomic";
const SESSION = "2026-09-08-1600";

let env: RulesTestEnvironment;

function db(uid: string): Firestore {
  return env.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

async function baseline(): Promise<void> {
  await seed([
    [`users/${HC}`, { status: "ACTIVE" }],
    [`users/${TD}`, { status: "ACTIVE" }],
    [`users/${ASSISTANT}`, { status: "ACTIVE" }],
    [`proClubs/${CLUB}/members/${HC}`, { status: "ACTIVE" }],
    [`proClubs/${CLUB}/staff/${HC}`, { status: "ACTIVE", staffRole: "HEAD_COACH" }],
    [`proClubs/${CLUB}/members/${TD}`, { status: "ACTIVE" }],
    [`proClubs/${CLUB}/staff/${TD}`, { status: "ACTIVE", staffRole: "TECHNICAL_DIRECTOR" }],
    [`proClubs/${CLUB}/members/${ASSISTANT}`, { status: "ACTIVE" }],
    [`proClubs/${CLUB}/staff/${ASSISTANT}`, { status: "ACTIVE", staffRole: "ASSISTANT_COACH" }],
    [`proClubs/${CLUB}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TD,
      authorityRole: "TECHNICAL_DIRECTOR",
    }],
  ]);
}

const planPath = (id = PLAN) => `proClubs/${CLUB}/weeklyTrainingPlans/${id}`;
const sessionPath = (id = PLAN) => `${planPath(id)}/sessions/${SESSION}`;
const blockPath = (id = PLAN, block = "block-01") => `${sessionPath(id)}/blocks/${block}`;

function planData(actor = HC): DocumentData {
  return {
    schemaVersion: 1,
    authorUid: actor,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    createdAt: serverTimestamp(),
    createdBy: actor,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  };
}

function sessionData(actor = HC): DocumentData {
  return {
    schemaVersion: 1,
    orderIndex: 0,
    sessionDate: "2026-09-08",
    startTime: "16:00",
    location: "Training Ground A",
    objective: "Progress through pressure",
    phaseOfPlay: "IN_POSSESSION",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    createdAt: serverTimestamp(),
    createdBy: actor,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  };
}

function blockData(actor = HC): DocumentData {
  return {
    schemaVersion: 1,
    orderIndex: 0,
    blockType: "TACTICAL",
    title: "Build-up 8v6",
    durationMinutes: 45,
    coachingPoints: ["Create the third-man option"],
    createdAt: serverTimestamp(),
    createdBy: actor,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
  };
}

before(async () => {
  const raw = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(raw, "Remediation rules test requires Firestore Emulator.");
  const split = raw.lastIndexOf(":");
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: raw.slice(0, split),
      port: Number(raw.slice(split + 1)),
      rules: readFileSync(
        new URL("./fixtures/firestore.pro-club-weekly-training.atomic-create-remediation.rules", import.meta.url),
        "utf8",
      ),
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await baseline();
});

after(async () => env.cleanup());

test("cheap fresh path permits one canonical atomic hierarchy", async () => {
  const actorDb = db(HC);
  const batch = writeBatch(actorDb);
  batch.set(doc(actorDb, planPath()), planData());
  batch.set(doc(actorDb, sessionPath()), sessionData());
  batch.set(doc(actorDb, blockPath()), blockData());
  await assertSucceeds(batch.commit());

  assert.equal((await getDoc(doc(actorDb, planPath()))).exists(), true);
  assert.equal((await getDoc(doc(actorDb, sessionPath()))).exists(), true);
  assert.equal((await getDoc(doc(actorDb, blockPath()))).exists(), true);
});

test("sequential fallback remains valid for canonical Head Coach writes", async () => {
  const actorDb = db(HC);
  await assertSucceeds(setDoc(doc(actorDb, planPath()), planData()));
  await assertSucceeds(setDoc(doc(actorDb, sessionPath()), sessionData()));
  await assertSucceeds(setDoc(doc(actorDb, blockPath()), blockData()));
});

test("assistant cannot bootstrap an atomic hierarchy through the cheap child path", async () => {
  const actorDb = db(ASSISTANT);
  const batch = writeBatch(actorDb);
  batch.set(doc(actorDb, planPath("assistant-plan")), planData(ASSISTANT));
  batch.set(doc(actorDb, sessionPath("assistant-plan")), sessionData(ASSISTANT));
  batch.set(doc(actorDb, blockPath("assistant-plan")), blockData(ASSISTANT));
  await assertFails(batch.commit());

  assert.equal((await getDoc(doc(actorDb, planPath("assistant-plan")))).exists(), false);
});

test("invalid block identity rejects the whole atomic hierarchy", async () => {
  const actorDb = db(HC);
  const batch = writeBatch(actorDb);
  batch.set(doc(actorDb, planPath()), planData());
  batch.set(doc(actorDb, sessionPath()), sessionData());
  batch.set(doc(actorDb, blockPath(PLAN, "block-02")), blockData());
  await assertFails(batch.commit());

  assert.equal((await getDoc(doc(actorDb, planPath()))).exists(), false);
  assert.equal((await getDoc(doc(actorDb, sessionPath()))).exists(), false);
});
