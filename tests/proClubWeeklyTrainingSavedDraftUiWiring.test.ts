import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  isWeeklyTrainingSavedDraftReadAvailable,
  PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED,
} from "../src/config/runtimeCapabilities";

const files = {
  adapter: "src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter.ts",
  model: "src/lib/proClubWeeklyTrainingSavedDraftReadModel.ts",
  component: "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
  editor: "src/components/pro-club/operations/WeeklyTrainingExistingDraftEditor.tsx",
  workspace: "src/components/pro-club/operations/ProClubRoleWorkspace.tsx",
  capability: "src/config/runtimeCapabilities.ts",
  rules: "firestore.rules",
  firebase: "firebase.json",
  spark: "firebase.spark.json",
  indexes: "firestore.indexes.json",
};

async function source(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

test("saved-DRAFT production capability activates only from reviewed index evidence", () => {
  assert.equal(PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED, true);
  assert.equal(isWeeklyTrainingSavedDraftReadAvailable({ dev: false, productionIndexVerified: false }), false);
  assert.equal(isWeeklyTrainingSavedDraftReadAvailable({ dev: true, productionIndexVerified: false }), true);
  assert.equal(isWeeklyTrainingSavedDraftReadAvailable({ dev: false, productionIndexVerified: true }), true);
});

test("saved-DRAFT dev exception remains serve-only and production activation has no environment escape hatch", async () => {
  const capability = await source(files.capability);
  assert.match(capability, /PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = true as const/);
  assert.match(capability, /index `CICAgOjXh4EK` verified READY/);
  assert.match(capability, /productionIndexVerified:\s*PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED/);
  assert.match(capability, /import\.meta as ImportMeta[^]*readonly hot\?: unknown/);
  assert.match(capability, /\.hot !== undefined/);
  assert.doesNotMatch(capability, /import\.meta[^;]*\.env[^;]*DEV/);
  assert.doesNotMatch(capability, /import\.meta[^;]*\.env[^;]*MODE/);
  assert.doesNotMatch(capability, /process\.env/);
  assert.doesNotMatch(capability, /VITE_.*SAVED.*DRAFT/i);
});

test("saved-DRAFT adapter is read-only, tenant-bound, page-bounded and preserves Firestore query order", async () => {
  const adapter = await source(files.adapter);
  assert.match(adapter, /WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE = 20/);
  assert.match(adapter, /where\("authorUid", "==", actorUid\)/);
  assert.match(adapter, /where\("status", "==", "DRAFT"\)/);
  assert.match(adapter, /orderBy\("updatedAt", "desc"\)/);
  assert.match(adapter, /orderBy\(documentId\(\), "desc"\)/);
  assert.match(adapter, /startAfter\(/);
  assert.match(adapter, /WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE \+ 1/);
  assert.match(adapter, /const last = summaries\.at\(-1\)/);
  assert.doesNotMatch(adapter, /localeCompare/);
  assert.doesNotMatch(adapter, /sortWeeklyTrainingSavedDraftSummaries/);
  assert.match(adapter, /planSummary\.value\.sessionCount \+ 1/);
  assert.match(adapter, /expectedBlockCount \+ 1/);
  for (const forbidden of [/\bsetDoc\b/, /\baddDoc\b/, /\bupdateDoc\b/, /\bdeleteDoc\b/, /\bwriteBatch\b/, /httpsCallable/]) {
    assert.doesNotMatch(adapter, forbidden);
  }
});

test("read model enforces creation/update audit-pair coherence and exact persisted payload parity", async () => {
  const model = await source(files.model);
  assert.doesNotMatch(model, /value\.createdBy !== value\.updatedBy/);
  assert.doesNotMatch(model, /sameTimestampOrder\(createdAt\.order, updatedAt\.order\)/);
  assert.match(model, /interface WeeklyTrainingSavedDraftAuditPair/);
  assert.match(model, /readonly creation: WeeklyTrainingSavedDraftAuditBinding/);
  assert.match(model, /readonly update: WeeklyTrainingSavedDraftAuditBinding/);
  assert.match(model, /compareWeeklyTrainingSavedDraftTimestampOrder\(updatedAt\.order, createdAt\.order\) < 0/);
  assert.match(model, /creation:[\s\S]*timestamp: summaryResult\.value\.createdAtOrder/);
  assert.match(model, /update:[\s\S]*timestamp: summaryResult\.value\.updatedAtOrder/);
  assert.match(model, /sessionPayloadMatchesPersisted/);
  assert.match(model, /blockPayloadMatchesPersisted/);
  assert.match(model, /sameStringArray/);
  assert.match(model, /parseSession\(entry\.document, expectedAudit\)/);
  assert.match(model, /parseBlock\(document, expectedAudit\)/);
  assert.match(model, /parseProClubWeeklyTrainingDraft/);
});

test("Head Coach UI keeps Existing-DRAFT edit behind its dedicated capability and fixed-shape editor", async () => {
  const component = await source(files.component);
  const editor = await source(files.editor);
  const workspace = await source(files.workspace);

  assert.match(component, /authority\.staffRole === "HEAD_COACH"/);
  assert.match(component, /PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_AVAILABLE/);
  assert.match(component, /Edit DRAFT/);
  assert.match(component, /<WeeklyTrainingExistingDraftEditor/);
  assert.match(component, /setNextCursor\(result\.value\.nextCursor\)/);
  assert.match(component, /Load more saved drafts/);
  assert.match(component, /loadPage\(nextCursor, true\)/);
  assert.match(component, /new Map\(current\.map/);
  assert.match(component, /Refresh saved drafts/);

  assert.match(editor, /Fixed-shape Weekly Training edit/);
  assert.match(editor, /editProClubWeeklyTrainingExistingDraft/);
  assert.match(editor, /getHeadCoachWeeklyTrainingSavedDraftDetail/);
  assert.match(editor, /exactIntendedDraft/);
  assert.match(editor, /complete read-back/i);
  assert.match(editor, /Save DRAFT edit/);
  assert.doesNotMatch(editor, /Add session/);
  assert.doesNotMatch(editor, /Remove session/);
  assert.doesNotMatch(editor, /Add block/);
  assert.doesNotMatch(editor, /Remove block/);

  assert.match(workspace, /WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE \? \(/);
  assert.match(workspace, /<WeeklyTrainingSavedDrafts authority=\{authority\} \/>/);
  assert.match(workspace, /<SavedDraftReadPending \/>/);
  assert.match(workspace, /Saved DRAFT history pending production index verification/);
});

test("Spark hosting-only release cannot deploy the index and relies only on reviewed source-controlled activation", async () => {
  const spark = JSON.parse(await source(files.spark));
  assert.deepEqual(Object.keys(spark).sort(), ["hosting"]);
  assert.equal(PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED, true);
});

test("authority changes cancel stale reads and reset all list/detail loading state", async () => {
  const component = await source(files.component);
  assert.match(component, /requestGeneration\.current \+= 1;/);
  assert.match(component, /setNextCursor\(null\);/);
  assert.match(component, /setLoadingList\(false\);/);
  assert.match(component, /setLoadingMore\(false\);/);
  assert.match(component, /setLoadingDetail\(false\);/);
});

test("Firebase config declares the deterministic saved-DRAFT history composite index", async () => {
  const firebase = JSON.parse(await source(files.firebase));
  const indexes = JSON.parse(await source(files.indexes));
  assert.equal(firebase.firestore.rules, "firestore.rules");
  assert.equal(firebase.firestore.indexes, "firestore.indexes.json");
  assert.ok(indexes.indexes.some((index: any) =>
    index.collectionGroup === "weeklyTrainingPlans" &&
    index.queryScope === "COLLECTION" &&
    JSON.stringify(index.fields) === JSON.stringify([
      { fieldPath: "authorUid", order: "ASCENDING" },
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "updatedAt", order: "DESCENDING" },
      { fieldPath: "__name__", order: "DESCENDING" },
    ])
  ));
});

test("existing root Rules retain the Weekly Training active-member read boundary", async () => {
  const rules = await source(files.rules);
  assert.match(rules, /match \/proClubs\/\{clubId\}\/weeklyTrainingPlans\/\{planId\}/);
  assert.match(rules, /allow get, list: if currentUserIsActive\(\)/);
  assert.match(rules, /proClubWeeklyTrainingActiveMemberV1\(clubId, request\.auth\.uid\)/);
});
