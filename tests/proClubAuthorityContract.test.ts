import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  hasActiveProClubMembershipAuthority,
  isProClubAuthorizationRole,
  isProClubMembershipStatus,
  isProClubStaffRole,
  isTerminalProClubMembershipStatus,
  resolveActiveProClubStaffRole,
  validateProClubMembership,
} from "../src/lib/proClubModel.js";
import type {
  ProClubAuthorizationRole,
  ProClubMembership,
  ProClubStaffAssignment,
  ProClubStaffRole,
} from "../src/types/ProClub.js";

const club = {
  name: "Lampang FC",
  level: "T1",
  status: "ACTIVE",
} as const;

const clubContext = {
  clubId: "club-lampang",
  documentId: "club-lampang",
};

const memberContext = {
  clubId: "club-lampang",
  documentClubId: "club-lampang",
  userId: "user-coach",
  documentId: "user-coach",
};

const activeMembership = {
  authorizationRole: "MEMBER",
  status: "ACTIVE",
} as const;

const activeStaffAssignment = {
  staffRole: "HEAD_COACH",
  status: "ACTIVE",
} as const;

const CANONICAL_PRO_CLUB_STAFF_ROLES: readonly ProClubStaffRole[] = [
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
];

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
    (role) => !(CANONICAL_PRO_CLUB_STAFF_ROLES as readonly string[]).includes(role as ProClubStaffRole),
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

describe("Pro Club Authority Foundation V1 contract", () => {
  it("freezes OWNER, ADMIN, and MEMBER as membership authorization roles", () => {
    const roles: ProClubAuthorizationRole[] = ["OWNER", "ADMIN", "MEMBER"];
    for (const role of roles) assert.equal(isProClubAuthorizationRole(role), true);

    for (const invalid of [
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
      "COACH",
      "SUPERADMIN",
      "USER",
      "",
      null,
    ]) {
      assert.equal(isProClubAuthorizationRole(invalid), false);
    }
  });

  it("freezes ACTIVE, INACTIVE, LEFT, and REVOKED membership semantics", () => {
    for (const status of ["ACTIVE", "INACTIVE", "LEFT", "REVOKED"]) {
      assert.equal(isProClubMembershipStatus(status), true);
    }
    for (const invalid of ["PENDING", "SUSPENDED", "DELETED", "", null]) {
      assert.equal(isProClubMembershipStatus(invalid), false);
    }

    assert.equal(isTerminalProClubMembershipStatus("ACTIVE"), false);
    assert.equal(isTerminalProClubMembershipStatus("INACTIVE"), false);
    assert.equal(isTerminalProClubMembershipStatus("LEFT"), true);
    assert.equal(isTerminalProClubMembershipStatus("REVOKED"), true);
  });

  it("validates only the exact identity-free membership payload", () => {
    if (!validateProClubMembership(activeMembership, memberContext)) {
      assert.fail("Expected exact canonical membership");
    }
    const narrowed: ProClubMembership = activeMembership;
    assert.equal(narrowed.authorizationRole, "MEMBER");

    for (const forged of [
      { ...activeMembership, id: "user-coach" },
      { ...activeMembership, uid: "user-coach" },
      { ...activeMembership, userId: "user-coach" },
      { ...activeMembership, clubId: "club-lampang" },
      { ...activeMembership, role: "ADMIN" },
      { ...activeMembership, accountRole: "ADMIN" },
      { ...activeMembership, staffRole: "HEAD_COACH" },
    ]) {
      assert.equal(validateProClubMembership(forged, memberContext), false);
    }
  });

  it("fails closed on every club-path or UID-path identity mismatch", () => {
    const mismatches = [
      { ...memberContext, clubId: "club-other" },
      { ...memberContext, documentClubId: "club-other" },
      { ...memberContext, userId: "user-other" },
      { ...memberContext, documentId: "user-other" },
      { ...memberContext, clubId: " club-lampang " },
      { ...memberContext, documentId: "users/user-coach" },
    ];

    for (const context of mismatches) {
      assert.equal(validateProClubMembership(activeMembership, context), false);
    }
    assert.equal(
      validateProClubMembership(
        activeMembership,
        null as unknown as typeof memberContext,
      ),
      false,
    );
  });

  it("requires an active club and active membership for tenant authority", () => {
    assert.equal(
      hasActiveProClubMembershipAuthority(
        club,
        clubContext,
        activeMembership,
        memberContext,
      ),
      true,
    );

    for (const status of ["INACTIVE", "LEFT", "REVOKED"] as const) {
      assert.equal(
        hasActiveProClubMembershipAuthority(
          club,
          clubContext,
          { ...activeMembership, status },
          memberContext,
        ),
        false,
      );
    }

    assert.equal(
      hasActiveProClubMembershipAuthority(
        { ...club, status: "INACTIVE" },
        clubContext,
        activeMembership,
        memberContext,
      ),
      false,
    );
    assert.equal(
      hasActiveProClubMembershipAuthority(
        club,
        { ...clubContext, documentId: "club-other" },
        activeMembership,
        memberContext,
      ),
      false,
    );
  });

  it("supports explicit authorization-role checks and rejects unknown policies", () => {
    const owner = { authorizationRole: "OWNER", status: "ACTIVE" } as const;
    assert.equal(
      hasActiveProClubMembershipAuthority(
        club,
        clubContext,
        owner,
        memberContext,
        ["OWNER", "ADMIN"],
      ),
      true,
    );
    assert.equal(
      hasActiveProClubMembershipAuthority(
        club,
        clubContext,
        activeMembership,
        memberContext,
        ["OWNER", "ADMIN"],
      ),
      false,
    );
    assert.equal(
      hasActiveProClubMembershipAuthority(
        club,
        clubContext,
        activeMembership,
        memberContext,
        [],
      ),
      false,
    );
    assert.equal(
      hasActiveProClubMembershipAuthority(
        club,
        clubContext,
        activeMembership,
        memberContext,
        ["SUPERADMIN" as ProClubAuthorizationRole],
      ),
      false,
    );
  });

  it("never turns an active functional staff assignment into membership authority", () => {
    assert.equal(
      resolveActiveProClubStaffRole(
        club,
        clubContext,
        activeMembership,
        memberContext,
        activeStaffAssignment,
        memberContext,
      ),
      "HEAD_COACH",
    );

    for (const status of ["INACTIVE", "LEFT", "REVOKED"] as const) {
      assert.equal(
        resolveActiveProClubStaffRole(
          club,
          clubContext,
          { ...activeMembership, status },
          memberContext,
          activeStaffAssignment,
          memberContext,
        ),
        null,
      );
    }

    for (const status of ["INACTIVE", "LEFT"] as const) {
      assert.equal(
        resolveActiveProClubStaffRole(
          club,
          clubContext,
          activeMembership,
          memberContext,
          { ...activeStaffAssignment, status },
          memberContext,
        ),
        null,
      );
    }
  });

  it("rejects cross-club and cross-user mixing between membership and staff paths", () => {
    assert.equal(
      resolveActiveProClubStaffRole(
        club,
        clubContext,
        activeMembership,
        memberContext,
        activeStaffAssignment,
        { ...memberContext, clubId: "club-other", documentClubId: "club-other" },
      ),
      null,
    );
    assert.equal(
      resolveActiveProClubStaffRole(
        club,
        clubContext,
        activeMembership,
        memberContext,
        activeStaffAssignment,
        { ...memberContext, userId: "user-other", documentId: "user-other" },
      ),
      null,
    );
  });

  it("keeps authorization and football assignment payload types structurally distinct", () => {
    type ForbiddenIdentityKey = "id" | "clubId" | "uid" | "userId";
    type HasForbiddenIdentity<T> = Extract<keyof T, ForbiddenIdentityKey> extends never
      ? false
      : true;
    type AssertFalse<T extends false> = T;

    const membershipHasIdentity: AssertFalse<
      HasForbiddenIdentity<ProClubMembership>
    > = false;
    const assignmentHasIdentity: AssertFalse<
      HasForbiddenIdentity<ProClubStaffAssignment>
    > = false;
    const membershipFields: (keyof ProClubMembership)[] = [
      "authorizationRole",
      "status",
    ];
    const assignmentFields: (keyof ProClubStaffAssignment)[] = [
      "staffRole",
      "status",
    ];

    assert.equal(membershipHasIdentity, false);
    assert.equal(assignmentHasIdentity, false);
    assert.equal(membershipFields.includes("staffRole" as keyof ProClubMembership), false);
    assert.equal(
      assignmentFields.includes("authorizationRole" as keyof ProClubStaffAssignment),
      false,
    );
  });

  it("proves canonical 10-role model and preserves authority boundaries", () => {
    assert.equal(CANONICAL_PRO_CLUB_STAFF_ROLES.length, 10);
    for (const role of CANONICAL_PRO_CLUB_STAFF_ROLES) {
      assert.equal(isProClubStaffRole(role), true, `${role} must be a valid staff role`);
      assert.equal(isProClubAuthorizationRole(role), false, `${role} must not be an authorization role`);
    }

    assert.equal(isProClubAuthorizationRole("TECHNICAL_DIRECTOR"), false);
    assert.equal(isProClubAuthorizationRole("MANAGER"), false);
    assert.equal(isProClubAuthorizationRole("GK_COACH"), false);
    assert.equal(isProClubAuthorizationRole("TEAM_MANAGER"), false);

    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("TECHNICAL_DIRECTOR"));
    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("MANAGER"));
    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("GK_COACH"));
    assert.ok(CANONICAL_PRO_CLUB_STAFF_ROLES.includes("TEAM_MANAGER"));
    assert.notEqual("MANAGER", "TEAM_MANAGER");

    const contractDoc = readFileSync("docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md", "utf8");
    const parsedRoles = parseAndAssertDocumentSuccessorStaffRoles(
      contractDoc,
      "docs/PRO_CLUB_AUTHORITY_FOUNDATION_V1_FREEZE.md",
    );
    assert.equal(parsedRoles.length, 10);
    assert.deepEqual([...parsedRoles], [...CANONICAL_PRO_CLUB_STAFF_ROLES]);

    for (const role of CANONICAL_PRO_CLUB_STAFF_ROLES) {
      assert.ok(contractDoc.includes(`\`${role}\``), `missing staff role in authority contract doc: ${role}`);
    }
  });

  it("resolves active functional staff roles for new canonical roles without altering authority", () => {
    for (const role of ["TECHNICAL_DIRECTOR", "MANAGER", "GK_COACH", "TEAM_MANAGER"] as const) {
      assert.equal(
        resolveActiveProClubStaffRole(
          club,
          clubContext,
          activeMembership,
          memberContext,
          { staffRole: role, status: "ACTIVE" },
          memberContext,
        ),
        role,
      );
    }
  });
});
