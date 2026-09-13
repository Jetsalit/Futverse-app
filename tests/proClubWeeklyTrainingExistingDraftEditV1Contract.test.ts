import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync(
  "docs/PRO_CLUB_WEEKLY_TRAINING_EXISTING_DRAFT_EDIT_V1_CONTRACT.md",
  "utf8",
).replace(/\r\n?/g, "\n");

function requires(...tokens: readonly string[]): void {
  for (const token of tokens) {
    assert.ok(contract.includes("`" + token + "`"), `Missing contract token: ${token}`);
  }
}

test("freezes exact Head Coach authority and own schema-v2 DRAFT binding", () => {
  assert.match(
    contract,
    /Accepted baseline SHA: `96cab027a8f1d8c9db5a95e2912d22bf6c6f891e`/,
  );
  requires(
    "AUTHORITY_SCOPE=ACTIVE_PRO_CLUB_ACTIVE_MEMBERSHIP_VALID_MEMBERSHIP_AUTHORITY_HEAD_COACH_ONLY",
    "TARGET_DRAFT=CURRENT_CLUB_CURRENT_HEAD_COACH_OWN_SCHEMA_V2_DRAFT",
    "DRAFT_STATUS_BEFORE=DRAFT",
    "DRAFT_STATUS_AFTER=DRAFT",
  );
  assert.match(contract, /organizationType=PRO_CLUB/);
  assert.match(contract, /organizationStatus=ACTIVE/);
  assert.match(contract, /membershipStatus=ACTIVE/);
  assert.match(contract, /hasMembershipAuthority=true/);
  assert.match(contract, /staffRole=HEAD_COACH/);
  assert.match(contract, /SuperAdmin bypass or override/);
  assert.match(contract, /Technical Director edit or co-authoring/);
});

test("freezes fixed hierarchy and the only mutable field groups", () => {
  requires(
    "HIERARCHY_SHAPE=FIXED",
    "SESSION_CREATE=FORBIDDEN",
    "SESSION_DELETE=FORBIDDEN",
    "SESSION_REORDER=FORBIDDEN",
    "BLOCK_CREATE=FORBIDDEN",
    "BLOCK_DELETE=FORBIDDEN",
    "BLOCK_REORDER=FORBIDDEN",
    "HIERARCHY_APPEND=FORBIDDEN",
    "HIERARCHY_CARDINALITY_CHANGE=FORBIDDEN",
    "MUTABLE_PLAN_FIELDS=squadLabel,mainObjective,secondaryObjective,headCoachNote",
    "MUTABLE_SESSION_FIELDS=location,objective,phaseOfPlay,plannedLoad,durationMinutes",
    "MUTABLE_BLOCK_FIELDS=blockType,title,durationMinutes,drillReference,coachingPoints",
  );
});

test("freezes immutable identities, creation audit and DRAFT lifecycle", () => {
  requires(
    "IMMUTABLE_CREATION_AUDIT=createdAt,createdBy",
    "LIFECYCLE_TRANSITION=FORBIDDEN",
    "STATUS_MUST_REMAIN=DRAFT",
  );
  for (const value of [
    "clubId",
    "planId",
    "schemaVersion",
    "authorUid",
    "weekStartDate",
    "sessionCount",
    "blockCount",
    "orderIndex",
    "sessionDate",
    "startTime",
    "createdAt",
    "createdBy",
  ]) {
    assert.ok(contract.includes("`" + value + "`"), `Missing immutable field: ${value}`);
  }
  assert.match(contract, /`updatedAt` and `updatedBy` MUST NOT be editable form inputs/);
  assert.match(contract, /`updatedAt` is server-derived/);
});

test("freezes optimistic concurrency and zero-write conflict behavior", () => {
  requires(
    "CONCURRENCY_TOKEN=EXPECTED_PLAN_UPDATED_AT",
    "BASE_REQUIREMENT=HIERARCHY_WIDE_AUDIT_COHERENCE",
    "STALE_RESULT=CONFLICT",
    "STALE_WRITE_COUNT=0",
    "INCOHERENT_RESULT=CONFLICT",
    "CONFLICT_BEHAVIOR=FAIL_CLOSED_NO_OVERWRITE",
    "REVISION_VERSION_SUBSYSTEM=NOT_AUTHORIZED",
  );
  assert.match(contract, /current plan `updatedAt` exactly equals the editor's expected `updatedAt`/);
  assert.match(contract, /current Head Coach authority remains valid/);
});

test("freezes atomic complete-hierarchy update without create delete append or control-state mutation", () => {
  requires(
    "ATOMIC_UPDATE_SCOPE=THE_COMPLETE_EXISTING_HIERARCHY_WITHIN_THE_CURRENT_CANONICAL_STORAGE_CARDINALITY_BOUNDS",
    "HIERARCHY_CREATE=FORBIDDEN",
    "HIERARCHY_DELETE=FORBIDDEN",
    "HIERARCHY_APPEND_ON_UPDATE=FORBIDDEN",
    "CREATE_MANIFEST_MUTATION=FORBIDDEN",
    "CALLABLE_RECEIPT_MUTATION=FORBIDDEN",
    "UPDATE_AUDIT=HIERARCHY_WIDE_COHERENT_SERVER_DERIVED",
  );
  assert.match(contract, /update the plan/);
  assert.match(contract, /update every existing session/);
  assert.match(contract, /update every existing block/);
  assert.doesNotMatch(contract, /183 documents/);
});

test("freezes ambiguous read-back reconciliation and Fresh-DRAFT preservation", () => {
  requires(
    "AMBIGUOUS_RESULT=READ_BACK_COMPLETE_HIERARCHY",
    "AMBIGUOUS_SUCCESS=EXACT_INTENDED_CANONICAL_STATE_ONLY",
    "AMBIGUOUS_BLIND_RETRY=FORBIDDEN",
    "AMBIGUOUS_AUTOMATIC_OVERWRITE=FORBIDDEN",
    "FRESH_DRAFT_BEHAVIOR=PRESERVED",
    "PLAN_ID_EQUALS_ORIGINAL_REQUEST_ID=PRESERVED",
    "ORIGINAL_CREATE_RETRY_AFTER_EDIT=FAIL_CLOSED_ON_PAYLOAD_MISMATCH",
    "RESTORE_ORIGINAL_CREATE_PAYLOAD=FORBIDDEN",
  );
  assert.match(contract, /MUST NOT predict the exact server request time/);
});

test("freezes intentional read-model evolution and keeps dedicated capability closed", () => {
  requires(
    "READ_MODEL_CHANGE_IN_SLICE_A=FORBIDDEN",
    "UNTOUCHED_FRESH_DRAFT_VALIDITY=PRESERVE",
    "LEGITIMATE_EDITED_SCHEMA_V2_DRAFT_VALIDITY=REQUIRED_FOR_FUTURE_IMPLEMENTATION",
    "PARTIAL_OR_MIXED_UPDATE_AUDIT=FAIL_CLOSED",
    "DEDICATED_EXISTING_DRAFT_EDIT_CAPABILITY=REQUIRED",
    "DEDICATED_EXISTING_DRAFT_EDIT_CAPABILITY_STATUS=CLOSED_NOT_IMPLEMENTED",
    "CAPABILITY_INHERITANCE=FORBIDDEN",
    "FIRESTORE_RULES_IMPLEMENTATION_IN_SLICE_A=FORBIDDEN",
    "FIRESTORE_RULES_DEPLOY=FORBIDDEN",
    "PRODUCTION_DATA_MUTATION=FORBIDDEN",
    "RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED",
    "COMMIT_AUTHORIZATION=NOT_GRANTED",
  );
});
