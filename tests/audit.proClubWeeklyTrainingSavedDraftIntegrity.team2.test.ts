import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSummary,
  sortWeeklyTrainingSavedDraftSummaries,
} from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";
import {
  getHeadCoachWeeklyTrainingSavedDraftDetail,
  type WeeklyTrainingSavedDraftReadOps,
} from "../src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";

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
      mainObjective: "Independent integrity audit",
      sessionCount: 1,
      createdAt: stamp(100, 500),
      createdBy: "hc-a",
      updatedAt: stamp(100, 500),
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "2026-09-08-1600",
    data: {
      schemaVersion: 2,
      orderIndex: 0,
      sessionDate: "2026-09-08",
      startTime: "16:00",
      location: "Ground",
      objective: "Objective",
      phaseOfPlay: "GENERAL",
      plannedLoad: "MODERATE",
      durationMinutes: 60,
      blockCount: 1,
      createdAt: stamp(100, 500),
      createdBy: "hc-a",
      updatedAt: stamp(100, 500),
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

function block(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-01",
    data: {
      schemaVersion: 2,
      orderIndex: 0,
      blockType: "TACTICAL",
      title: "Block",
      durationMinutes: 30,
      coachingPoints: ["Point"],
      createdAt: stamp(100, 500),
      createdBy: "hc-a",
      updatedAt: stamp(100, 500),
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

test("one-nanosecond audit reversal fails closed", () => {
  const result = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: plan({ createdAt: stamp(100, 501), updatedAt: stamp(100, 500) }),
  });
  assert.equal(result.state, "INVALID");
});

test("sorting uses actual nanosecond order rather than plan ID inside one millisecond", () => {
  const older = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: { ...plan({ updatedAt: stamp(100, 100_000) }), id: "aaa" },
  });
  const newer = buildWeeklyTrainingSavedDraftSummary({
    clubId: "club-a",
    actorUid: "hc-a",
    document: { ...plan({ updatedAt: stamp(100, 100_001) }), id: "zzz" },
  });
  assert.equal(older.state, "VALID");
  assert.equal(newer.state, "VALID");
  if (older.state !== "VALID" || newer.state !== "VALID") return;
  assert.deepEqual(sortWeeklyTrainingSavedDraftSummaries([older.value, newer.value]).map((value) => value.planId), ["zzz", "aaa"]);
});

test("detail rejects both under-counted and over-counted session collections", () => {
  assert.equal(buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan({ sessionCount: 2 }),
    sessions: [{ document: session(), blocks: [block()] }],
  }).state, "INVALID");

  assert.equal(buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan({ sessionCount: 1 }),
    sessions: [
      { document: session(), blocks: [block()] },
      { document: { ...session({ orderIndex: 1, sessionDate: "2026-09-09" }), id: "2026-09-09-1600" }, blocks: [block()] },
    ],
  }).state, "INVALID");
});

test("detail rejects both under-counted and over-counted block collections", () => {
  assert.equal(buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan(),
    sessions: [{ document: session({ blockCount: 2 }), blocks: [block()] }],
  }).state, "INVALID");

  assert.equal(buildWeeklyTrainingSavedDraftDetail({
    clubId: "club-a",
    actorUid: "hc-a",
    planDocument: plan(),
    sessions: [{
      document: session({ blockCount: 1 }),
      blocks: [block(), { ...block({ orderIndex: 1, title: "Block 2" }), id: "block-02" }],
    }],
  }).state, "INVALID");
});

test("adapter rejects session cardinality mismatch before any block read", async () => {
  let blockReads = 0;
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async readDocument() { return plan({ sessionCount: 1 }); },
    async listDocuments(path) {
      if (path.at(-1) === "sessions") {
        return [session(), { ...session({ orderIndex: 1, sessionDate: "2026-09-09" }), id: "2026-09-09-1600" }];
      }
      if (path.at(-1) === "blocks") blockReads += 1;
      return [];
    },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "INVALID_DATA");
  assert.equal(blockReads, 0);
});

test("adapter validates all session metadata before any block fan-out", async () => {
  let blockReads = 0;
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async readDocument() { return plan({ sessionCount: 2 }); },
    async listDocuments(path) {
      if (path.at(-1) === "sessions") {
        return [
          session(),
          { ...session({ orderIndex: 1, sessionDate: "2026-09-09", blockCount: 99 }), id: "2026-09-09-1600" },
        ];
      }
      if (path.at(-1) === "blocks") blockReads += 1;
      return [];
    },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "INVALID_DATA");
  assert.equal(blockReads, 0);
});

test("browser read adapter remains free of write and callable APIs", async () => {
  const source = await readFile("src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter.ts", "utf8");
  for (const forbidden of ["setDoc", "addDoc", "updateDoc", "deleteDoc", "writeBatch", "runTransaction", "httpsCallable"]) {
    assert.equal(new RegExp(`\\b${forbidden}\\b`).test(source), false, forbidden);
  }
  assert.match(source, /sessionCount \+ 1/);
  assert.match(source, /expectedBlockCount \+ 1/);
});

test("trusted server is sole producer of hierarchy cardinality fields", async () => {
  const source = await readFile("functions/src/proClubWeeklyTrainingDraftSave/service.ts", "utf8");
  assert.match(source, /sessionCount: draft\.sessions\.length/);
  assert.match(source, /blockCount: session\.blocks\.length/);
  assert.match(source, /WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION = 2/);
  assert.doesNotMatch(source, /input\.(sessionCount|blockCount)/);
});
