import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ProClubWeeklyTrainingDraftSaveClientError,
  saveProClubWeeklyTrainingFreshDraft,
  type ProClubWeeklyTrainingDraftSaveRequest,
  type ProClubWeeklyTrainingFreshDraftInput,
  type WeeklyTrainingDraftSaveCallableCaller,
} from "../src/lib/proClubWeeklyTrainingDraftSaveClient.ts";
import type {
  ProClubTrainingBlockDraft,
  ProClubTrainingSessionDraft,
} from "../src/lib/proClubWeeklyTraining.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function block(index = 0): ProClubTrainingBlockDraft {
  return { blockType: "TACTICAL", title: `Block ${index + 1}`, durationMinutes: 5, coachingPoints: ["Keep the team compact"] };
}
function session(sessionDate = "2026-09-07", startTime = "10:00", blocks: readonly ProClubTrainingBlockDraft[] = [block()]): ProClubTrainingSessionDraft {
  return { sessionDate, startTime, location: "Training Ground", objective: "Prepare the team structure", phaseOfPlay: "GENERAL", plannedLoad: "MODERATE", durationMinutes: 90, blocks };
}
function draft(sessions: readonly ProClubTrainingSessionDraft[] = [session()]): ProClubWeeklyTrainingFreshDraftInput {
  return { weekStartDate: "2026-09-07", squadLabel: "First Team", mainObjective: "Prepare for the next match", secondaryObjective: "Improve compactness", headCoachNote: "Fresh DRAFT only", sessions };
}
function completedResponse(submitted: ProClubWeeklyTrainingDraftSaveRequest, overrides: Record<string, unknown> = {}) {
  const count = 1 + submitted.draft.sessions.length + submitted.draft.sessions.reduce((sum, current) => sum + current.blocks.length, 0);
  return { status: "COMPLETED", requestId: submitted.requestId, clubId: submitted.draft.clubId, planId: "server-plan-1", documentCount: count, createdAt: "2026-09-09T16:00:00.000Z", ...overrides };
}
function errorCode(error: unknown): string | undefined {
  return error instanceof ProClubWeeklyTrainingDraftSaveClientError ? error.code : undefined;
}

test("binds canonical club, actor and stable request identity before callable invocation", async () => {
  let captured: ProClubWeeklyTrainingDraftSaveRequest | null = null;
  const caller: WeeklyTrainingDraftSaveCallableCaller = async (submitted) => { captured = submitted; return { data: completedResponse(submitted) }; };
  const result = await saveProClubWeeklyTrainingFreshDraft({ requestId: REQUEST_ID, clubId: "club-a", actorUid: "coach-1", draft: draft() }, caller);
  assert.equal(captured?.requestId, REQUEST_ID);
  assert.equal(captured?.draft.clubId, "club-a");
  assert.equal(captured?.draft.authorUid, "coach-1");
  assert.equal("technicalDirectorNote" in (captured?.draft as object), false);
  assert.equal(result.requestId, REQUEST_ID);
  assert.equal(result.status, "COMPLETED");
});

test("rejects malformed request identity and invalid domain input before transport", async () => {
  let called = false;
  const caller: WeeklyTrainingDraftSaveCallableCaller = async (submitted) => { called = true; return { data: completedResponse(submitted) }; };
  await assert.rejects(saveProClubWeeklyTrainingFreshDraft({ requestId: "bad-id", clubId: "club-a", actorUid: "coach-1", draft: draft() }, caller), (e: unknown) => errorCode(e) === "INVALID_ARGUMENT");
  await assert.rejects(saveProClubWeeklyTrainingFreshDraft({ requestId: REQUEST_ID, clubId: "club-a", actorUid: "coach-1", draft: { ...draft(), mainObjective: "" } }, caller), (e: unknown) => errorCode(e) === "INVALID_ARGUMENT");
  assert.equal(called, false);
});

test("rejects oversized or ill-formed Unicode drill references before transport", async () => {
  let called = false;
  const caller: WeeklyTrainingDraftSaveCallableCaller = async (submitted) => { called = true; return { data: completedResponse(submitted) }; };
  for (const drillReference of ["a".repeat(1_501), "ก".repeat(501), "😀".repeat(376), "\ud800", "\udc00", "\ud800x", "x\udc00"]) {
    const hostileBlock: ProClubTrainingBlockDraft = { ...block(), drillReference };
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraft({
        requestId: REQUEST_ID,
        clubId: "club-a",
        actorUid: "coach-1",
        draft: draft([session("2026-09-07", "10:00", [hostileBlock])]),
      }, caller),
      (e: unknown) => errorCode(e) === "INVALID_ARGUMENT",
    );
  }
  assert.equal(called, false);
});

test("accepts a well-formed surrogate pair drill reference", async () => {
  let called = false;
  const caller: WeeklyTrainingDraftSaveCallableCaller = async (submitted) => {
    called = true;
    return { data: completedResponse(submitted) };
  };
  const emojiBlock: ProClubTrainingBlockDraft = { ...block(), drillReference: "😀" };
  await saveProClubWeeklyTrainingFreshDraft({
    requestId: REQUEST_ID,
    clubId: "club-a",
    actorUid: "coach-1",
    draft: draft([session("2026-09-07", "10:00", [emojiBlock])]),
  }, caller);
  assert.equal(called, true);
});

test("rejects runtime Technical Director note smuggling before transport", async () => {
  let called = false;
  const hostileDraft = { ...draft(), technicalDirectorNote: "client must not persist this field" } as ProClubWeeklyTrainingFreshDraftInput;
  await assert.rejects(saveProClubWeeklyTrainingFreshDraft({ requestId: REQUEST_ID, clubId: "club-a", actorUid: "coach-1", draft: hostileDraft }, async () => { called = true; return { data: null }; }), (e: unknown) => errorCode(e) === "INVALID_ARGUMENT");
  assert.equal(called, false);
});

test("fails closed if COMPLETED response does not echo the same request identity", async () => {
  await assert.rejects(saveProClubWeeklyTrainingFreshDraft({ requestId: REQUEST_ID, clubId: "club-a", actorUid: "coach-1", draft: draft() }, async (submitted) => ({ data: completedResponse(submitted, { requestId: "22222222-2222-4222-8222-222222222222" }) })), (e: unknown) => errorCode(e) === "INVALID_RESPONSE");
});

test("normalizes callable auth, permission and precondition failures", async () => {
  const cases = [["functions/unauthenticated", "AUTH_REQUIRED"], ["functions/permission-denied", "PERMISSION_DENIED"], ["functions/failed-precondition", "FAILED_PRECONDITION"]] as const;
  for (const [firebaseCode, expected] of cases) {
    await assert.rejects(saveProClubWeeklyTrainingFreshDraft({ requestId: REQUEST_ID, clubId: "club-a", actorUid: "coach-1", draft: draft() }, async () => { throw { code: firebaseCode }; }), (e: unknown) => errorCode(e) === expected);
  }
});

test("fails closed on malformed, cross-club or incorrect-count responses", async () => {
  for (const override of [{ status: "PENDING" }, { clubId: "club-b" }, { planId: " padded " }, { documentCount: 999 }, { createdAt: "not-a-timestamp" }]) {
    await assert.rejects(saveProClubWeeklyTrainingFreshDraft({ requestId: REQUEST_ID, clubId: "club-a", actorUid: "coach-1", draft: draft() }, async (submitted) => ({ data: completedResponse(submitted, override) })), (e: unknown) => errorCode(e) === "INVALID_RESPONSE");
  }
});

test("accepts full 14-session x 12-block client envelope without a smaller cap", async () => {
  const sessions: ProClubTrainingSessionDraft[] = [];
  for (let index = 0; index < 14; index += 1) {
    const dayOffset = index % 7;
    const date = `2026-09-${String(7 + dayOffset).padStart(2, "0")}`;
    const startTime = index < 7 ? "09:00" : "15:00";
    sessions.push(session(date, startTime, Array.from({ length: 12 }, (_, blockIndex) => block(blockIndex))));
  }
  let capturedCount = 0;
  const result = await saveProClubWeeklyTrainingFreshDraft({ requestId: REQUEST_ID, clubId: "club-a", actorUid: "coach-1", draft: draft(sessions) }, async (submitted) => {
    capturedCount = 1 + submitted.draft.sessions.length + submitted.draft.sessions.reduce((sum, current) => sum + current.blocks.length, 0);
    return { data: completedResponse(submitted) };
  });
  assert.equal(capturedCount, 183);
  assert.equal(result.documentCount, 183);
});
