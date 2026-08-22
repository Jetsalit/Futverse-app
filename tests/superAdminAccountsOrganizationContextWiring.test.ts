import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

function readSource(relativePath: string): string {
  return fs
    .readFileSync(path.join(repoRoot, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

function readSourceIfPresent(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    return "";
  }

  return fs
    .readFileSync(absolutePath, "utf8")
    .replace(/\r\n/g, "\n");
}

const portalSource = readSource(
  "src/components/SuperadminPortal.tsx",
);

const organizationCellsSource = readSourceIfPresent(
  "src/components/superadmin/SuperAdminAccountOrganizationCells.tsx",
);

const accountsStart =
  portalSource.indexOf(
    '{activeTab === "users" && (',
  );

const accountsEnd =
  portalSource.indexOf(
    '{activeTab === "academies" && (',
    accountsStart,
  );

assert.ok(
  accountsStart >= 0 &&
    accountsEnd > accountsStart,
  "Accounts render boundary must remain discoverable",
);

const accountsSource =
  portalSource.slice(
    accountsStart,
    accountsEnd,
  );

describe("SuperAdmin Accounts organization-context wiring", () => {
  it("1. maps every non-ready shared inventory lifecycle state fail-closed for the Account context builder", () => {
    assert.match(
      portalSource,
      /buildSuperAdminAccountOrganizationContext/,
    );

    const stateIndex =
      portalSource.indexOf(
        "const accountOrganizationInventoryState",
      );

    assert.notEqual(
      stateIndex,
      -1,
      "Accounts must derive the context inventory state from the shared owner",
    );

    const stateBlock =
      portalSource.slice(
        stateIndex,
        stateIndex + 900,
      );

    assert.match(
      stateBlock,
      /relationshipInventoryState\.status === "READY"/,
    );

    assert.match(
      stateBlock,
      /relationshipInventoryState\.status === "UNAVAILABLE"/,
    );

    assert.match(
      stateBlock,
      /: "LOADING"/,
      "IDLE, STALE and other non-authoritative states must collapse to LOADING instead of being treated as authority",
    );
  });

  it("2. indexes authoritative relationship rows by exact canonical userId only when the shared inventory is READY", () => {
    const mapIndex =
      portalSource.indexOf(
        "const relationshipRowsByUserId",
      );

    assert.notEqual(
      mapIndex,
      -1,
      "Accounts must create an exact-UID relationship lookup",
    );

    const mapBlock =
      portalSource.slice(
        mapIndex,
        mapIndex + 1400,
      );

    assert.match(
      mapBlock,
      /relationshipInventoryState\.status === "READY"/,
    );

    assert.match(
      mapBlock,
      /relationshipInventoryState\.inventory\.rows/,
    );

    assert.match(
      mapBlock,
      /row\.userId/,
    );

    assert.match(
      mapBlock,
      /Map/,
    );

    assert.doesNotMatch(
      mapBlock,
      /row\.email/,
      "email must never be used as the organization-authority join key",
    );

    assert.doesNotMatch(
      mapBlock,
      /row\.name/,
      "display name must never be used as the organization-authority join key",
    );
  });

  it("3. builds each Account organization context from that Account exact UID and its exact authoritative row", () => {
    const helperIndex =
      portalSource.indexOf(
        "const accountOrganizationContextFor",
      );

    assert.notEqual(
      helperIndex,
      -1,
      "Accounts must expose one narrow organization-context helper",
    );

    const helperBlock =
      portalSource.slice(
        helperIndex,
        helperIndex + 1200,
      );

    assert.match(
      helperBlock,
      /\buserId(?:\s*:\s*userId)?\s*,/,
    );

    assert.match(
      helperBlock,
      /inventoryState:\s*accountOrganizationInventoryState/,
    );

    assert.match(
      helperBlock,
      /relationshipRowsByUserId\.get\(userId\)/,
    );

    assert.match(
      accountsSource,
      /accountOrganizationContextFor\(user\.id\)/,
      "each visible Account row must request context with the canonical Firestore user document ID",
    );
  });

  it("4. Accounts labels organization authority separately from account-level status and role controls", () => {
    assert.match(
      accountsSource,
      />Organization Context</,
    );

    assert.match(
      accountsSource,
      />Current Authority</,
    );

    assert.match(
      accountsSource,
      />Account Status</,
    );

    assert.match(
      accountsSource,
      />Account Role</,
    );

    assert.doesNotMatch(
      accountsSource,
      />Authoritative Status</,
    );

    assert.doesNotMatch(
      accountsSource,
      />Authoritative Role</,
    );
  });

  it("5. existing Account Status and Account Role mutation controls remain intact and separate from organization authority", () => {
    assert.match(
      accountsSource,
      /value=\{normalizeManagedAccountStatus\(user\.status\)\}/,
    );

    assert.match(
      accountsSource,
      /handleUpdateStatus\(user,\s*e\.target\.value\)/,
    );

    assert.match(
      accountsSource,
      /value=\{user\.role \|\| ""\}/,
    );

    assert.match(
      accountsSource,
      /handleUpdateRole\(user,\s*e\.target\.value\)/,
    );

    assert.match(
      accountsSource,
      /SAFE_ACCOUNT_ROLES\.map/,
    );
  });

  it("6. organization cells render READY, OUT_OF_SYNC, LOADING and UNAVAILABLE as explicit presentation states with no Firestore ownership", () => {
    assert.notEqual(
      organizationCellsSource,
      "",
      "organization presentation component must exist",
    );

    for (const state of [
      "READY",
      "OUT_OF_SYNC",
      "LOADING",
      "UNAVAILABLE",
    ]) {
      assert.match(
        organizationCellsSource,
        new RegExp(`context\\.state === "${state}"`),
        `component must handle ${state} explicitly`,
      );
    }

    assert.doesNotMatch(
      organizationCellsSource,
      /firebase|firestore|loadSuperAdminRelationshipInventory/i,
      "Accounts presentation must never own persistence or authoritative reads",
    );

    assert.match(
      organizationCellsSource,
      /Refresh required/,
      "OUT_OF_SYNC must be visibly different from unassigned authority",
    );
  });

  it("7. READY organization presentation keeps current and historical relationships separate and renders every relationship", () => {
    assert.match(
      organizationCellsSource,
      /context\.presentation\.current/,
    );

    assert.match(
      organizationCellsSource,
      /context\.presentation\.historical/,
    );

    assert.match(
      organizationCellsSource,
      /current\.map/,
    );

    assert.match(
      organizationCellsSource,
      /historical\.map/,
    );

    assert.match(
      organizationCellsSource,
      /organizationName \|\| .*organizationId/,
    );

    assert.match(
      organizationCellsSource,
      /Current/,
    );

    assert.match(
      organizationCellsSource,
      /Historical/,
    );
  });

  it("8. Current Authority uses organization relationship role/status, never account role, and keeps Pro Club coverage explicitly unconnected", () => {
    assert.match(
      organizationCellsSource,
      /relationship\.role/,
    );

    assert.match(
      organizationCellsSource,
      /relationship\.status/,
    );

    assert.match(
      organizationCellsSource,
      /context\.coverage\.proClubAuthority === "NOT_CONNECTED"/,
    );

    assert.match(
      organizationCellsSource,
      /Pro Club authority not connected/,
    );

    assert.match(
      organizationCellsSource,
      /No Academy relationship in connected V1 coverage/,
    );

    assert.doesNotMatch(
      organizationCellsSource,
      /presentation\.accountRole/,
      "global/account profile role must not be presented as current organization authority",
    );
  });
  it("9. conflicting canonical evidence must never be presented as resolved Current Authority", () => {
    const readyIndex =
      organizationCellsSource.indexOf(
        'if (context.state === "READY")',
      );

    assert.notEqual(
      readyIndex,
      -1,
      "READY organization presentation must remain explicit",
    );

    const readyBlock =
      organizationCellsSource.slice(readyIndex);

    assert.match(
      readyBlock,
      /context\.presentation\.integrity === "CONFLICT"/,
      "Current Authority must explicitly guard canonical conflict",
    );

    assert.match(
      readyBlock,
      /Authority unresolved/,
      "canonical conflict must be displayed as unresolved authority",
    );

    const conflictGuardIndex =
      readyBlock.indexOf(
        'context.presentation.integrity === "CONFLICT"',
      );

    const authorityMapIndex =
      readyBlock.indexOf(
        'current.map((relationship)',
        conflictGuardIndex,
      );

    assert.ok(
      conflictGuardIndex >= 0 &&
        authorityMapIndex > conflictGuardIndex,
      "conflict guard must precede resolved Current Authority relationship rendering",
    );
  });
});
