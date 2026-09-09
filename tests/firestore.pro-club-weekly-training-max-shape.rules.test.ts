import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";

import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pr119-max-shape";
const CLUB_ID = "club-a";
const HEAD_COACH_UID = "hc-a";
const TECHNICAL_DIRECTOR_UID = "td-a";
const PLAN_ID = "max-shape-plan";
const WEEK_START = "2026-09-07";

let testEnv: RulesTestEnvironment;

function authedDb(): Firestore {
  return testEnv.authenticatedContext(HEAD_COACH_UID).firestore() as unknown as Firestore;
}

async function seed(entries: Array<[string, DocumentData]>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
  });
}

async function seedBaseline(): Promise<void> {
  await seed([
    [`users/${HEAD_COACH_UID}`, { status: "ACTIVE" }],
    [`users/${TECHNICAL_DIRECTOR_UID}`, { status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}`, { name: "Club A", level: "T1", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${HEAD_COACH_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${HEAD_COACH_UID}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/members/${TECHNICAL_DIRECTOR_UID}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_ID}/staff/${TECHNICAL_DIRECTOR_UID}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
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

function planData(): DocumentData {
  return {
    schemaVersion: 1,
    authorUid: HEAD_COACH_UID,
    status: "DRAFT",
    weekStartDate: WEEK_START,
    squadLabel: "First Team",
    mainObjective: "Maximum valid fresh draft shape",
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  };
}

function sessionSlot(index: number): { date: string; time: string; id: string } {
  const day = 7 + Math.floor(index / 2);
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  const time = index % 2 === 0 ? "09:00" : "16:00";
  return { date, time, id: `${date}-${time.replace(":", "")}` };
}

function sessionData(index: number): DocumentData {
  const slot = sessionSlot(index);
  return {
    schemaVersion: 1,
    orderIndex: index,
    sessionDate: slot.date,
    startTime: slot.time,
    location: "Training Ground A",
    objective: `Session ${index + 1}`,
    phaseOfPlay: "GENERAL",
    plannedLoad: "MODERATE",
    durationMinutes: 60,
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
    title: "Canonical block",
    durationMinutes: 30,
    coachingPoints: ["One coaching point"],
    createdAt: serverTimestamp(),
    createdBy: HEAD_COACH_UID,
    updatedAt: serverTimestamp(),
    updatedBy: HEAD_COACH_UID,
  };
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Must run through the Firestore Emulator.");
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
  await seedBaseline();
});

after(async () => {
  await testEnv.cleanup();
});

test("PR119 root rules allow the domain-valid maximum 14-session fresh hierarchy atomically", async () => {
  const db = authedDb();
  const batch = writeBatch(db);
  batch.set(doc(db, planPath()), planData());

  for (let index = 0; index < 14; index += 1) {
    const slot = sessionSlot(index);
    const sessionPath = `${planPath()}/sessions/${slot.id}`;
    batch.set(doc(db, sessionPath), sessionData(index));
    batch.set(doc(db, `${sessionPath}/blocks/block-01`), blockData());
  }

  await assertSucceeds(batch.commit());
});
