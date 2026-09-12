import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const paths = {
  contract:
    "docs/PRO_CLUB_WEEKLY_PERIODIZATION_BOARD_V1_CONTRACT_FREEZE.md",
  legacy: "src/components/WeeklyPeriodization.tsx",
  savedDraftComponent:
    "src/components/pro-club/operations/WeeklyTrainingSavedDrafts.tsx",
  savedDraftModel: "src/lib/proClubWeeklyTrainingSavedDraftReadModel.ts",
  savedDraftAdapter:
    "src/lib/firestore/proClubWeeklyTrainingSavedDraftReadAdapter.ts",
  trustedFreshSave: "functions/src/proClubWeeklyTrainingDraftSave/service.ts",
} as const;

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}

function includesAll(source: string, fragments: readonly string[]): void {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `missing contract fragment: ${fragment}`);
  }
}

test("Board V1 contract document exists", () => {
  assert.equal(existsSync(paths.contract), true);
});

const contract = read(paths.contract);

test("contract freezes Board V1 as read-only presentation and derivation only", () => {
  includesAll(contract, [
    "`BOARD_V1=READ_ONLY`",
    "`BOARD_V1=PRESENTATION_DERIVATION_ONLY`",
    "`BOARD_IMPLEMENTATION=NOT_INCLUDED`",
    "read-only presentation and derivation layer",
    "`MERGE_AUTHORIZATION=NOT_GRANTED`",
  ]);
});

test("contract pins the existing validated Saved-DRAFT detail as the sole source", () => {
  includesAll(contract, [
    "The sole source of truth for Board V1 is `WeeklyTrainingSavedDraftDetail.draft`.",
    "`SAVED_DRAFT_READ_MODEL=REUSE_UNCHANGED`",
    "`SAVED_DRAFT_READ_ADAPTER=REUSE_UNCHANGED`",
    "`FRESH_DRAFT_PRODUCTION_CREATION=UNCHANGED`",
    "`EXISTING_DRAFT_EDITING=CLOSED`",
  ]);
});

test("contract limits Board data to canonical existing draft fields", () => {
  includesAll(contract, [
    "`weekStartDate`",
    "`squadLabel`",
    "`mainObjective`",
    "`secondaryObjective`",
    "`sessionDate`",
    "`startTime`",
    "`location`",
    "`objective`",
    "`phaseOfPlay`",
    "`plannedLoad`",
    "session `durationMinutes`",
    "training `blocks`",
    "`blockType`",
    "block `title`",
    "block `durationMinutes`",
    "optional `drillReference`",
    "`coachingPoints`",
    "presentation-derived focus",
    "no derived focus may be written back to persistence",
  ]);
});

test("contract preserves the exact canonical plannedLoad vocabulary and forbids persisted aliases", () => {
  assert.match(
    contract,
    /The canonical `plannedLoad` values remain exactly:\n\n1\. `LOW`\n2\. `MODERATE`\n3\. `HIGH`/,
  );
  includesAll(contract, [
    "`PLANNED_LOAD_CANONICAL_VALUES=LOW|MODERATE|HIGH`",
    "`NEW_PERSISTED_INTENSITY_OR_LOAD_FIELD=FORBIDDEN`",
    "No new persisted `intensity`, `load`, `trainingLoad`, or equivalent field is permitted.",
  ]);
});

test("contract uses actual calendar dates and forbids inferred Match Day notation", () => {
  includesAll(contract, [
    "Actual `sessionDate`, calendar date, and day-of-week are the authoritative V1 timeline.",
    "`V1_TIMELINE=ACTUAL_SESSION_DATE|CALENDAR_DATE|DAY_OF_WEEK`",
    "`AUTHORITATIVE_MATCH_DATE_SOURCE=ABSENT`",
    "`MD_LABELS=FORBIDDEN_WITHOUT_AUTHORITATIVE_MATCH_DATE`",
    "`MATCH_COMPETITION_CALENDAR=FUTURE_SEPARATELY_REVIEWED_CONTRACT`",
    "`MD-4`, `MD-3`, `MD-2`, `MD-1`, `MD`, or `MD+1`",
    "`weekStartDate`, position within a week, a weekday, an assumed Saturday/Sunday match, or any hard-coded match date",
  ]);
});

test("contract preserves exact Head Coach authority and identity binding", () => {
  includesAll(contract, [
    "`organizationType == PRO_CLUB`",
    "`organizationStatus == ACTIVE`",
    "`membershipStatus == ACTIVE`",
    "`hasMembershipAuthority == true`",
    "effective role `HEAD_COACH`",
    "`BOARD_AUTHORITY=EXISTING_HEAD_COACH_SAVED_DRAFT_READ_AUTHORITY`",
    "`CLUB_IDENTITY=RESOLVED_ORGANIZATION_MEMBERSHIP_AUTHORITY_ONLY`",
    "`ACTOR_IDENTITY=AUTHENTICATED_RESOLVED_AUTHORITY_ONLY`",
    "`SUPERADMIN_BYPASS=FORBIDDEN`",
    "`TECHNICAL_DIRECTOR_ACCESS_EXPANSION=FORBIDDEN`",
    "`ASSISTANT_COACH_OR_STAFF_ROLE_EXPANSION=FORBIDDEN`",
    "`FREE_FORM_CLUB_ID_OR_ACTOR_UID=FORBIDDEN`",
  ]);
});

test("contract forbids all persistence, write authority and DRAFT lifecycle mutations", () => {
  includesAll(contract, [
    "must not save, update, patch, edit, reconcile, delete, archive, submit, review, approve, or publish a DRAFT",
    "`NEW_PERSISTENCE=FORBIDDEN`",
    "`FIRESTORE_SCHEMA_CHANGE=FORBIDDEN`",
    "`FIRESTORE_PATH_CHANGE=FORBIDDEN`",
    "`NEW_WRITE_AUTHORITY=FORBIDDEN`",
    "`EXISTING_DRAFT_UPDATE=FORBIDDEN`",
    "`EXISTING_DRAFT_RECONCILE=FORBIDDEN`",
    "`EXISTING_DRAFT_DELETE_ARCHIVE=FORBIDDEN`",
    "`SUBMIT_REVIEW_APPROVE_PUBLISH=FORBIDDEN`",
    "`NEW_CALLABLE_OR_FUNCTION_MUTATION_PATH=FORBIDDEN`",
    "No Firestore collection, document hierarchy, document, persisted Weekly Training field, write path, callable, Function, HTTP mutation endpoint, or production service integration may be added",
  ]);
});

test("contract requires future Board transformation to be pure deterministic and IO-free", () => {
  includesAll(contract, [
    "`FUTURE_BOARD_TRANSFORMATION=PURE|DETERMINISTIC|NO_IO`",
    "the same canonical draft produces the same presentation result",
    "The transformation must perform no IO.",
    "must never write to Firestore, Storage, Functions, HTTP mutation endpoints, or production data",
  ]);
});

test("contract freezes legacy, runtime, Firebase and Cloud Functions surfaces", () => {
  includesAll(contract, [
    "`src/components/WeeklyPeriodization.tsx` is frozen",
    "not the authoritative Pro Club Weekly Training surface",
    "`LEGACY_WEEKLY_PERIODIZATION_COMPONENT=FROZEN_NOT_AUTHORITATIVE`",
    "`PRO_CLUB_PORTAL_RUNTIME_SHELL=NOT_ACTIVATED_OR_EXPANDED`",
    "`RUNTIME_CAPABILITY_FILES=FROZEN`",
    "`FIRESTORE_RULES=FROZEN`",
    "`FIRESTORE_INDEXES=FROZEN`",
    "`FIREBASE_CONFIGURATION=FROZEN`",
    "`CLOUD_FUNCTIONS_AND_CALLABLES=FROZEN`",
  ]);
  assert.equal(existsSync(paths.legacy), true);
});

test("contract preserves schema, idempotency, binding, snapshot and pagination behavior", () => {
  includesAll(contract, [
    "`WEEKLY_TRAINING_SCHEMA_VERSION_BEHAVIOR=UNCHANGED_SCHEMA_VERSION_2`",
    "`IDEMPOTENCY_BEHAVIOR=UNCHANGED`",
    "`TENANT_CLUB_BINDING=UNCHANGED`",
    "`ACTOR_BINDING=UNCHANGED`",
    "`IMMUTABLE_FRESH_SAVE_SNAPSHOT=UNCHANGED`",
    "`SAVED_DRAFT_CANONICAL_RECONSTRUCTION=UNCHANGED`",
    "`SAVED_DRAFT_PAGINATION_READ_BEHAVIOR=UNCHANGED`",
    "`RUNTIME_PRODUCTION_ACTIVATION_BOUNDARIES=UNCHANGED`",
  ]);
});

test("existing Saved-DRAFT source still exposes canonical detail and Head Coach authority gate", () => {
  const model = read(paths.savedDraftModel);
  const component = read(paths.savedDraftComponent);

  assert.match(
    model,
    /export interface WeeklyTrainingSavedDraftDetail extends WeeklyTrainingSavedDraftSummary \{\s+readonly draft: ProClubWeeklyTrainingDraft;/,
  );
  assert.match(model, /SAVED_DRAFT_HIERARCHY_SCHEMA_VERSION = 2 as const/);
  includesAll(component, [
    'authority.organizationType === "PRO_CLUB"',
    'authority.organizationStatus === "ACTIVE"',
    'authority.membershipStatus === "ACTIVE"',
    "authority.hasMembershipAuthority",
    'authority.staffRole === "HEAD_COACH"',
  ]);
});

test("existing Saved-DRAFT adapter remains bounded, author-bound and read-only", () => {
  const adapter = read(paths.savedDraftAdapter);

  includesAll(adapter, [
    'where("authorUid", "==", actorUid)',
    'where("status", "==", "DRAFT")',
    'orderBy("updatedAt", "desc")',
    "WEEKLY_TRAINING_SAVED_DRAFT_PAGE_SIZE + 1",
    "planSummary.value.sessionCount + 1",
    "expectedBlockCount + 1",
    "buildWeeklyTrainingSavedDraftDetail",
  ]);
  for (const forbidden of [
    /\bsetDoc\b/,
    /\baddDoc\b/,
    /\bupdateDoc\b/,
    /\bdeleteDoc\b/,
    /\bwriteBatch\b/,
    /httpsCallable/,
  ]) {
    assert.doesNotMatch(adapter, forbidden);
  }
});

test("existing trusted fresh save retains schema-v2 create-only snapshot and idempotency receipt", () => {
  const service = read(paths.trustedFreshSave);

  includesAll(service, [
    '"weeklyTrainingDraftSaveRequests" as const',
    "WEEKLY_TRAINING_DRAFT_HIERARCHY_SCHEMA_VERSION",
    "transaction.create(freshPlanRef, planPayload)",
    "transaction.create(sessionRef",
    "transaction.create(blockRef",
    "transaction.create(receiptRef",
  ]);
  assert.match(service, /createdBy: actorUid,[\s\S]*updatedBy: actorUid/);
});

test("contract safety declaration records no implementation or production mutation", () => {
  includesAll(contract, [
    "`FIRESTORE_RULES_CHANGED=NO`",
    "`FIRESTORE_INDEXES_CHANGED=NO`",
    "`FIREBASE_CONFIG_CHANGED=NO`",
    "`FUNCTIONS_CHANGED=NO`",
    "`RUNTIME_CAPABILITY_CHANGED=NO`",
    "`IMPLEMENTATION_SOURCE_CHANGED=NO`",
    "`DEPLOY_PERFORMED=NO`",
    "`PRODUCTION_CALLABLE_INVOKED=NO`",
    "`PRODUCTION_DATA_WRITE=NO`",
  ]);
});
