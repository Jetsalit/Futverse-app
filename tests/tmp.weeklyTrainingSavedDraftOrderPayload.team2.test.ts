import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listHeadCoachWeeklyTrainingSavedDrafts,
  type WeeklyTrainingSavedDraftReadOps,
} from "../src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";
import {
  buildWeeklyTrainingSavedDraftDetail,
  type WeeklyTrainingSavedDraftDocument,
} from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const TS = stamp(1_757_280_100, 987_654_321);

function plan(id: string): WeeklyTrainingSavedDraftDocument {
  return {
    id,
    data: {
      schemaVersion: 2,
      authorUid: "hc-a",
      status: "DRAFT",
      weekStartDate: "2026-09-07",
      squadLabel: "First Team",
      mainObjective: "Build through pressure",
      sessionCount: 1,
      createdAt: TS,
      createdBy: "hc-a",
      updatedAt: TS,
      updatedBy: "hc-a",
    },
  };
}

function session(overrides: Record<string, unknown> = {}): WeeklyTrainingSavedDraftDocument {
  return {
    id: "2026-09-08-1600",
    data: {
      schemaVersion: 2,
      orderIndex: 0,
      sessionDate: "2026-09-08",
      startTime: "16:00",
      location: "Training Ground A",
      objective: "Progress through two pressing lines",
      phaseOfPlay: "IN_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 90,
      blockCount: 1,
      createdAt: TS,
      createdBy: "hc-a",
      updatedAt: TS,
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

function block(overrides: Record<string, unknown> = {}): WeeklyTrainingSavedDraftDocument {
  return {
    id: "block-01",
    data: {
      schemaVersion: 2,
      orderIndex: 0,
      blockType: "TACTICAL",
      title: "Build-up 8v6",
      durationMinutes: 45,
      coachingPoints: ["Create the third-player option"],
      createdAt: TS,
      createdBy: "hc-a",
      updatedAt: TS,
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

function opsWithPage(documents: readonly WeeklyTrainingSavedDraftDocument[]): WeeklyTrainingSavedDraftReadOps {
  return {
    async listPlanPage() { return documents; },
    async listDocuments() { return []; },
    async readDocument() { return null; },
  };
}

test("independent audit: pagination preserves query order for same-timestamp mixed-case IDs", async () => {
  const ids = [
    "z0", "a0", "Z0", "A0", "m0", "M0", "x0", "X0", "b0", "B0",
    "y0", "Y0", "c0", "C0", "n0", "N0", "d0", "D0", "q0", "Q0", "sentinel0",
  ];
  const result = await listHeadCoachWeeklyTrainingSavedDrafts(
    "club-a",
    "hc-a",
    null,
    opsWithPage(ids.map(plan)),
  );
  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") return;
  assert.deepEqual(result.value.items.map((item) => item.planId), ids.slice(0, 20));
  assert.deepEqual(result.value.nextCursor, { updatedAt: TS, planId: "Q0" });
});

test("independent audit: session normalization drift is rejected", () => {
  for (const drift of [
    { location: " Training Ground A" },
    { location: "Training Ground A " },
    { objective: " Progress through two pressing lines" },
    { objective: "Progress through two pressing lines " },
  ]) {
    const result = buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan("plan-a"),
      sessions: [{ document: session(drift), blocks: [block()] }],
    });
    assert.equal(result.state, "INVALID");
  }
});

test("independent audit: block normalization drift is rejected", () => {
  for (const drift of [
    { title: " Build-up 8v6" },
    { title: "Build-up 8v6 " },
    { coachingPoints: [" Create the third-player option"] },
    { coachingPoints: ["Create the third-player option "] },
  ]) {
    const result = buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan("plan-a"),
      sessions: [{ document: session(), blocks: [block(drift)] }],
    });
    assert.equal(result.state, "INVALID");
  }
});
