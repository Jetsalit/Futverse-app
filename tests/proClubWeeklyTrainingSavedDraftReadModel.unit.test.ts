import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSummary,
  sortWeeklyTrainingSavedDraftSummaries,
} from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const BASE_STAMP = stamp(1_757_280_100, 500_000);

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-a",
    data: {
      schemaVersion: 2,
      authorUid: "hc-a",
      status: "DRAFT",
      weekStartDate: "2026-09-07",
      squadLabel: "First Team",
      mainObjective: "Build through pressure",
      sessionCount: 1,
      createdAt: BASE_STAMP,
      createdBy: "hc-a",
      updatedAt: BASE_STAMP,
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

function session(orderIndex = 0, overrides: Record<string, unknown> = {}) {
  return {
    id: orderIndex === 0 ? "2026-09-08-1600" : "2026-09-09-1600",
    data: {
      schemaVersion: 2,
      orderIndex,
      sessionDate: orderIndex === 0 ? "2026-09-08" : "2026-09-09",
      startTime: "16:00",
      location: "Training Ground A",
      objective: "Progress through two pressing lines",
      phaseOfPlay: "IN_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 90,
      blockCount: 1,
      createdAt: BASE_STAMP,
      createdBy: "hc-a",
      updatedAt: BASE_STAMP,
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

function block(orderIndex = 0, overrides: Record<string, unknown> = {}) {
  return {
    id: `block-${String(orderIndex + 1).padStart(2, "0")}`,
    data: {
      schemaVersion: 2,
      orderIndex,
      blockType: "TACTICAL",
      title: `Build-up block ${orderIndex + 1}`,
      durationMinutes: 30,
      coachingPoints: ["Create the third-player option"],
      createdAt: BASE_STAMP,
      createdBy: "hc-a",
      updatedAt: BASE_STAMP,
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

test("saved-DRAFT summary binds exact club, author and immutable fresh-save audit", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: plan() });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal(result.value.planId, "plan-a");
  assert.deepEqual(result.value.createdAtOrder, BASE_STAMP);
  assert.deepEqual(result.value.updatedAtOrder, BASE_STAMP);
});

test("summary fails closed for binding, lifecycle, field, cardinality and audit drift", () => {
  for (const document of [
    plan({ authorUid: "hc-b" }),
    plan({ status: "SUBMITTED" }),
    plan({ injected: true }),
    plan({ sessionCount: 0 }),
    plan({ sessionCount: 15 }),
    plan({ updatedAt: { seconds: 1, nanoseconds: 1_000_000_000 } }),
    plan({ createdBy: "hc-b" }),
    plan({ updatedBy: "hc-b" }),
    plan({ updatedAt: stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1) }),
    plan({ squadLabel: "x".repeat(101) }),
  ]) {
    assert.equal(buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document }).state, "INVALID");
  }
});

test("detail reconstructs canonical football draft only when child audit matches plan snapshot", () => {
  const result = buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan(),
    sessions: [{ document: session(), blocks: [block()] }],
  });
  assert.equal(result.state, "VALID");
});

test("detail rejects child actor or timestamp audit divergence", () => {
  for (const sessions of [
    [{ document: session(0, { updatedBy: "hc-b" }), blocks: [block()] }],
    [{ document: session(0, { updatedAt: stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1) }), blocks: [block()] }],
    [{ document: session(), blocks: [block(0, { createdBy: "hc-b" })] }],
    [{ document: session(), blocks: [block(0, { updatedAt: stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1) })] }],
  ]) {
    assert.equal(buildWeeklyTrainingSavedDraftDetail({ clubId: "club-a", actorUid: "hc-a", planDocument: plan(), sessions }).state, "INVALID");
  }
});

test("detail rejects missing suffix children using trusted cardinality", () => {
  assert.equal(buildWeeklyTrainingSavedDraftDetail({ clubId: "club-a", actorUid: "hc-a", planDocument: plan({ sessionCount: 2 }), sessions: [{ document: session(), blocks: [block()] }] }).state, "INVALID");
  assert.equal(buildWeeklyTrainingSavedDraftDetail({ clubId: "club-a", actorUid: "hc-a", planDocument: plan(), sessions: [{ document: session(0, { blockCount: 2 }), blocks: [block()] }] }).state, "INVALID");
});

test("detail rejects reordered and non-deterministic child hierarchy", () => {
  assert.equal(buildWeeklyTrainingSavedDraftDetail({ clubId: "club-a", actorUid: "hc-a", planDocument: plan(), sessions: [{ document: session(1), blocks: [block()] }] }).state, "INVALID");
  assert.equal(buildWeeklyTrainingSavedDraftDetail({ clubId: "club-a", actorUid: "hc-a", planDocument: plan(), sessions: [{ document: { ...session(), id: "wrong-session-id" }, blocks: [block()] }] }).state, "INVALID");
  assert.equal(buildWeeklyTrainingSavedDraftDetail({ clubId: "club-a", actorUid: "hc-a", planDocument: plan(), sessions: [{ document: session(), blocks: [{ ...block(), id: "block-02" }] }] }).state, "INVALID");
});

test("summary ordering preserves Firestore nanosecond precision and plan-id tie-break", () => {
  const olderStamp = stamp(1_757_280_100, 100_000);
  const newerStamp = stamp(1_757_280_100, 900_000);
  const older = buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: { ...plan({ createdAt: olderStamp, updatedAt: olderStamp }), id: "plan-z" } });
  const newer = buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: { ...plan({ createdAt: newerStamp, updatedAt: newerStamp }), id: "plan-a" } });
  assert.equal(older.state, "VALID"); assert.equal(newer.state, "VALID");
  if (older.state !== "VALID" || newer.state !== "VALID") return;
  assert.deepEqual(sortWeeklyTrainingSavedDraftSummaries([older.value, newer.value]).map((item) => item.planId), ["plan-a", "plan-z"]);
}