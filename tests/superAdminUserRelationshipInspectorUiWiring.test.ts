import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

const componentPath = path.join(
  repoRoot,
  "src/components/superadmin/SuperAdminUserRelationshipInspector.tsx",
);

const portalPath = path.join(
  repoRoot,
  "src/components/SuperadminPortal.tsx",
);

function readPortal() {
  return fs
    .readFileSync(portalPath, "utf8")
    .replace(/\r\n/g, "\n");
}

function readInspectorComponent() {
  assert.equal(
    fs.existsSync(componentPath),
    true,
    "2C.2B Inspector UI component must exist before this contract can pass",
  );

  return fs
    .readFileSync(componentPath, "utf8")
    .replace(/\r\n/g, "\n");
}

describe("SuperAdmin User Relationship Inspector UI wiring", () => {
  it("1. keeps the Inspector UI presentation-only with no Firebase or mutation ownership", () => {
    const source = readInspectorComponent();

    assert.doesNotMatch(
      source,
      /firebase|firestore|getDocs|getDoc\(|setDoc\(|updateDoc\(|deleteDoc\(|runTransaction|writeBatch|loadSuperAdminRelationshipInventory/i,
      "Inspector UI must not own authoritative persistence",
    );

    assert.doesNotMatch(
      source,
      /\b(assign|revoke|transfer|approve|reject)\b.*\b(membership|authority)\b/i,
      "2C.2B must not introduce controlled membership actions",
    );
  });

  it("2. consumes the audited 2C.2A pure inspector builder instead of rebuilding authority logic", () => {
    const source = readInspectorComponent();

    assert.match(
      source,
      /buildSuperAdminUserRelationshipInspectorModel/,
      "Inspector UI must consume the audited pure builder",
    );

    assert.match(
      source,
      /superAdminUserRelationshipInspectorModel/,
      "Inspector UI must import the 2C.2A model",
    );

    assert.doesNotMatch(
      source,
      /accountRole\s*===\s*["'](?:ADMIN|COACH|PLAYER|PARENT)["']/,
      "Account role must never be reinterpreted as organization authority",
    );
  });

  it("3. renders every fail-closed lifecycle state explicitly", () => {
    const source = readInspectorComponent();

    for (const state of [
      "LOADING",
      "UNAVAILABLE",
      "OUT_OF_SYNC",
      "READY",
    ]) {
      assert.match(
        source,
        new RegExp(`["']${state}["']`),
        `Inspector UI must explicitly handle ${state}`,
      );
    }

    assert.match(
      source,
      /onRefresh/,
      "Inspector UI must expose the existing shared refresh path",
    );
  });

  it("4. distinguishes resolved Current Authority from inspectable conflicting evidence", () => {
    const source = readInspectorComponent();

    assert.match(
      source,
      /UNRESOLVED_CONFLICT/,
      "Conflict state must be rendered explicitly",
    );

    assert.match(
      source,
      /Authority unresolved/i,
      "Conflict must never be presented as resolved authority",
    );

    assert.match(
      source,
      /Current Authority/i,
      "Resolved organization authority must have an explicit section",
    );

    assert.match(
      source,
      /Current Evidence/i,
      "Current evidence must remain separately inspectable",
    );
  });

  it("5. exposes organization evidence, history, legacy evidence and integrity issues without collapsing them", () => {
    const source = readInspectorComponent();

    for (const token of [
      "Historical Relationships",
      "Legacy Evidence",
      "Integrity Issues",
      "membershipSource",
      "playerId",
      "futId",
      "playerName",
      "source",
      "integrity",
    ]) {
      assert.match(
        source,
        new RegExp(token),
        `Inspector UI must preserve ${token}`,
      );
    }

    assert.match(
      source,
      /proClubAuthority/,
      "Coverage must preserve explicit Pro Club authority state",
    );
  });

  it("6. Portal imports the dedicated Inspector UI instead of embedding a second authority implementation", () => {
    const portal = readPortal();

    assert.match(
      portal,
      /import\s+SuperAdminUserRelationshipInspector\s+from\s+["']\.\/superadmin\/SuperAdminUserRelationshipInspector["'];?/,
      "Portal must import the dedicated Inspector UI",
    );

    assert.equal(
      (
        portal.match(
          /<SuperAdminUserRelationshipInspector\b/g,
        ) || []
      ).length,
      1,
      "Portal must mount exactly one Inspector UI",
    );
  });

  it("7. Portal wires Inspector authority using exact selected UID and the existing shared relationship inventory only", () => {
    const portal = readPortal();

    const mount =
      portal.match(
        /<SuperAdminUserRelationshipInspector[\s\S]*?\/>/,
      )?.[0] || "";

    assert.notEqual(
      mount,
      "",
      "Inspector mount must exist",
    );

    assert.match(
      mount,
      /userId=\{selectedUser\.id\}/,
      "Inspector must use selectedUser.id as exact canonical UID",
    );

    assert.match(
      mount,
      /context=\{accountOrganizationContextFor\(selectedUser\.id\)\}/,
      "Inspector must reuse the existing organization context builder",
    );

    assert.match(
      mount,
      /row=\{relationshipRowsByUserId\.get\(selectedUser\.id\)\}/,
      "Inspector must reuse the exact-UID shared relationship row",
    );

    assert.match(
      mount,
      /onRefresh=\{refreshRelationshipInventory\}/,
      "Inspector refresh must delegate to the existing shared owner",
    );

    assert.doesNotMatch(
      mount,
      /email|name/i,
      "Inspector authority wiring must never join by email or name",
    );
  });

  it("8. mounts relationship inspection only in READ_ONLY_PROFILE and keeps Account Role separate from organization authority", () => {
    const portal = readPortal();

    const readOnlyBranch =
      portal.indexOf(
        'if (reviewMode === "READ_ONLY_PROFILE")',
      );

    const inspectorMount =
      portal.indexOf(
        "<SuperAdminUserRelationshipInspector",
      );

    const approvalBranch =
      portal.indexOf(
        "if (!isPendingAccountStatus(selectedUser.status))",
        readOnlyBranch,
      );

    assert.ok(
      readOnlyBranch >= 0,
      "existing READ_ONLY_PROFILE branch must remain",
    );

    assert.ok(
      inspectorMount > readOnlyBranch,
      "Inspector must be mounted after entering READ_ONLY_PROFILE",
    );

    assert.ok(
      approvalBranch > inspectorMount,
      "Inspector mount must stay inside the read-only branch and before approval workflow",
    );

    assert.doesNotMatch(
      portal,
      /Authoritative Account Role/,
      "Account-level role must not be labelled as organization authority",
    );

    assert.match(
      portal,
      />\s*Account Role\s*</,
      "Profile must label the account-level role explicitly as Account Role",
    );
  });
});