import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRO_CLUB_WEEKLY_TRAINING_MAX_PRODUCTION_BATCH_DOCUMENTS,
  ProClubWeeklyTrainingProductionPersistenceError,
  prepareProClubWeeklyTrainingProductionWrite,
  saveProClubWeeklyTrainingFreshDraftToProductionFirestore,
  type ProClubWeeklyTrainingProductionPersistenceOps,
  type ProClubWeeklyTrainingPreparedProductionWrite,
} from "../src/lib/firestore/proClubWeeklyTrainingProductionPersistence.ts";
import type {
  ProClubTrainingBlockDraft,
  ProClubTrainingSessionDraft,
  ProClubWeeklyTrainingDraft,
} from "../src/lib/proClubWeeklyTraining.ts";
import type { WeeklyTrainingSavedDraftDetail } from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const CLUB_ID = "club-a";
const COACH_UID = "coach-1";

function block(index = 0): ProClubTrainingBlockDraft {
  return {
    blockType: index % 2 === 0 ? "GAME" : "CONDITIONING",
    title: `Block ${index + 1}`,
    durationMinutes: 5,
    coachingPoints: ["Keep the team compact"],
  };
}

function session(
  sessionDate = "2026-09-07",
  startTime = "10:00",
  blocks: readonly ProClubTrainingBlockDraft[] = [block()],
): ProClubTrainingSessionDraft {
  return {
    sessionDate,
    startTime,
    location: "Training Ground",
    objective: "Prepare the team structure",
    phaseOfPlay: "GENERAL",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    blocks,
  };
}

function draft(
  sessions: readonly ProClubTrainingSessionDraft[] = [session()],
): ProClubWeeklyTrainingDraft {
  return {
    clubId: CLUB_ID,
    authorUid: COACH_UID,
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Prepare for the next match",
    secondaryObjective: "Improve compactness",
    headCoachNote: "Fresh DRAFT only",
    sessions,
  };
}

function detail(
  source: ProClubWeeklyTrainingDraft = draft(),
): WeeklyTrainingSavedDraftDetail {
  return {
    planId: REQUEST_ID,
    clubId: CLUB_ID,
    authorUid: COACH_UID,
    weekStartDate: source.weekStartDate,
    squadLabel: source.squadLabel,
    mainObjective: source.mainObjective,
    ...(source.secondaryObjective === undefined
      ? {}
      : { secondaryObjective: source.secondaryObjective }),
    ...(source.headCoachNote === undefined
      ? {}
      : { headCoachNote: source.headCoachNote }),
    sessionCount: source.sessions.length,
    createdAt: "2026-09-12T03:00:00.000Z",
    updatedAt: "2026-09-12T03:00:00.000Z",
    createdAtOrder: { seconds: 1_757_643_600, nanoseconds: 0 },
    updatedAtOrder: { seconds: 1_757_643_600, nanoseconds: 0 },
    draft: source,
  };
}

function input(source: ProClubWeeklyTrainingDraft = draft()) {
  return {
    requestId: REQUEST_ID,
    clubId: CLUB_ID,
    actorUid: COACH_UID,
    draft: source,
  } as const;
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ProClubWeeklyTrainingProductionPersistenceError
    ? error.code
    : undefined;
}

function ops(input: {
  commit?: (prepared: ProClubWeeklyTrainingPreparedProductionWrite) => Promise<void>;
  read?: ProClubWeeklyTrainingProductionPersistenceOps["readDetail"];
} = {}): ProClubWeeklyTrainingProductionPersistenceOps {
  return {
    commitPreparedWrite: input.commit ?? (async () => undefined),
    readDetail:
      input.read ??
      (async () => ({ state: "FOUND", value: detail() })),
  };
}

test("uses requestId as deterministic plan identity and reserves one manifest write", () => {
  const prepared = prepareProClubWeeklyTrainingProductionWrite(input());
  assert.equal(prepared.planId, REQUEST_ID);
  assert.equal(prepared.manifestPath, `proClubs/${CLUB_ID}/weeklyTrainingDraftCreateRequests/${REQUEST_ID}`);
  assert.equal(prepared.hierarchyDocumentCount, 3);
  assert.equal(prepared.batchDocumentCount, 4);
});

test("accepts the canonical 183-document hierarchy as one 184-write production batch", () => {
  const sessions: ProClubTrainingSessionDraft[] = [];
  for (let index = 0; index < 14; index += 1) {
    const date = `2026-09-${String(7 + (index % 7)).padStart(2, "0")}`;
    const startTime = index < 7 ? "09:00" : "15:00";
    sessions.push(
      session(
        date,
        startTime,
        Array.from({ length: 12 }, (_, blockIndex) => block(blockIndex)),
      ),
    );
  }
  const prepared = prepareProClubWeeklyTrainingProductionWrite(input(draft(sessions)));
  assert.equal(prepared.hierarchyDocumentCount, 183);
  assert.equal(prepared.batchDocumentCount, PRO_CLUB_WEEKLY_TRAINING_MAX_PRODUCTION_BATCH_DOCUMENTS);
});

test("treats a committed write as complete only after deterministic detail reconciliation", async () => {
  let committedPlanId = "";
  const result = await saveProClubWeeklyTrainingFreshDraftToProductionFirestore(
    input(),
    ops({
      commit: async (prepared) => {
        committedPlanId = prepared.planId;
      },
    }),
  );
  assert.equal(committedPlanId, REQUEST_ID);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.requestId, REQUEST_ID);
  assert.equal(result.planId, REQUEST_ID);
  assert.equal(result.documentCount, 3);
});

test("reconciles an ambiguous commit failure to success when the exact deterministic draft exists", async () => {
  const result = await saveProClubWeeklyTrainingFreshDraftToProductionFirestore(
    input(),
    ops({
      commit: async () => {
        throw { code: "firestore/unavailable" };
      },
    }),
  );
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.planId, REQUEST_ID);
});

test("keeps a missing ambiguous save retryable with the same request identity", async () => {
  let capturedRequestId = "";
  await assert.rejects(
    saveProClubWeeklyTrainingFreshDraftToProductionFirestore(
      input(),
      ops({
        commit: async (prepared) => {
          capturedRequestId = prepared.requestId;
          throw { code: "firestore/unavailable" };
        },
        read: async () => ({ state: "MISSING" }),
      }),
    ),
    (error: unknown) => errorCode(error) === "unavailable",
  );
  assert.equal(capturedRequestId, REQUEST_ID);
});

test("fails closed when the deterministic plan exists with a different canonical payload", async () => {
  const changed = { ...draft(), mainObjective: "Different canonical payload" };
  await assert.rejects(
    saveProClubWeeklyTrainingFreshDraftToProductionFirestore(
      input(),
      ops({
        commit: async () => {
          throw { code: "firestore/permission-denied" };
        },
        read: async () => ({ state: "FOUND", value: detail(changed) }),
      }),
    ),
    (error: unknown) => errorCode(error) === "failed-precondition",
  );
});

test("fails closed on invalid saved hierarchy and permission-denied reconciliation", async () => {
  for (const [state, expected] of [
    ["INVALID_DATA", "failed-precondition"],
    ["PERMISSION_DENIED", "permission-denied"],
  ] as const) {
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraftToProductionFirestore(
        input(),
        ops({
          read: async () => ({ state, error: new Error(state) }),
        }),
      ),
      (error: unknown) => errorCode(error) === expected,
    );
  }
});

test("rejects cross-club or cross-actor binding before any transport", async () => {
  let called = false;
  for (const hostile of [
    { ...input(), clubId: "club-b" },
    { ...input(), actorUid: "coach-2" },
  ]) {
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraftToProductionFirestore(
        hostile,
        ops({ commit: async () => { called = true; } }),
      ),
      (error: unknown) => errorCode(error) === "invalid-argument",
    );
  }
  assert.equal(called, false);
});
