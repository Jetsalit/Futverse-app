import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contractPath =
  "docs/PRO_CLUB_SUPERADMIN_SUPPORT_SESSION_AUDIT_V1_CONTRACT_FREEZE.md";
const contract = read(contractPath);
const normalized = contract.replace(/\s+/g, " ");
const supportReadAdapter = read("src/lib/firestore/proClubSupportReadAdapter.ts");
const firestoreRules = read("firestore.rules");

const requiredAuditFields = [
  "schemaVersion",
  "eventId",
  "sessionId",
  "eventType",
  "mode",
  "actorUid",
  "clubId",
  "subjectUid",
  "readSurface",
  "outcome",
  "reasonCode",
  "occurredAt",
] as const;

const readSurfaces = [
  "CLUB",
  "SUBJECT_MEMBERSHIP",
  "SUBJECT_STAFF",
  "TECHNICAL_GOVERNANCE",
  "WEEKLY_TRAINING_PLAN",
  "WEEKLY_TRAINING_SESSION",
  "WEEKLY_TRAINING_BLOCK",
] as const;

const outcomes = [
  "SUCCESS",
  "MISSING",
  "PERMISSION_DENIED",
  "INVALID_TARGET",
  "INVALID_DATA",
  "UNAUTHORIZED",
  "UNEXPECTED_ERROR",
] as const;

test("contract pins exact stacked parent and active merge dependency", () => {
  assert.match(
    contract,
    /Accepted parent HEAD: `c4305442ce19c7fe470eb50975e3a252618df2aa`/,
  );
  assert.match(contract, /Parent PR: `#131`/);
  assert.match(contract, /`MERGE_GATE=BLOCKED_BY_HEAD_COACH_PHASE_5E_2`/);
  assert.match(contract, /`MERGE_AUTHORIZATION=NOT_GRANTED`/);
});

test("contract freezes docs tests only and explicitly forbids runtime activation", () => {
  assert.match(contract, /`SCOPE=DOCS_TESTS_ONLY`/);
  assert.match(contract, /`RUNTIME_IMPLEMENTATION=NOT_AUTHORIZED`/);
  assert.match(contract, /`AUDIT_PERSISTENCE_IMPLEMENTATION=NOT_AUTHORIZED`/);
  assert.match(contract, /`FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`FUNCTIONS_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`UI_CHANGE=NOT_AUTHORIZED`/);
  assert.match(contract, /`PRODUCTION_DEPLOY_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DATA_READ_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(contract, /`PRODUCTION_DATA_WRITE_AUTHORIZATION=NOT_GRANTED`/);
  assert.match(normalized, /Exactly two new files are authorized in this slice:/);
});

test("audit and session evidence can never become Pro Club authority", () => {
  assert.match(contract, /`AUDIT_AS_AUTHORITY=FORBIDDEN`/);
  assert.match(contract, /`SESSION_AS_AUTHORITY=FORBIDDEN`/);
  assert.match(contract, /`TENANT_MEMBERSHIP_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`FOOTBALL_STAFF_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`TECHNICAL_AUTHORITY=NOT_GRANTED`/);
  assert.match(contract, /`DOMAIN_MUTATION_AUTHORITY=NONE`/);
  assert.match(
    normalized,
    /authorize a read merely because a prior audit\/session record exists/,
  );
});

test("real Firebase actor and canonical ACTIVE SUPERADMIN remain identity source", () => {
  assert.match(
    contract,
    /`ACTOR_IDENTITY_SOURCE=REAL_FIREBASE_AUTH_UID_PLUS_CANONICAL_ACTIVE_SUPERADMIN_ACCOUNT`/,
  );
  assert.match(contract, /`CURRENT_USER_IMPERSONATION=FORBIDDEN`/);
  assert.match(
    contract,
    /`SUPPORT_PRESENTATION_AS_PRO_CLUB_AUTHORITY=FORBIDDEN`/,
  );
  assert.match(contract, /`FIREBASE_AUTH_IDENTITY_SWAP=FORBIDDEN`/);
  assert.match(
    normalized,
    /Actor identity must never be accepted from an arbitrary client payload/,
  );
});

test("support target is exact and target switching invalidates prior state", () => {
  assert.match(contract, /`TARGET_BINDING=EXACT_CLUB_ID`/);
  assert.match(contract, /`GENERIC_PRO_CLUB_DISCOVERY=FORBIDDEN`/);
  assert.match(contract, /`CROSS_TENANT_FALLBACK=FORBIDDEN`/);
  assert.match(contract, /`TARGET_SWITCH_REQUIRES_PREVIOUS_INVALIDATION=YES`/);
  assert.match(
    normalized,
    /A new support target creates a new support-session identity/,
  );
});

test("future session and event identifiers are trusted and append only", () => {
  assert.match(contract, /`SESSION_ID_SOURCE=TRUSTED_SERVER_GENERATED`/);
  assert.match(contract, /`AUDIT_EVENT_MODEL=APPEND_ONLY`/);
  for (const eventType of ["SESSION_STARTED", "READ_ATTEMPTED", "SESSION_ENDED"]) {
    assert.match(contract, new RegExp(`\\b${eventType}\\b`));
  }
  assert.match(
    normalized,
    /Existing audit events must never be updated in place or deleted through the support runtime/,
  );
});

test("minimum audit evidence shape is frozen and uses trusted time", () => {
  assert.match(contract, /`AUDIT_SCHEMA_VERSION=1`/);
  assert.match(contract, /`AUDIT_TIME_SOURCE=TRUSTED_SERVER_TIME`/);
  for (const field of requiredAuditFields) {
    assert.match(contract, new RegExp(`\\b${field}\\b`));
  }
  assert.match(
    normalized,
    /Client-supplied timestamps are not authoritative/,
  );
});

test("read-surface vocabulary is allowlisted and does not expand parent read envelope", () => {
  assert.match(contract, /`READ_SURFACE_DEFAULT_DENY=YES`/);
  for (const surface of readSurfaces) {
    assert.match(contract, new RegExp(`\\b${surface}\\b`));
  }
  assert.match(
    normalized,
    /This contract does not expand the Firestore read envelope frozen in PR #131/,
  );
});

test("outcome vocabulary preserves fail-closed distinctions", () => {
  assert.match(contract, /`OUTCOME_DEFAULT_DENY=YES`/);
  for (const outcome of outcomes) {
    assert.match(contract, new RegExp(`\\b${outcome}\\b`));
  }
  assert.match(
    normalized,
    /preserve meaningful fail-closed distinctions rather than silently converting denied\/invalid states to success/,
  );
});

test("audit data minimization forbids snapshots secrets and arbitrary dumps", () => {
  assert.match(contract, /`AUDIT_PAYLOAD_SNAPSHOT=FORBIDDEN`/);
  assert.match(contract, /`AUDIT_SECRET_CAPTURE=FORBIDDEN`/);
  assert.match(contract, /`AUDIT_FREEFORM_DATA_DUMP=FORBIDDEN`/);
  assert.match(
    normalized,
    /must not copy full Pro Club documents, Weekly Training content, private notes, tokens, credentials, secrets, or arbitrary payload snapshots/,
  );
});

test("future audit persistence requires trusted writer and forbids client direct writes", () => {
  assert.match(contract, /`CLIENT_DIRECT_AUDIT_WRITE=FORBIDDEN`/);
  assert.match(contract, /`TRUSTED_APPEND_ONLY_WRITER_REQUIRED=YES`/);
  assert.match(
    normalized,
    /the client must not directly create, update, or delete authoritative support audit records/,
  );
  assert.match(
    normalized,
    /the trusted writer must derive actor identity from authenticated context/,
  );
});

test("session invalidation is frozen for actor loss account downgrade and target switch", () => {
  for (const phrase of [
    "explicit support exit",
    "sign-out",
    "loss of authenticated actor identity",
    "actor account becoming non-ACTIVE",
    "actor role no longer being SUPERADMIN",
    "target switch",
    "unrecoverable target-validation failure",
  ]) {
    assert.match(normalized, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(
    normalized,
    /must never recover by impersonating a target user or by falling back to another club/,
  );
});

test("Academy support reuse remains forbidden and parent support read boundary remains visible", () => {
  assert.match(contract, /`ACADEMY_SUPPORT_MODE_REUSE=FORBIDDEN`/);
  assert.match(supportReadAdapter, /PRO_CLUB_SUPERADMIN_SUPPORT_MODE_V1/);
  assert.match(supportReadAdapter, /No mutation operation is exposed here/);
  assert.match(firestoreRules, /PRO_CLUB_SUPERADMIN_SUPPORT_READ_V1/);
  assert.match(firestoreRules, /allow get: if isSuperAdmin\(\);/);
});

test("contract preserves exact two-file final scope", () => {
  assert.match(
    contract,
    /docs\/PRO_CLUB_SUPERADMIN_SUPPORT_SESSION_AUDIT_V1_CONTRACT_FREEZE\.md/,
  );
  assert.match(
    contract,
    /tests\/proClubSuperAdminSupportSessionAuditV1Contract\.test\.ts/,
  );
  assert.match(contract, /- `firestore\.rules`/);
  assert.match(contract, /- `src\/\*\*`/);
  assert.match(contract, /- `functions\/\*\*`/);
  assert.match(contract, /- `package\.json`/);
});
