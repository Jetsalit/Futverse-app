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

test("saved-DRAFT production capability is fail-closed until reviewed index evidence exists", () => {
  assert.equal(PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED, false);
  assert.equal(isWeeklyTrainingSavedDraftReadAvailable({ dev: false, productionIndexVerified: false }), false);
  assert.equal(isWeeklyTrainingSavedDraftReadAvailable({ dev: true, productionIndexVerified: false }), true);
  assert.equal(isWeeklyTrainingSavedDraftReadAvailable({ dev: false, productionIndexVerified: true }), true);
});

test("saved-DRAFT dev exception is serve-only and cannot be enabled by build environment or mode", async () => {
  const capability = await source(files.capability);
  assert.match(capability, /PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = false as const/);
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

test("read model enforces immutable audit parity and exact persisted payload parity", async () => {
  const model = await source(files.model);
  assert.match(model, /value\.createdBy !== value\.updatedBy/);
  assert.match(model, /sameTimestampOrder\(createdAt\.order, updatedAt\.order\)/);
  assert.match(model, /actorUid: summaryResult\.value\.authorUid/);
  assert.match(model, /timestamp: summaryResult\.value\.createdAtOrder/);
  assert.match(model, /sessionPayloadMatchesPersisted/);
  assert.match(model, /blockPayloadMatchesPersisted/);
  assert.match(model, /sameStringArray/);
  assert.match(model, /parseSession\(entry\.document, expectedAudit\)/);
  assert.match(model, /parseBlock\(document, expectedAudit\)/);
  assert.match(model, /parseProClubWeeklyTrainingDraft/);
});

test("Head Coach UI gates production saved-DRAFT mounting until the index capability is verified", async () => {
  const component = await source(files.component);
  const workspace = await source(files.workspace);
  assert.match(component, /authority\.staffRole === "HEAD_COACH"/);
  assert.match(component, /setNextCursor\(result\.value\.nextCursor\)/);
  assert.match(component, /Load more saved drafts/);
  assert.match(component, /loadPage\(nextCursor, true\)/);
  assert.match(component, /new Map\(current\.map/);
  assert.match(component, /Refresh saved drafts/);
  assert.doesNotMatch(component, /\bEdit\b/);
  assert.doesNotMatch(component, /\bSave\b/);
  assert.match(workspace, /WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE \? \(/);
  assert.match(workspace, /<WeeklyTrainingSavedDrafts authority=\{authority\} \/>/);
  assert.match(workspace, /<SavedDraftReadPending \/>/);
  assert.match(workspace, /Saved DRAFT history pending production index verification/);
});

test("Spark hosting-only release cannot deploy the index and therefore must rely on the fail-closed capability", async () => {
  const spark = JSON.parse(await source(files.spark));
  assert.deepEqual(Object.keys(spark).sort(), ["hosting"]);
  assert.equal(PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED, false);
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
