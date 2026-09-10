import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSummary,
  sortWeeklyTrainingSavedDraftSummaries,
} from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });

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
      createdAt: stamp(1_757_280_000),
      createdBy: "hc-a",
      updatedAt: stamp(1_757_280_100),
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
      createdAt: stamp(1_757_280_000),
      createdBy: "hc-a",
      updatedAt: stamp(1_757_280_100),
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
      createdAt: stamp(1_757_280_000),
      createdBy: "hc-a",
      updatedAt: stamp(1_757_280_100),
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

test("saved-DRAFT summary binds exact club, author and integrity-bearing schema", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: plan(),
  });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal(result.value.planId, "plan-a");
  assert.equal(result.value.authorUid, "hc-a");
  assert.equal(result.value.sessionCount, 1);
  assert.match(result.value.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("summary fails closed for another author, lifecycle drift, extra fields, bad counts and bad timestamps", () => {
  for (const document of [
    plan({ authorUid: "hc-b" }),
    plan({ status: "SUBMITTED" }),
    plan({ injected: true }),
    plan({ sessionCount: 0 }),
    plan({ sessionCount: 15 }),
    plan({ updatedAt: { seconds: 1, nanoseconds: 1_000_000_000 } }),
    plan({ createdAt: stamp(200), updatedAt: stamp(100) }),
    plan({ createdAt: stamp(100, 900_000), updatedAt: stamp(100, 800_000) }),
    plan({ squadLabel: "x".repeat(101) }),
  ]) {
    assert.equal(
      buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document }).state,
      "INVALID",
    );
  }
});

test("detail reconstructs canonical football draft from persisted hierarchy", () => {
  const result = buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan(),
    sessions: [{ document: session(), blocks: [block()] }],
  });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal(result.value.draft.sessions.length, 1);
  assert.equal(result.value.draft.sessions[0]?.blocks.length, 1);
});

test("detail rejects missing suffix children using trusted cardinality", () => {
  assert.equal(
    buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan({ sessionCount: 2 }),
      sessions: [{ document: session(), blocks: [block()] }],
    }).state,
    "INVALID",
  );

  assert.equal(
    buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan(),
      sessions: [{ document: session(0, { blockCount: 2 }), blocks: [block()] }],
    }).state,
    "INVALID",
  );
});

test("detail rejects reordered and non-deterministic child hierarchy", () => {
  assert.equal(
    buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan(),
      sessions: [{ document: session(1), blocks: [block()] }],
    }).state,
    "INVALID",
  );
  assert.equal(
    buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan(),
      sessions: [{ document: { ...session(), id: "wrong-session-id" }, blocks: [block()] }],
    }).state,
    "INVALID",
  );
  assert.equal(
    buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan(),
      sessions: [{ document: session(), blocks: [{ ...block(), id: "block-02" }] }],
    }).state,
    "INVALID",
  );
});

test("summary ordering preserves Firestore nanosecond precision", () => {
  const older = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: { ...plan({ updatedAt: stamp(1_757_280_100, 100_000) }), id: "plan-z" },
  });
  const newer = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: { ...plan({ updatedAt: stamp(1_757_280_100, 900_000) }), id: "plan-a" },
  });
  assert.equal(older.state, "VALID");
  assert.equal(newer.state, "VALID");
  if (older.state !== "VALID" || newer.state !== "VALID") return;
  assert.deepEqual(
    sortWeeklyTrainingSavedDraftSummaries([older.value, newer.value]).map((item) => item.planId),
    ["plan-a", "plan-z"],
  );
});
