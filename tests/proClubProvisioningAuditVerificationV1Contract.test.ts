import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const CONTRACT_PATH = "docs/PRO_CLUB_PROVISIONING_AUDIT_VERIFICATION_V1_CONTRACT_FREEZE.md";
const contract = readFileSync(CONTRACT_PATH, "utf8");

function section(startHeading: string, nextHeading?: string): string {
  const start = contract.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section: ${startHeading}`);
  if (!nextHeading) return contract.slice(start);
  const end = contract.indexOf(nextHeading, start + startHeading.length);
  assert.notEqual(end, -1, `Missing next section: ${nextHeading}`);
  return contract.slice(start, end);
}

function numberedBacktickItems(block: string): string[] {
  return Array.from(block.matchAll(/^\d+\. `([^`]+)`$/gm), (match) => match[1]);
}

describe("Pro Club Provisioning Audit Verification V1 Contract Freeze", () => {
  it("freezes exact baseline and two-file contract-only scope", () => {
    const scope = section("## 1. Baseline and exact slice scope", "## 2. Purpose and non-goals");
    assert.match(scope, /d2f2db5fe4fabd6d94ecb188338c5be23a400a1b/);
    assert.match(scope, /may introduce or modify exactly two files/);
    assert.match(scope, /PRO_CLUB_PROVISIONING_AUDIT_VERIFICATION_V1_CONTRACT_FREEZE\.md/);
    assert.match(scope, /proClubProvisioningAuditVerificationV1Contract\.test\.ts/);
    assert.match(scope, /No production source/);
    assert.match(scope, /does not authorize production implementation, merge to `main`, or production deployment/);
  });

  it("freezes verify-not-repair, consistent snapshot, and absolute zero mutation", () => {
    const purpose = section("## 2. Purpose and non-goals", "## 3. Actor terminology and authority separation");
    assert.match(purpose, /VERIFY != REPAIR/);
    assert.match(purpose, /READ AUTHORITY != WRITE AUTHORITY/);
    assert.match(purpose, /OBSERVABILITY != TENANT AUTHORITY/);
    assert.match(purpose, /must never repair, mutate, backfill, recreate/);

    const execution = section(
      "## 5. Trusted execution boundary, consistent snapshot, and zero mutation",
      "## 6. Exact V1 request contract",
    );
    assert.match(execution, /one consistent Firestore snapshot/);
    assert.match(execution, /single Firestore transaction/);
    assert.match(execution, /same read timestamp/);
    assert.match(execution, /reads only/);
    for (const path of [
      "users/{verifyingSuperAdminUid}",
      "proClubProvisioningAudits/{provisioningId}",
      "proClubs/{audit.clubId}",
      "proClubs/{audit.clubId}/members/{audit.ownerUid}",
    ]) {
      assert.ok(execution.includes(path), `Missing consistent-snapshot read: ${path}`);
    }
    assert.match(execution, /strictly read-only/);
    assert.match(execution, /zero Firestore writes/);
    for (const token of ["create", "set", "update", "delete", "transaction write", "batch write", "repair", "backfill", "audit mutation"]) {
      assert.ok(execution.includes(token), `Missing forbidden operation: ${token}`);
    }
  });

  it("separates current verifier from historical provisioning actor", () => {
    const actors = section("## 3. Actor terminology and authority separation", "## 4. Current verifier requesting authority");
    assert.match(actors, /`verifyingSuperAdminUid`/);
    assert.match(actors, /`audit\.requestingSuperAdminUid`/);
    assert.match(actors, /MAY be different/);
    assert.match(actors, /MUST NOT require:[\s\S]*verifyingSuperAdminUid === audit\.requestingSuperAdminUid/);
    assert.match(actors, /historical provisioning actor does not need to remain currently active or currently SUPERADMIN/);
    assert.match(actors, /MUST NOT read `users\/\{audit\.requestingSuperAdminUid\}`/);
  });

  it("requires current authenticated canonical ACTIVE SUPERADMIN only", () => {
    const authority = section(
      "## 4. Current verifier requesting authority",
      "## 5. Trusted execution boundary, consistent snapshot, and zero mutation",
    );
    assert.match(authority, /users\/\{verifyingSuperAdminUid\}/);
    assert.match(authority, /role === "SUPERADMIN"/);
    assert.match(authority, /status === "Active"/);
    assert.match(authority, /status === "ACTIVE"/);
    assert.match(authority, /before any audit existence lookup/);
    for (const forbidden of ["OWNER", "ADMIN", "MEMBER", "TEAM_MANAGER", "Academy membership", "requestedRole", "support presentation", "caller-supplied UID", "service identity"]) {
      assert.ok(authority.includes(forbidden), `Missing forbidden authority: ${forbidden}`);
    }
    assert.match(authority, /never becomes Pro Club tenant authority/);
  });

  it("freezes exact one-key request shape and no discovery", () => {
    const input = section("## 6. Exact V1 request contract", "## 7. Decision order and exact consistent-snapshot read set");
    assert.match(input, /exactly one own key: `provisioningId`/);
    assert.match(input, /arrays are rejected/);
    assert.match(input, /every extra key is rejected/);
    assert.match(input, /already be trimmed, non-empty, contain no slash/);
    for (const forbidden of ["collection list", "collection query", "prefix search", "club-wide discovery", "owner-wide discovery", "audit browsing", "enumeration of provisioning records"]) {
      assert.ok(input.includes(forbidden), `Missing discovery prohibition: ${forbidden}`);
    }
  });

  it("freezes authority-before-existence order inside one consistent Firestore snapshot", () => {
    const reads = section("## 7. Decision order and exact consistent-snapshot read set", "## 8. Replay validator separation");
    const ordered = [
      "cryptographically verify current caller authentication",
      "validate the exact request shape",
      "begin one read-only Firestore transaction",
      "users/{verifyingSuperAdminUid}",
      "proClubProvisioningAudits/{provisioningId}",
      "validate the complete stored audit",
      "proClubs/{audit.clubId}",
      "proClubs/{audit.clubId}/members/{audit.ownerUid}",
      "zero writes",
    ];
    let cursor = -1;
    for (const text of ordered) {
      const next = reads.indexOf(text);
      assert.ok(next > cursor, `Missing/out-of-order decision step: ${text}`);
      cursor = next;
    }
    assert.match(reads, /one consistent read timestamp/);
    assert.match(reads, /Independent sequential document reads outside a consistent-snapshot boundary are forbidden/);
    assert.match(reads, /Unauthorized callers must be rejected before audit existence is read/);
    assert.match(reads, /does not read `users\/\{audit\.requestingSuperAdminUid\}`/);
  });

  it("prevents accidental reuse of replay-only caller equality", () => {
    const replay = section("## 8. Replay validator separation", "## 9. Canonical audit integrity");
    assert.match(replay, /validateStoredAuditOnReplay/);
    assert.match(replay, /MUST NOT reuse that replay-specific caller-equality requirement/);
    assert.match(replay, /does not require an incoming provisioning request fingerprint/);
    assert.match(replay, /does not require current `verifyingSuperAdminUid` to equal historical `audit\.requestingSuperAdminUid`/);
    assert.match(replay, /preserve existing provisioning replay behavior exactly/);
  });

  it("freezes exact audit and all nine normalized-request fields plus all four bindings", () => {
    const audit = section("## 9. Canonical audit integrity", "## 10. Canonical resource integrity");
    const auditFields = [
      "schemaVersion",
      "provisioningId",
      "clubId",
      "ownerUid",
      "requestingSuperAdminUid",
      "requestFingerprint",
      "normalizedRequest",
      "createdAt",
      "status",
    ];
    const auditListStart = audit.indexOf("A provisioning audit is VERIFIED only if it exists and has exactly these nine top-level fields and no others:");
    const auditListEnd = audit.indexOf("Required values and bindings:", auditListStart);
    assert.notEqual(auditListStart, -1, "Missing audit whitelist introduction");
    assert.notEqual(auditListEnd, -1, "Missing audit whitelist terminator");
    const topLevelWhitelist = audit.slice(auditListStart, auditListEnd);
    assert.deepEqual(numberedBacktickItems(topLevelWhitelist), auditFields);
    assert.equal(numberedBacktickItems(topLevelWhitelist).length, 9);
    assert.match(audit, /schemaVersion === 1/);
    assert.match(audit, /status === "COMPLETED"/);
    assert.match(audit, /\^sha256:\[a-f0-9\]\{64\}\$/);

    const normalizedFields = [
      "clubId",
      "country",
      "initialOwnerUid",
      "level",
      "logoUrl",
      "name",
      "provisioningId",
      "requestingSuperAdminUid",
      "shortName",
    ];
    const normalizedListStart = audit.indexOf("`normalizedRequest` must contain exactly these nine fields and no others:");
    const normalizedListEnd = audit.indexOf("Bindings must satisfy:", normalizedListStart);
    assert.notEqual(normalizedListStart, -1, "Missing normalized-request whitelist introduction");
    assert.notEqual(normalizedListEnd, -1, "Missing normalized-request whitelist terminator");
    const normalizedWhitelist = audit.slice(normalizedListStart, normalizedListEnd);
    assert.deepEqual(numberedBacktickItems(normalizedWhitelist), normalizedFields);
    assert.equal(numberedBacktickItems(normalizedWhitelist).length, 9);

    const bindingBlockEnd = audit.indexOf("The verifier reconstructs canonical JSON", normalizedListEnd);
    assert.notEqual(bindingBlockEnd, -1, "Missing normalized binding block terminator");
    const bindingBlock = audit.slice(normalizedListEnd, bindingBlockEnd);
    const bindings = [
      "normalizedRequest.provisioningId === audit.provisioningId",
      "normalizedRequest.clubId === audit.clubId",
      "normalizedRequest.initialOwnerUid === audit.ownerUid",
      "normalizedRequest.requestingSuperAdminUid === audit.requestingSuperAdminUid",
    ];
    for (const binding of bindings) {
      assert.ok(bindingBlock.includes(`\`${binding}\``), `Missing normalized binding: ${binding}`);
    }
    assert.match(audit, /recomputes SHA-256 from the stored normalized request/);
    assert.match(audit, /must exactly equal `audit\.requestFingerprint`/);
  });

  it("requires canonical ACTIVE club and exact ACTIVE OWNER without staff dependency", () => {
    const resources = section("## 10. Canonical resource integrity", "## 11. Result and error contract");
    assert.match(resources, /same consistent Firestore snapshot/);
    assert.match(resources, /existing canonical stored Pro Club validator/);
    assert.match(resources, /status === "ACTIVE"/);
    assert.match(resources, /"authorizationRole": "OWNER"/);
    assert.match(resources, /No extra membership fields are permitted/);
    assert.match(resources, /OWNER != staffRole/);
    assert.match(resources, /No football staff assignment, invitation, onboarding claim, Academy membership/);
  });

  it("prevents unauthorized existence leakage and raw-sensitive output", () => {
    const result = section("## 11. Result and error contract", "## 12. Safe observability");
    for (const status of ["VERIFIED", "NOT_FOUND", "INTEGRITY_FAILURE", "UNAUTHORIZED", "INVALID_REQUEST", "INTERNAL_ERROR"]) {
      assert.ok(result.includes(`\`${status}\``), `Missing result classification: ${status}`);
    }
    assert.match(result, /must not learn whether the audit, club, or owner exists/);
    assert.match(result, /readonly status: "VERIFIED"/);
    assert.match(result, /never exposes tokens, Authorization headers, raw user documents, email, phone/);
  });

  it("freezes privacy-safe observability", () => {
    const logs = section("## 12. Safe observability", "## 13. Fail-closed matrix");
    for (const forbidden of ["authentication tokens", "Authorization headers", "App Check tokens", "service credentials", "email", "phone", "raw Auth user records", "raw Firestore user documents", "full raw audit payloads", "full normalized request snapshots"]) {
      assert.ok(logs.includes(forbidden), `Missing logging prohibition: ${forbidden}`);
    }
    assert.match(logs, /stable safe errors/);
  });

  it("freezes fail-closed outcomes including snapshot failure with zero writes", () => {
    const matrix = section("## 13. Fail-closed matrix", "## 14. Preserved FutVerse boundaries");
    for (const required of [
      "missing/invalid authentication",
      "current verifier inactive",
      "array body",
      "extra key",
      "audit not found",
      "fingerprint mismatch",
      "inactive club",
      "non-exact ACTIVE OWNER membership",
      "inability to obtain one consistent Firestore snapshot",
      "Firestore read failure",
      "unexpected exception",
    ]) {
      assert.ok(matrix.includes(required), `Missing fail-closed case: ${required}`);
    }
    assert.match(matrix, /never VERIFIED/);
    assert.match(matrix, /no path may fabricate VERIFIED/);
    assert.match(matrix, /every path performs zero Firestore writes/);
  });

  it("preserves tenant/staff/Academy boundaries", () => {
    const preserved = section("## 14. Preserved FutVerse boundaries", "## 15. Required implementation regressions");
    assert.match(preserved, /authorization roles remain exactly `OWNER`, `ADMIN`, `MEMBER`/);
    assert.match(preserved, /canonical ten-role set/);
    assert.match(preserved, /`MANAGER` and `TEAM_MANAGER` remain distinct/);
    assert.match(preserved, /`staffRole != authorizationRole`/);
    assert.match(preserved, /Academy authority does not grant Pro Club authority/);
    assert.match(preserved, /no list\/discovery capability/);
    assert.match(preserved, /no mutation capability/);
  });

  it("requires future implementation regression coverage for all review findings", () => {
    const future = section("## 15. Required implementation regressions", "## 16. Succession and review gate");
    assert.match(future, /different ACTIVE SUPERADMIN can verify an audit created by another historical SuperAdmin/);
    assert.match(future, /historical provisioning actor does not need to remain currently ACTIVE\/SUPERADMIN/);
    assert.match(future, /request body rejects arrays, missing key, and every extra key/);
    assert.match(future, /exact normalized-request whitelist and all four audit bindings are enforced/);
    assert.match(future, /does not inherit replay-only current-caller equality or incoming-fingerprint requirements/);
    assert.match(future, /canonical verifier, audit, club, and OWNER membership reads share one consistent Firestore read timestamp/);
    assert.match(future, /concurrent club or OWNER state change cannot produce VERIFIED from a mixed-time snapshot/);
    assert.match(future, /failure to obtain the consistent read snapshot fails closed with zero writes/);
    assert.match(future, /existing Provisioning V1 service and replay behavior remain unchanged/);
    assert.match(future, /zero writes occur on VERIFIED, NOT_FOUND, INTEGRITY_FAILURE, UNAUTHORIZED, INVALID_REQUEST, and INTERNAL_ERROR/);
  });

  it("freezes trusted read-only service as next slice and keeps UI later", () => {
    const succession = section("## 16. Succession and review gate");
    assert.match(succession, /current verifier identity is explicitly separated from historical provisioning-requester evidence/);
    assert.match(succession, /exact one-key request-body shape is explicit/);
    assert.match(succession, /one read-only consistent Firestore snapshot/);
    assert.match(succession, /all nine fields and all four bindings explicitly/);
    assert.match(succession, /TRUSTED READ-ONLY SERVICE IMPLEMENTATION/);
    assert.match(succession, /Slice 4 — Privileged Control-Plane UI \/ API Integration/);
    assert.match(succession, /No production implementation, merge to `main`, or production deployment is authorized/);
  });
});
