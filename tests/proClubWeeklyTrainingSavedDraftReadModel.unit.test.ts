import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSummary,
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

function detailWith(sessionOverrides: Record<string, unknown> = {}, blockOverrides: Record<string, unknown> = {}) {
  return buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan(),
    sessions: [{ document: session(0, sessionOverrides), blocks: [block(0, blockOverrides)] }],
  });
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
    plan({ squadLabel: " First Team" }),
    plan({ mainObjective: "Build through pressure " }),
  ]) {
    assert.equal(buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document }).state, "INVALID");
  }
});

test("detail reconstructs canonical football draft only when child audit matches plan snapshot", () => {
  assert.equal(detailWith().state, "VALID");
});

test("detail rejects child actor or timestamp audit divergence", () => {
  for (const result of [
    detailWith({ updatedBy: "hc-b" }),
    detailWith({ updatedAt: stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1) }),
    detailWith({}, { createdBy: "hc-b" }),
    detailWith({}, { updatedAt: stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1) }),
  ]) {
    assert.equal(result.state, "INVALID");
  }
});

test("detail rejects parser-normalizable persisted session text", () => {
  for (const overrides of [
    { location: " Training Ground A" },
    { location: "Training Ground A " },
    { objective: " Progress through two pressing lines" },
    { objective: "Progress through two pressing lines " },
  ]) {
    assert.equal(detailWith(overrides).state, "INVALID");
  }
});

test("detail rejects parser-normalizable persisted block text and coaching points", () => {
  for (const overrides of [
    { title: " Build-up block 1" },
    { title: "Build-up block 1 " },
    { coachingPoints: [" Create the third-player option"] },
    { coachingPoints: ["Create the third-player option "] },
  ]) {
    assert.equal(detailWith({}, overrides).state, "INVALID");
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

test("summary preserves exact Firestore timestamp precision for cursor use", () => {
  const exact = stamp(1_757_280_100, 987_654_321);
  const result = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: plan({ createdAt: exact, updatedAt: exact }),
  });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.deepEqual(result.value.updatedAtOrder, exact);
});