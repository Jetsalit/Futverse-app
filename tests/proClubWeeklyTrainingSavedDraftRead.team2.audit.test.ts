import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildWeeklyTrainingSavedDraftDetail,
  buildWeeklyTrainingSavedDraftSummary,
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

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "2026-09-08-1600",
    data: {
      schemaVersion: 1,
      orderIndex: 0,
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

function block(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-01",
    data: {
      schemaVersion: 1,
      orderIndex: 0,
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

test("cross-author and lifecycle drift fail closed", () => {
  for (const document of [
    plan({ authorUid: "hc-b" }),
    plan({ status: "SUBMITTED" }),
    plan({ status: "PUBLISHED" }),
  ]) {
    assert.equal(
      buildWeeklyTrainingSavedDraftSummary({ clubId: "club-a", actorUid: "hc-a", document }).state,
      "INVALID",
    );
  }
});

test("child audit corruption and non-contiguous hierarchy fail closed", () => {
  const cases = [
    [{ document: session({ updatedAt: stamp(10), createdAt: stamp(20) }), blocks: [block()] }],
    [{ document: session(), blocks: [{ ...block(), id: "block-02" }] }],
    [{ document: { ...session(), id: "2026-09-08-1700" }, blocks: [block()] }],
  ];
  for (const sessions of cases) {
    assert.equal(
      buildWeeklyTrainingSavedDraftDetail({
        clubId: "club-a",
        actorUid: "hc-a",
        planDocument: plan(),
        sessions,
      }).state,
      "INVALID",
    );
  }
});

test("browser adapter remains read-only and server-source-bound", async () => {
  const adapter = await readFile("src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter.ts", "utf8");
  assert.match(adapter, /getDocFromServer/);
  assert.match(adapter, /getDocsFromServer/);
  assert.match(adapter, /authorUid/);
  assert.match(adapter, /status/);
  for (const forbidden of ["setDoc", "addDoc", "updateDoc", "deleteDoc", "writeBatch", "runTransaction", "httpsCallable"]) {
    assert.doesNotMatch(adapter, new RegExp(`\\b${forbidden}\\b`));
  }
});

test("authority change invalidates stale reads and clears both loading flags", async () => {
  const component = await readFile("src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx", "utf8");
  const effectStart = component.indexOf("useEffect(() => {");
  const effectEnd = component.indexOf("}, [allowed, authority.organizationId, authority.userId, loadList]);");
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  const effect = component.slice(effectStart, effectEnd);
  assert.match(effect, /requestGeneration\.current \+= 1/);
  assert.match(effect, /setDrafts\(\[\]\)/);
  assert.match(effect, /setSelectedPlanId\(null\)/);
  assert.match(effect, /setDetail\(null\)/);
  assert.match(effect, /setLoadingList\(false\)/);
  assert.match(effect, /setLoadingDetail\(false\)/);
});
