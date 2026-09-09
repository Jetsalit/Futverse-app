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
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-weekly-training-root";
const CLUB_A = "club-a";
const HC = "hc-a";
const TD = "td-a";
const ASSISTANT = "assistant-a";
const INACTIVE_HC = "inactive-hc";
const STAFF_ONLY = "staff-only";
const OUTSIDER = "outsider";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
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
    [`users/${HC}`, { status: "ACTIVE" }],
    [`users/${TD}`, { status: "ACTIVE" }],
    [`users/${ASSISTANT}`, { status: "ACTIVE" }],
    [`users/${INACTIVE_HC}`, { status: "INACTIVE" }],
    [`users/${STAFF_ONLY}`, { status: "ACTIVE" }],
    [`users/${OUTSIDER}`, { status: "ACTIVE", role: "SUPERADMIN" }],

    [`proClubs/${CLUB_A}`, { name: "Club A", level: "T1", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${HC}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${HC}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${TD}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${TD}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${ASSISTANT}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${ASSISTANT}`, { staffRole: "ASSISTANT_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${INACTIVE_HC}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_HC}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${STAFF_ONLY}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],

    [`proClubs/${CLUB_A}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TD,
      authorityRole: "TECHNICAL_DIRECTOR",
    }],
  ]);
}

function planData(authorUid = HC): DocumentData {
  return {
    schemaVersion: 1,
    authorUid,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    createdAt: serverTimestamp(),
    createdBy: authorUid,
    updatedAt: serverTimestamp(),
    updatedBy: authorUid,
  };
}

function sessionData(actorUid = HC): DocumentData {
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
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function blockData(actorUid = HC): DocumentData {
  return {
    schemaVersion: 1,
    orderIndex: 0,
    blockType: "TACTICAL",
    title: "Build-up 8v6",
    durationMinutes: 45,
    coachingPoints: ["Create the third-man option"],
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

function planRef(db: Firestore) {
  return doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`);
}

function sessionRef(db: Firestore) {
  return doc(
    db,
    `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600`,
  );
}

function blockRef(db: Firestore) {
  return doc(
    db,
    `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-01`,
  );
}

async function createPlan(db: Firestore): Promise<void> {
  await assertSucceeds(setDoc(planRef(db), planData()));
}

async function createDraftHierarchy(db: Firestore): Promise<void> {
  await createPlan(db);
  await assertSucceeds(setDoc(sessionRef(db), sessionData()));
  await assertSucceeds(setDoc(blockRef(db), blockData()));
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(
    emulatorHost,
    "Root Rules tests must run through the Firestore Emulator.",
  );

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

test("root rules allow the canonical Head Coach DRAFT hierarchy and active-member reads", async () => {
  await createDraftHierarchy(authedDb(HC));

  const assistantDb = authedDb(ASSISTANT);
  await assertSucceeds(getDoc(planRef(assistantDb)));
  await assertSucceeds(getDoc(sessionRef(assistantDb)));
  await assertSucceeds(getDoc(blockRef(assistantDb)));
  await assertSucceeds(
    getDoc(doc(assistantDb, `proClubs/${CLUB_A}/technicalGovernance/current`)),
  );
});

test("root rules deny inactive, staff-only, and global SUPERADMIN write bypasses", async () => {
  await assertFails(setDoc(planRef(authedDb(INACTIVE_HC)), planData(INACTIVE_HC)));
  await assertFails(setDoc(planRef(authedDb(STAFF_ONLY)), planData(STAFF_ONLY)));
  await assertFails(setDoc(planRef(authedDb(OUTSIDER)), planData(OUTSIDER)));
});

test("root rules require current authority to match active canonical Membership and Staff", async () => {
  await seed([
    [`proClubs/${CLUB_A}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TD,
      authorityRole: "HEAD_COACH",
    }],
  ]);

  await assertFails(setDoc(planRef(authedDb(HC)), planData()));
});

test("root rules preserve normalized text and immutable plan-week invariants", async () => {
  const db = authedDb(HC);

  await assertFails(setDoc(planRef(db), { ...planData(), squadLabel: "   " }));
  await assertFails(setDoc(planRef(db), { ...planData(), mainObjective: " padded " }));

  await createDraftHierarchy(db);
  await assertFails(
    updateDoc(planRef(db), {
      weekStartDate: "2026-09-14",
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
  await assertFails(
    updateDoc(sessionRef(db), {
      location: " padded ",
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
  await assertFails(
    updateDoc(blockRef(db), {
      coachingPoints: ["   "],
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
});

test("root rules preserve deterministic session/block identity and parent-week bounds", async () => {
  const db = authedDb(HC);
  await createPlan(db);

  await assertFails(
    setDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-09-0900`,
      ),
      sessionData(),
    ),
  );
  await assertFails(
    setDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-14-1600`,
      ),
      { ...sessionData(), sessionDate: "2026-09-14" },
    ),
  );

  await assertSucceeds(setDoc(sessionRef(db), sessionData()));
  await assertFails(
    setDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-02`,
      ),
      blockData(),
    ),
  );
});

test("root rules keep lifecycle transitions, deletes, and technical-governance client writes closed", async () => {
  const db = authedDb(HC);
  await createDraftHierarchy(db);

  await assertFails(
    updateDoc(planRef(db), {
      status: "SUBMITTED",
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
  await assertFails(deleteDoc(blockRef(db)));

  const authorityRef = doc(db, `proClubs/${CLUB_A}/technicalGovernance/current`);
  await assertFails(updateDoc(authorityRef, { authorityUid: HC }));
  await assertFails(deleteDoc(authorityRef));
});

test("root rules leave unrelated Pro Club child paths fail-closed", async () => {
  const db = authedDb(HC);
  await assertFails(
    setDoc(doc(db, `proClubs/${CLUB_A}/unexpectedCollection/doc-1`), { unsafe: true }),
  );
  await assertFails(
    setDoc(doc(db, `proClubs/${CLUB_A}/nameHistory/change-1`), { unsafe: true }),
  );
});
