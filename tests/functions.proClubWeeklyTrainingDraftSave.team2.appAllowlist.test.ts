import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { executeSaveProClubWeeklyTrainingDraftCallable } from "../functions/src/proClubWeeklyTrainingDraftSave/callableHandler.ts";

const PRODUCTION_APP_ID = "1:504089427500:web:3cc2c8b1283316bdee9b89";

function completedResult() {
  return {
    status: "COMPLETED" as const,
    clubId: "club-a",
    planId: "plan-a",
    documentCount: 183,
    createdAt: "2026-09-09T00:00:00.000Z",
  };
}

function codeOf(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

test("Team2: authorized production app reaches service with authenticated UID only", async () => {
  let received: unknown;
  const result = await executeSaveProClubWeeklyTrainingDraftCallable(
    {
      auth: { uid: "canonical-head-coach" },
      app: { appId: PRODUCTION_APP_ID },
      data: { actorUid: "attacker", authorUid: "attacker" },
    },
    {
      allowedAppIds: [PRODUCTION_APP_ID],
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
    draft: { actorUid: "attacker", authorUid: "attacker" },
  });
  assert.deepEqual(result, completedResult());
});

test("Team2: sibling Firebase app is rejected before Admin-backed service", async () => {
  let called = false;
  await assert.rejects(
    executeSaveProClubWeeklyTrainingDraftCallable(
      {
        auth: { uid: "canonical-head-coach" },
        app: { appId: "1:504089427500:web:staging-or-debug" },
        data: {},
      },
      {
        allowedAppIds: [PRODUCTION_APP_ID],
        service: {
          async saveFreshDraft() {
            called = true;
            return completedResult();
          },
        },
      },
    ),
    (error: unknown) => codeOf(error) === "failed-precondition",
  );
  assert.equal(called, false);
});

test("Team2: empty or noncanonical allowlist fails closed before service", async () => {
  for (const allowedAppIds of [[], ["   "], [` ${PRODUCTION_APP_ID}`]]) {
    let called = false;
    await assert.rejects(
      executeSaveProClubWeeklyTrainingDraftCallable(
        {
          auth: { uid: "canonical-head-coach" },
          app: { appId: PRODUCTION_APP_ID },
          data: {},
        },
        {
          allowedAppIds,
          service: {
            async saveFreshDraft() {
              called = true;
              return completedResult();
            },
          },
        },
      ),
      (error: unknown) => codeOf(error) === "internal",
    );
    assert.equal(called, false);
  }
});

test("Team2: production entrypoint binds callable to canonical production app constant", async () => {
  const source = await readFile("functions/src/index.ts", "utf8");
  assert.match(source, /const FUTVERSE_PRODUCTION_WEB_APP_ID = "1:504089427500:web:3cc2c8b1283316bdee9b89";/);
  assert.match(source, /export const saveProClubWeeklyTrainingDraftV1 = onCall\(/);
  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /allowedAppIds:\s*\[FUTVERSE_PRODUCTION_WEB_APP_ID\]/);
});
