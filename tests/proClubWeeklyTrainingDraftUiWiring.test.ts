import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const files = {
  client: "src/lib/proClubWeeklyTrainingDraftSaveClient.ts",
  composer: "src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx",
  workspace: "src/components/pro-club/operations/ProClubRoleWorkspace.tsx",
  dashboard: "src/components/pro-club/operations/ProClubOperationsDashboard.tsx",
  storageBounds: "src/lib/proClubWeeklyTrainingStorageBounds.ts",
};

async function source(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

test("client uses only the reviewed callable transport and preserves the production runtime gate", async () => {
  const client = await source(files.client);
  assert.match(client, /saveProClubWeeklyTrainingDraftV1/);
  assert.match(client, /httpsCallable/);
  assert.match(client, /FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/);

  for (const forbidden of [
    /firebase\/firestore/,
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
  ]) {
    assert.doesNotMatch(client, forbidden);
  }
});

test("Head Coach composer binds authority and does not expose Technical Director fresh-save wiring", async () => {
  const composer = await source(files.composer);
  assert.match(composer, /authority\.organizationId/);
  assert.match(composer, /authority\.userId/);
  assert.match(composer, /authority\.staffRole === "HEAD_COACH"/);
  assert.match(composer, /saveProClubWeeklyTrainingFreshDraft/);
  assert.match(composer, /FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/);
  assert.doesNotMatch(composer, /technicalDirectorNote\s*:/);

  for (const forbidden of [
    /firebase\/firestore/,
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
  ]) {
    assert.doesNotMatch(composer, forbidden);
  }
});

test("drill reference UI enforces the shared UTF-8 byte budget instead of character-only validation", async () => {
  const composer = await source(files.composer);
  const bounds = await source(files.storageBounds);
  assert.match(bounds, /PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES = 1_500/);
  assert.match(bounds, /TextEncoder/);
  assert.match(composer, /PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES/);
  assert.match(composer, /proClubTrainingUtf8ByteLength\(value\)/);
  assert.match(composer, /maxLength=\{PRO_CLUB_TRAINING_DRILL_REFERENCE_MAX_UTF8_BYTES\}/);
  assert.match(composer, /UTF-8 bytes/);
});

test("role workspace passes the canonical authority object to the composer", async () => {
  const workspace = await source(files.workspace);
  const dashboard = await source(files.dashboard);
  assert.match(workspace, /WeeklyTrainingDraftComposer authority=\{authority\}/);
  assert.match(workspace, /authority\.staffRole === "HEAD_COACH"/);
  assert.match(workspace, /authority\.staffRole === "TECHNICAL_DIRECTOR"/);
  assert.match(workspace, /Technical Director co-author persistence remains deliberately deferred/);
  assert.match(dashboard, /ProClubRoleWorkspace authority=\{authority\}/);
});
