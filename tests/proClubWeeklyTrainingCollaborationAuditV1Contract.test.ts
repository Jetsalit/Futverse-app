import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync(
  "docs/PRO_CLUB_WEEKLY_TRAINING_COLLABORATION_AUDIT_V1_CONTRACT_FREEZE.md",
  "utf8",
);
const roleWorkspace = readFileSync(
  "src/components/pro-club/operations/ProClubRoleWorkspace.tsx",
  "utf8",
);
const proClubTypes = readFileSync("src/types/ProClub.ts", "utf8");

test("collaboration contract is pinned to the accepted main baseline and isolated from failed PR #162", () => {
  assert.match(contract, /c1742e2437a6e747c236fa49e4da50437b5d873d/);
  assert.match(contract, /independent from PR #162/);
  assert.match(contract, /does not inherit the failed schema-v2 root Rules integration/);
});

test("contract preserves Plan, Execution and Actual as distinct concepts", () => {
  assert.match(contract, /Plan → Execution → Actual/);
  assert.match(contract, /The original Plan must not be silently overwritten/);
  assert.match(contract, /planned session is never edited, but Actual records the real execution difference/);
});

test("assigned contributor roles already exist in the canonical Pro Club staff model", () => {
  for (const role of ["ASSISTANT_COACH", "GK_COACH", "FITNESS_COACH", "ANALYST"]) {
    assert.match(proClubTypes, new RegExp(`\\| \\"${role}\\"`));
    assert.match(contract, new RegExp(`\\`${role}\\``));
  }
  assert.match(contract, /Assignment is explicit and scoped/);
  assert.match(contract, /staff role alone does not grant access to every Weekly Training plan/);
});

test("Technical Director, Owner Admin and SuperAdmin authority remain fail-closed", () => {
  assert.match(contract, /Technical Director is a football-governance authority, not an automatic co-author/);
  assert.match(contract, /OWNER\/ADMIN status alone must never become football-content authority/);
  assert.match(contract, /Global SUPERADMIN is not an automatic Pro Club football authority/);
  assert.match(contract, /explicit audited support\/break-glass flow/);
});

test("audit history is append-only and actor-specific", () => {
  assert.match(contract, /Audit history is append-only and actor-specific/);
  for (const field of [
    "actorUid",
    "actorRole",
    "action",
    "targetType",
    "targetId",
    "clubId",
    "occurredAt",
    "delegatedBy",
    "reason",
  ]) {
    assert.match(contract, new RegExp(`\\`${field}\\``));
  }
  assert.match(contract, /updatedBy.*not a substitute for the audit history/s);
});

test("first UI slice is preview-only and existing workspace has compatible insertion points", () => {
  assert.match(contract, /read-only\/sample-state only/);
  assert.match(contract, /must not call Firestore, callable Functions, HTTP endpoints or production APIs/);
  assert.match(roleWorkspace, /Department Updates/);
  assert.match(roleWorkspace, /Training Collaboration/);
  assert.match(roleWorkspace, /Technical Review Queue/);
  assert.match(roleWorkspace, /Department Reports/);
});

test("roles do not define schema versions and persistence remains unauthorized", () => {
  assert.match(contract, /V1 and V2 remain data\/persistence versions/);
  assert.match(contract, /roles\/delegation are authorization\/workflow concepts/);
  assert.match(contract, /no role gets its own schema version/);
  assert.match(contract, /NEW_PERSISTENCE=NOT_AUTHORIZED/);
  assert.match(contract, /FIRESTORE_RULES_CHANGE=NOT_AUTHORIZED/);
  assert.match(contract, /PRODUCTION_DEPLOY=NOT_AUTHORIZED/);
  assert.match(contract, /PRODUCTION_DATA_WRITE=NOT_AUTHORIZED/);
  assert.match(contract, /PRODUCTION_CAPABILITY_CHANGE=NOT_AUTHORIZED/);
});
