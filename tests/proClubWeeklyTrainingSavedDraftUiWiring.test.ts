import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const files = {
  adapter: "src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter.ts",
  model: "src/lib/proClubWeeklyTrainingSavedDraftReadModel.ts",
  component: "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
  workspace: "src/components/pro-club/operations/ProClubRoleWorkspace.tsx",
  rules: "firestore.rules",
};

async function source(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

test("saved-DRAFT adapter is read-only, tenant/author constrained, and read-bounded", async () => {
  const adapter = await source(files.adapter);
  assert.match(adapter, /getDocFromServer/);
  assert.match(adapter, /getDocsFromServer/);
  assert.match(adapter, /authorUid/);
  assert.match(adapter, /status/);
  assert.match(adapter, /DRAFT/);
  assert.match(adapter, /\["proClubs",\s*clubId,\s*"weeklyTrainingPlans"\]/);
  assert.match(adapter, /planSummary\.value\.sessionCount \+ 1/);
  assert.match(adapter, /expectedBlockCount \+ 1/);
  assert.match(adapter, /sessionDocuments\.length !== planSummary\.value\.sessionCount/);
  for (const forbidden of [/\bsetDoc\b/, /\baddDoc\b/, /\bupdateDoc\b/, /\bdeleteDoc\b/, /\bwriteBatch\b/, /httpsCallable/]) {
    assert.doesNotMatch(adapter, forbidden);
  }
});

test("read model reconstructs through the canonical parser and enforces trusted hierarchy cardinality", async () => {
  const model = await source(files.model);
  assert.match(model, /parseProClubWeeklyTrainingDraft/);
  assert.match(model, /input\.sessions\.length !== summaryResult\.value\.sessionCount/);
  assert.match(model, /entry\.blocks\.length !== session\.blockCount/);
  assert.match(model, /block-\$\{String/);
  assert.match(model, /replace\(":", ""\)/);
  assert.match(model, /compareTimestampOrder\(updatedAt\.order, createdAt\.order\) < 0/);
  assert.match(model, /compareTimestampOrder\(b\.updatedAtOrder, a\.updatedAtOrder\)/);
});

test("Head Coach workspace exposes read-only saved drafts without opening Technical Director workflow", async () => {
  const component = await source(files.component);
  const workspace = await source(files.workspace);
  assert.match(component, /authority\.staffRole === "HEAD_COACH"/);
  assert.match(component, /authority\.organizationId/);
  assert.match(component, /authority\.userId/);
  assert.match(component, /Read-only detail/);
  assert.match(component, /Refresh saved drafts/);
  assert.doesNotMatch(component, /\bEdit\b/);
  assert.doesNotMatch(component, /\bSave\b/);
  assert.match(workspace, /WeeklyTrainingSavedDrafts authority=\{authority\}/);
  assert.match(workspace, /authority\.staffRole === "TECHNICAL_DIRECTOR"/);
});

test("authority changes cancel stale reads and reset loading state", async () => {
  const component = await source(files.component);
  assert.match(component, /requestGeneration\.current \+= 1;/);
  assert.match(component, /setLoadingList\(false\);/);
  assert.match(component, /setLoadingDetail\(false\);/);
  assert.match(component, /\[allowed, authority\.organizationId, authority\.userId, loadList\]/);
});

test("existing root Rules retain the Weekly Training active-member read boundary", async () => {
  const rules = await source(files.rules);
  assert.match(rules, /match \/proClubs\/\{clubId\}\/weeklyTrainingPlans\/\{planId\}/);
  assert.match(rules, /allow get, list: if currentUserIsActive\(\)/);
  assert.match(rules, /proClubWeeklyTrainingActiveMemberV1\(clubId, request\.auth\.uid\)/);
});
