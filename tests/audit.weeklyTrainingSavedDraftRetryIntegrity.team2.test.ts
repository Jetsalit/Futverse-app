import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createWeeklyTrainingDraftSaveService } from "../functions/src/proClubWeeklyTrainingDraftSave/service.ts";
import { WeeklyTrainingDraftSaveError } from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

const PROJECT_ID = "demo-futverse-weekly-training-retry-team2-r3";
const CLUB_ID = "club-team2";
const HC_UID = "hc-team2";
const TD_UID = "td-team2";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const app = initializeApp({ projectId: PROJECT_ID }, "weekly-training-retry-team2-r3");
const db = getFirestore(app);

function draft() {
  return {
    clubId: CLUB_ID,
    authorUid: "ignored-client-author",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Independent retry integrity",
    sessions: [
      {
        sessionDate: "2026-09-08",
        startTime: "10:00",
        location: "Pitch A",
        objective: "Build through pressure",
        phaseOfPlay: "IN_POSSESSION",
        plannedLoad: "MODERATE",
        durationMinutes: 60,
        blocks: [
          { blockType: "TACTICAL", title: "Build-up", durationMinutes: 25, coachingPoints: ["Third player"] },
          { blockType: "GAME", title: "Conditioned game", durationMinutes: 25, coachingPoints: ["Scan early"] },
        ],
      },
    ],
  };
}

async function clearData() {
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_ID));
  await db.recursiveDelete(db.collection("weeklyTrainingDraftSaveRequests"));
  await Promise.all([
    db.collection("users").doc(HC_UID).delete().catch(() => undefined),
    db.collection("users").doc(TD_UID).delete().catch(() => undefined),
  ]);
}

async function seed() {
  const club = db.collection("proClubs").doc(CLUB_ID);
  const batch = db.batch();
  batch.set(db.collection("users").doc(HC_UID), { status: "ACTIVE" });
  batch.set(db.collection("users").doc(TD_UID), { status: "ACTIVE" });
  batch.set(club, { status: "ACTIVE", name: "Team 2 FC" });
  batch.set(club.collection("members").doc(HC_UID), { status: "ACTIVE", authorizationRole: "MEMBER" });
  batch.set(club.collection("staff").doc(HC_UID), { status: "ACTIVE", staffRole: "HEAD_COACH" });
  batch.set(club.collection("members").doc(TD_UID), { status: "ACTIVE", authorizationRole: "MEMBER" });
  batch.set(club.collection("staff").doc(TD_UID), { status: "ACTIVE", staffRole: "TECHNICAL_DIRECTOR" });
  batch.set(club.collection("technicalGovernance").doc("current"), {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TD_UID,
    authorityRole: "TECHNICAL_DIRECTOR",
  });
  await batch.commit();
}

function service() {
  return createWeeklyTrainingDraftSaveService({
    firestore: db,
    trustedClock: () => new Date("2026-09-10T04:30:00.123Z"),
    planIdFactory: () => "team2-plan",
  });
}

async function save() {
  return await service().saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() });
}

async function expectFail() {
  await assert.rejects(
    service().saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
  await clearData();
});
beforeEach(async () => {
  await clearData();
  await seed();
});
after(async () => {
  await clearData();
  await deleteApp(app);
});

test("control: intact receipt-bound hierarchy retries successfully", async () => {
  const first = await save();
  const retry = await service().saveFreshDraft({ actorUid: HC_UID, requestId: REQUEST_ID, draft: draft() });
  assert.equal(retry.planId, first.planId);
  assert.equal(retry.createdAt, first.createdAt);
});

test("tampered session blockCount cannot return false COMPLETED", async () => {
  const first = await save();
  const session = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(first.planId)
    .collection("sessions").doc("2026-09-08-1000");
  await session.update({ blockCount: 1 });
  await expectFail();
});

test("missing block cannot return false COMPLETED", async () => {
  const first = await save();
  const block = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(first.planId)
    .collection("sessions").doc("2026-09-08-1000").collection("blocks").doc("block-02");
  await block.delete();
  await expectFail();
});

test("unexpected extra block is detected by bounded +1 sentinel", async () => {
  const first = await save();
  const blocks = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(first.planId)
    .collection("sessions").doc("2026-09-08-1000").collection("blocks");
  await blocks.doc("block-03").set({ schemaVersion: 2, orderIndex: 2 });
  await expectFail();
});

test("persisted football payload drift cannot be acknowledged as same save", async () => {
  const first = await save();
  const block = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(first.planId)
    .collection("sessions").doc("2026-09-08-1000").collection("blocks").doc("block-01");
  await block.update({ coachingPoints: ["Changed after save"] });
  await expectFail();
});

test("persisted audit timestamp drift cannot be acknowledged as same save", async () => {
  const first = await save();
  const session = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(first.planId)
    .collection("sessions").doc("2026-09-08-1000");
  await session.update({ updatedAt: Timestamp.fromDate(new Date("2026-09-10T04:31:00.123Z")) });
  await expectFail();
});
