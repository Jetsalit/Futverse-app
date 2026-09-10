import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const PROJECT_ID = "demo-futverse-weekly-training-cross-tenant-team2-r4";
const CLUB_A = "club-a";
const CLUB_B = "club-b";
const HC_UID = "hc-a";
const TD_UID = "td-a";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const OPERATION = "PRO_CLUB_WEEKLY_TRAINING_DRAFT_SAVE";
const REQUESTS = "weeklyTrainingDraftSaveRequests";

const app = initializeApp({ projectId: PROJECT_ID }, "weekly-training-cross-tenant-team2-r4");
const db = getFirestore(app);
let rulesEnv: RulesTestEnvironment;

function registryId(actorUid = HC_UID, requestId = REQUEST_ID): string {
  return createHash("sha256")
    .update(JSON.stringify([OPERATION, actorUid, requestId]))
    .digest("hex");
}

function draft(clubId: string, mainObjective = "Build through pressure") {
  return {
    clubId,
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

function seedClub(batch: FirebaseFirestore.WriteBatch, clubId: string): void {
  const club = db.collection("proClubs").doc(clubId);
  batch.set(club, { name: clubId === CLUB_A ? "Club A" : "Club B", status: "ACTIVE", level: "T1" });
  batch.set(club.collection("members").doc(HC_UID), { authorizationRole: "MEMBER", status: "ACTIVE" });
  batch.set(club.collection("staff").doc(HC_UID), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  batch.set(club.collection("members").doc(TD_UID), { authorizationRole: "MEMBER", status: "ACTIVE" });
  batch.set(club.collection("staff").doc(TD_UID), { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" });
  batch.set(club.collection("technicalGovernance").doc("current"), {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TD_UID,
    authorityRole: "TECHNICAL_DIRECTOR",
  });
}

async function clear(): Promise<void> {
  await Promise.all([
    db.recursiveDelete(db.collection("proClubs").doc(CLUB_A)),
    db.recursiveDelete(db.collection("proClubs").doc(CLUB_B)),
    db.recursiveDelete(db.collection(REQUESTS)),
  ]);
  for (const uid of [HC_UID, TD_UID]) {
    await db.collection("users").doc(uid).delete().catch(() => undefined);
  }
}

async function seed(): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection("users").doc(HC_UID), { status: "ACTIVE" });
  batch.set(db.collection("users").doc(TD_UID), { status: "ACTIVE" });
  seedClub(batch, CLUB_A);
  seedClub(batch, CLUB_B);
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

test("same actor request ID cannot be reused from Club A in Club B", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  const first = await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) });

  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_B) }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );

  assert.equal((await db.collection("proClubs").doc(CLUB_A).collection("weeklyTrainingPlans").get()).size, 1);
  assert.equal((await db.collection("proClubs").doc(CLUB_B).collection("weeklyTrainingPlans").get()).size, 0);
  const receipt = await db.collection(REQUESTS).doc(registryId()).get();
  assert.equal(receipt.exists, true);
  assert.equal(receipt.data()?.clubId, CLUB_A);
  assert.equal(receipt.data()?.planId, first.planId);
});

test("concurrent cross-tenant race commits exactly one club and one actor-global receipt", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  const outcomes = await Promise.allSettled([
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) }),
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_B) }),
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) }),
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_B) }),
  ]);

  const fulfilled = outcomes.filter((result) => result.status === "fulfilled");
  const rejected = outcomes.filter((result) => result.status === "rejected");
  assert.ok(fulfilled.length >= 1);
  assert.ok(rejected.length >= 1);

  const aPlans = await db.collection("proClubs").doc(CLUB_A).collection("weeklyTrainingPlans").get();
  const bPlans = await db.collection("proClubs").doc(CLUB_B).collection("weeklyTrainingPlans").get();
  assert.equal(aPlans.size + bPlans.size, 1);
  assert.equal((await db.collection(REQUESTS).get()).size, 1);

  const receipt = await db.collection(REQUESTS).doc(registryId()).get();
  assert.equal(receipt.exists, true);
  assert.ok([CLUB_A, CLUB_B].includes(String(receipt.data()?.clubId)));
});

test("same actor request still returns the original plan inside its bound tenant", async () => {
  let sequence = 0;
  const service = createWeeklyTrainingDraftSaveService({
    firestore: db,
    trustedClock: () => new Date("2026-09-10T00:00:00.000Z"),
    planIdFactory: () => `plan-${++sequence}`,
  });

  const first = await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) });
  const retry = await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) });
  assert.equal(first.planId, retry.planId);
  assert.equal(first.createdAt, retry.createdAt);
  assert.equal((await db.collection("proClubs").doc(CLUB_A).collection("weeklyTrainingPlans").get()).size, 1);
});

test("actor-global receipt tampering or changed payload fails closed", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) });
  const receipt = db.collection(REQUESTS).doc(registryId());
  await receipt.update({ requestFingerprint: "0".repeat(64) });

  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
});

test("actor-global receipt pointing to missing plan fails closed", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  const first = await service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) });
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_A).collection("weeklyTrainingPlans").doc(first.planId));

  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft(CLUB_A) }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
});

test("client Firestore rules deny top-level request registry read and write", async () => {
  const clientDb = rulesEnv.authenticatedContext(HC_UID).firestore();
  const requestDoc = doc(clientDb, REQUESTS, registryId());
  await assertFails(getDoc(requestDoc));
  await assertFails(setDoc(requestDoc, { clubId: CLUB_B, planId: "forged" }));
});

test("service source no longer scopes request registry under proClubs", async () => {
  const source = await readFile("functions/src/proClubWeeklyTrainingDraftSave/service.ts", "utf8");
  assert.match(source, /collection\(WEEKLY_TRAINING_DRAFT_SAVE_REQUESTS\)/);
  assert.match(source, /requestReceiptDocumentId\(actorUid, requestId\)/);
  assert.doesNotMatch(source, /clubRef\.collection\(WEEKLY_TRAINING_DRAFT_SAVE_REQUESTS\)/);
  assert.match(source, /receipt\?\.clubId !== draft\.clubId/);
});
