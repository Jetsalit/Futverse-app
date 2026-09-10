import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  isWeeklyTrainingSavedDraftReadAvailable,
  PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED,
} from "../src/config/runtimeCapabilities";

async function source(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

test("independent audit: production saved-DRAFT history is fail-closed by default", () => {
  assert.equal(PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED, false);
  assert.equal(
    isWeeklyTrainingSavedDraftReadAvailable({ dev: false, productionIndexVerified: false }),
    false,
  );
});

test("independent audit: DEV remains available while production requires explicit verified evidence", () => {
  assert.equal(
    isWeeklyTrainingSavedDraftReadAvailable({ dev: true, productionIndexVerified: false }),
    true,
  );
  assert.equal(
    isWeeklyTrainingSavedDraftReadAvailable({ dev: false, productionIndexVerified: true }),
    true,
  );
});

test("independent audit: production capability has no environment-variable escape hatch", async () => {
  const capability = await source("src/config/runtimeCapabilities.ts");
  assert.match(capability, /PRODUCTION_WEEKLY_TRAINING_SAVED_DRAFT_INDEX_VERIFIED = false as const/);
  assert.doesNotMatch(capability, /VITE_[A-Z0-9_]*SAVED[A-Z0-9_]*DRAFT/i);
  assert.doesNotMatch(capability, /process\.env[^\n]*SAVED/i);
});

test("independent audit: Head Coach workspace does not unconditionally mount the query UI", async () => {
  const workspace = await source("src/components/pro-club/operations/ProClubRoleWorkspace.tsx");
  assert.match(workspace, /WEEKLY_TRAINING_SAVED_DRAFT_READ_AVAILABLE \? \(/);
  assert.match(workspace, /<WeeklyTrainingSavedDrafts authority=\{authority\} \/>/);
  assert.match(workspace, /<SavedDraftReadPending \/>/);
  assert.match(workspace, /Saved DRAFT history pending production index verification/);
});

test("independent audit: Spark release remains Hosting-only and cannot silently deploy Firestore index", async () => {
  const spark = JSON.parse(await source("firebase.spark.json"));
  assert.deepEqual(Object.keys(spark).sort(), ["hosting"]);
  assert.equal("firestore" in spark, false);
  assert.equal("functions" in spark, false);
});

test("independent audit: production config retains the reviewed composite index declaration", async () => {
  const firebase = JSON.parse(await source("firebase.json"));
  const indexes = JSON.parse(await source("firestore.indexes.json"));
  assert.equal(firebase.firestore.indexes, "firestore.indexes.json");
  assert.ok(indexes.indexes.some((index: any) =>
    index.collectionGroup === "weeklyTrainingPlans" &&
    JSON.stringify(index.fields) === JSON.stringify([
      { fieldPath: "authorUid", order: "ASCENDING" },
      { fieldPath: "status", order: "ASCENDING" },
      { fieldPath: "updatedAt", order: "DESCENDING" },
      { fieldPath: "__name__", order: "DESCENDING" },
    ])
  ));
});
