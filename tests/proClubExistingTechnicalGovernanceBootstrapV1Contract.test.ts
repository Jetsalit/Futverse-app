import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync(
  new URL(
    "../docs/PRO_CLUB_EXISTING_TECHNICAL_GOVERNANCE_BOOTSTRAP_V1_CONTRACT_FREEZE.md",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");

function requireText(...values: string[]) {
  for (const value of values) {
    assert.ok(contract.includes(value), `missing contract text: ${value}`);
  }
}

test("freezes the existing-club-only contract scope and current architecture facts", () => {
  requireText(
    "CONTRACT_SCOPE=EXISTING_PRO_CLUB_TECHNICAL_GOVERNANCE_CURRENT_BOOTSTRAP_ONLY",
    "TECHNICAL_GOVERNANCE_CURRENT_REQUIRED=YES",
    "EXISTING_CLUB_ONLY=YES",
    "CLIENT_CREATE_ALLOWED=NO",
    "CANONICAL_PRODUCTION_WRITER_EXISTS=NO",
    "PROVISIONING_CREATES_GOVERNANCE_CURRENT=NO",
    "IMPLEMENTATION_INCLUDED=NO",
    "PRODUCTION_EXECUTION_AUTHORIZED=NO",
    "PRODUCTION_WRITE_IN_CONTRACT_SLICE=NO",
    "proClubs/{clubId}/technicalGovernance/current",
  );
});

test("freezes the trusted operator, project, input, and canonical-state gates", () => {
  requireText(
    "TRUSTED_ADMIN_WRITER_REQUIRED=YES",
    "TRUSTED_OPERATOR_VERIFICATION_REQUIRED=YES",
    "PROJECT_PIN_REQUIRED=YES",
    "ACTIVE_CLUB_REQUIRED=YES",
    "CANONICAL_STAFF_REQUIRED=YES",
    "CANONICAL_MEMBERSHIP_REQUIRED=YES",
    "ACTIVE_MEMBERSHIP_REQUIRED=YES",
    "ACTIVE_STAFF_REQUIRED=YES",
    "AUTHORITY_UID_IDENTITY_PARITY_REQUIRED=YES",
    "AUTHORITY_ROLE_STAFF_ROLE_PARITY_REQUIRED=YES",
    "SUPERADMIN_WEEKLY_BYPASS=FORBIDDEN",
  );
});

test("freezes AUTO authority resolution and fail-closed outcomes", () => {
  requireText(
    "resolveProClubTechnicalAuthority",
    "AUTO_AUTHORITY_RESOLUTION=YES",
    "AUTO_TECHNICAL_DIRECTOR_PRECEDENCE=YES",
    "AUTO_HEAD_COACH_FALLBACK=YES",
    "AMBIGUITY_FAIL_CLOSED=YES",
    "MISSING_FAIL_CLOSED=YES",
    "Exactly one ACTIVE Technical Director resolves to that Technical Director.",
    "Otherwise, exactly one ACTIVE Head Coach resolves to that Head Coach.",
  );
});

test("freezes the exact four-field current-document schema", () => {
  requireText("CURRENT_DOCUMENT_EXACT_FOUR_FIELD_SCHEMA=YES");

  const schemaMatch = contract.match(
    /```ts\n(type ProClubTechnicalGovernanceCurrentV1 = \{[\s\S]*?\n\};)\n```/,
  );
  assert.ok(schemaMatch, "missing exact current-document schema block");

  const fieldNames = Array.from(
    schemaMatch[1].matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm),
    (match) => match[1],
  );
  assert.deepEqual(fieldNames, [
    "schemaVersion",
    "status",
    "authorityUid",
    "authorityRole",
  ]);
  assert.match(schemaMatch[1], /schemaVersion: 1;/);
  assert.match(schemaMatch[1], /status: "ACTIVE";/);
  assert.match(schemaMatch[1], /authorityUid: string;/);
  assert.match(
    schemaMatch[1],
    /authorityRole: "TECHNICAL_DIRECTOR" \| "HEAD_COACH";/,
  );
});

test("freezes create-only idempotency and mismatch conflict behavior", () => {
  requireText(
    "CREATE_IF_ABSENT=YES",
    "IDENTICAL_REPLAY_NOOP=YES",
    "MISMATCH_CONFLICT=YES",
    "EXISTING_CURRENT_OVERWRITE=FORBIDDEN",
    "SINGLE_DOCUMENT_WRITE_BOUNDARY=YES",
    "Never update, merge, repair, replace, or delete an existing current document.",
    "Never write any other document.",
  );
});

test("freezes client, Rules, Weekly, tenant, audit, and safety boundaries", () => {
  requireText(
    "CLIENT_WRITE_REMAINS_FORBIDDEN=YES",
    "RULE_CHANGE=FORBIDDEN",
    "WEEKLY_CODE_CHANGE=FORBIDDEN",
    "TENANT_HARDCODE=FORBIDDEN",
    "AUDIT_EVIDENCE_LOCATION=CONTROLLED_EXECUTION_REPORT_ONLY",
    "NEW_PRODUCTION_AUDIT_COLLECTION=NO",
    "INPUT_GATE=PASS",
    "AUTHORIZATION_GATE=PASS",
    "SECRET_GATE=PASS",
    "DEPENDENCY_GATE=PASS",
    "FAILURE_BEHAVIOR_GATE=PASS",
  );
});
