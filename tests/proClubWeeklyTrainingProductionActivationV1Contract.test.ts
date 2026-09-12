import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read(
  "docs/PRO_CLUB_WEEKLY_TRAINING_PRODUCTION_ACTIVATION_V1_CONTRACT_FREEZE.md",
);
const runtimeCapabilities = read("src/config/runtimeCapabilities.ts");
const composer = read(
  "src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx",
);
const saveClient = read("src/lib/proClubWeeklyTrainingDraftSaveClient.ts");
const trustedService = read(
  "functions/src/proClubWeeklyTrainingDraftSave/service.ts",
);
const rules = read("firestore.rules");
const spark = read("firebase.spark.json");

test("contract pins exact accepted baseline and docs-tests-only scope", () => {
  assert.match(
    contract,
    /Accepted baseline SHA: `c1742e2437a6e747c236fa49e4da50437b5d873d`/,
  );
  assert.match(contract, /`SCOPE=DOCS_TESTS_ONLY`/);
  assert.match(contract, /`MERGE_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`/);
});

test("production scope is Head Coach fresh DRAFT only", () => {
  assert.match(contract, /`HEAD_COACH_FRESH_DRAFT_CREATE=IN_SCOPE`/);
  assert.match(contract, /`EXISTING_DRAFT_EDIT=FORBIDDEN`/);
  assert.match(contract, /`EXISTING_DRAFT_RECONCILE=FORBIDDEN`/);
  assert.match(contract, /`DELETE_ARCHIVE=FORBIDDEN`/);
  assert.match(contract, /`SUBMIT_REVIEW_APPROVE_PUBLISH=FORBIDDEN`/);
  assert.match(contract, /`TECHNICAL_DIRECTOR_COAUTHOR=FORBIDDEN`/);

  assert.match(composer, /authority\.staffRole === "HEAD_COACH"/);
  assert.match(
    composer,
    /Existing draft editing, lifecycle actions and\s+Technical Director co-authoring remain closed in this slice\./,
  );
});

test("current production browser save remains function-backed and fail-closed", () => {
  assert.match(
    composer,
    /const runtimeAllowed = FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/,
  );
  assert.match(saveClient, /"saveProClubWeeklyTrainingDraftV1" as const/);
  assert.match(
    runtimeCapabilities,
    /export const FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE =\s*isFunctionBackedProClubWebAvailable\(\{ dev: readViteDevServerRuntime\(\) \}\)/,
  );
  assert.match(
    contract,
    /`GENERIC_FUNCTION_CAPABILITY_PRODUCTION_FLIP=FORBIDDEN`/,
  );
});

test("Spark production boundary remains Hosting-only", () => {
  const parsed = JSON.parse(spark) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ["hosting"]);
  assert.match(contract, /`SPARK_HOSTING_BOUNDARY=PRESERVE`/);
  assert.match(contract, /`FUNCTIONS_PRODUCTION_ENABLEMENT=NOT_AUTHORIZED`/);
  assert.match(contract, /`BILLING_CHANGE=NOT_AUTHORIZED`/);
});

test("trusted fresh save persists schema v2 hierarchy with server receipt", () => {
  assert.match(
    trustedService,
    /WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION = 2 as const/,
  );
  assert.match(trustedService, /"sessionCount"|sessionCount:/);
  assert.match(trustedService, /"blockCount"|blockCount:/);
  assert.match(trustedService, /weeklyTrainingDraftSaveRequests/);
  assert.match(trustedService, /transaction\.create\(receiptRef/);
});

test("current browser Firestore write Rules are schema v1 and cannot replace trusted save", () => {
  assert.match(
    rules,
    /function proClubWeeklyTrainingValidPlanValuesV1\(data\)[\s\S]*data\.get\('schemaVersion', 0\) == 1/,
  );
  assert.match(
    rules,
    /function proClubWeeklyTrainingValidSessionValuesV1\(data\)[\s\S]*data\.get\('schemaVersion', 0\) == 1/,
  );
  assert.match(
    rules,
    /function proClubWeeklyTrainingValidBlockValuesV1\(data\)[\s\S]*data\.get\('schemaVersion', 0\) == 1/,
  );
  assert.match(
    contract,
    /`SCHEMA_V1_BROWSER_WRITE_AS_PRODUCTION_PATH=FORBIDDEN`/,
  );
  assert.match(contract, /`SCHEMA_V2_READ_CONTRACT_MUST_BE_PRESERVED=YES`/);
});

test("production activation requires a dedicated Weekly Training capability", () => {
  assert.match(
    contract,
    /`DEDICATED_WEEKLY_TRAINING_PRODUCTION_CAPABILITY=REQUIRED`/,
  );
  assert.match(contract, /`UNRELATED_PRO_CLUB_MODULE_CHANGE=FORBIDDEN`/);
});

test("failure behavior stays fail-closed until a separately reviewed implementation exists", () => {
  assert.match(contract, /`IDEMPOTENCY_REGRESSION=FORBIDDEN`/);
  assert.match(contract, /`PARTIAL_VALID_DRAFT=FORBIDDEN`/);
  assert.match(contract, /production remains fail-closed/i);
  assert.match(contract, /`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`/);
});
