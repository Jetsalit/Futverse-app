import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createWeeklyTrainingDraftSaveService } from "../functions/src/proClubWeeklyTrainingDraftSave/service.ts";
import { WeeklyTrainingDraftSaveError } from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

const PROJECT_ID = "demo-futverse-weekly-training-integrity-v2";
const CLUB_ID = "club-integrity";
const HEAD_COACH_UID = "hc-integrity";
const TD_UID = "td-integrity";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

const app = initializeApp({ projectId: PROJECT_ID }, "weekly-training-integrity-v2-test");
const db = getFirestore(app);

function draft() {
  return {
    clubId: CLUB_ID,
    authorUid: "untrusted-payload-author",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Integrity metadata proof",
    sessions: [
      {
        sessionDate: "2026-09-08",
        startTime: "09:00",
        location: "Ground A",
        objective: "Session one",
        phaseOfPlay: "GENERAL",
        plannedLoad: "MODERATE",
        durationMinutes: 60,
        blocks: [
          { blockType: "WARM_UP", title: "Warm up", durationMinutes: 15, coachingPoints: ["Prepare"] },
          { blockType: "TACTICAL", title: "Tactical", durationMinutes: 30, coachingPoints: ["Scan"] },
        ],
      },
      {
        sessionDate: "2026-09-09",
        startTime: "16:00",
        location: "Ground A",
        objective: "Session two",
        phaseOfPlay: "OUT_OF_POSSESSION",
        plannedLoad: "HIGH",
        durationMinutes: 45,
        blocks: [
          { blockType: "TACTICAL", title: "Pressing", durationMinutes: 30, coachingPoints: ["Lock play"] },
        ],
      },
    ],
  };
}

async function clearData(): Promise<void> {
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_ID));
  await db.recursiveDelete(db.collection("weeklyTrainingDraftSaveRequests"));
  await Promise.all([
    db.collection("users").doc(HEAD_COACH_UID).delete().catch(() => undefined),
    db.collection("users").doc(TD_UID).delete().catch(() => undefined),
  ]);
}

async function seed(): Promise<void> {
  const batch = db.batch();
  const club = db.collection("proClubs").doc(CLUB_ID);
  batch.set(db.collection("users").doc(HEAD_COACH_UID), { status: "ACTIVE" });
  batch.set(db.collection("users").doc(TD_UID), { status: "ACTIVE" });
  batch.set(club, { name: "Integrity FC", status: "ACTIVE", level: "T1" });
  batch.set(club.collection("members").doc(HEAD_COACH_UID), { authorizationRole: "MEMBER", status: "ACTIVE" });
  batch.set(club.collection("staff").doc(HEAD_COACH_UID), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  batch.set(club.collection("members").doc(TD_UID), { authorizationRole: "MEMBER", status: "ACTIVE" });
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
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Must run against Firestore Emulator.");
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

test("trusted save persists schema v2 hierarchy cardinality without increasing document count", async () => {
  const service = createWeeklyTrainingDraftSaveService({
    firestore: db,
    trustedClock: () => new Date("2026-09-10T04:00:00.000Z"),
    planIdFactory: () => "integrity-plan",
  });
  const result = await service.saveFreshDraft({ actorUid: HEAD_COACH_UID, requestId: REQUEST_ID, draft: draft() });
  assert.equal(result.documentCount, 6);

  const planRef = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(result.planId);
  const plan = await planRef.get();
  assert.equal(plan.data()?.schemaVersion, 2);
  assert.equal(plan.data()?.sessionCount, 2);

  const sessions = await planRef.collection("sessions").orderBy("orderIndex").get();
  assert.equal(sessions.size, 2);
  assert.equal(sessions.docs[0]?.data().schemaVersion, 2);
  assert.equal(sessions.docs[0]?.data().blockCount, 2);
  assert.equal(sessions.docs[1]?.data().blockCount, 1);

  const firstBlocks = await sessions.docs[0]!.ref.collection("blocks").get();
  const secondBlocks = await sessions.docs[1]!.ref.collection("blocks").get();
  assert.equal(firstBlocks.size, 2);
  assert.equal(secondBlocks.size, 1);
  assert.ok(firstBlocks.docs.every((item) => item.data().schemaVersion === 2));
  assert.ok(secondBlocks.docs.every((item) => item.data().schemaVersion === 2));
});

test("idempotent retry rejects a tampered persisted plan cardinality", async () => {
  const service = createWeeklyTrainingDraftSaveService({
    firestore: db,
    planIdFactory: () => "integrity-plan",
  });
  const first = await service.saveFreshDraft({ actorUid: HEAD_COACH_UID, requestId: REQUEST_ID, draft: draft() });
  const planRef = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(first.planId);
  await planRef.update({ sessionCount: 1 });

  await assert.rejects(
    service.saveFreshDraft({ actorUid: HEAD_COACH_UID, requestId: REQUEST_ID, draft: draft() }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "FAILED_PRECONDITION",
  );
});
