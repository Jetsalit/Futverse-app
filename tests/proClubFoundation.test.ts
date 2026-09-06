import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActiveProClubStaffAssignment,
  isProClubLevel,
  isProClubStaffRole,
  isProClubStaffStatus,
  isProClubStatus,
  isValidDocumentIdentifier,
  validateProClub,
  validateProClubStaffAssignment,
} from "../src/lib/proClubModel.js";
import type {
  ProClub,
  ProClubStaffAssignment,
  ProClubStaffRole,
} from "../src/types/ProClub.js";

const clubContext = {
  clubId: "club-200",
  documentId: "club-200",
};

const staffContext = {
  clubId: "club-200",
  documentClubId: "club-200",
  userId: "user-100",
  documentId: "user-100",
};

describe("Pro Club Foundation 1A", () => {
  it("validates exact document identifiers and rejects padded or path-like IDs", () => {
    assert.equal(isValidDocumentIdentifier("user-123"), true);
    assert.equal(isValidDocumentIdentifier("club-456"), true);
    for (const invalid of [
      "",
      "   ",
      " user-123 ",
      "user-123 ",
      " user-123",
      "user/123",
      "clubs/456",
      null,
      undefined,
      123,
    ]) {
      assert.equal(isValidDocumentIdentifier(invalid), false);
    }
  });

  it("preserves the existing club levels and status values", () => {
    for (const level of ["T1", "T2", "T3"]) {
      assert.equal(isProClubLevel(level), true);
    }
    for (const invalid of ["T4", "t1", "PRO", "", null]) {
      assert.equal(isProClubLevel(invalid), false);
    }
    assert.equal(isProClubStatus("ACTIVE"), true);
    assert.equal(isProClubStatus("INACTIVE"), true);
    assert.equal(isProClubStatus("SUSPENDED"), false);
  });

  it("validates the club payload against its exact canonical document path", () => {
    const club = {
      name: "Lampang FC",
      shortName: "LFC",
      level: "T1",
      status: "ACTIVE",
      country: "TH",
    };

    assert.equal(validateProClub(club, clubContext), true);
    assert.equal(
      validateProClub(club, { ...clubContext, documentId: "other-club" }),
      false,
    );
    assert.equal(
      validateProClub({ ...club, clubId: "club-200" }, clubContext),
      false,
    );
    assert.equal(validateProClub({ ...club, id: "club-200" }, clubContext), false);
    assert.equal(validateProClub({ ...club, name: " Lampang FC " }, clubContext), false);
    assert.equal(validateProClub({ ...club, status: "SUSPENDED" }, clubContext), false);
  });

  it("validates all ten functional staff roles independently of authorization roles", () => {
    const roles: ProClubStaffRole[] = [
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

    for (const role of roles) assert.equal(isProClubStaffRole(role), true);
    for (const invalid of ["COACH", "OWNER", "ADMIN", "MEMBER", "SUPERADMIN", ""]) {
      assert.equal(isProClubStaffRole(invalid), false);
    }
  });

  it("preserves ACTIVE, INACTIVE, and LEFT staff assignment status", () => {
    for (const status of ["ACTIVE", "INACTIVE", "LEFT"]) {
      assert.equal(isProClubStaffStatus(status), true);
    }
    for (const invalid of ["PENDING", "SUSPENDED", "REVOKED", "", null]) {
      assert.equal(isProClubStaffStatus(invalid), false);
    }
  });

  it("validates an identity-free staff payload only for its exact club and UID path", () => {
    const assignment: unknown = {
      staffRole: "ANALYST",
      status: "ACTIVE",
    };

    if (!validateProClubStaffAssignment(assignment, staffContext)) {
      assert.fail("Expected an exact-path staff assignment");
    }
    const narrowed: ProClubStaffAssignment = assignment;
    assert.equal(narrowed.staffRole, "ANALYST");

    assert.equal(
      validateProClubStaffAssignment(assignment, {
        ...staffContext,
        documentClubId: "other-club",
      }),
      false,
    );
    assert.equal(
      validateProClubStaffAssignment(assignment, {
        ...staffContext,
        documentId: "other-user",
      }),
      false,
    );
    assert.equal(
      validateProClubStaffAssignment(
        { ...assignment, userId: "user-100" },
        staffContext,
      ),
      false,
    );
    assert.equal(
      validateProClubStaffAssignment(
        { ...assignment, clubId: "club-200" },
        staffContext,
      ),
      false,
    );
  });

  it("treats active staff assignment as functional state, not membership authority", () => {
    const active = { staffRole: "PHYSIO", status: "ACTIVE" };
    const inactive = { ...active, status: "INACTIVE" };
    const left = { ...active, status: "LEFT" };

    assert.equal(isActiveProClubStaffAssignment(active, staffContext), true);
    assert.equal(isActiveProClubStaffAssignment(inactive, staffContext), false);
    assert.equal(isActiveProClubStaffAssignment(left, staffContext), false);
    assert.equal(
      isActiveProClubStaffAssignment(active, {
        ...staffContext,
        clubId: "other-club",
      }),
      false,
    );
  });

  it("excludes all canonical identity fields from stored Pro Club payload types", () => {
    type ForbiddenIdentityKey = "id" | "clubId" | "uid" | "userId";
    type HasForbiddenIdentity<T> = Extract<keyof T, ForbiddenIdentityKey> extends never
      ? false
      : true;
    type AssertFalse<T extends false> = T;

    const clubHasIdentity: AssertFalse<HasForbiddenIdentity<ProClub>> = false;
    const staffHasIdentity: AssertFalse<
      HasForbiddenIdentity<ProClubStaffAssignment>
    > = false;

    assert.equal(clubHasIdentity, false);
    assert.equal(staffHasIdentity, false);
  });
});
