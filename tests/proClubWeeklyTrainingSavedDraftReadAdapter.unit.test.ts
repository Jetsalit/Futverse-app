import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getHeadCoachWeeklyTrainingSavedDraftDetail,
  listHeadCoachWeeklyTrainingSavedDrafts,
  type WeeklyTrainingSavedDraftReadOps,
} from "../src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const plan = (authorUid = "hc-a", overrides: Record<string, unknown> = {}) => ({
  id: "plan-a",
  data: {
    schemaVersion: 2,
    authorUid,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    sessionCount: 1,
    createdAt: stamp(1_757_280_000),
    createdBy: authorUid,
    updatedAt: stamp(1_757_280_100),
    updatedBy: authorUid,
    ...overrides,
  },
});
const session = (overrides: Record<string, unknown> = {}) => ({
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
    createdAt: stamp(1_757_280_000),
    createdBy: "hc-a",
    updatedAt: stamp(1_757_280_100),
    updatedBy: "hc-a",
    ...overrides,
  },
});
const block = {
  id: "block-01",
  data: {
    schemaVersion: 2,
    orderIndex: 0,
    blockType: "TACTICAL",
    title: "Build-up 8v6",
    durationMinutes: 45,
    coachingPoints: ["Create the third-player option"],
    createdAt: stamp(1_757_280_000),
    createdBy: "hc-a",
    updatedAt: stamp(1_757_280_100),
    updatedBy: "hc-a",
  },
};

test("list query is tenant-bound and author/status constrained", async () => {
  const calls: Array<{ path: readonly string[]; filters: unknown; maxDocuments?: number }> = [];
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async listDocuments(path, filters, maxDocuments) {
      calls.push({ path, filters, maxDocuments });
      return [plan()];
    },
    async readDocument() {
      throw new Error("not used");
    },
  };

  const result = await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", ops);
  assert.equal(result.state, "FOUND");
  assert.deepEqual(calls[0]?.path, ["proClubs", "club-a", "weeklyTrainingPlans"]);
  assert.deepEqual(calls[0]?.filters, [
    { field: "authorUid", value: "hc-a" },
    { field: "status", value: "DRAFT" },
  ]);
  assert.equal(calls[0]?.maxDocuments, undefined);
});

test("detail rebinds plan author before reading child collections", async () => {
  let childReads = 0;
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async listDocuments() {
      childReads += 1;
      return [];
    },
    async readDocument() {
      return plan("hc-b");
    },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "MISSING");
  assert.equal(childReads, 0);
});

test("detail bounds session and block reads by trusted cardinality", async () => {
  const calls: Array<{ path: string; maxDocuments?: number }> = [];
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async readDocument(path) {
      calls.push({ path: path.join("/") });
      return plan();
    },
    async listDocuments(path, _filters, maxDocuments) {
      calls.push({ path: path.join("/"), maxDocuments });
      if (path.at(-1) === "sessions") return [session()];
      if (path.at(-1) === "blocks") return [block];
      return [];
    },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "FOUND");
  assert.deepEqual(calls, [
    { path: "proClubs/club-a/weeklyTrainingPlans/plan-a" },
    { path: "proClubs/club-a/weeklyTrainingPlans/plan-a/sessions", maxDocuments: 2 },
    { path: "proClubs/club-a/weeklyTrainingPlans/plan-a/sessions/2026-09-08-1600/blocks", maxDocuments: 2 },
  ]);
});

test("oversized session result fails before any block fan-out", async () => {
  let blockReads = 0;
  const sessions = Array.from({ length: 15 }, (_, index) => ({
    ...session({ orderIndex: Math.min(index, 13) }),
    id: `session-${index}`,
  }));
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async readDocument() {
      return plan("hc-a", { sessionCount: 14 });
    },
    async listDocuments(path) {
      if (path.at(-1) === "sessions") return sessions;
      if (path.at(-1) === "blocks") blockReads += 1;
      return [];
    },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "INVALID_DATA");
  assert.equal(blockReads, 0);
});

test("truncated block hierarchy fails closed against trusted blockCount", async () => {
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async readDocument() {
      return plan();
    },
    async listDocuments(path) {
      if (path.at(-1) === "sessions") return [session({ blockCount: 2 })];
      if (path.at(-1) === "blocks") return [block];
      return [];
    },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "INVALID_DATA");
});

test("permission-denied is normalized without exposing a partial result", async () => {
  const denied = Object.assign(new Error("denied"), { code: "permission-denied" });
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async listDocuments() {
      throw denied;
    },
    async readDocument() {
      throw denied;
    },
  };
  assert.equal((await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", ops)).state, "PERMISSION_DENIED");
  assert.equal((await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops)).state, "PERMISSION_DENIED");
});

test("invalid path identities fail before any Firestore operation", async () => {
  let calls = 0;
  const ops: WeeklyTrainingSavedDraftReadOps = {
    async listDocuments() { calls += 1; return []; },
    async readDocument() { calls += 1; return null; },
  };
  assert.equal((await listHeadCoachWeeklyTrainingSavedDrafts("club/a", "hc-a", ops)).state, "INVALID_DATA");
  assert.equal((await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan/a", ops)).state, "INVALID_DATA");
  assert.equal(calls, 0);
});
