import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listHeadCoachWeeklyTrainingSavedDrafts,
  type WeeklyTrainingSavedDraftReadOps,
} from "../src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";
import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSummary,
  type WeeklyTrainingSavedDraftDocument,
} from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const TS = stamp(1_757_280_100, 987_654_321);

function plan(id = "plan-a", overrides: Record<string, unknown> = {}): WeeklyTrainingSavedDraftDocument {
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
      ...overrides,
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

test("independent audit: omitted optional plan fields remain valid and absent", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: plan() });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal("secondaryObjective" in result.value, false);
  assert.equal("headCoachNote" in result.value, false);
});

test("independent audit: exact non-empty optional plan fields remain valid", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: plan("plan-a", {
      secondaryObjective: "Improve third-player timing",
      headCoachNote: "Keep distances compact",
    }),
  });
  assert.equal(result.state, "VALID");
  if (result.state !== "VALID") return;
  assert.equal(result.value.secondaryObjective, "Improve third-player timing");
  assert.equal(result.value.headCoachNote, "Keep distances compact");
});

test("independent audit: present empty null or normalized optional plan fields fail closed", () => {
  for (const drift of [
    { secondaryObjective: "" },
    { headCoachNote: "" },
    { secondaryObjective: "   " },
    { headCoachNote: "\t" },
    { secondaryObjective: " Improve third-player timing" },
    { secondaryObjective: "Improve third-player timing " },
    { headCoachNote: " Keep distances compact" },
    { headCoachNote: "Keep distances compact " },
    { secondaryObjective: null },
    { headCoachNote: null },
  ]) {
    assert.equal(
      buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document: plan("plan-a", drift) }).state,
      "INVALID",
    );
  }
});

test("independent audit: list path fails closed when a visible plan has invalid optional presence", async () => {
  for (const drift of [{ secondaryObjective: "" }, { headCoachNote: null }]) {
    const result = await listHeadCoachWeeklyTrainingSavedDrafts(
      "club-a",
      "hc-a",
      null,
      opsWithPage([plan("plan-a", drift)]),
    );
    assert.equal(result.state, "INVALID_DATA");
  }
});

test("independent audit: pagination preserves authoritative query order for same-timestamp mixed-case IDs", async () => {
  const ids = [
    "z0", "a0", "Z0", "A0", "m0", "M0", "x0", "X0", "b0", "B0",
    "y0", "Y0", "c0", "C0", "n0", "N0", "d0", "D0", "q0", "Q0", "sentinel0",
  ];
  const result = await listHeadCoachWeeklyTrainingSavedDrafts(
    "club-a",
    "hc-a",
    null,
    opsWithPage(ids.map((id) => plan(id)),
  );
  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") return;
  assert.deepEqual(result.value.items.map((item) => item.planId), ids.slice(0, 20));
  assert.deepEqual(result.value.nextCursor, { updatedAt: TS, planId: "Q0" });
});

test("independent audit: child normalization corruption remains rejected", () => {
  for (const [sessionDrift, blockDrift] of [
    [{ location: " Training Ground A" }, {}],
    [{ objective: "Progress through two pressing lines " }, {}],
    [{}, { title: " Build-up 8v6" }],
    [{}, { coachingPoints: ["Create the third-player option "] }],
  ] as Array<[Record<string, unknown>, Record<string, unknown>]>) {
    const result = buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: plan(),
      sessions: [{ document: session(sessionDrift), blocks: [block(blockDrift)] }],
    });
    assert.equal(result.state, "INVALID");
  }
});