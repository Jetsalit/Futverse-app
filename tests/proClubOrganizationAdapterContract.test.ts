import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const contract = read(
  "docs/PRO_CLUB_ORGANIZATION_ADAPTER_V1_FREEZE.md",
);

const authorityFoundation = read(
  "docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md",
);

const persistenceContract = read(
  "docs/PRO_CLUB_PERSISTENCE_CONTRACT_V1_FREEZE.md",
);

const proClubTypes = read(
  "src/types/ProClub.ts",
);

const readAdapter = read(
  "src/lib/firestore/proClubReadAdapter.ts",
);

const relationshipModel = read(
  "src/lib/superAdminRelationshipReadModel.ts",
);

const accountOrganizationContext = read(
  "src/components/superadmin/superAdminAccountOrganizationContext.ts",
);

const CANONICAL_PRO_CLUB_STAFF_ROLES = [
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
] as const;

const FORBIDDEN_AUTHORIZATION_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;

function extractSuccessorStaffRoleAmendmentSection(docContent: string): string {
  const match = docContent.match(
    /##\s+(?:\d+\.\s+)?Staff Management V1 successor role-set amendment([\s\S]*?)(?=\r?\n##\s+|$)/i,
  );
  assert.ok(match, "Successor role-set amendment section heading not found in document");
  return match[1];
}

function extractFunctionalRoleListBlock(sectionText: string): string {
  const match = sectionText.match(
    /canonical set of exactly 10 roles:([\s\S]*?)(?=MANAGER and TEAM_MANAGER|This successor amendment does NOT change:|$)/i,
  );
  assert.ok(match, "Functional staff-role enumeration block not found in amendment section");
  return match[1];
}

function parseSuccessorStaffRoleTokens(roleListBlock: string): string[] {
  const lines = roleListBlock.split(/\r?\n/);
  const roles: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bulletMatch = trimmed.match(/^-\s*`?([A-Za-z0-9_]+)`?\s*$/);
    if (bulletMatch) {
      roles.push(bulletMatch[1]);
    } else {
      for (const authRole of FORBIDDEN_AUTHORIZATION_ROLES) {
        if (new RegExp(`\\b${authRole}\\b`).test(trimmed)) {
          roles.push(authRole);
        }
      }
    }
  }
  return roles;
}

function assertExactSuccessorStaffRoleSet(
  actualRoles: readonly string[],
  context = "successor amendment",
): void {
  for (const authRole of FORBIDDEN_AUTHORIZATION_ROLES) {
    if (actualRoles.includes(authRole)) {
      throw new Error(
        `Authorization role ${authRole} must not appear in functional staff role list (${context})`,
      );
    }
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const role of actualRoles) {
    if (seen.has(role)) {
      duplicates.push(role);
    }
    seen.add(role);
  }
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate role(s) found in ${context}: ${duplicates.join(", ")}`,
    );
  }

  const unknownRoles = actualRoles.filter(
    (role) => !(CANONICAL_PRO_CLUB_STAFF_ROLES as readonly string[]).includes(role),
  );
  if (unknownRoles.length > 0) {
    throw new Error(
      `Unknown role(s) found in ${context}: ${unknownRoles.join(", ")}`,
    );
  }

  const missingRoles = (CANONICAL_PRO_CLUB_STAFF_ROLES as readonly string[]).filter(
    (role) => !actualRoles.includes(role),
  );
  if (missingRoles.length > 0) {
    throw new Error(
      `Missing canonical role(s) in ${context}: ${missingRoles.join(", ")}`,
    );
  }

  if (actualRoles.length !== CANONICAL_PRO_CLUB_STAFF_ROLES.length) {
    throw new Error(
      `Expected exactly ${CANONICAL_PRO_CLUB_STAFF_ROLES.length} roles, got ${actualRoles.length} in ${context}`,
    );
  }

  assert.equal(actualRoles.includes("MANAGER"), true);
  assert.equal(actualRoles.includes("TEAM_MANAGER"), true);
  assert.notEqual("MANAGER", "TEAM_MANAGER");

  assert.deepEqual(
    [...actualRoles],
    [...CANONICAL_PRO_CLUB_STAFF_ROLES],
    `Role array in ${context} does not match canonical order exactly`,
  );
}

function parseAndAssertDocumentSuccessorStaffRoles(docContent: string, docName: string): string[] {
  const amendmentSection = extractSuccessorStaffRoleAmendmentSection(docContent);
  const roleListBlock = extractFunctionalRoleListBlock(amendmentSection);
  const actualRoles = parseSuccessorStaffRoleTokens(roleListBlock);
  assertExactSuccessorStaffRoleSet(actualRoles, docName);
  return actualRoles;
}

test("Pro Club Organization Adapter V1 Contract Freeze", async (t) => {
  await t.test("freezes one exact club/user read boundary", () => {
    assert.match(
      contract,
      /resolveProClubOrganizationAuthority\(clubId, uid, ops\?\)/,
    );

    assert.match(
      contract,
      /V1 does not enumerate all Pro Clubs for an account\./,
    );

    assert.match(
      contract,
      /V1 does not use collection or collectionGroup discovery\./,
    );
  });

  await t.test("requires existing authority resolver", () => {
    assert.match(
      contract,
      /resolveProClubAuthoritySnapshot\(clubId, uid\)/,
    );

    assert.match(
      readAdapter,
      /export async function resolveProClubAuthoritySnapshot/,
    );

    assert.match(
      contract,
      /must not duplicate or independently recreate Pro Club authority logic/,
    );
  });

  await t.test("preserves canonical Pro Club paths", () => {
    for (const path of [
      "proClubs/{clubId}",
      "proClubs/{clubId}/members/{uid}",
      "proClubs/{clubId}/staff/{uid}",
    ]) {
      assert.ok(contract.includes(path));
      assert.ok(persistenceContract.includes(path));
    }
  });

  await t.test("preserves upstream result states", () => {
    for (const state of [
      "FOUND",
      "MISSING",
      "PERMISSION_DENIED",
      "INVALID_DATA",
      "ERROR",
    ]) {
      assert.match(
        contract,
        new RegExp(`\\b${state}\\b`),
      );
    }

    assert.match(
      contract,
      /PERMISSION_DENIED` to `MISSING/,
    );

    assert.match(
      contract,
      /INVALID_DATA` to `MISSING/,
    );
  });

  await t.test("keeps organization type explicit", () => {
    assert.match(
      contract,
      /organization type exactly `PRO_CLUB`/,
    );

    assert.match(
      relationshipModel,
      /\| "PRO_CLUB"/,
    );
  });

  await t.test("preserves authorization roles separately", () => {
    for (const role of [
      "OWNER",
      "ADMIN",
      "MEMBER",
    ]) {
      assert.match(
        proClubTypes,
        new RegExp(`"${role}"`),
      );

      assert.match(
        contract,
        new RegExp(`\\b${role}\\b`),
      );
    }

    assert.match(
      contract,
      /Authorization role and football staff role must never be collapsed into one\s+generic role field\./,
    );

    assert.match(
      contract,
      /`MEMBER` must not be silently rewritten as `COACH`\./,
    );

    assert.match(
      contract,
      /`OWNER` must not be collapsed into `ADMIN`\./,
    );
  });

  await t.test("preserves football staff roles", () => {
    const parsedRoles = parseAndAssertDocumentSuccessorStaffRoles(
      contract,
      "docs/PRO_CLUB_ORGANIZATION_ADAPTER_V1_FREEZE.md",
    );
    assert.equal(parsedRoles.length, 10);
    assert.deepEqual([...parsedRoles], [...CANONICAL_PRO_CLUB_STAFF_ROLES]);

    for (const role of CANONICAL_PRO_CLUB_STAFF_ROLES) {
      assert.match(
        proClubTypes,
        new RegExp(`"${role}"`),
      );

      assert.match(
        contract,
        new RegExp(`\\b${role}\\b`),
      );
    }
    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("TECHNICAL_DIRECTOR"));
    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("MANAGER"));
    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("GK_COACH"));
    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("TEAM_MANAGER"));
    assert.notEqual("MANAGER", "TEAM_MANAGER");
  });

  await t.test("preserves membership lifecycle", () => {
    for (const status of [
      "ACTIVE",
      "INACTIVE",
      "LEFT",
      "REVOKED",
    ]) {
      assert.match(
        contract,
        new RegExp(`\\b${status}\\b`),
      );
    }

    assert.match(
      contract,
      /`LEFT` and `REVOKED` remain terminal V1 relationship evidence\./,
    );

    assert.match(
      authorityFoundation,
      /`LEFT` and `REVOKED` are terminal in V1\./,
    );
  });

  await t.test("keeps Academy unchanged", () => {
    assert.match(
      contract,
      /Academy authority remains unchanged\./,
    );

    assert.match(
      contract,
      /No compatibility shortcut may make Pro Club use an Academy canonical path\./,
    );
  });

  await t.test("keeps SuperAdmin Pro Club connection closed", () => {
    assert.match(
      contract,
      /SuperAdmin `proClubAuthority` remains `NOT_CONNECTED` in this slice\./,
    );

    assert.match(
      accountOrganizationContext,
      /const PRO_CLUB_NOT_CONNECTED = "NOT_CONNECTED" as const;/,
    );

    assert.match(
      accountOrganizationContext,
      /relationship\.organizationType !== "ACADEMY"/,
    );

    assert.match(
      contract,
      /No `PRO_CLUB` relationship is injected into `SuperAdminUserRelationshipRow`/,
    );
  });

  await t.test("keeps Rules and mutation boundaries closed", () => {
    assert.match(
      contract,
      /This slice does not modify `firestore\.rules`\./,
    );

    assert.match(
      contract,
      /Organization Adapter V1 is read-only\./,
    );

    for (const mutation of [
      "setDoc",
      "updateDoc",
      "deleteDoc",
    ]) {
      assert.match(
        contract,
        new RegExp(`\\b${mutation}\\b`),
      );
    }
  });

  await t.test("keeps UI and integration outside implementation scope", () => {
    assert.match(
      contract,
      /No component wiring is permitted\./,
    );

    assert.match(
      contract,
      /UI connection requires a later dedicated integration slice\./,
    );

    assert.match(
      contract,
      /account-wide Pro Club discovery/,
    );
  });

  await t.test("freezes exact implementation files", () => {
    assert.match(
      contract,
      /src\/lib\/firestore\/proClubOrganizationAdapter\.ts/,
    );

    assert.match(
      contract,
      /tests\/proClubOrganizationAdapter\.test\.ts/,
    );
  });
});
