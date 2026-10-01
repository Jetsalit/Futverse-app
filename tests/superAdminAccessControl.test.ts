import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "firebase/firestore";
import {
  normalizeAccessEmail,
  resolveAccountByExactEmail,
  resolveAcademyAccessState,
  resolveProClubAccessState,
} from "../src/lib/superAdminAccessControl";

const accounts = [
  {
    id: "coach-uid",
    name: "Coach Jet",
    email: "CoachJet@example.com",
    role: "COACH",
    status: "Active",
  },
  {
    id: "parent-uid",
    name: "Parent Jet",
    email: "parent@example.com",
    role: "PARENT",
    status: "ACTIVE",
  },
];

function academyMembership(overrides: Record<string, unknown> = {}) {
  return {
    userId: "coach-uid",
    academyId: "academy-a",
    role: "COACH",
    status: "ACTIVE",
    source: "CLAIM_APPROVAL",
    approvalClaimId: "claim-a",
    joinedAt: Timestamp.fromMillis(1000),
    joinedBy: "superadmin-uid",
    updatedAt: Timestamp.fromMillis(1000),
    ...overrides,
  };
}

function fitnessSpecialty(status = "ACTIVE") {
  return {
    schemaVersion: 1,
    specialty: "FITNESS_COACH",
    status,
    createdAt: Timestamp.fromMillis(1000),
    createdBy: "superadmin-uid",
    updatedAt: Timestamp.fromMillis(1000),
    updatedBy: "superadmin-uid",
  };
}

test("normalizes email by trimming and lowercasing, and rejects empty input", () => {
  assert.equal(normalizeAccessEmail("  CoachJet@Example.COM "), "coachjet@example.com");
  assert.equal(normalizeAccessEmail("  "), null);
  assert.equal(normalizeAccessEmail(null), null);
});

test("resolves one exact normalized email to its canonical account UID", () => {
  const result = resolveAccountByExactEmail(accounts, " coachjet@EXAMPLE.com ");

  assert.equal(result.state, "FOUND");
  if (result.state !== "FOUND") assert.fail("Expected the exact account match.");
  assert.equal(result.user.id, "coach-uid");
  assert.equal(result.user.role, "COACH");
});

test("does not treat a partial email as an account match", () => {
  assert.equal(resolveAccountByExactEmail(accounts, "coachjet").state, "NOT_FOUND");
});

test("fails closed when normalized email matches more than one account", () => {
  const result = resolveAccountByExactEmail(
    [...accounts, { ...accounts[0], id: "duplicate-uid", email: "coachjet@EXAMPLE.com" }],
    "CoachJet@example.com",
  );

  assert.equal(result.state, "AMBIGUOUS");
});

test("counts an exact email match even when that duplicate lacks a canonical UID", () => {
  const result = resolveAccountByExactEmail(
    [...accounts, { email: "coachjet@example.com", role: "COACH", status: "Active" }],
    "coachjet@example.com",
  );

  assert.equal(result.state, "AMBIGUOUS");
});

test("rejects an inactive account resolved by exact email", () => {
  const result = resolveAccountByExactEmail(
    [{ ...accounts[0], status: "Inactive" }],
    "coachjet@example.com",
  );

  assert.equal(result.state, "INELIGIBLE");
});

test("rejects a SuperAdmin account resolved by exact email", () => {
  const result = resolveAccountByExactEmail(
    [{ ...accounts[0], role: "SUPERADMIN" }],
    "coachjet@example.com",
  );

  assert.equal(result.state, "INELIGIBLE");
});

test("assigns Pro Club membership and staff role when both are absent", () => {
  const result = resolveProClubAccessState(null, null, "GK_COACH");

  assert.equal(result.state, "ASSIGN");
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.actionType, "ACCESS_ASSIGNED");
});

test("adds a staff role to an active MEMBER without replacing membership authority", () => {
  const result = resolveProClubAccessState(
    { authorizationRole: "MEMBER", status: "ACTIVE" },
    null,
    "GK_COACH",
  );

  assert.equal(result.state, "ASSIGN_STAFF_ROLE");
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.actionType, "STAFF_ROLE_ASSIGNED");
});

test("does not write when the active Pro Club role already matches", () => {
  const result = resolveProClubAccessState(
    { authorizationRole: "MEMBER", status: "ACTIVE" },
    { staffRole: "GK_COACH", status: "ACTIVE" },
    "GK_COACH",
  );

  assert.equal(result.state, "ALREADY_ACTIVE");
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.actionType, null);
});

test("requires confirmation to change an active Pro Club staff role", () => {
  const result = resolveProClubAccessState(
    { authorizationRole: "MEMBER", status: "ACTIVE" },
    { staffRole: "ANALYST", status: "ACTIVE" },
    "GK_COACH",
  );

  assert.equal(result.state, "CHANGE_ROLE");
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.actionType, "STAFF_ROLE_CHANGED");
});

test("offers explicit reactivation only for safely inactive Pro Club state", () => {
  const result = resolveProClubAccessState(
    { authorizationRole: "MEMBER", status: "INACTIVE" },
    { staffRole: "GK_COACH", status: "INACTIVE" },
    "GK_COACH",
  );

  assert.equal(result.state, "REACTIVATE");
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.actionType, "ACCESS_REACTIVATED");
});

test("fails closed for Pro Club OWNER or ADMIN authority", () => {
  for (const authorizationRole of ["OWNER", "ADMIN"]) {
    assert.equal(
      resolveProClubAccessState(
        { authorizationRole, status: "ACTIVE" },
        null,
        "GK_COACH",
      ).state,
      "MANUAL_REVIEW",
    );
  }
});

test("fails closed for terminal, partial, malformed, and conflicting Pro Club state", () => {
  const invalidCases = [
    [null, { staffRole: "GK_COACH", status: "ACTIVE" }],
    [{ authorizationRole: "MEMBER", status: "REVOKED" }, null],
    [{ authorizationRole: "MEMBER", status: "ACTIVE" }, { staffRole: "GK_COACH", status: "LEFT" }],
    [{ authorizationRole: "MEMBER", status: "INACTIVE" }, { staffRole: "GK_COACH", status: "ACTIVE" }],
    [{ authorizationRole: "MEMBER", status: "ACTIVE", unexpected: true }, null],
  ] as const;

  for (const [membership, staff] of invalidCases) {
    assert.equal(resolveProClubAccessState(membership, staff, "GK_COACH").state, "MANUAL_REVIEW");
  }
});

test("assigns an Academy ADMIN or COACH membership when none exists", () => {
  assert.equal(resolveAcademyAccessState(null, null, "ADMIN", false).state, "ASSIGN");
  assert.equal(resolveAcademyAccessState(null, null, "COACH", false).state, "ASSIGN");
});

test("keeps an active Academy membership with the same role as a no-op", () => {
  const result = resolveAcademyAccessState(academyMembership(), null, "COACH", false);

  assert.equal(result.state, "ALREADY_ACTIVE");
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.actionType, null);
});

test("requires confirmation for an Academy role change and preserves canonical provenance", () => {
  const membership = academyMembership();
  const result = resolveAcademyAccessState(membership, null, "ADMIN", false);

  assert.equal(result.state, "CHANGE_ROLE");
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.actionType, "ACADEMY_ROLE_CHANGED");
  assert.equal(membership.source, "CLAIM_APPROVAL");
  assert.equal(membership.approvalClaimId, "claim-a");
  assert.equal(membership.joinedBy, "superadmin-uid");
});

test("offers Academy reactivation for SUSPENDED memberships only", () => {
  assert.equal(
    resolveAcademyAccessState(academyMembership({ status: "SUSPENDED" }), null, "COACH", false).state,
    "REACTIVATE",
  );
  for (const status of ["PENDING", "LEFT", "REVOKED"]) {
    assert.equal(
      resolveAcademyAccessState(academyMembership({ status }), null, "COACH", false).state,
      "MANUAL_REVIEW",
    );
  }
});

test("requires suspended Academy access to be reactivated before changing its role", () => {
  const decision = resolveAcademyAccessState(
    academyMembership({ role: "ADMIN", status: "SUSPENDED" }),
    null,
    "COACH",
    false,
  );
  assert.equal(decision.state, "MANUAL_REVIEW");
  assert.match(decision.reason ?? "", /before changing/i);
});

test("assigns Fitness Coach only to an active Academy COACH", () => {
  const result = resolveAcademyAccessState(academyMembership(), null, "COACH", true);

  assert.equal(result.state, "SPECIALTY_CHANGE");
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.actionType, "ACADEMY_SPECIALTY_ASSIGNED");
  assert.equal(
    resolveAcademyAccessState(academyMembership({ role: "ADMIN" }), null, "ADMIN", true).state,
    "MANUAL_REVIEW",
  );
});

test("reactivates an inactive Fitness Coach specialty without changing membership role", () => {
  const result = resolveAcademyAccessState(
    academyMembership(),
    fitnessSpecialty("INACTIVE"),
    "COACH",
    true,
  );

  assert.equal(result.state, "SPECIALTY_CHANGE");
  assert.equal(result.actionType, "ACADEMY_SPECIALTY_REACTIVATED");
});

test("does not rewrite an already active Fitness Coach specialty", () => {
  const result = resolveAcademyAccessState(
    academyMembership(),
    fitnessSpecialty(),
    "COACH",
    true,
  );

  assert.equal(result.state, "ALREADY_ACTIVE");
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.actionType, null);
});

test("fails closed for terminal or orphaned Academy specialty state", () => {
  assert.equal(
    resolveAcademyAccessState(academyMembership(), fitnessSpecialty("LEFT"), "COACH", true).state,
    "MANUAL_REVIEW",
  );
  assert.equal(
    resolveAcademyAccessState(null, fitnessSpecialty("INACTIVE"), "COACH", false).state,
    "MANUAL_REVIEW",
  );
});

test("does not reactivate a LEFT specialty as part of an Academy role change", () => {
  assert.equal(
    resolveAcademyAccessState(
      academyMembership({ role: "ADMIN" }),
      fitnessSpecialty("LEFT"),
      "COACH",
      true,
    ).state,
    "MANUAL_REVIEW",
  );
});

test("fails closed for malformed Academy membership provenance and unsupported roles", () => {
  assert.equal(
    resolveAcademyAccessState(
      academyMembership({ approvalClaimId: "bad/id" }),
      null,
      "COACH",
      false,
    ).state,
    "MANUAL_REVIEW",
  );
  assert.equal(resolveAcademyAccessState(null, null, "GK_COACH", false).state, "MANUAL_REVIEW");
});
