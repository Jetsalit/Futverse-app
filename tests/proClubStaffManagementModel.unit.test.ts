import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isProClubStaffRole,
  isProClubAuthorizationRole,
  isProClubMembershipStatus,
  isProClubStaffStatus,
} from "../src/lib/proClubModel";
import { staffRoleLabels } from "../src/lib/proClubOnboarding";
import type {
  ProClubStaffRole,
  ProClubAuthorizationRole,
} from "../src/types/ProClub";

test("Pro Club Staff Management Model V1 - Role Model & Contract Extension", async (t) => {
  const CANONICAL_STAFF_ROLES: readonly ProClubStaffRole[] = [
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

  await t.test("1. TECHNICAL_DIRECTOR accepted by isProClubStaffRole", () => {
    assert.equal(isProClubStaffRole("TECHNICAL_DIRECTOR"), true);
  });

  await t.test("2. MANAGER accepted by isProClubStaffRole", () => {
    assert.equal(isProClubStaffRole("MANAGER"), true);
  });

  await t.test("3. GK_COACH accepted by isProClubStaffRole", () => {
    assert.equal(isProClubStaffRole("GK_COACH"), true);
  });

  await t.test("4. TEAM_MANAGER remains accepted by isProClubStaffRole", () => {
    assert.equal(isProClubStaffRole("TEAM_MANAGER"), true);
  });

  await t.test("5. all legacy roles remain accepted", () => {
    const legacyRoles: ProClubStaffRole[] = [
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ];
    for (const role of legacyRoles) {
      assert.equal(isProClubStaffRole(role), true);
    }
  });

  await t.test("6. exactly 10 canonical roles are recognized", () => {
    assert.equal(CANONICAL_STAFF_ROLES.length, 10);
    for (const role of CANONICAL_STAFF_ROLES) {
      assert.equal(isProClubStaffRole(role), true);
    }
  });

  await t.test("7. arbitrary and unknown roles are rejected", () => {
    const invalidRoles = [
      "COACH",
      "DIRECTOR",
      "SCOUT",
      "PRESIDENT",
      "MEDIC",
      "BALLBOY",
      "SUPERADMIN",
      "ROOT",
      "UNKNOWN",
      "",
      null,
      undefined,
      123,
      {},
      [],
    ];
    for (const invalid of invalidRoles) {
      assert.equal(isProClubStaffRole(invalid), false);
    }
  });

  await t.test("8. lowercase and untrusted variants are rejected", () => {
    const variants = [
      "technical_director",
      "Technical_Director",
      "manager",
      "Manager",
      "gk_coach",
      "Gk_Coach",
      "team_manager",
      "Team_Manager",
      "head_coach",
      "assistant_coach",
      "fitness_coach",
      "analyst",
      "physio",
      "staff",
      " MANAGER ",
      "TEAM_MANAGER\n",
    ];
    for (const variant of variants) {
      assert.equal(isProClubStaffRole(variant), false);
    }
  });

  await t.test("9. authorization roles remain OWNER, ADMIN, and MEMBER only", () => {
    const canonicalAuthRoles: ProClubAuthorizationRole[] = [
      "OWNER",
      "ADMIN",
      "MEMBER",
    ];
    for (const authRole of canonicalAuthRoles) {
      assert.equal(isProClubAuthorizationRole(authRole), true);
      // Authorization roles must NOT be valid staff roles
      assert.equal(isProClubStaffRole(authRole), false);
    }

    // Operational staff roles must NOT be valid authorization roles
    for (const staffRole of CANONICAL_STAFF_ROLES) {
      assert.equal(isProClubAuthorizationRole(staffRole), false);
    }

    // Invalid authorization roles
    for (const invalid of ["SUPERADMIN", "COACH", "DIRECTOR", "", null, undefined]) {
      assert.equal(isProClubAuthorizationRole(invalid), false);
    }
  });

  await t.test("10. display labels exist for all 10 staff roles", () => {
    const labelKeys = Object.keys(staffRoleLabels);
    assert.equal(labelKeys.length, 10);
    for (const role of CANONICAL_STAFF_ROLES) {
      assert.ok(
        typeof staffRoleLabels[role] === "string" && staffRoleLabels[role].length > 0,
        `Missing or empty label for role ${role}`,
      );
    }
  });

  await t.test("11. MANAGER label is exactly 'Manager'", () => {
    assert.equal(staffRoleLabels.MANAGER, "Manager");
    assert.equal(staffRoleLabels.TECHNICAL_DIRECTOR, "Technical Director");
    assert.equal(staffRoleLabels.GK_COACH, "GK Coach");
  });

  await t.test("12. TEAM_MANAGER remains independent from MANAGER", () => {
    assert.notEqual("TEAM_MANAGER", "MANAGER");
    assert.equal(staffRoleLabels.TEAM_MANAGER, "Team manager");
    assert.equal(staffRoleLabels.MANAGER, "Manager");
    assert.notEqual(staffRoleLabels.TEAM_MANAGER, staffRoleLabels.MANAGER);
  });

  await t.test("13. Firestore role validator contains all 10 canonical values", () => {
    const rulesContent = fs.readFileSync("firestore.rules", "utf-8");

    const validatorMatch = rulesContent.match(
      /function\s+validProClubStaffRoleV1\s*\(\s*role\s*\)\s*\{\s*return\s+role\s+in\s+\[([\s\S]*?)\];/s,
    );
    assert.ok(validatorMatch, "validProClubStaffRoleV1 function not found in firestore.rules");

    const rolesInRule = (validatorMatch[1].match(/'([A-Z_]+)'/g) || []).map((r) =>
      r.replace(/'/g, ""),
    );

    assert.equal(rolesInRule.length, 10);
    for (const role of CANONICAL_STAFF_ROLES) {
      assert.ok(
        rolesInRule.includes(role),
        `Role ${role} missing from Firestore validProClubStaffRoleV1`,
      );
    }
  });

  await t.test("14. Firestore client update/delete fail-closed remains unchanged", () => {
    const rulesContent = fs.readFileSync("firestore.rules", "utf-8");

    // Match the proClubs block first to avoid academy members block
    const proClubBlockMatch = rulesContent.match(
      /match\s+\/proClubs\/\{clubId\}\s*\{([\s\S]*?)(?:match\s+\/proPlayers|\Z)/,
    );
    assert.ok(proClubBlockMatch, "match /proClubs/{clubId} block not found");
    const proClubRules = proClubBlockMatch[1];

    // Match the members block within proClubs
    const membersBlockMatch = proClubRules.match(
      /match\s+\/members\/\{uid\}\s*\{([\s\S]*?)\}/,
    );
    assert.ok(membersBlockMatch, "match /members/{uid} block not found in proClubs");
    assert.match(
      membersBlockMatch[1],
      /allow\s+update,\s*delete:\s*if\s+false;/,
      "proClubs members update, delete must remain 'if false'",
    );

    // Match the staff block within proClubs
    const staffBlockMatch = proClubRules.match(
      /match\s+\/staff\/\{uid\}\s*\{([\s\S]*?)\}/,
    );
    assert.ok(staffBlockMatch, "match /staff/{uid} block not found in proClubs");
    assert.match(
      staffBlockMatch[1],
      /allow\s+update,\s*delete:\s*if\s+false;/,
      "proClubs staff update, delete must remain 'if false'",
    );
  });

  await t.test("15. lifecycle statuses remain untouched", () => {
    assert.equal(isProClubMembershipStatus("ACTIVE"), true);
    assert.equal(isProClubMembershipStatus("INACTIVE"), true);
    assert.equal(isProClubMembershipStatus("LEFT"), true);
    assert.equal(isProClubMembershipStatus("REVOKED"), true);
    assert.equal(isProClubMembershipStatus("PENDING"), false);

    assert.equal(isProClubStaffStatus("ACTIVE"), true);
    assert.equal(isProClubStaffStatus("INACTIVE"), true);
    assert.equal(isProClubStaffStatus("LEFT"), true);
    assert.equal(isProClubStaffStatus("REVOKED"), false);
  });
});
