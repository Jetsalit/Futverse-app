import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { createWeeklyTrainingDraftSaveService } from "../functions/src/proClubWeeklyTrainingDraftSave/service.ts";
import { WeeklyTrainingDraftSaveError } from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

const PROJECT_ID = "demo-futverse-server-weekly-training-team2-r3";
const CLUB_ID = "club-a";
const HC_UID = "hc-a";
const TD_UID = "td-a";

const app = initializeApp({ projectId: PROJECT_ID }, "weekly-training-team2-r3");
const db = getFirestore(app);

function draft(overrides: Record<string, unknown> = {}) {
  return {
    clubId: CLUB_ID,
    authorUid: "spoofed-payload-author",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Independent authorization proof",
    sessions: [
      {
        sessionDate: "2026-09-07",
        startTime: "09:00",
        location: "Training Ground A",
        objective: "Build through pressure",
        phaseOfPlay: "GENERAL",
        plannedLoad: "MODERATE",
        durationMinutes: 60,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Build-up",
            durationMinutes: 30,
            coachingPoints: ["Body orientation"],
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function clear(): Promise<void> {
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_ID));
  await Promise.all([
    db.collection("users").doc(HC_UID).delete().catch(() => undefined),
    db.collection("users").doc(TD_UID).delete().catch(() => undefined),
  ]);
}

async function seed(): Promise<void> {
  const batch = db.batch();
  const club = db.collection("proClubs").doc(CLUB_ID);
  batch.set(db.collection("users").doc(HC_UID), { status: "ACTIVE" });
  batch.set(db.collection("users").doc(TD_UID), { status: "ACTIVE" });
  batch.set(club, { name: "Club A", status: "ACTIVE", level: "T1" });
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
  await batch.commit();
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "Must run against Firestore Emulator.");
});

beforeEach(async () => {
  await clear();
  await seed();
});

after(async () => {
  await clear();
  await deleteApp(app);
});

async function assertDenied(): Promise<void> {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, draft: draft() }),
    (error: unknown) =>
      error instanceof WeeklyTrainingDraftSaveError &&
      (error.code === "PERMISSION_DENIED" || error.code === "FAILED_PRECONDITION"),
  );
  const plans = await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").get();
  assert.equal(plans.empty, true);
}

test("payload author spoof cannot replace the authenticated Head Coach as authoritative author", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  const result = await service.saveFreshDraft({ actorUid: HC_UID, draft: draft() });
  const plan = await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(result.planId).get();
  assert.equal(plan.data()?.authorUid, HC_UID);
  assert.equal(plan.data()?.createdBy, HC_UID);
  assert.notEqual(plan.data()?.authorUid, "spoofed-payload-author");
});

test("Head Coach Staff record without canonical Membership cannot write", async () => {
  await db.collection("proClubs").doc(CLUB_ID).collection("members").doc(HC_UID).delete();
  await assertDenied();
});

test("inactive technical-authority Membership invalidates the write", async () => {
  await db.collection("proClubs").doc(CLUB_ID).collection("members").doc(TD_UID).set({
    authorizationRole: "MEMBER",
    status: "INACTIVE",
  });
  await assertDenied();
});

test("technical-authority Staff role mismatch invalidates the write", async () => {
  await db.collection("proClubs").doc(CLUB_ID).collection("staff").doc(TD_UID).set({
    staffRole: "HEAD_COACH",
    status: "ACTIVE",
  });
  await assertDenied();
});

test("canonical identity parity rejects whitespace-padded tenant identifiers before writes", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await assert.rejects(
    service.saveFreshDraft({ actorUid: HC_UID, draft: draft({ clubId: " club-a " }) }),
    (error: unknown) => error instanceof WeeklyTrainingDraftSaveError && error.code === "INVALID_ARGUMENT",
  );
  const plans = await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").get();
  assert.equal(plans.empty, true);
});
