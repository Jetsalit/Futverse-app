import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const files = {
  adapter: "src/lib/proClubWeeklyTrainingReviseAsNewDraft.ts",
  composer: "src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx",
  savedDrafts: "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
  capability: "src/config/runtimeCapabilities.ts",
  freshClient: "src/lib/proClubWeeklyTrainingDraftSaveClient.ts",
};

async function source(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

test("revise-as-new reuses the existing Fresh-DRAFT composer and production save path", async () => {
  const composer = await source(files.composer);
  const savedDrafts = await source(files.savedDrafts);
  const freshClient = await source(files.freshClient);

  assert.match(composer, /initialDraft\?: ProClubWeeklyTrainingFreshDraftInput/);
  assert.match(composer, /\(\) => initialDraft \?\? freshDraft\(\)/);
  assert.match(composer, /saveProClubWeeklyTrainingFreshDraftForCurrentRuntime/);

  assert.match(savedDrafts, /Use as new DRAFT/);
  assert.match(savedDrafts, /buildFreshWeeklyTrainingDraftFromSavedDraft\(detail\.draft\)/);
  assert.match(savedDrafts, /<WeeklyTrainingDraftComposer/);
  assert.match(savedDrafts, /initialDraft=/);

  assert.match(freshClient, /saveProClubWeeklyTrainingFreshDraftToProductionFirestore/);
});

test("revise-as-new leaves Existing-DRAFT production mutation capability closed", async () => {
  const savedDrafts = await source(files.savedDrafts);
  const capability = await source(files.capability);

  assert.match(
    capability,
    /PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_WRITER_VERIFIED = false as const/,
  );
  assert.match(savedDrafts, /PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_AVAILABLE/);
  assert.match(savedDrafts, /direct Existing-DRAFT mutation remains separately capability-gated/);
});

test("adapter copies only Fresh-DRAFT content and does not import a persistence writer", async () => {
  const adapter = await source(files.adapter);

  assert.match(adapter, /buildFreshWeeklyTrainingDraftFromSavedDraft/);
  assert.doesNotMatch(adapter, /\bclubId\s*:/);
  assert.doesNotMatch(adapter, /\bauthorUid\s*:/);
  assert.doesNotMatch(adapter, /technicalDirectorNote\s*:/);
  assert.doesNotMatch(adapter, /setDoc|updateDoc|deleteDoc|writeBatch|httpsCallable/);
});
