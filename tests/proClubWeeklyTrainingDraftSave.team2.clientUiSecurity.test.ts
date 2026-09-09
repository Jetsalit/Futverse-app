import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  ProClubWeeklyTrainingDraftSaveClientError,
  saveProClubWeeklyTrainingFreshDraft,
  type ProClubWeeklyTrainingFreshDraftInput,
} from "../src/lib/proClubWeeklyTrainingDraftSaveClient.ts";
import {
  isFunctionBackedProClubWebAvailable,
} from "../src/config/runtimeCapabilities.ts";
import type { ProClubWeeklyTrainingDraft } from "../src/lib/proClubWeeklyTraining.ts";

function baseDraft(): ProClubWeeklyTrainingFreshDraftInput {
  return {
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Defensive organization",
    sessions: [
      {
        sessionDate: "2026-09-07",
        startTime: "10:00",
        location: "Training Ground",
        objective: "Compactness",
        phaseOfPlay: "OUT_OF_POSSESSION",
        plannedLoad: "MODERATE",
        durationMinutes: 90,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Compact block",
            durationMinutes: 30,
            coachingPoints: ["Distances between lines"],
          },
        ],
      },
    ],
  };
}

function clientCode(error: unknown): string | undefined {
  return error instanceof ProClubWeeklyTrainingDraftSaveClientError
    ? error.code
    : undefined;
}

test("runtime spoof fields cannot replace the bound club or actor", async () => {
  const hostileDraft = {
    ...baseDraft(),
    clubId: "attacker-club",
    authorUid: "attacker-user",
  } as ProClubWeeklyTrainingFreshDraftInput;
  let captured: ProClubWeeklyTrainingDraft | null = null;

  await saveProClubWeeklyTrainingFreshDraft(
    { clubId: "club-a", actorUid: "coach-1", draft: hostileDraft },
    async (submitted) => {
      captured = submitted;
      return {
        data: {
          status: "COMPLETED",
          clubId: "club-a",
          planId: "server-plan",
          documentCount: 3,
          createdAt: "2026-09-09T16:00:00.000Z",
        },
      };
    },
  );

  assert.equal(captured?.clubId, "club-a");
  assert.equal(captured?.authorUid, "coach-1");
});

test("runtime attempt to smuggle a Technical Director note fails before transport", async () => {
  const hostileDraft = {
    ...baseDraft(),
    technicalDirectorNote: "smuggled client authority field",
  } as ProClubWeeklyTrainingFreshDraftInput;
  let called = false;

  await assert.rejects(
    saveProClubWeeklyTrainingFreshDraft(
      { clubId: "club-a", actorUid: "coach-1", draft: hostileDraft },
      async () => {
        called = true;
        return { data: null };
      },
    ),
    (error: unknown) => clientCode(error) === "INVALID_ARGUMENT",
  );
  assert.equal(called, false);
});

test("COMPLETED label alone cannot forge client success", async () => {
  const forgedResponses = [
    { status: "COMPLETED", clubId: "club-b", planId: "server-plan", documentCount: 3, createdAt: "2026-09-09T16:00:00.000Z" },
    { status: "COMPLETED", clubId: "club-a", planId: "server-plan", documentCount: 2, createdAt: "2026-09-09T16:00:00.000Z" },
    { status: "COMPLETED", clubId: "club-a", planId: "server/plan", documentCount: 3, createdAt: "2026-09-09T16:00:00.000Z" },
    { status: "COMPLETED", clubId: "club-a", planId: "server-plan", documentCount: 3, createdAt: "2026-09-09T16:00:00Z" },
  ];

  for (const data of forgedResponses) {
    await assert.rejects(
      saveProClubWeeklyTrainingFreshDraft(
        { clubId: "club-a", actorUid: "coach-1", draft: baseDraft() },
        async () => ({ data }),
      ),
      (error: unknown) => clientCode(error) === "INVALID_RESPONSE",
    );
  }
});

test("production function-backed runtime remains fail closed while DEV remains testable", () => {
  assert.equal(isFunctionBackedProClubWebAvailable({ dev: false }), false);
  assert.equal(isFunctionBackedProClubWebAvailable({}), false);
  assert.equal(isFunctionBackedProClubWebAvailable({ dev: true }), true);
});

test("client and composer contain no browser Firestore Weekly Training write fallback", async () => {
  const sources = await Promise.all([
    readFile("src/lib/proClubWeeklyTrainingDraftSaveClient.ts", "utf8"),
    readFile("src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx", "utf8"),
  ]);
  const combined = sources.join("\n");
  for (const forbidden of [
    /firebase\/firestore/,
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
  ]) {
    assert.doesNotMatch(combined, forbidden);
  }
  assert.match(combined, /saveProClubWeeklyTrainingDraftV1/);
  assert.match(combined, /FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/);
});

test("UI wiring keeps Technical Director out of the fresh-save composer", async () => {
  const workspace = await readFile(
    "src/components/pro-club/operations/ProClubRoleWorkspace.tsx",
    "utf8",
  );
  const headCoachPosition = workspace.indexOf('authority.staffRole === "HEAD_COACH"');
  const composerPosition = workspace.indexOf("<WeeklyTrainingDraftComposer authority={authority} />");
  const tdPosition = workspace.indexOf('authority.staffRole === "TECHNICAL_DIRECTOR"');
  assert.ok(headCoachPosition >= 0);
  assert.ok(composerPosition > headCoachPosition);
  assert.ok(tdPosition > composerPosition);
  assert.equal(workspace.slice(tdPosition).includes("<WeeklyTrainingDraftComposer"), false);
});
