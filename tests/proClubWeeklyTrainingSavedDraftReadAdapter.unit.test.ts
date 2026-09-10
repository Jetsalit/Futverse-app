import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getHeadCoachWeeklyTrainingSavedDraftDetail,
  listHeadCoachWeeklyTrainingSavedDrafts,
  WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE,
  type WeeklyTrainingSavedDraftPageCursor,
  type WeeklyTrainingSavedDraftReadOps,
} from "../src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const BASE_STAMP = stamp(1_757_280_100, 500_000);
const plan = (authorUid = "hc-a", overrides: Record<string, unknown> = {}, id = "plan-a") => ({
  id,
  data: {
    schemaVersion: 2,
    authorUid,
    status: "DRAFT",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    sessionCount: 1,
    createdAt: BASE_STAMP,
    createdBy: authorUid,
    updatedAt: BASE_STAMP,
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
    createdAt: BASE_STAMP,
    createdBy: "hc-a",
    updatedAt: BASE_STAMP,
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
    createdAt: BASE_STAMP,
    createdBy: "hc-a",
    updatedAt: BASE_STAMP,
    updatedBy: "hc-a",
  },
};

function baseOps(): WeeklyTrainingSavedDraftReadOps {
  return {
    async listDocuments() { return []; },
    async listPlanPage() { return []; },
    async readDocument() { return null; },
  };
}

test("list page is tenant/actor bound, sentinel limited, and cursor-preserving", async () => {
  const calls: Array<{ clubId: string; actorUid: string; cursor: WeeklyTrainingSavedDraftPageCursor | null; maxDocuments: number }> = [];
  const docs = Array.from({ length: WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE + 1 }, (_, index) => {
    const ts = stamp(1_757_280_200 - index, 900_000 - index);
    return plan("hc-a", { createdAt: ts, updatedAt: ts }, `plan-${String(99 - index).padStart(2, "0")}`);
  });
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...baseOps(),
    async listPlanPage(clubId, actorUid, cursor, maxDocuments) {
      calls.push({ clubId, actorUid, cursor, maxDocuments });
      return docs;
    },
  };

  const result = await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", null, ops);
  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") return;
  assert.equal(calls[0]?.clubId, "club-a");
  assert.equal(calls[0]?.actorUid, "hc-a");
  assert.equal(calls[0]?.maxDocuments, WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE + 1);
  assert.equal(result.value.items.length, WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE);
  assert.ok(result.value.nextCursor);
  assert.equal(result.value.nextCursor?.planId, result.value.items.at(-1)?.planId);
});

test("list page returns no cursor when the page is exhausted", async () => {
  const ops: WeeklyTrainingSavedDraftReadOps = { ...baseOps(), async listPlanPage() { return [plan()]; } };
  const result = await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", null, ops);
  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") return;
  assert.equal(result.value.items.length, 1);
  assert.equal(result.value.nextCursor, null);
});

test("invalid page cursor fails before any Firestore operation", async () => {
  let calls = 0;
  const ops: WeeklyTrainingSavedDraftReadOps = { ...baseOps(), async listPlanPage() { calls += 1; return []; } };
  const bad = { updatedAt: { seconds: 1, nanoseconds: 1_000_000_000 }, planId: "plan-a" };
  assert.equal((await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", bad, ops)).state, "INVALID_DATA");
  assert.equal(calls, 0);
});

test("detail rebinds plan author before reading child collections", async () => {
  let childReads = 0;
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...baseOps(),
    async listDocuments() { childReads += 1; return []; },
    async readDocument() { return plan("hc-b"); },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "MISSING");
  assert.equal(childReads, 0);
});

test("detail bounds session and block reads by trusted cardinality and audit parity", async () => {
  const calls: Array<{ path: string; maxDocuments?: number }> = [];
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...baseOps(),
    async readDocument(path) { calls.push({ path: path.join("/") }); return plan(); },
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

test("detail rejects child audit drift before rendering", async () => {
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...baseOps(),
    async readDocument() { return plan(); },
    async listDocuments(path) {
      if (path.at(-1) === "sessions") return [session({ updatedBy: "hc-b" })];
      if (path.at(-1) === "blocks") return [block];
      return [];
    },
  };
  const result = await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops);
  assert.equal(result.state, "INVALID_DATA");
});

test("oversized session result fails before any block fan-out", async () => {
  let blockReads = 0;
  const sessions = Array.from({ length: 15 }, (_, index) => ({ ...session({ orderIndex: Math.min(index, 13) }), id: `session-${index}` }));
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...baseOps(),
    async readDocument() { return plan("hc-a", { sessionCount: 14 }); },
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
    ...baseOps(),
    async readDocument() { return plan(); },
    async listDocuments(path) {
      if (path.at(-1) === "sessions") return [session({ blockCount: 2 })];
      if (path.at(-1) === "blocks") return [block];
      return [];
    },
  };
  assert.equal((await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops)).state, "INVALID_DATA");
});

test("permission-denied is normalized without exposing a partial result", async () => {
  const denied = Object.assign(new Error("denied"), { code: "permission-denied" });
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...baseOps(),
    async listPlanPage() { throw denied; },
    async listDocuments() { throw denied; },
    async readDocument() { throw denied; },
  };
  assert.equal((await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", null, ops)).state, "PERMISSION_DENIED");
  assert.equal((await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan-a", ops)).state, "PERMISSION_DENIED");
});

test("invalid path identities fail before any Firestore operation", async () => {
  let calls = 0;
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...baseOps(),
    async listPlanPage() { calls += 1; return []; },
    async listDocuments() { calls += 1; return []; },
    async readDocument() { calls += 1; return null; },
  };
  assert.equal((await listHeadCoachWeeklyTrainingSavedDrafts("club/a", "hc-a", null, ops)).state, "INVALID_DATA");
  assert.equal((await getHeadCoachWeeklyTrainingSavedDraftDetail("club-a", "hc-a", "plan/a", ops)).state, "INVALID_DATA");
  assert.equal(calls, 0);
});
