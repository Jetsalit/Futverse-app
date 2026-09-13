import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = readFileSync(
  new URL(
    "../docs/PRO_CLUB_HEAD_COACH_WEEKLY_PRODUCTION_ACCEPTANCE_V1_EVIDENCE_FREEZE.md",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");

function requireText(...values: string[]) {
  for (const value of values) {
    assert.ok(evidence.includes(value), `missing evidence text: ${value}`);
  }
}

test("freezes exact production source/project and evidence-only boundary", () => {
  requireText(
    "main@757a790d4c5372db7050666fe154ae88d94b93e3",
    "futverse-d7872",
    "EVIDENCE_ONLY=YES",
    "RUNTIME_SOURCE_CHANGE=NO",
    "PRODUCTION_CAPABILITY_EXPANSION=NO",
    "DEPLOY_PERFORMED_BY_FREEZE=NO",
    "PRODUCTION_WRITE_PERFORMED_BY_FREEZE=NO",
  );
});

test("freezes Technical Governance production bootstrap and read-back acceptance", () => {
  requireText(
    "TECHNICAL_GOVERNANCE_BOOTSTRAP=PASS",
    "TECHNICAL_GOVERNANCE_CREATE_ONLY=PASS",
    "TECHNICAL_GOVERNANCE_POST_CREATE_NOOP=PASS",
    "TECHNICAL_GOVERNANCE_READ_BACK=PASS",
    "AUTHORITY_UID_DISCLOSED_IN_EVIDENCE=NO",
    "authorityRole=HEAD_COACH",
  );
});

test("freezes Head Coach fresh-DRAFT production smoke and persistence acceptance", () => {
  requireText(
    "HEAD_COACH_PRODUCTION_WORKSPACE=PASS",
    "FRESH_DRAFT_UI_BOUNDARY=PASS",
    "SMOKE_INPUT_CANONICAL=PASS",
    "HEAD_COACH_FRESH_DRAFT_PRODUCTION_WRITE=PASS",
    "PLAN_ID_EQUALS_REQUEST_ID=PASS",
    "SMOKE_IDENTIFIERS_REDACTED=YES",
    "HEAD_COACH_FRESH_DRAFT_PRODUCTION_SMOKE=PASS",
    "FRESH_DRAFT_PRODUCTION_READ_BACK=PASS",
    "SCHEMA_V2_PERSISTENCE=PASS",
    "ATOMIC_BATCH_DOCUMENTS=4",
  );
});

test("freezes Saved-DRAFT list/detail/periodization production acceptance", () => {
  requireText(
    "SAVED_DRAFT_PRODUCTION_LIST=PASS",
    "SAVED_DRAFT_DETAIL=PASS",
    "WEEKLY_PERIODIZATION_BOARD_PRODUCTION=PASS",
    "BLOCK_AND_COACHING_POINTS_PRESENTATION=PASS",
    "HEAD_COACH_WEEKLY_TRAINING_PRODUCTION_ACCEPTANCE=PASS",
    "END_TO_END_PRODUCTION_ACCEPTANCE=PASS",
  );
});

test("freezes still-closed mutation/lifecycle/unrelated-module boundaries", () => {
  requireText(
    "EXISTING_DRAFT_EDIT=FORBIDDEN",
    "LIFECYCLE_EXPANSION=FORBIDDEN",
    "UNRELATED_PRO_CLUB_MODULE_ACTIVATION=FORBIDDEN",
    "edit existing DRAFT",
    "delete/archive",
    "submit/review/approve/publish lifecycle",
    "Technical Director co-authoring",
    "generic SuperAdmin football-authority bypass",
  );
});

test("freezes generic identifier-redaction policy without embedding production identifiers", () => {
  requireText(
    "raw actor UID is not frozen in this evidence document",
    "raw plan/request identifier is not frozen in this evidence document",
    "SMOKE_IDENTIFIERS_REDACTED=YES",
    "AUTHORITY_UID_DISCLOSED_IN_EVIDENCE=NO",
  );

  assert.doesNotMatch(
    evidence,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    "evidence must not contain raw UUID-shaped production identifiers",
  );

  assert.doesNotMatch(
    evidence,
    /\b(?:actor|authority|head coach)\s*(?:uid|user id)\s*[:=]\s*[A-Za-z0-9_-]{20,}\b/i,
    "evidence must not contain a labeled raw actor/authority UID",
  );

  assert.doesNotMatch(
    evidence,
    /\b(?:plan|request)\s*(?:id|identifier)\s*[:=]\s*[A-Za-z0-9_-]{16,}\b/i,
    "evidence must not contain a labeled raw plan/request identifier",
  );
});
