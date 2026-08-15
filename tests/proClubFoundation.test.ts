import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isActiveProClubStaffAssignment,
  isProClubLevel,
  isProClubStaffRole,
  isProClubStaffStatus,
  isValidDocumentIdentifier,
  validateProClubStaffAssignment,
} from "../src/lib/proClubModel.js";
import type {
  ProClub,
  ProClubStaffAssignment,
  ProClubStaffRole,
} from "../src/types/ProClub.js";

describe("Pro Club Foundation 1A", () => {
  it("validates document identifiers correctly and rejects padded or path-like IDs", () => {
    assert.equal(isValidDocumentIdentifier("user-123"), true);
    assert.equal(isValidDocumentIdentifier("club-456"), true);

    // Invalid / malformed cases
    assert.equal(isValidDocumentIdentifier(""), false);
    assert.equal(isValidDocumentIdentifier("   "), false);
    assert.equal(isValidDocumentIdentifier(" user-123 "), false);
    assert.equal(isValidDocumentIdentifier("user-123 "), false);
    assert.equal(isValidDocumentIdentifier(" user-123"), false);
    assert.equal(isValidDocumentIdentifier("user/123"), false);
    assert.equal(isValidDocumentIdentifier("clubs/456"), false);
    assert.equal(isValidDocumentIdentifier(null), false);
    assert.equal(isValidDocumentIdentifier(undefined), false);
    assert.equal(isValidDocumentIdentifier(123), false);
  });

  it("validates ProClubLevel values (T1, T2, T3)", () => {
    assert.equal(isProClubLevel("T1"), true);
    assert.equal(isProClubLevel("T2"), true);
    assert.equal(isProClubLevel("T3"), true);

    assert.equal(isProClubLevel("T4"), false);
    assert.equal(isProClubLevel("t1"), false);
    assert.equal(isProClubLevel("PRO"), false);
    assert.equal(isProClubLevel(""), false);
    assert.equal(isProClubLevel(null), false);
  });

  it("validates all 7 functional ProClubStaffRole values", () => {
    const roles: ProClubStaffRole[] = [
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ];

    for (const role of roles) {
      assert.equal(isProClubStaffRole(role), true);
    }

    // Invalid roles
    assert.equal(isProClubStaffRole("COACH"), false);
    assert.equal(isProClubStaffRole("ADMIN"), false);
    assert.equal(isProClubStaffRole("SUPERADMIN"), false);
    assert.equal(isProClubStaffRole("MANAGER"), false);
    assert.equal(isProClubStaffRole(""), false);
    assert.equal(isProClubStaffRole(null), false);
  });

  it("validates ProClubStaffStatus values (ACTIVE, INACTIVE, LEFT)", () => {
    assert.equal(isProClubStaffStatus("ACTIVE"), true);
    assert.equal(isProClubStaffStatus("INACTIVE"), true);
    assert.equal(isProClubStaffStatus("LEFT"), true);

    assert.equal(isProClubStaffStatus("PENDING"), false);
    assert.equal(isProClubStaffStatus("SUSPENDED"), false);
    assert.equal(isProClubStaffStatus("REVOKED"), false);
    assert.equal(isProClubStaffStatus(""), false);
    assert.equal(isProClubStaffStatus(null), false);
  });

  it("acts as a TypeScript type guard in validateProClubStaffAssignment for all valid staff roles", () => {
    const roles: ProClubStaffRole[] = [
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ];

    for (const staffRole of roles) {
      const assignment: unknown = {
        userId: "user-100",
        clubId: "club-200",
        staffRole,
        status: "ACTIVE",
      };

      if (validateProClubStaffAssignment(assignment)) {
        // TypeScript type narrowing proof: assignment is ProClubStaffAssignment
        const user: string = assignment.userId;
        const club: string = assignment.clubId;
        const role: ProClubStaffRole = assignment.staffRole;
        assert.equal(user, "user-100");
        assert.equal(club, "club-200");
        assert.equal(role, staffRole);
      } else {
        assert.fail(
          `Expected validateProClubStaffAssignment to return true for role ${staffRole}`
        );
      }
    }
  });

  it("fails closed on malformed identifiers in staff assignment", () => {
    const base = {
      userId: "user-100",
      clubId: "club-200",
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
    };

    assert.equal(
      validateProClubStaffAssignment({ ...base, userId: "" }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, userId: " user-100 " }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, userId: "user/100" }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, clubId: "" }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, clubId: " club-200" }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, clubId: "clubs/200" }),
      false
    );
  });

  it("fails closed on unknown staff roles or statuses", () => {
    const base = {
      userId: "user-100",
      clubId: "club-200",
      staffRole: "HEAD_COACH",
      status: "ACTIVE",
    };

    assert.equal(
      validateProClubStaffAssignment({ ...base, staffRole: "INVALID_ROLE" }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, staffRole: "COACH" }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, status: "PENDING" }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment({ ...base, status: "SUSPENDED" }),
      false
    );
    assert.equal(validateProClubStaffAssignment(null), false);
    assert.equal(validateProClubStaffAssignment("not-an-object"), false);
  });

  it("fails closed on expected userId or clubId mismatch", () => {
    const assignment: unknown = {
      userId: "user-100",
      clubId: "club-200",
      staffRole: "ANALYST",
      status: "ACTIVE",
    };

    assert.equal(
      validateProClubStaffAssignment(assignment, {
        expectedUserId: "user-999",
      }),
      false
    );
    assert.equal(
      validateProClubStaffAssignment(assignment, {
        expectedClubId: "club-999",
      }),
      false
    );
  });

  it("evaluates isActiveProClubStaffAssignment directly from unknown inputs", () => {
    const activeAssignment: unknown = {
      userId: "user-100",
      clubId: "club-200",
      staffRole: "PHYSIO",
      status: "ACTIVE",
    };

    const inactiveAssignment: unknown = {
      userId: "user-100",
      clubId: "club-200",
      staffRole: "PHYSIO",
      status: "INACTIVE",
    };

    const leftAssignment: unknown = {
      userId: "user-100",
      clubId: "club-200",
      staffRole: "PHYSIO",
      status: "LEFT",
    };

    assert.equal(isActiveProClubStaffAssignment(activeAssignment), true);
    assert.equal(
      isActiveProClubStaffAssignment(activeAssignment, {
        expectedUserId: "user-100",
        expectedClubId: "club-200",
      }),
      true
    );

    assert.equal(isActiveProClubStaffAssignment(inactiveAssignment), false);
    assert.equal(isActiveProClubStaffAssignment(leftAssignment), false);

    // Mismatched options
    assert.equal(
      isActiveProClubStaffAssignment(activeAssignment, {
        expectedUserId: "wrong-user",
      }),
      false
    );

    // Malformed assignments
    assert.equal(
      isActiveProClubStaffAssignment({
        userId: " user-100 ",
        clubId: "club-200",
        staffRole: "PHYSIO",
        status: "ACTIVE",
      }),
      false
    );
    assert.equal(isActiveProClubStaffAssignment("not-an-object"), false);
    assert.equal(isActiveProClubStaffAssignment(null), false);
    assert.equal(isActiveProClubStaffAssignment(undefined), false);
  });

  it("enforces static and runtime contract that ProClub interface excludes a stored document id property", () => {
    // Static type guard check: if "id" property is added to ProClub, HasStoredIdField becomes true
    // and causes a TypeScript compilation error (Type 'true' does not satisfy constraint 'false').
    type HasStoredIdField<T> = "id" extends keyof T ? true : false;
    type AssertNoStoredId<T extends false> = T;
    const staticCheck: AssertNoStoredId<HasStoredIdField<ProClub>> = false;
    assert.equal(staticCheck, false);

    const clubKeys: (keyof ProClub)[] = [
      "name",
      "shortName",
      "level",
      "status",
      "country",
      "logoUrl",
      "createdAt",
      "updatedAt",
    ];
    assert.equal(clubKeys.includes("id" as unknown as keyof ProClub), false);
  });
});
