import assert from "node:assert/strict";
import { test } from "node:test";

import {
  exactWeeklyTrainingTimestampToken,
  validateWeeklyTrainingExistingDraftEditInput,
  WeeklyTrainingExistingDraftEditError,
} from "../functions/src/proClubWeeklyTrainingExistingDraftEdit/core.ts";
import {
  executeEditProClubWeeklyTrainingExistingDraftCallable,
  PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_SERVER_ENABLED,
} from "../functions/src/proClubWeeklyTrainingExistingDraftEdit/callableHandler.ts";

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
    phaseOfPlay: "IN_POSSESSION",
    plannedLoad: "MODERATE",
    durationMinutes: 90,
    blocks: [{
      blockType: "TACTICAL",
      title: "Build-up",
      durationMinutes: 30,
      coachingPoints: ["Create the third-player option"],
    }],
  }],
};

const EXPECTED_UPDATED_AT = {
  seconds: 1_757_829_600,
  nanoseconds: 123_456_789,
} as const;

test("Existing-DRAFT edit input reuses canonical Weekly Training validation", () => {
  const result = validateWeeklyTrainingExistingDraftEditInput({
    planId: "plan-a",
    expectedPlanUpdatedAt: EXPECTED_UPDATED_AT,
    draft,
  });
  assert.equal(result.planId, "plan-a");
  assert.deepEqual(result.expectedPlanUpdatedAt, EXPECTED_UPDATED_AT);
  assert.equal(result.draft.clubId, "club-a");
});

test("Existing-DRAFT edit rejects non-canonical envelope and timestamp", () => {
  assert.equal(exactWeeklyTrainingTimestampToken(EXPECTED_UPDATED_AT), true);
  assert.equal(
    exactWeeklyTrainingTimestampToken({
      seconds: EXPECTED_UPDATED_AT.seconds,
      nanoseconds: 1_000_000_000,
    }),
    false,
  );
  assert.equal(
    exactWeeklyTrainingTimestampToken("2026-09-14T06:00:00.123Z"),
    false,
  );
  assert.throws(
    () => validateWeeklyTrainingExistingDraftEditInput({
      planId: "plan-a",
      expectedPlanUpdatedAt: EXPECTED_UPDATED_AT,
      draft,
      injected: true,
    }),
    (error) => error instanceof WeeklyTrainingExistingDraftEditError && error.code === "INVALID_ARGUMENT",
  );
});

test("server production activation remains fail-closed before service execution", async () => {
  assert.equal(PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_SERVER_ENABLED, false);
  let called = false;
  await assert.rejects(
    () => executeEditProClubWeeklyTrainingExistingDraftCallable(
      {
        auth: { uid: "hc-a" },
        app: { appId: "app-a" },
        data: { planId: "plan-a", expectedPlanUpdatedAt: EXPECTED_UPDATED_AT, draft },
      },
      {
        allowedAppIds: ["app-a"],
        executionEnabled: false,
        service: {
          async editExistingDraft() {
            called = true;
            throw new Error("must not run");
          },
        },
      },
    ),
    (error: unknown) => Boolean(
      error && typeof error === "object" && "code" in error &&
      String((error as { code?: unknown }).code).includes("failed-precondition"),
    ),
  );
  assert.equal(called, false);
});

test("callable rejects missing App Check before invoking service", async () => {
  let called = false;
  await assert.rejects(
    () => executeEditProClubWeeklyTrainingExistingDraftCallable(
      { auth: { uid: "hc-a" }, data: { planId: "plan-a", expectedPlanUpdatedAt: EXPECTED_UPDATED_AT, draft } },
      {
        allowedAppIds: ["app-a"],
        executionEnabled: true,
        service: {
          async editExistingDraft() {
            called = true;
            throw new Error("must not run");
          },
        },
      },
    ),
    (error: unknown) => Boolean(
      error && typeof error === "object" && "code" in error &&
      String((error as { code?: unknown }).code).includes("failed-precondition"),
    ),
  );
  assert.equal(called, false);
});

test("callable binds actor from auth and maps conflict to aborted", async () => {
  let receivedActor: unknown;
  await assert.rejects(
    () => executeEditProClubWeeklyTrainingExistingDraftCallable(
      {
        auth: { uid: "hc-a" },
        app: { appId: "app-a" },
        data: { planId: "plan-a", expectedPlanUpdatedAt: EXPECTED_UPDATED_AT, draft },
      },
      {
        allowedAppIds: ["app-a"],
        executionEnabled: true,
        service: {
          async editExistingDraft(input) {
            receivedActor = input.actorUid;
            throw new WeeklyTrainingExistingDraftEditError("CONFLICT", "stale");
          },
        },
      },
    ),
    (error: unknown) => Boolean(
      error && typeof error === "object" && "code" in error &&
      String((error as { code?: unknown }).code).includes("aborted"),
    ),
  );
  assert.equal(receivedActor, "hc-a");
});
