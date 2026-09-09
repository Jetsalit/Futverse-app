import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createWeeklyTrainingDraftSaveService } from "../functions/src/proClubWeeklyTrainingDraftSave/service.ts";

const PROJECT_ID = "demo-futverse-weekly-training-server-team2";
const CLUB_ID = "club-a";
const ACTOR_UID = "hc-a";
const TD_UID = "td-a";
const app = initializeApp({ projectId: PROJECT_ID }, "weekly-training-team2");
const db = getFirestore(app);

function draft(authorUid = "spoofed-author") {
  return {
    clubId: CLUB_ID,
    authorUid,
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Canonical plan",
    sessions: [{
      sessionDate: "2026-09-08",
      startTime: "16:00",
      location: "Ground A",
      objective: "Build up",
      phaseOfPlay: "IN_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 60,
      blocks: [{
        blockType: "TACTICAL",
        title: "8v6",
        durationMinutes: 30,
        coachingPoints: ["Third man"],
      }],
    }],
  };
}

async function clear(): Promise<void> {
  await db.recursiveDelete(db.collection("proClubs").doc(CLUB_ID));
  await Promise.all([
    db.collection("users").doc(ACTOR_UID).delete().catch(() => undefined),
    db.collection("users").doc(TD_UID).delete().catch(() => undefined),
  ]);
}

async function seed(): Promise<void> {
  const club = db.collection("proClubs").doc(CLUB_ID);
  const batch = db.batch();
  batch.set(db.collection("users").doc(ACTOR_UID), { status: "ACTIVE" });
  batch.set(db.collection("users").doc(TD_UID), { status: "ACTIVE" });
  batch.set(club, { status: "ACTIVE" });
  batch.set(club.collection("members").doc(ACTOR_UID), { status: "ACTIVE" });
  batch.set(club.collection("staff").doc(ACTOR_UID), { status: "ACTIVE", staffRole: "HEAD_COACH" });
  batch.set(club.collection("members").doc(TD_UID), { status: "ACTIVE" });
  batch.set(club.collection("staff").doc(TD_UID), { status: "ACTIVE", staffRole: "TECHNICAL_DIRECTOR" });
  batch.set(club.collection("technicalGovernance").doc("current"), {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: TD_UID,
    authorityRole: "TECHNICAL_DIRECTOR",
  });
  await batch.commit();
}

async function plansEmpty(): Promise<boolean> {
  return (await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").get()).empty;
}

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
  await clear();
});
beforeEach(async () => { await clear(); await seed(); });
after(async () => { await clear(); await deleteApp(app); });

test("payload author spoof cannot change authoritative author", async () => {
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  const result = await service.saveFreshDraft({ actorUid: ACTOR_UID, draft: draft("attacker") });
  const plan = await db.collection("proClubs").doc(CLUB_ID).collection("weeklyTrainingPlans").doc(result.planId).get();
  assert.equal(plan.data()?.authorUid, ACTOR_UID);
  assert.equal(plan.data()?.createdBy, ACTOR_UID);
});

test("staff-only Head Coach without Membership is denied", async () => {
  await db.collection("proClubs").doc(CLUB_ID).collection("members").doc(ACTOR_UID).delete();
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await assert.rejects(service.saveFreshDraft({ actorUid: ACTOR_UID, draft: draft() }));
  assert.equal(await plansEmpty(), true);
});

test("inactive technical authority Membership is denied", async () => {
  await db.collection("proClubs").doc(CLUB_ID).collection("members").doc(TD_UID).set({ status: "INACTIVE" });
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await assert.rejects(service.saveFreshDraft({ actorUid: ACTOR_UID, draft: draft() }));
  assert.equal(await plansEmpty(), true);
});

test("technical authority Staff role mismatch is denied", async () => {
  await db.collection("proClubs").doc(CLUB_ID).collection("staff").doc(TD_UID).set({ status: "ACTIVE", staffRole: "HEAD_COACH" });
  const service = createWeeklyTrainingDraftSaveService({ firestore: db });
  await assert.rejects(service.saveFreshDraft({ actorUid: ACTOR_UID, draft: draft() }));
  assert.equal(await plansEmpty(), true);
});
