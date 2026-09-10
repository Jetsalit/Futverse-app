import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  buildWeeklyTrainingSavedDraftDetail,
} from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";
import {
  listHeadCoachWeeklyTrainingSavedDrafts,
  WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE,
  type WeeklyTrainingSavedDraftReadOps,
} from "../src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter";

const stamp = (seconds: number, nanoseconds = 0) => ({ seconds, nanoseconds });
const baseStamp = stamp(1_757_280_100, 700_000);

function plan(id: string, seconds: number, nanoseconds = 0) {
  const ts = stamp(seconds, nanoseconds);
  return {
    id,
    data: {
      schemaVersion: 2,
      authorUid: "hc-a",
      status: "DRAFT",
      weekStartDate: "2026-09-07",
      squadLabel: "First Team",
      mainObjective: "Audit",
      sessionCount: 1,
      createdAt: ts,
      createdBy: "hc-a",
      updatedAt: ts,
      updatedBy: "hc-a",
    },
  };
}

function detailPlan() {
  return plan("plan-a", baseStamp.seconds, baseStamp.nanoseconds);
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
      objective: "Progress",
      phaseOfPlay: "IN_POSSESSION",
      plannedLoad: "MODERATE",
      durationMinutes: 60,
      blockCount: 1,
      createdAt: baseStamp,
      createdBy: "hc-a",
      updatedAt: baseStamp,
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
      coachingPoints: ["Scan"],
      createdAt: baseStamp,
      createdBy: "hc-a",
      updatedAt: baseStamp,
      updatedBy: "hc-a",
      ...overrides,
    },
  };
}

function opsWithPage(documents: readonly any[]): WeeklyTrainingSavedDraftReadOps {
  return {
    async listPlanPage() { return documents; },
    async listDocuments() { return []; },
    async readDocument() { return null; },
  };
}

test("page boundary exposes exactly 20 items and cursor from last visible item, not sentinel", async () => {
  const docs = Array.from({ length: 21 }, (_, index) => plan(`plan-${String(100 - index).padStart(3, "0")}`, 2_000 - index));
  const result = await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", null, opsWithPage(docs));
  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") return;
  assert.equal(result.value.items.length, WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE);
  assert.equal(result.value.nextCursor?.planId, docs[19]?.id);
  assert.notEqual(result.value.nextCursor?.planId, docs[20]?.id);
});

test("second-page cursor is forwarded without precision loss", async () => {
  const seen: any[] = [];
  const cursor = { updatedAt: { seconds: 123, nanoseconds: 987_654_321 }, planId: "plan-z" };
  const ops: WeeklyTrainingSavedDraftReadOps = {
    ...opsWithPage([]),
    async listPlanPage(_clubId, _actorUid, actualCursor) { seen.push(actualCursor); return []; },
  };
  const result = await listHeadCoachWeeklyTrainingSavedDrafts("club-a", "hc-a", cursor, ops);
  assert.equal(result.state, "FOUND");
  assert.deepEqual(seen[0], cursor);
});

test("detail fails closed for any child fresh-save audit drift", () => {
  for (const hierarchy of [
    [{ document: session({ createdBy: "hc-b" }), blocks: [block()] }],
    [{ document: session({ updatedAt: stamp(baseStamp.seconds, baseStamp.nanoseconds + 1) }), blocks: [block()] }],
    [{ document: session(), blocks: [block({ updatedBy: "hc-b" })] }],
    [{ document: session(), blocks: [block({ createdAt: stamp(baseStamp.seconds - 1, baseStamp.nanoseconds) })] }],
  ]) {
    const result = buildWeeklyTrainingSavedDraftDetail({
      clubId: "club-a",
      actorUid: "hc-a",
      planDocument: detailPlan(),
      sessions: hierarchy,
    });
    assert.equal(result.state, "INVALID");
  }
});

test("pagination implementation is ordered, bounded, indexed and read-only", async () => {
  const adapter = await readFile("src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter.ts", "utf8");
  const component = await readFile("src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx", "utf8");
  const firebase = JSON.parse(await readFile("firebase.json", "utf8"));
  const indexes = JSON.parse(await readFile("firestore.indexes.json", "utf8"));

  assert.match(adapter, /orderBy\("updatedAt", "desc"\)/);
  assert.match(adapter, /orderBy\(documentId\(\), "desc"\)/);
  assert.match(adapter, /new Timestamp\(cursor\.updatedAt\.seconds, cursor\.updatedAt\.nanoseconds\)/);
  assert.match(adapter, /startAfter\(/);
  assert.match(adapter, /WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE \+ 1/);
  assert.doesNotMatch(adapter, /\bsetDoc\b|\bupdateDoc\b|\bdeleteDoc\b|httpsCallable/);
  assert.match(component, /Load more saved drafts/);
  assert.match(component, /setNextCursor\(null\)/);
  assert.equal(firebase.firestore.indexes, "firestore.indexes.json");
  assert.deepEqual(indexes.indexes[0].fields, [
    { fieldPath: "authorUid", order: "ASCENDING" },
    { fieldPath: "status", order: "ASCENDING" },
    { fieldPath: "updatedAt", order: "DESCENDING" },
    { fieldPath: "__name__", order: "DESCENDING" },
  ]);
});
