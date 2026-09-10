import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

const PROJECT_ID = "demo-futverse-pro-club-support-read-v1";
const CLUB_A = "club-a";
const CLUB_B = "club-b";
const SUPERADMIN = "support-superadmin";
const INACTIVE_SUPERADMIN = "inactive-superadmin";
const DATA_ADMIN = "data-admin";
const OUTSIDER = "outsider";
const HEAD_COACH = "head-coach-a";
const PLAN_ID = "plan-a";
const SESSION_ID = "2026-09-10-1800";
const BLOCK_ID = "block-01";

let testEnv: RulesTestEnvironment;

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seed(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `users/${SUPERADMIN}`), { role: "SUPERADMIN", status: "ACTIVE" }),
      setDoc(doc(db, `users/${INACTIVE_SUPERADMIN}`), { role: "SUPERADMIN", status: "INACTIVE" }),
      setDoc(doc(db, `users/${DATA_ADMIN}`), { role: "DATA_ADMIN", status: "ACTIVE" }),
      setDoc(doc(db, `users/${OUTSIDER}`), { role: "USER", status: "ACTIVE" }),
      setDoc(doc(db, `proClubs/${CLUB_A}`), { name: "Club A", level: "T3", status: "ACTIVE" }),
      setDoc(doc(db, `proClubs/${CLUB_B}`), { name: "Club B", level: "T2", status: "ACTIVE" }),
      setDoc(doc(db, `proClubs/${CLUB_A}/members/${HEAD_COACH}`), { authorizationRole: "MEMBER", status: "ACTIVE" }),
      setDoc(doc(db, `proClubs/${CLUB_A}/staff/${HEAD_COACH}`), { staffRole: "HEAD_COACH", status: "ACTIVE" }),
      setDoc(doc(db, `proClubs/${CLUB_A}/technicalGovernance/current`), {
        schemaVersion: 1,
        status: "ACTIVE",
        authorityUid: HEAD_COACH,
        authorityRole: "HEAD_COACH",
      }),
      setDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/${PLAN_ID}`), {
        schemaVersion: 1,
        authorUid: HEAD_COACH,
        status: "DRAFT",
      }),
      setDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/${PLAN_ID}/sessions/${SESSION_ID}`), {
        schemaVersion: 1,
        orderIndex: 0,
      }),
      setDoc(doc(db, `proClubs/${CLUB_A}/weeklyTrainingPlans/${PLAN_ID}/sessions/${SESSION_ID}/blocks/${BLOCK_ID}`), {
        schemaVersion: 1,
        orderIndex: 0,
      }),
      setDoc(doc(db, `proClubs/${CLUB_A}/private/secret`), { secret: true }),
    ]);
  });
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
  await seed();
});

after(async () => {
  await testEnv.cleanup();
});

test("ACTIVE SUPERADMIN can read exact support targets", async () => {
  const db = authedDb(SUPERADMIN);

  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_A)));
  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_B)));
  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_A, "members", HEAD_COACH)));
  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_A, "staff", HEAD_COACH)));
  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_A, "technicalGovernance", "current")));
  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID)));
  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID, "sessions", SESSION_ID)));
  await assertSucceeds(getDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID, "sessions", SESSION_ID, "blocks", BLOCK_ID)));
});

test("support read permits operational lists only inside an exact club", async () => {
  const db = authedDb(SUPERADMIN);

  await assertSucceeds(getDocs(collection(db, "proClubs", CLUB_A, "weeklyTrainingPlans")));
  await assertSucceeds(getDocs(collection(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID, "sessions")));
  await assertSucceeds(getDocs(collection(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID, "sessions", SESSION_ID, "blocks")));

  await assertFails(getDocs(collection(db, "proClubs")));
  await assertFails(getDocs(collection(db, "proClubs", CLUB_A, "members")));
  await assertFails(getDocs(collection(db, "proClubs", CLUB_A, "staff")));
});

test("support read does not expose unknown Pro Club child paths", async () => {
  await assertFails(
    getDoc(doc(authedDb(SUPERADMIN), "proClubs", CLUB_A, "private", "secret")),
  );
});

test("inactive SUPERADMIN DATA_ADMIN and outsider receive no support-read bypass", async () => {
  for (const uid of [INACTIVE_SUPERADMIN, DATA_ADMIN, OUTSIDER]) {
    const db = authedDb(uid);
    await assertFails(getDoc(doc(db, "proClubs", CLUB_A)));
    await assertFails(getDoc(doc(db, "proClubs", CLUB_A, "members", HEAD_COACH)));
    await assertFails(getDoc(doc(db, "proClubs", CLUB_A, "staff", HEAD_COACH)));
    await assertFails(getDoc(doc(db, "proClubs", CLUB_A, "technicalGovernance", "current")));
    await assertFails(getDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID)));
  }
});

test("support read grants no Pro Club root membership staff or governance mutation", async () => {
  const db = authedDb(SUPERADMIN);

  await assertFails(setDoc(doc(db, "proClubs", "new-club"), { name: "New", level: "T3", status: "ACTIVE" }));
  await assertFails(updateDoc(doc(db, "proClubs", CLUB_A), { name: "Changed" }));
  await assertFails(deleteDoc(doc(db, "proClubs", CLUB_A)));

  await assertFails(setDoc(doc(db, "proClubs", CLUB_A, "members", SUPERADMIN), { authorizationRole: "OWNER", status: "ACTIVE" }));
  await assertFails(setDoc(doc(db, "proClubs", CLUB_A, "staff", SUPERADMIN), { staffRole: "HEAD_COACH", status: "ACTIVE" }));
  await assertFails(updateDoc(doc(db, "proClubs", CLUB_A, "technicalGovernance", "current"), { authorityUid: SUPERADMIN }));
});

test("support read grants no Weekly Training mutation", async () => {
  const db = authedDb(SUPERADMIN);

  await assertFails(updateDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID), { status: "DRAFT" }));
  await assertFails(setDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", "support-created"), { authorUid: SUPERADMIN, status: "DRAFT" }));
  await assertFails(updateDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID, "sessions", SESSION_ID), { orderIndex: 1 }));
  await assertFails(updateDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID, "sessions", SESSION_ID, "blocks", BLOCK_ID), { orderIndex: 1 }));
  await assertFails(deleteDoc(doc(db, "proClubs", CLUB_A, "weeklyTrainingPlans", PLAN_ID)));
});
