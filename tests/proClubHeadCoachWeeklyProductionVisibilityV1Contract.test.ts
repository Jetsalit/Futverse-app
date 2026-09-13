import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync(
  "docs/PRO_CLUB_HEAD_COACH_WEEKLY_PRODUCTION_VISIBILITY_V1_CONTRACT_FREEZE.md",
  "utf8",
).replace(/\r\n?/g, "\n");

function requireText(value: string): void {
  assert.ok(contract.includes(value), `missing contract fragment: ${value}`);
}

test("freezes Head Coach Weekly visibility only", () => {
  for (const value of [
    "`HEAD_COACH_WEEKLY_PRODUCTION_VISIBILITY_V1=CONTRACT_ONLY`",
    "`PRODUCTION_WEEKLY_SURFACE=HEAD_COACH_ONLY`",
    "`FRESH_DRAFT_SURFACE=REUSE_EXISTING`",
    "`SAVED_DRAFT_SURFACE=REUSE_EXISTING`",
    "`PERIODIZATION_BOARD_SURFACE=REUSE_EXISTING`",
  ]) requireText(value);
});

test("keeps authority narrow", () => {
  for (const value of [
    "`AUTHORITY_SOURCE=EXISTING_PRO_CLUB_ORGANIZATION_AUTHORITY`",
    "`SUPERADMIN_BYPASS=FORBIDDEN`",
    "`TECHNICAL_DIRECTOR_VISIBILITY_EXPANSION=FORBIDDEN`",
    "`ASSISTANT_COACH_VISIBILITY_EXPANSION=FORBIDDEN`",
    "`GENERIC_STAFF_VISIBILITY_EXPANSION=FORBIDDEN`",
  ]) requireText(value);
});

test("keeps generic Operations production activation closed", () => {
  requireText("`PRO_CLUB_OPERATIONS_PREVIEW_GATE=REMAIN_DEV_ONLY`");
  requireText("`FULL_OPERATIONS_PRODUCTION_ACTIVATION=FORBIDDEN`");
});

test("reuses existing Weekly capabilities", () => {
  requireText("`WEEKLY_CAPABILITIES=REUSE_UNCHANGED`");
  requireText("`ENVIRONMENT_TOGGLE_FOR_PRODUCTION_VISIBILITY=FORBIDDEN`");
});

test("forbids persistence and lifecycle expansion", () => {
  for (const value of [
    "`EXISTING_DRAFT_EDITING=CLOSED`",
    "`LIFECYCLE_EXPANSION=FORBIDDEN`",
    "`NEW_PERSISTENCE=FORBIDDEN`",
    "`NEW_WRITE_AUTHORITY=FORBIDDEN`",
  ]) requireText(value);
});

test("forbids tenant hard-code and defers auto-entry", () => {
  for (const value of [
    "`TENANT_SPECIFIC_CODE=FORBIDDEN`",
    "`LAMPANG_HARDCODE=FORBIDDEN`",
    "`SINGLE_PRO_CLUB_AUTO_ENTRY=DEFERRED`",
    "`ORGANIZATION_SWITCHER_CHANGE=FORBIDDEN`",
    "`ONBOARDING_FLOW_CHANGE=FORBIDDEN`",
  ]) requireText(value);
});

test("records contract-only safety state", () => {
  for (const value of [
    "`IMPLEMENTATION_SOURCE_CHANGED=NO`",
    "`FIRESTORE_RULES_CHANGED=NO`",
    "`FIRESTORE_INDEXES_CHANGED=NO`",
    "`FUNCTIONS_CHANGED=NO`",
    "`RUNTIME_CAPABILITY_CHANGED=NO`",
    "`DEPLOY_PERFORMED=NO`",
    "`PRODUCTION_DATA_WRITE=NO`",
  ]) requireText(value);
});
