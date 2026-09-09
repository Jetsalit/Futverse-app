import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { createWeeklyTrainingDraftSaveService } from "../functions/src/proClubWeeklyTrainingDraftSave/service.ts";
import { WeeklyTrainingDraftSaveError } from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

const PROJECT_ID = "demo-futverse-weekly-training-idempotency-team2-r3";
const CLUB_ID = "club-a";
const HC_UID = "hc-a";
const HC2_UID = "hc-b";
const TD_UID = "td-a";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const RECEIPTS = "weeklyTrainingDraftSaveReceipts";

const app = initializeApp({ projectId: PROJECT_ID }, "weekly-training-idempotency-team2-r3");
const db = getFirestore(app);
let rulesEnv: RulesTestEnvironment;

function draft(mainObjective = "Build through pressure") {
  return {
    clubId: CLUB_ID,
    authorUid: "payload-author-is-not-authority",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective,
    sessions: [{
      sessionDate: "2026-09-07",
      startTime: "09:00",
      location: "Training Ground A",
      objective: "Progress through first line",
      phaseOfPlay: "GENERAL",
      plannedLoad: "MODERATE",
      durationMinutes: 60,
      blocks: [{
        blockType: "TACTICAL",
        title: "Build-up",
        durationMinutes: 30,
        coachingPoints: ["Body orientation"],
      }],
    }],
  };
}

async function clear(): Promise<void> {
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_ID));
  for (const uid of [HC_UID, HC2_UID, TD_UID]) {
    await db.collection("users").doc(uid).delete().catch(() => undefined);
  }
}

async function seed(): Promise<void> {
  const club = db.collection("proClubs").doc(CLUB_ID);
  const batch = db.batch();
  for (const uid of [HC_UID, HC2_UID, TD_UID]) batch.set(db.collection("users").doc(uid), { status: "ACTIVE" });
  batch.set(club, { name: "Club A", status: "ACTIVE", level: "T1" });
  for (const uid of [HC_UID, HC2_UID, TD_UID]) batch.set(club.collection("members").doc(uid), { authorizationRole: "MEMBER", status: "ACTIVE" });
  batch.set(club.collection("staff").doc(HC_UID), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  batch.set(club.collection("staff").doc(HC2_UID), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  batch.set(club.collection("staff").doc(TD_UID), { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" });
  batch.set(club.collection("technicalGovernance").doc("current"), {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TD_UID,
    authorityRole: "TECHNICAL_DIRECTOR",
  });
  await batch.commit();
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Must run against Firestore Emulator");
  const rules = await readFile("firestore.rules", "utf8");
  rulesEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules } });
  await clear();
});

beforeEach(async () => {
  await clear();
  await seed();
});

after(async () => {
  await clear();
  await rulesEnv.cleanup();
  await deleteApp(app);
});

test("concurrent same-request executions converge to one hierarchy and one receipt", async () => {
  let sequence = 0;
  const service = createWeeklyTrainingDraftSaveService({
    firestore: db,
    trustedClock: () => new Date("2026-09-09T17:00:00.000Z"),
    planIdFactory: () => `concurrent-plan-${++sequence}`,
  });

  const [a, b, c] = await Promise.all([
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() }),
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() }),
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() }),
  ]);

  assert.equal(a.planId, b.planId);
  assert.equal(b.planId, c.planId);
  assert.equal(a.requestId, REQUEST_ID);
  const club = db.collection("proClubs").doc(CLUB_ID);
  assert.equal((await club.collection("weeklyTrainingPlans").get()).size, 1);
  assert.equal((await club.collection(RECEIPTS).get()).size, 1);
});

test("request identity cannot be replayed by another active Head Coach", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() });
  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC2_UID, requestId: REQUEST_ID, draft: draft() }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
  assert.equal((await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").get()).size, 1);
});

test("tampered receipt fails closed instead of manufacturing retry success", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() });
  const receipt = db.collection("proClubs").doc(CLUB_ID).collection(RECEIPTS).doc(REQUEST_ID);
  await receipt.update({ requestFingerprint: "0".repeat(64) });
  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
});

test("receipt pointing to a missing plan fails closed", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  const first = await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() });
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(first.planId));
  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
});

test("client Firestore rules expose no read or write path to idempotency receipts", async () => {
  const clientDb = rulesEnv.authenticatedContext(HC_UID).firestore();
  const receiptRef = doc(clientDb, "proClubs", CLUB_ID, RECEIPTS, REQUEST_ID);
  await assertFails(getDoc(receiptRef));
  await assertFails(setDoc(receiptRef, { planId: "forged" }));
});

test("UI keeps ambiguous retry identity, locks payload, and has no browser Firestore writer", async () => {
  const composer = await readFile("src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx", "utf8");
  const client = await readFile("src/lib/proClubWeeklyTrainingDraftSaveClient.ts", "utf8");
  assert.match(composer, /pendingRequestId/);
  assert.match(composer, /isAmbiguousWeeklyTrainingDraftSaveError/);
  assert.match(composer, /setPendingRequestId\(requestId\)/);
  assert.match(composer, /disabled=\{saving \|\| Boolean\(saved\) \|\| ambiguousSave\}/);
  assert.match(composer, /Retry same save/);
  assert.match(client, /response\.requestId !== input\.requestId/);
  for (const source of [composer, client]) {
    for (const forbidden of [/firebase\/firestore/, /\bsetDoc\b/, /\baddDoc\b/, /\bwriteBatch\b/, /\bupdateDoc\b/]) {
      assert.doesNotMatch(source, forbidden);
    }
  }
});

test("same request with changed canonical payload remains fail closed", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() });
  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft("Different objective") }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
});
