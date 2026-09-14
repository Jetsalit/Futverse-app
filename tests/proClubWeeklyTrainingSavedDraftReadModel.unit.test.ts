import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSessionCardinality,
  buildWeeklyTrainingSavedDraftSummary,
} from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const BASE_STAMP = stamp(1_757_280_100, 500_000);
const EDITED_STAMP = stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1);
const DIVERGENT_STAMP = stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 2);

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

function detailWith(
  sessionOverrides: Record<string, unknown> = {},
  blockOverrides: Record<string, unknown> = {},
  planOverrides: Record<string, unknown> = {},
) {
  return buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan(planOverrides),
    sessions: [{ document: session(0, sessionOverrides), blocks: [block(0, blockOverrides)] }],
  });
}

test("saved-DRAFT summary binds exact club and author while preserving fresh audit equality", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: plan() });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal(result.value.planId, "plan-a");
  assert.deepEqual(result.value.createdAtOrder, BASE_STAMP);
  assert.deepEqual(result.value.updatedAtOrder, BASE_STAMP);
});

test("summary accepts present non-empty optional plan snapshot fields exactly", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: plan({ secondaryObjective: "Improve third-man support", headCoachNote: "Keep distances compact" }),
  });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal(result.value.secondaryObjective, "Improve third-man support");
  assert.equal(result.value.headCoachNote, "Keep distances compact");
});

test("summary rejects persisted empty or non-canonical optional plan fields", () => {
  for (const overrides of [
    { secondaryObjective: "" },
    { headCoachNote: "" },
    { secondaryObjective: "   " },
    { headCoachNote: "\t" },
    { secondaryObjective: " Improve third-man support" },
    { headCoachNote: "Keep distances compact " },
    { secondaryObjective: null },
    { headCoachNote: null },
  ]) {
    assert.equal(
      buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: plan(overrides) }).state,
      "INVALID",
    );
  }
});

test("summary fails closed for binding, lifecycle, field, cardinality and audit drift", () => {
  for (const document of [
    plan({ authorUid: "hc-b" }),
    plan({ schemaVersion: 1 }),
    plan({ status: "SUBMITTED" }),
    plan({ injected: true }),
    plan({ sessionCount: 0 }),
    plan({ sessionCount: 15 }),
    plan({ updatedAt: { seconds: 1, nanoseconds: 1_000_000_000 } }),
    plan({ createdBy: "hc-b" }),
    plan({ updatedBy: "hc-b" }),
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

test("coherent edited hierarchy preserves creation audit and exposes the advanced update audit", () => {
  const result = detailWith(
    { location: "Training Ground B", updatedAt: EDITED_STAMP },
    { title: "Edited build-up block", drillReference: "drill-build-up", updatedAt: EDITED_STAMP },
    {
      mainObjective: "Edited build through pressure",
      secondaryObjective: "Protect rest defence",
      headCoachNote: "Updated after review",
      updatedAt: EDITED_STAMP,
    },
  );
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.deepEqual(result.value.createdAtOrder, BASE_STAMP);
  assert.deepEqual(result.value.updatedAtOrder, EDITED_STAMP);
  assert.equal(result.value.draft.mainObjective, "Edited build through pressure");
  assert.equal(result.value.draft.secondaryObjective, "Protect rest defence");
  assert.equal(result.value.draft.headCoachNote, "Updated after review");
  assert.equal(result.value.draft.sessions[0]?.location, "Training Ground B");
  assert.equal(result.value.draft.sessions[0]?.blocks[0]?.title, "Edited build-up block");
  assert.equal(result.value.draft.sessions[0]?.blocks[0]?.drillReference, "drill-build-up");
});

test("edited summary accepts exact nanosecond advancement for the same author actor", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: plan({ updatedAt: EDITED_STAMP }),
  });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.deepEqual(result.value.createdAtOrder, BASE_STAMP);
  assert.deepEqual(result.value.updatedAtOrder, EDITED_STAMP);
});

test("session cardinality preflight preserves its public creation binding and validates the local update audit", () => {
  const expectedCreation = { actorUid: "hc-a", timestamp: BASE_STAMP };
  assert.equal(
    buildWeeklyTrainingSavedDraftSessionCardinality(
      session(0, { updatedAt: EDITED_STAMP }),
      expectedCreation,
    ).state,
    "VALID",
  );
  for (const document of [
    session(0, { updatedBy: "hc-b" }),
    session(0, { updatedAt: stamp(BASE_STAMP.seconds - 1) }),
    session(0, { createdAt: EDITED_STAMP, updatedAt: EDITED_STAMP }),
    session(0, { updatedAt: undefined }),
  ]) {
    assert.equal(
      buildWeeklyTrainingSavedDraftSessionCardinality(document, expectedCreation).state,
      "INVALID",
    );
  }
});

test("detail rejects a plan-only audit advancement", () => {
  assert.equal(detailWith({}, {}, { updatedAt: EDITED_STAMP }).state, "INVALID");
});

test("detail rejects one divergent session update timestamp", () => {
  const result = buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan({ sessionCount: 2, updatedAt: EDITED_STAMP }),
    sessions: [
      {
        document: session(0, { updatedAt: EDITED_STAMP }),
        blocks: [block(0, { updatedAt: EDITED_STAMP })],
      },
      {
        document: session(1, { updatedAt: DIVERGENT_STAMP }),
        blocks: [block(0, { updatedAt: EDITED_STAMP })],
      },
    ],
  });
  assert.equal(result.state, "INVALID");
});

test("detail rejects one divergent block update timestamp", () => {
  const result = buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan({ updatedAt: EDITED_STAMP }),
    sessions: [{
      document: session(0, { blockCount: 2, updatedAt: EDITED_STAMP }),
      blocks: [
        block(0, { updatedAt: EDITED_STAMP }),
        block(1, { updatedAt: DIVERGENT_STAMP }),
      ],
    }],
  });
  assert.equal(result.state, "INVALID");
});

test("detail rejects child actor or timestamp audit divergence", () => {
  for (const result of [
    detailWith({ updatedBy: "hc-b" }),
    detailWith({ updatedAt: stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1) }),
    detailWith({}, { createdBy: "hc-b" }),
    detailWith({}, { updatedAt: stamp(BASE_STAMP.seconds, BASE_STAMP.nanoseconds + 1) }),
    detailWith({ createdAt: EDITED_STAMP, updatedAt: EDITED_STAMP }),
    detailWith({}, { createdAt: EDITED_STAMP, updatedAt: EDITED_STAMP }),
    detailWith({ updatedAt: stamp(BASE_STAMP.seconds - 1) }),
    detailWith({}, { updatedAt: stamp(BASE_STAMP.seconds - 1) }),
    detailWith({ updatedAt: undefined }),
    detailWith({}, { updatedBy: undefined }),
    detailWith({ schemaVersion: 1 }),
    detailWith({}, { schemaVersion: 1 }),
    detailWith({ injected: true }),
    detailWith({}, { injected: true }),
  ]) {
    assert.equal(result.state, "INVALID");
  }
});

test("summary rejects timestamp regression malformed audits and missing audit metadata", () => {
  for (const overrides of [
    { updatedAt: stamp(BASE_STAMP.seconds - 1) },
    { createdAt: "not-a-timestamp" },
    { updatedAt: "not-a-timestamp" },
    { createdAt: undefined },
    { createdBy: undefined },
    { updatedAt: undefined },
    { updatedBy: undefined },
  ]) {
    assert.equal(
      buildWeeklyTrainingSavedDraftSummary({
        clubId: "club-a",
        actorUid: "hc-a",
        document: plan(overrides),
      }).state,
      "INVALID",
    );
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
