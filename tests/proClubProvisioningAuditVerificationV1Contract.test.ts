import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const CONTRACT_PATH =
  "docs/PRO_CLUB_PROVISIONING_AUDIT_VERIFICATION_V1_CONTRACT_FREEZE.md";

const contract = readFileSync(CONTRACT_PATH, "utf8");

function section(startHeading: string, nextHeading?: string): string {
  const start = contract.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section: ${startHeading}`);

  if (!nextHeading) return contract.slice(start);

  const end = contract.indexOf(nextHeading, start + startHeading.length);
  assert.notEqual(end, -1, `Missing next section: ${nextHeading}`);
  return contract.slice(start, end);
}

describe("Pro Club Provisioning Audit Verification V1 Contract Freeze", () => {
  it("freezes the exact post-PR62 production baseline and exact two-file scope", () => {
    assert.match(
      contract,
      /Exact production baseline: `d2f2db5fe4fabd6d94ecb188338c5be23a400a1b`/,
    );
    assert.match(
      contract,
      /Branch: `feat\/pro-club-provisioning-v1-audit-verification-contract`/,
    );

    const scope = section("## 1. Baseline, Branch, and Exact Scope", "## 2. Purpose");
    assert.match(scope, /may introduce exactly two files/i);
    assert.match(
      scope,
      /docs\/PRO_CLUB_PROVISIONING_AUDIT_VERIFICATION_V1_CONTRACT_FREEZE\.md/,
    );
    assert.match(
      scope,
      /tests\/proClubProvisioningAuditVerificationV1Contract\.test\.ts/,
    );
    assert.match(scope, /No production source/);
    assert.match(scope, /Firestore Rules/);
    assert.match(scope, /UI/);
    assert.match(scope, /deployment/i);
  });

  it("freezes verification as detection only and never repair", () => {
    const purpose = section("## 2. Purpose", "## 3. Requesting Authority");
    assert.match(purpose, /VERIFY != REPAIR/);
    assert.match(purpose, /READ AUTHORITY != WRITE AUTHORITY/);
    assert.match(purpose, /OBSERVABILITY != TENANT AUTHORITY/);
    assert.match(purpose, /must never repair, mutate, backfill, recreate/i);
  });

  it("requires authenticated canonical ACTIVE SUPERADMIN authority only", () => {
    const authority = section("## 3. Requesting Authority", "## 4. Execution Boundary");

    assert.match(authority, /ACTIVE SUPERADMIN/);
    assert.match(authority, /users\/\{requestingSuperAdminUid\}/);
    assert.match(authority, /role === "SUPERADMIN"/);
    assert.match(authority, /status === "Active"/);
    assert.match(authority, /status === "ACTIVE"/);
    assert.match(authority, /never from request payload/);
    assert.match(authority, /fail closed/i);
  });

  it("rejects membership, staff, Academy, support presentation, and service identity as standalone authority", () => {
    const authority = section("## 3. Requesting Authority", "## 4. Execution Boundary");

    for (const forbidden of [
      "OWNER",
      "ADMIN",
      "MEMBER",
      "TECHNICAL_DIRECTOR",
      "MANAGER",
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "GK_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
      "Academy membership",
      "requestedRole",
      "support presentation",
      "caller-supplied UID",
      "service identity",
    ]) {
      assert.ok(authority.includes(forbidden), `Missing forbidden authority: ${forbidden}`);
    }

    assert.match(authority, /does not grant Pro Club tenant authority/);
  });

  it("freezes a trusted backend boundary with an absolute zero-write rule", () => {
    const execution = section("## 4. Execution Boundary", "## 5. Exact V1 Input Contract");

    assert.match(execution, /trusted backend \/ Admin SDK boundary/);
    assert.match(execution, /strictly read-only/);
    assert.match(execution, /zero Firestore writes/);

    for (const forbiddenMutation of [
      "create",
      "set",
      "update",
      "delete",
      "transaction write",
      "batch write",
      "repair",
      "backfill",
      "owner replacement",
      "membership mutation",
      "staff assignment mutation",
      "invite or claim mutation",
      "audit mutation",
    ]) {
      assert.ok(
        execution.includes(forbiddenMutation),
        `Missing forbidden mutation: ${forbiddenMutation}`,
      );
    }
  });

  it("allows exactly one domain input and forbids discovery", () => {
    const input = section("## 5. Exact V1 Input Contract", "## 6. Exact Read Set and Decision Order");

    assert.match(input, /readonly provisioningId: string/);
    assert.match(input, /contains exactly one domain input/);
    assert.match(input, /exact document lookup only/i);

    for (const forbiddenDiscovery of [
      "collection list",
      "collection query",
      "prefix search",
      "club-wide discovery",
      "owner-wide discovery",
      "audit browsing",
      "enumeration of provisioning records",
    ]) {
      assert.ok(
        input.includes(forbiddenDiscovery),
        `Missing no-discovery boundary: ${forbiddenDiscovery}`,
      );
    }
  });

  it("freezes the minimum exact read set and audit-derived target binding", () => {
    const reads = section("## 6. Exact Read Set and Decision Order", "## 7. Canonical Audit Integrity Contract");

    const expectedOrder = [
      "users/{requestingSuperAdminUid}",
      "proClubProvisioningAudits/{provisioningId}",
      "proClubs/{audit.clubId}",
      "proClubs/{audit.clubId}/members/{audit.ownerUid}",
    ];

    let cursor = -1;
    for (const path of expectedOrder) {
      const next = reads.indexOf(path);
      assert.ok(next > cursor, `Read path missing or out of order: ${path}`);
      cursor = next;
    }

    assert.match(reads, /must not read a caller-supplied club or owner target/);
    assert.match(reads, /No staff document and no invitation document is required/);
  });

  it("freezes the exact nine-field canonical audit whitelist", () => {
    const audit = section("## 7. Canonical Audit Integrity Contract", "## 8. Canonical Resource Integrity Contract");

    const topLevelFields = [
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

    assert.match(audit, /exactly these nine fields and no others/i);
    for (const field of topLevelFields) {
      assert.ok(audit.includes(`\`${field}\``), `Missing audit field: ${field}`);
    }

    assert.match(audit, /schemaVersion === 1/);
    assert.match(audit, /status === "COMPLETED"/);
    assert.match(audit, /\/\^sha256:\[a-f0-9\]\{64\}\$\//);
  });

  it("freezes the exact normalized-request whitelist, bindings, and SHA-256 recomputation", () => {
    const audit = section("## 7. Canonical Audit Integrity Contract", "## 8. Canonical Resource Integrity Contract");

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

    for (const field of normalizedFields) {
      assert.ok(audit.includes(`\`${field}\``), `Missing normalized field: ${field}`);
    }

    assert.match(audit, /normalizedRequest\.provisioningId === audit\.provisioningId/);
    assert.match(audit, /normalizedRequest\.clubId === audit\.clubId/);
    assert.match(audit, /normalizedRequest\.initialOwnerUid === audit\.ownerUid/);
    assert.match(
      audit,
      /normalizedRequest\.requestingSuperAdminUid === audit\.requestingSuperAdminUid/,
    );
    assert.match(audit, /recompute SHA-256/);
    assert.match(audit, /must exactly equal `audit\.requestFingerprint`/);
    assert.match(audit, /must never be reported as VERIFIED/);
  });

  it("requires a canonical ACTIVE club and exact ACTIVE OWNER membership", () => {
    const resources = section("## 8. Canonical Resource Integrity Contract", "## 9. Verification Result Contract");

    assert.match(resources, /canonical Pro Club stored-shape validator/);
    assert.match(resources, /status === "ACTIVE"/);
    assert.match(resources, /"authorizationRole": "OWNER"/);
    assert.match(resources, /"status": "ACTIVE"/);
    assert.match(resources, /No extra fields are permitted/);
    assert.match(resources, /OWNER != staffRole/);
    assert.match(resources, /does not require an invite/);
  });

  it("prevents resource-existence leakage and freezes a minimal privileged result", () => {
    const result = section("## 9. Verification Result Contract", "## 10. Safe Observability Contract");

    for (const status of [
      "VERIFIED",
      "NOT_FOUND",
      "INTEGRITY_FAILURE",
      "UNAUTHORIZED",
      "INTERNAL_ERROR",
    ]) {
      assert.ok(result.includes(`\`${status}\``), `Missing result class: ${status}`);
    }

    assert.match(result, /must not learn whether the requested `provisioningId`, club, owner, or audit exists/);
    assert.match(result, /readonly status: "VERIFIED"/);
    assert.match(result, /readonly provisioningId: string/);
    assert.match(result, /readonly clubId: string/);
    assert.match(result, /readonly ownerUid: string/);
    assert.match(result, /readonly createdAt: string/);
  });

  it("freezes privacy-safe observability without raw security or identity payloads", () => {
    const observability = section("## 10. Safe Observability Contract", "## 11. Fail-Closed Matrix");

    for (const forbiddenLog of [
      "authentication tokens",
      "Authorization headers",
      "service credentials",
      "email",
      "phone",
      "raw Auth user records",
      "raw Firestore user documents",
      "full raw audit payloads",
      "full normalized request snapshots",
    ]) {
      assert.ok(
        observability.includes(forbiddenLog),
        `Missing privacy-safe logging rule: ${forbiddenLog}`,
      );
    }

    assert.match(observability, /stable safe error code/);
  });

  it("freezes a complete fail-closed matrix with zero writes on every outcome", () => {
    const matrix = section("## 11. Fail-Closed Matrix", "## 12. Security and Authority Preservation");

    for (const requiredFailure of [
      "missing/invalid auth",
      "requester not ACTIVE",
      "requester role not exact SUPERADMIN",
      "audit not found",
      "malformed audit",
      "fingerprint mismatch",
      "missing club",
      "malformed or inactive club",
      "missing OWNER membership",
      "OWNER membership not exact ACTIVE OWNER",
      "Firestore read failure",
      "unexpected exception",
    ]) {
      assert.ok(matrix.includes(requiredFailure), `Missing failure case: ${requiredFailure}`);
    }

    assert.match(matrix, /no failure path may fabricate `VERIFIED`/);
    assert.match(matrix, /every path performs zero Firestore writes/);
    assert.match(matrix, /naturally idempotent because the operation is read-only/);
  });

  it("preserves exact tenant authority and canonical ten-role staff separation", () => {
    const preservation = section("## 12. Security and Authority Preservation", "## 13. Required Future Implementation Tests");

    assert.match(preservation, /authorization roles remain exactly `OWNER`, `ADMIN`, `MEMBER`/);
    assert.match(preservation, /football staff roles remain exactly the canonical ten-role set/);
    assert.match(preservation, /`MANAGER` and `TEAM_MANAGER` remain distinct/);
    assert.match(preservation, /`staffRole != authorizationRole`/);
    assert.match(preservation, /staff assignment never creates membership authority/);
    assert.match(preservation, /Academy authority does not grant Pro Club authority/);
    assert.match(preservation, /no list\/discovery capability/);
    assert.match(preservation, /no mutation capability/);
  });

  it("requires future implementation to prove zero writes and no regression", () => {
    const futureTests = section("## 13. Required Future Implementation Tests", "## 14. Succession and Review Gate");

    for (const outcome of [
      "VERIFIED",
      "NOT_FOUND",
      "INTEGRITY_FAILURE",
      "UNAUTHORIZED",
      "INTERNAL_ERROR",
    ]) {
      assert.match(
        futureTests,
        new RegExp(`zero writes occur on ${outcome}`),
        `Missing zero-write future test for ${outcome}`,
      );
    }

    assert.match(futureTests, /existing provisioning service behavior remains unchanged/);
    assert.match(futureTests, /Academy behavior remains unchanged/);
  });

  it("freezes trusted read-only implementation as the next approved slice and keeps UI later", () => {
    const succession = section("## 14. Succession and Review Gate");

    assert.match(
      succession,
      /PRO CLUB PROVISIONING AUDIT VERIFICATION V1 — TRUSTED READ-ONLY SERVICE IMPLEMENTATION/,
    );
    assert.match(succession, /Slice 4 — Privileged Control-Plane UI \/ API Integration/);
    assert.match(succession, /No production implementation, merge to `main`, or production deployment is authorized/);
  });
});
