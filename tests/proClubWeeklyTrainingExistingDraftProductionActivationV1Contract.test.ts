import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function text(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

test("contract is pinned to PR180 baseline and remains docs-tests only", async () => {
  const contract = await text(
    "docs/PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_PRODUCTION_ACTIVATION_V1_CONTRACT_FREEZE.md",
  );
  assert.match(contract, /86a51ee57dbb90d56f5b50b74e2eda4ca6a3f224/);
  assert.match(contract, /SCOPE=DOCS_TESTS_ONLY/);
  assert.match(contract, /SERVER_PRODUCTION_EDIT_GATE=CLOSED/);
  assert.match(contract, /WEB_PRODUCTION_EDIT_GATE=CLOSED/);
});

test("server and web production edit gates are still false on the accepted baseline", async () => {
  const handler = await text(
    "functions/src/proClubWeeklyTrainingExistingDraftEdit/callableHandler.ts",
  );
  const runtime = await text("src/config/runtimeCapabilities.ts");
  assert.match(
    handler,
    /PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_SERVER_ENABLED:\s*boolean\s*=\s*false/,
  );
  assert.match(
    runtime,
    /PRODUCTION_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_WRITER_VERIFIED\s*=\s*false\s+as const/,
  );
});

test("activation order is server deployment evidence, server activation, canary, then web activation", async () => {
  const contract = await text(
    "docs/PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_PRODUCTION_ACTIVATION_V1_CONTRACT_FREEZE.md",
  );
  assert.match(contract, /Gate B — Disabled-writer deployment candidate/);
  assert.match(contract, /Gate C — Server activation/);
  assert.match(contract, /Gate D — Controlled authenticated canary/);
  assert.match(contract, /Gate E — Web activation/);
  assert.match(contract, /SERVER_TRUE_WEB_FALSE=REQUIRED_INTERMEDIATE_STATE/);
});

test("Spark configuration remains Hosting-only while full firebase config contains Functions", async () => {
  const firebase = JSON.parse(await text("firebase.json")) as Record<string, unknown>;
  const spark = JSON.parse(await text("firebase.spark.json")) as Record<string, unknown>;
  assert.ok("functions" in firebase);
  assert.deepEqual(Object.keys(spark).sort(), ["hosting"]);
});
