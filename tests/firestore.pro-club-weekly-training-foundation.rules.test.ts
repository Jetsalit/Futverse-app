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

function draftData(authorUid = HC): DocumentData {
  return {
    schemaVersion: 1,
    authorUid,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    sessions: [{ sessionDate: "2026-09-08" }],
    createdAt: serverTimestamp(),
    createdBy: authorUid,
    updatedAt: serverTimestamp(),
    updatedBy: authorUid,
  };
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

test("ACTIVE Head Coach with ACTIVE membership/staff and valid authority snapshot can create own DRAFT", async () => {
  await assertSucceeds(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData()),
  );
});

test("Head Coach cannot create another author's DRAFT", async () => {
  await assertFails(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData(TD)),
  );
});

test("Assistant Coach cannot create a weekly DRAFT from staff role alone", async () => {
  await assertFails(
    setDoc(doc(authedDb(ASSISTANT), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData(ASSISTANT)),
  );
});

test("staff-only Head Coach without canonical Membership is denied", async () => {
  await assertFails(
    setDoc(doc(authedDb(STAFF_ONLY), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData(STAFF_ONLY)),
  );
});

test("inactive account is denied even with ACTIVE membership and staff documents", async () => {
  await assertFails(
    setDoc(doc(authedDb(INACTIVE_HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData(INACTIVE_HC)),
  );
});

test("global SUPERADMIN label gives no Pro Club weekly-training bypass", async () => {
  await assertFails(
    setDoc(doc(authedDb(OUTSIDER), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData(OUTSIDER)),
  );
});

test("DRAFT create fails closed when current authority snapshot points to a role mismatch", async () => {
  await seed([[`proClubs/${CLUB_A}/technicalGovernance/current`, {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TD,
    authorityRole: "HEAD_COACH",
  }]]);

  await assertFails(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData()),
  );
});

test("client cannot create update or delete canonical current technical authority", async () => {
  const db = authedDb(HC);
  const authorityRef = doc(db, `proClubs/${CLUB_A}/technicalGovernance/current`);

  await assertFails(updateDoc(authorityRef, { authorityUid: HC }));
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

test("active member can read weekly technical work but outsider cannot", async () => {
  await seed([[`proClubs/${CLUB_A}/weeklyTrainingPlans/seeded`, {
    ...draftData(),
    createdAt: new Date("2026-09-09T05:00:00Z"),
    updatedAt: new Date("2026-09-09T05:00:00Z"),
  }]]);

  await assertSucceeds(getDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/seeded`)));
  await assertSucceeds(getDoc(doc(authedDb(TD), `proClubs/${CLUB_A}/weeklyTrainingPlans/seeded`)));
  await assertFails(getDoc(doc(authedDb(OUTSIDER), `proClubs/${CLUB_A}/weeklyTrainingPlans/seeded`)));
});

test("author can edit content while status remains DRAFT", async () => {
  const ref = doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`);
  await assertSucceeds(setDoc(ref, draftData()));
  await assertSucceeds(
    updateDoc(ref, {
      mainObjective: "Updated objective",
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
});

test("foundation denies client lifecycle transition and delete", async () => {
  const ref = doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`);
  await assertSucceeds(setDoc(ref, draftData()));
  await assertFails(
    updateDoc(ref, {
      status: "SUBMITTED",
      updatedAt: serverTimestamp(),
      updatedBy: HC,
    }),
  );
});

test("cross-club authority evidence cannot authorize a club missing its own valid current authority", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    // Remove Club A's current authority while Club B still has a valid one for the same HC.
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(context.firestore(), `proClubs/${CLUB_A}/technicalGovernance/current`));
  });

  await assertFails(
    setDoc(doc(authedDb(HC), `proClubs/${CLUB_A}/weeklyTrainingPlans/plan-1`), draftData()),
  );
});
