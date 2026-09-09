import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpsError } from "firebase-functions/v2/https";

import {
  executeSaveProClubWeeklyTrainingDraftCallable,
} from "../functions/src/proClubWeeklyTrainingDraftSave/callableHandler.ts";
import {
  WeeklyTrainingDraftSaveError,
} from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

function completedResult() {
  return {
    status: "COMPLETED" as const,
    clubId: "club-a",
    planId: "plan-1",
    documentCount: 3,
    createdAt: "2026-09-09T00:00:00.000Z",
  };
}

test("rejects missing App Check before service execution", async () => {
  let called = false;
  await assert.rejects(
    executeSaveProClubWeeklyTrainingDraftCallable(
      {
        auth: { uid: "coach-1" },
        data: { clubId: "club-a" },
      },
      {
        service: {
          async saveFreshDraft() {
            called = true;
            return completedResult();
          },
        },
      },
    ),
    (error: unknown) => error instanceof HttpsError && error.code === "failed-precondition",
  );
  assert.equal(called, false);
});

test("rejects unauthenticated caller before service execution", async () => {
  let called = false;
  await assert.rejects(
    executeSaveProClubWeeklyTrainingDraftCallable(
      {
        app: { appId: "1:test:web:app" },
        data: { clubId: "club-a" },
      },
      {
        service: {
          async saveFreshDraft() {
            called = true;
            return completedResult();
          },
        },
      },
    ),
    (error: unknown) => error instanceof HttpsError && error.code === "unauthenticated",
  );
  assert.equal(called, false);
});

test("uses authenticated uid as authoritative actor and returns service result unchanged", async () => {
  let received: unknown;
  const result = await executeSaveProClubWeeklyTrainingDraftCallable(
    {
      auth: { uid: "coach-authenticated" },
      app: { appId: "1:test:web:app" },
      data: {
        clubId: "club-a",
        authorUid: "spoofed-author",
      },
    },
    {
      service: {
        async saveFreshDraft(input) {
          received = input;
          return completedResult();
        },
      },
    },
  );

  assert.deepEqual(received, {
    actorUid: "coach-authenticated",
    draft: {
      clubId: "club-a",
      authorUid: "spoofed-author",
    },
  });
  assert.deepEqual(result, completedResult());
});

for (const [domainCode, callableCode] of [
  ["INVALID_ARGUMENT", "invalid-argument"],
  ["PERMISSION_DENIED", "permission-denied"],
  ["FAILED_PRECONDITION", "failed-precondition"],
] as const) {
  test(`maps ${domainCode} to ${callableCode}`, async () => {
    await assert.rejects(
      executeSaveProClubWeeklyTrainingDraftCallable(
        {
          auth: { uid: "coach-1" },
          app: { appId: "1:test:web:app" },
          data: {},
        },
        {
          service: {
            async saveFreshDraft() {
              throw new WeeklyTrainingDraftSaveError(domainCode, "domain failure");
            },
          },
        },
      ),
      (error: unknown) => error instanceof HttpsError && error.code === callableCode,
    );
  });
}

test("maps unexpected failures to internal without leaking original message", async () => {
  await assert.rejects(
    executeSaveProClubWeeklyTrainingDraftCallable(
      {
        auth: { uid: "coach-1" },
        app: { appId: "1:test:web:app" },
        data: {},
      },
      {
        service: {
          async saveFreshDraft() {
            throw new Error("sensitive backend details");
          },
        },
      },
    ),
    (error: unknown) =>
      error instanceof HttpsError &&
      error.code === "internal" &&
      error.message === "An internal error occurred.",
  );
});
