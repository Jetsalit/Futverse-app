import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  executeSaveProClubWeeklyTrainingDraftCallable,
} from "../functions/src/proClubWeeklyTrainingDraftSave/callableHandler.ts";
import {
  WeeklyTrainingDraftSaveError,
} from "../functions/src/proClubWeeklyTrainingDraftSave/core.ts";

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function errorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return "message" in error && typeof error.message === "string" ? error.message : undefined;
}

function completedResult() {
  return {
    status: "COMPLETED" as const,
    clubId: "club-a",
    planId: "plan-a",
    documentCount: 183,
    createdAt: "2026-09-09T00:00:00.000Z",
  };
}

test("fails closed on whitespace-only App Check appId before service", async () => {
  let serviceCalled = false;
  await assert.rejects(
    executeSaveProClubWeeklyTrainingDraftCallable(
      {
        auth: { uid: "coach-1" },
        app: { appId: "   " },
        data: {},
      },
      {
        service: {
          async saveFreshDraft() {
            serviceCalled = true;
            return completedResult();
          },
        },
      },
    ),
    (error: unknown) => errorCode(error) === "failed-precondition",
  );
  assert.equal(serviceCalled, false);
});

test("fails closed on whitespace-only auth uid before service", async () => {
  let serviceCalled = false;
  await assert.rejects(
    executeSaveProClubWeeklyTrainingDraftCallable(
      {
        auth: { uid: "   " },
        app: { appId: "1:test:web:app" },
        data: {},
      },
      {
        service: {
          async saveFreshDraft() {
            serviceCalled = true;
            return completedResult();
          },
        },
      },
    ),
    (error: unknown) => errorCode(error) === "unauthenticated",
  );
  assert.equal(serviceCalled, false);
});

test("payload actor fields cannot override trusted request auth uid", async () => {
  let received: unknown;
  await executeSaveProClubWeeklyTrainingDraftCallable(
    {
      auth: { uid: "canonical-head-coach" },
      app: { appId: "1:test:web:app" },
      data: {
        actorUid: "attacker",
        authorUid: "attacker",
        createdBy: "attacker",
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
    actorUid: "canonical-head-coach",
    draft: {
      actorUid: "attacker",
      authorUid: "attacker",
      createdBy: "attacker",
    },
  });
});

test("permission errors do not bypass callable mapping", async () => {
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
            throw new WeeklyTrainingDraftSaveError(
              "PERMISSION_DENIED",
              "Active Head Coach assignment required.",
            );
          },
        },
      },
    ),
    (error: unknown) =>
      errorCode(error) === "permission-denied" &&
      errorMessage(error) === "Active Head Coach assignment required.",
  );
});

test("unexpected backend errors are sanitized", async () => {
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
            throw new Error("secret-token-and-backend-path");
          },
        },
      },
    ),
    (error: unknown) =>
      errorCode(error) === "internal" &&
      errorMessage(error) === "An internal error occurred.",
  );
});

test("production entrypoint statically enforces App Check and trusted auth forwarding", async () => {
  const source = await readFile("functions/src/index.ts", "utf8");
  assert.match(source, /export const saveProClubWeeklyTrainingDraftV1 = onCall\(/);
  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /auth:\s*request\.auth \? \{ uid: request\.auth\.uid \} : undefined/);
  assert.match(source, /service:\s*getWeeklyTrainingDraftSaveService\(\)/);
});
