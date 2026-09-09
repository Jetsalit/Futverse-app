import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProClubWeeklyTrainingDraftSaveClientError,
  saveProClubWeeklyTrainingFreshDraft,
  type ProClubWeeklyTrainingFreshDraftInput,
  type WeeklyTrainingDraftSaveCallableCaller,
} from "../src/lib/proClubWeeklyTrainingDraftSaveClient.ts";
import type {
  ProClubTrainingBlockDraft,
  ProClubTrainingSessionDraft,
  ProClubWeeklyTrainingDraft,
} from "../src/lib/proClubWeeklyTraining.ts";

function block(index = 0): ProClubTrainingBlockDraft {
  return {
    blockType: "TACTICAL",
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
): ProClubWeeklyTrainingFreshDraftInput {
  return {
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Prepare for the next match",
    secondaryObjective: "Improve compactness",
    headCoachNote: "Fresh DRAFT only",
    sessions,
  };
}

function completedResponse(
  submitted: ProClubWeeklyTrainingDraft,
  overrides: Record<string, unknown> = {},
) {
  const count =
    1 +
    submitted.sessions.length +
    submitted.sessions.reduce((sum, current) => sum + current.blocks.length, 0);
  return {
    status: "COMPLETED",
    clubId: submitted.clubId,
    planId: "server-plan-1",
    documentCount: count,
    createdAt: "2026-09-09T16:00:00.000Z",
    ...overrides,
  };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ProClubWeeklyTrainingDraftSaveClientError
    ? error.code
    : undefined;
}

test("binds canonical club and actor identity before callable invocation", async () => {
  let captured: ProClubWeeklyTrainingDraft | null = null;
  const caller: WeeklyTrainingDraftSaveCallableCaller = async (submitted) => {
    captured = submitted;
    return { data: completedResponse(submitted) };
  };

  const result = await saveProClubWeeklyTrainingFreshDraft(
    { clubId: "club-a", actorUid: "coach-1", draft: draft() },
    caller,
  );

  assert.equal(captured?.clubId, "club-a");
  assert.equal(captured?.authorUid, "coach-1");
  assert.equal("technicalDirectorNote" in (captured as object), false);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.clubId, "club-a");
});

test("rejects invalid domain input before transport", async () => {
  let called = false;
  const caller: WeeklyTrainingDraftSaveCallableCaller = async (submitted) => {
    called = true;
    return { data: completedResponse(submitted) };
  };

  await assert.rejects(
    saveProClubWeeklyTrainingFreshDraft(
      {
        clubId: "club-a",
        actorUid: "coach-1",
        draft: { ...draft(), mainObjective: "" },
      },
      caller,
    ),
    (error: unknown) => errorCode(error) === "INVALID_ARGUMENT",
  );
  assert.equal(called, false);
});

test("normalizes callable auth, permission and precondition failures", async () => {
  const cases = [
    ["functions/unauthenticated", "AUTH_REQUIRED"],
    ["functions/permission-denied", "PERMISSION_DENIED"],
    ["functions/failed-precondition", "FAILED_PRECONDITION"],
  ] as const;

  for (const [firebaseCode, expected] of cases) {
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraft(
        { clubId: "club-a", actorUid: "coach-1", draft: draft() },
        async () => {
          throw { code: firebaseCode, message: "backend detail must not become authority" };
        },
      ),
      (error: unknown) => errorCode(error) === expected,
    );
  }
});

test("fails closed on malformed, cross-club or incorrect-count responses", async () => {
  const overrides = [
    { status: "PENDING" },
    { clubId: "club-b" },
    { planId: " padded " },
    { documentCount: 999 },
    { createdAt: "not-a-timestamp" },
  ];

  for (const override of overrides) {
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraft(
        { clubId: "club-a", actorUid: "coach-1", draft: draft() },
        async (submitted) => ({ data: completedResponse(submitted, override) }),
      ),
      (error: unknown) => errorCode(error) === "INVALID_RESPONSE",
    );
  }
});

test("accepts the full 14-session x 12-block client envelope without a smaller cap", async () => {
  const sessions: ProClubTrainingSessionDraft[] = [];
  for (let index = 0; index < 14; index += 1) {
    const dayOffset = index % 7;
    const date = `2026-09-${String(7 + dayOffset).padStart(2, "0")}`;
    const startTime = index < 7 ? "09:00" : "15:00";
    sessions.push(session(date, startTime, Array.from({ length: 12 }, (_, blockIndex) => block(blockIndex))));
  }

  let capturedCount = 0;
  const result = await saveProClubWeeklyTrainingFreshDraft(
    { clubId: "club-a", actorUid: "coach-1", draft: draft(sessions) },
    async (submitted) => {
      capturedCount =
        1 +
        submitted.sessions.length +
        submitted.sessions.reduce((sum, current) => sum + current.blocks.length, 0);
      return { data: completedResponse(submitted) };
    },
  );

  assert.equal(capturedCount, 183);
  assert.equal(result.documentCount, 183);
});
