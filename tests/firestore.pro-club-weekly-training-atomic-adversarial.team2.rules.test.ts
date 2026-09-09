import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";

import {
  assertFails,
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

const PROJECT_ID = "demo-futverse-pro-club-weekly-training-team2-adversarial";
const CLUB_ID = "club-team2";
const HC = "hc-team2";
const ASSISTANT = "assistant-team2";
const TD = "td-team2";
const PLAN_ID = "team2-plan";
const SESSION_ID = "2026-09-08-1600";

let testEnv: RulesTestEnvironment;

function db(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

async function seedCanonicalBaseline(): Promise<void> {
  await seed([
    [`users/${HC}`, { status: "ACTIVE" }],
    [`users/${ASSISTANT}`, { status: "ACTIVE" }],
    [`users/${TD}`, { status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}`, { name: "Team 2 Club", level: "T1", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${HC}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${HC}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${ASSISTANT}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${ASSISTANT}`, { staffRole: "ASSISTANT_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${TD}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${TD}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TD,
      authorityRole: "TECHNICAL_DIRECTOR",
    }],
  ]);
}

const planPath = () => `proClubs/${CLUB_ID}/weeklyTrainingPlans/${PLAN_ID}`;
const sessionPath = () => `${planPath()}/sessions/${SESSION_ID}`;
const blockPath = () => `${sessionPath()}/blocks/block-01`;

function planData(actor: string, author = actor): DocumentData {
  return {
    schemaVersion: 1,
    authorUid: author,
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

function sessionData(actor: string): DocumentData {
  return {
    schemaVersion: 1,
    orderIndex: 0,
    sessionDate: "2026-09-08",
    startTime: "16:00",
    location: "Training Ground",
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

function blockData(actor: string): DocumentData {
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

async function attemptHierarchy(actor: string, author = actor): Promise<void> {
  const firestore = db(actor);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, planPath()), planData(actor, author));
  batch.set(doc(firestore, sessionPath()), sessionData(actor));
  batch.set(doc(firestore, blockPath()), blockData(actor));
  await assertFails(batch.commit());

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    assert.equal((await getDoc(doc(adminDb, planPath()))).exists(), false);
    assert.equal((await getDoc(doc(adminDb, sessionPath()))).exists(), false);
    assert.equal((await getDoc(doc(adminDb, blockPath()))).exists(), false);
  });
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Team 2 audit must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
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
  await seedCanonicalBaseline();
});

after(async () => {
  await testEnv.cleanup();
});

test("Assistant Coach cannot use fresh-child atomic path to bypass plan authorization", async () => {
  await attemptHierarchy(ASSISTANT);
});

test("inactive Head Coach cannot use fresh-child atomic path to bypass account gate", async () => {
  await seed([[`users/${HC}`, { status: "INACTIVE" }]]);
  await attemptHierarchy(HC);
});

test("governance role mismatch rejects the entire atomic hierarchy", async () => {
  await seed([[`proClubs/${CLUB_ID}/staff/${TD}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }]]);
  await attemptHierarchy(HC);
});

test("Head Coach cannot atomically create a fresh hierarchy authored by another user", async () => {
  await attemptHierarchy(HC, TD);
});
