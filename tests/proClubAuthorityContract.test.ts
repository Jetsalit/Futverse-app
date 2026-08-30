import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasActiveProClubMembershipAuthority,
  isProClubAuthorizationRole,
  isProClubMembershipStatus,
  isTerminalProClubMembershipStatus,
  resolveActiveProClubStaffRole,
  validateProClubMembership,
} from "../src/lib/proClubModel.js";
import type {
  ProClubAuthorizationRole,
  ProClubMembership,
  ProClubStaffAssignment,
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

describe("Pro Club Authority Foundation V1 contract", () => {
  it("freezes OWNER, ADMIN, and MEMBER as membership authorization roles", () => {
    const roles: ProClubAuthorizationRole[] = ["OWNER", "ADMIN", "MEMBER"];
    for (const role of roles) assert.equal(isProClubAuthorizationRole(role), true);

    for (const invalid of [
      "HEAD_COACH",
      "ASSISTANT_COACH",
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
});
