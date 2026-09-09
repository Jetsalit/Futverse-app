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

const PROJECT_ID = "demo-futverse-pro-club-weekly-training-foundation";
const CLUB_A = "club-a";
const CLUB_B = "club-b";
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
    await Promise.all(entries.map(([path, data]) => setDoc(doc(context.firestore(), path), data)));
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

    [`proClubs/${CLUB_A}/members/${HC}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${HC}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${TD}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${TD}`, { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${ASSISTANT}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${ASSISTANT}`, { staffRole: "ASSISTANT_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/members/${INACTIVE_HC}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${INACTIVE_HC}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],
    [`proClubs/${CLUB_A}/staff/${STAFF_ONLY}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],

    [`proClubs/${CLUB_B}/members/${HC}`, { authorizationRole: "MEMBER", status: "ACTIVE" }],
    [`proClubs/${CLUB_B}/staff/${HC}`, { staffRole: "HEAD_COACH", status: "ACTIVE" }],

    [`proClubs/${CLUB_A}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: TD,
      authorityRole: "TECHNICAL_DIRECTOR",
    }],
    [`proClubs/${CLUB_B}/technicalGovernance/current`, {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: HC,
      authorityRole: "HEAD_COACH",
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

async function createDraftHierarchy(db: Firestore): Promise<void> {
  await assertSucceeds(
    setDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData()),
  );
  await assertSucceeds(
    setDoc(
      doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600`),
      sessionData(),
    ),
  );
  await assertSucceeds(
    setDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-01`,
      ),
      blockData(),
    ),
  );
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
      rules: readFileSync(
        new URL("./fixtures/firestore.pro-club-weekly-training.foundation.rules", import.meta.url),
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

test("ACTIVE Head Coach can create normalized own DRAFT plan/session/block hierarchy", async () => {
  await createDraftHierarchy(authedDb(HC));
});

test("plan metadata rejects embedded sessions so nested data cannot bypass document rules", async () => {
  await assertFails(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), {
      ...planData(),
      sessions: [{ unsafe: true }],
    }),
  );
});

test("Head Coach cannot create another author's DRAFT", async () => {
  await assertFails(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData(TD)),
  );
});

test("Assistant Coach and staff-only Head Coach cannot create weekly work", async () => {
  await assertFails(
    setDoc(doc(authedDb(ASSISTANT), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData(ASSISTANT)),
  );
  await assertFails(
    setDoc(doc(authedDb(STAFF_ONLY), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData(STAFF_ONLY)),
  );
});

test("inactive account and global SUPERADMIN label get no write bypass", async () => {
  await assertFails(
    setDoc(doc(authedDb(INACTIVE_HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData(INACTIVE_HC)),
  );
  await assertFails(
    setDoc(doc(authedDb(OUTSIDER), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData(OUTSIDER)),
  );
});

test("DRAFT create fails closed when current authority snapshot role mismatches canonical staff", async () => {
  await seed([[`proClubs/${CLUB_A}/technicalGovernance/current`, {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TD,
    authorityRole: "HEAD_COACH",
  }]]);

  await assertFails(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData()),
  );
});

test("client cannot create update or delete canonical current technical authority", async () => {
  const db = authedDb(HC);
  const authorityRef = doc(db, `proClubs/${CLUB_A}/technicalGovernance/current`);

  await assertFails(updateDoc(authorityRef, { authorityUid: HC }));
  await assertFails(deleteDoc(authorityRef));
  await assertFails(
    setDoc(doc(db, `proClubs/${CLUB_A}/technicalGovernance/new-current`), {
      schemaVersion: 1,
      status: "ACTIVE",
      authorityUid: HC,
      authorityRole: "HEAD_COACH",
    }),
  );
});

test("active staff can read current authority while outsider cannot", async () => {
  await assertSucceeds(
    getDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/technicalGovernance/current`)),
  );
  await assertFails(
    getDoc(doc(authedDb(OUTSIDER), `proClubs/${CLUB_A}/technicalGovernance/current`)),
  );
});

test("session writes require an existing own DRAFT parent plan", async () => {
  const db = authedDb(HC);
  const sessionRef = doc(
    db,
    `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600`,
  );

  await assertFails(setDoc(sessionRef, sessionData()));
  await assertSucceeds(
    setDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData()),
  );
  await assertSucceeds(setDoc(sessionRef, sessionData()));
});

test("block writes require existing session and validate coaching points deeply", async () => {
  const db = authedDb(HC);
  await assertSucceeds(
    setDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData()),
  );

  const blockRef = doc(
    db,
    `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-01`,
  );
  await assertFails(setDoc(blockRef, blockData()));

  await assertSucceeds(
    setDoc(
      doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600`),
      sessionData(),
    ),
  );
  await assertSucceeds(setDoc(blockRef, blockData()));

  await assertFails(
    setDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-02`,
      ),
      { ...blockData(), orderIndex: 1, coachingPoints: [] },
    ),
  );
  await assertFails(
    setDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-02`,
      ),
      { ...blockData(), orderIndex: 1, coachingPoints: ["Good", 42] },
    ),
  );
});

test("author can edit normalized DRAFT metadata/session/block while immutable fields stay protected", async () => {
  const db = authedDb(HC);
  await createDraftHierarchy(db);

  await assertSucceeds(
    updateDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), {
      mainObjective: "Updated objective",
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
  await assertSucceeds(
    updateDoc(
      doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600`),
      { objective: "Updated session objective", updatedAt: serverTimestamp(), updatedBy: HC },
    ),
  );
  await assertSucceeds(
    updateDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-01`,
      ),
      { title: "Updated block", updatedAt: serverTimestamp(), updatedBy: HC },
    ),
  );

  await assertFails(
    updateDoc(
      doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600`),
      { orderIndex: 2, updatedAt: serverTimestamp(), updatedBy: HC },
    ),
  );
});

test("foundation denies lifecycle transition and deletes", async () => {
  const db = authedDb(HC);
  await createDraftHierarchy(db);

  await assertFails(
    updateDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), {
      status: "SUBMITTED",
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
  await assertFails(
    deleteDoc(
      doc(
        db,
        `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1/sessions/2026-09-08-1600/blocks/block-01`,
      ),
    ),
  );
});

test("cross-club authority evidence cannot authorize a club missing its own valid current authority", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), `proClubs/${CLUB_A}/technicalGovernance/current`));
  });

  await assertFails(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), planData()),
  );
});
