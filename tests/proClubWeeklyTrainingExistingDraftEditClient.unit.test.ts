import assert from "node:assert/strict";
import { test } from "node:test";

import {
  editProClubWeeklyTrainingExistingDraft,
  ProClubWeeklyTrainingExistingDraftEditClientError,
} from "../src/lib/proClubWeeklyTrainingExistingDraftEditClient";

const draft = {
  clubId: "club-a",
  authorUid: "hc-a",
  weekStartDate: "2026-09-14",
  squadLabel: "First Team",
  mainObjective: "Build through pressure",
  sessions: [{
    sessionDate: "2026-09-15",
    startTime: "16:00",
    location: "Training Ground A",
    objective: "Progress through pressure",
    phaseOfPlay: "IN_POSSESSION" as const,
    plannedLoad: "MODERATE" as const,
    durationMinutes: 90,
    blocks: [{
      blockType: "TACTICAL" as const,
      title: "Build-up",
      durationMinutes: 30,
      coachingPoints: ["Create the third-player option"],
    }],
  }],
};

const expectedPlanUpdatedAt = {
  seconds: 1_757_829_600,
  nanoseconds: 123_456_789,
} as const;

test("existing-DRAFT edit client validates and accepts exact server result", async () => {
  const result = await editProClubWeeklyTrainingExistingDraft(
    { planId: "plan-a", expectedPlanUpdatedAt, draft },
    async (request) => ({
      data: {
        status: "COMPLETED",
        clubId: request.draft.clubId,
        planId: request.planId,
        documentCount: 3,
        updatedAt: "2026-09-14T06:05:00.000Z",
      },
    }),
  );
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.planId, "plan-a");
  assert.equal(result.documentCount, 3);
});

test("existing-DRAFT edit client maps callable aborted to conflict", async () => {
  await assert.rejects(
    () => editProClubWeeklyTrainingExistingDraft(
      { planId: "plan-a", expectedPlanUpdatedAt, draft },
      async () => {
        throw { code: "functions/aborted" };
      },
    ),
    (error) => error instanceof ProClubWeeklyTrainingExistingDraftEditClientError && error.code === "CONFLICT",
  );
});

test("existing-DRAFT edit client rejects unverifiable response", async () => {
  await assert.rejects(
    () => editProClubWeeklyTrainingExistingDraft(
      { planId: "plan-a", expectedPlanUpdatedAt, draft },
      async () => ({ data: { status: "COMPLETED", clubId: "club-a", planId: "plan-a" } }),
    ),
    (error) => error instanceof ProClubWeeklyTrainingExistingDraftEditClientError && error.code === "INVALID_RESPONSE",
  );
});


test("existing-DRAFT client preserves nanosecond concurrency precision", async () => {
  let received:
    | { readonly seconds: number; readonly nanoseconds: number }
    | undefined;

  await editProClubWeeklyTrainingExistingDraft(
    { planId: "plan-a", expectedPlanUpdatedAt, draft },
    async (request) => {
      received = request.expectedPlanUpdatedAt;
      return {
        data: {
          status: "COMPLETED",
          clubId: request.draft.clubId,
          planId: request.planId,
          documentCount: 3,
          updatedAt: "2026-09-14T06:05:00.000Z",
        },
      };
    },
  );

  assert.deepEqual(received, expectedPlanUpdatedAt);
});
