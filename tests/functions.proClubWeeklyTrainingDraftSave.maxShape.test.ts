import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  createWeeklyTrainingDraftSaveService,
} from "../functions/src/proClubWeeklyTrainingDraftSave/service.ts";
import { WeeklyTrainingDraftSaveError } from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

const PROJECT_ID = "demo-futverse-server-weekly-training-max-shape";
const CLUB_ID = "club-a";
const HEAD_COACH_UID = "hc-a";
const TD_UID = "td-a";

const app = initializeApp({ projectId: PROJECT_ID }, "weekly-training-max-shape-test");
const db = getFirestore(app);

function maxShapeDraft() {
  const sessions = Array.from({ length: 14 }, (_, sessionIndex) => {
    const day = 7 + Math.floor(sessionIndex / 2);
    const sessionDate = `2026-09-${String(day).padStart(2, "0")}`;
    const startTime = sessionIndex % 2 === 0 ? "09:00" : "16:00";
    return {
      sessionDate,
      startTime,
      location: "Training Ground A",
      objective: `Maximum shape session ${sessionIndex + 1}`,
      phaseOfPlay: "GENERAL",
      plannedLoad: "MODERATE",
      durationMinutes: 360,
      blocks: Array.from({ length: 12 }, (_, blockIndex) => ({
        blockType: blockIndex === 0 ? "WARM_UP" : "TACTICAL",
        title: `Block ${blockIndex + 1}`,
        durationMinutes: 30,
        coachingPoints: ["Canonical coaching point"],
      })),
    };
  });

  return {
    clubId: CLUB_ID,
    authorUid: "payload-author-must-not-be-trusted",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Maximum domain-valid hierarchy",
    sessions,
  };
}

async function clearProjectData(): Promise<void> {
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_ID));
  await Promise.all([
    db.collection("users").doc(HEAD_COACH_UID).delete().catch(() => undefined),
    db.collection("users").doc(TD_UID).delete().catch(() => undefined),
  ]);
}

async function seedBaseline(): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection("users").doc(HEAD_COACH_UID), { status: "ACTIVE" });
  batch.set(db.collection("users").doc(TD_UID), { status: "ACTIVE" });
  const clubRef = db.collection("proClubs").doc(CLUB_ID);
  batch.set(clubRef, { name: "Club A", status: "ACTIVE", level: "T1" });
  batch.set(clubRef.collection("members").doc(HEAD_COACH_UID), { authorizationRole: "MEMBER", status: "ACTIVE" });
  batch.set(clubRef.collection("staff").doc(HEAD_COACH_UID), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  batch.set(clubRef.collection("members").doc(TD_UID), { authorizationRole: "MEMBER", status: "ACTIVE" });
  batch.set(clubRef.collection("staff").doc(TD_UID), { staffRole: "TECHNICAL_DIRECTOR", status: "ACTIVE" });
  batch.set(clubRef.collection("technicalGovernance").doc("current"), {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TD_UID,
    authorityRole: "TECHNICAL_DIRECTOR",
  });
  await batch.commit();
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Must run against Firestore Emulator.");
  await clearProjectData();
});

beforeEach(async () => {
  await clearProjectData();
  await seedBaseline();
});

after(async () => {
  await clearProjectData();
  await deleteApp(app);
});

test("server transaction commits the maximum 14-session x 12-block hierarchy atomically", async () => {
  const service = createWeeklyTrainingDraftSaveService({
    firestore: db,
    trustedClock: () => new Date("2026-09-09T12:30:00.000Z"),
  });

  const result = await service.saveFreshDraft({
    actorUid: HEAD_COACH_UID,
    draft: maxShapeDraft(),
  });

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.documentCount, 183);

  const planRef = db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(result.planId);
  const plan = await planRef.get();
  assert.equal(plan.exists, true);
  assert.equal(plan.data()?.authorUid, HEAD_COACH_UID);
  assert.equal(plan.data()?.createdBy, HEAD_COACH_UID);

  const sessions = await planRef.collection("sessions").get();
  assert.equal(sessions.size, 14);
  let blockCount = 0;
  for (const session of sessions.docs) {
    const blocks = await session.ref.collection("blocks").get();
    assert.equal(blocks.size, 12);
    blockCount += blocks.size;
  }
  assert.equal(blockCount, 168);
});

test("inactive Head Coach is rejected before any weekly-training hierarchy is written", async () => {
  await db.collection("users").doc(HEAD_COACH_UID).set({ status: "INACTIVE" });
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });

  await assert.rejects(
    service.saveFreshDraft({ actorUid: HEAD_COACH_UID, draft: maxShapeDraft() }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "PERMISSION_DENIED",
  );

  const plans = await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").get();
  assert.equal(plans.empty, true);
});

test("Assistant Coach cannot use the trusted server path", async () => {
  await db.collection("proClubs").doc(CLUB_ID).collection("staff").doc(HEAD_COACH_UID).set({
    staffRole: "ASSISTANT_COACH",
    status: "ACTIVE",
  });
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });

  await assert.rejects(
    service.saveFreshDraft({ actorUid: HEAD_COACH_UID, draft: maxShapeDraft() }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "PERMISSION_DENIED",
  );

  const plans = await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").get();
  assert.equal(plans.empty, true);
});
