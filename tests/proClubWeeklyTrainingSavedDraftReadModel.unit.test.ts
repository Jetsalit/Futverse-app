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
      schemaVersion: 1,
      authorUid: "hc-a",
      status: "DRAFT",
      weekStartDate: "2026-09-07",
      squadLabel: "First Team",
      mainObjective: "Build through pressure",
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
    id: "2026-09-08-1600",
    data: {
      schemaVersion: 1,
      orderIndex,
      sessionDate: "2026-09-08",
      startTime: "16:00",
      location: "Training Ground A",
      objective: "Progress through two pressing lines",
      phaseOfPlay: "IN_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 90,
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
      schemaVersion: 1,
      orderIndex,
      blockType: "TACTICAL",
      title: "Build-up 8v6",
      durationMinutes: 45,
      coachingPoints: ["Create the third-player option"],
      createdAt: stamp(1_757_280_000),
      createdBy: "hc-a",
      updatedAt: stamp(1_757_280_100),
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

test("saved-DRAFT summary binds exact club, author and canonical persisted schema", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: plan(),
  });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal(result.value.planId, "plan-a");
  assert.equal(result.value.authorUid, "hc-a");
  assert.equal(result.value.squadLabel, "First Team");
  assert.match(result.value.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("summary fails closed for another author, non-DRAFT, extra fields and bad timestamps", () => {
  for (const document of [
    plan({ authorUid: "hc-b" }),
    plan({ status: "SUBMITTED" }),
    plan({ injected: true }),
    plan({ updatedAt: { seconds: 1, nanoseconds: 1_000_000_000 } }),
    plan({ createdAt: stamp(200), updatedAt: stamp(100) }),
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
  assert.equal(result.value.draft.sessions[0]?.blocks[0]?.title, "Build-up 8v6");
});

test("detail rejects partial, reordered and non-deterministic child hierarchy", () => {
  assert.equal(
    buildWeeklyTrainingSavedDraftDetail({ clubId: "club-a", actorUid: "hc-a", planDocument: plan(), sessions: [] }).state,
    "INVALID",
  );
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

test("summary ordering is deterministic by trusted updatedAt then planId", () => {
  const a = buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: plan() });
  const b = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: { ...plan({ updatedAt: stamp(1_757_280_200) }), id: "plan-b" },
  });
  assert.equal(a.state, "VALID");
  assert.equal(b.state, "VALID");
  if (a.state !== "VALID" || b.state !== "VALID") return;
  assert.deepEqual(sortWeeklyTrainingSavedDraftSummaries([a.value, b.value]).map((item) => item.planId), ["plan-b", "plan-a"]);
});
