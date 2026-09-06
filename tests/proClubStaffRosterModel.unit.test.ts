import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isReviewerVisibleProClubStaffRosterEntryV1,
  validateProClubStaffRosterEntryV1,
} from "../src/lib/proClubStaffRosterModel";

const context = {
  clubId: "club-lampang",
  documentClubId: "club-lampang",
  userId: "staff.uid-001",
  documentId: "staff.uid-001",
};

const valid = {
  schemaVersion: 1 as const,
  clubId: "club-lampang",
  userId: "staff.uid-001",
  displayName: "Max Coach",
  authorizationRole: "MEMBER" as const,
  membershipStatus: "ACTIVE" as const,
  staffRole: "HEAD_COACH" as const,
  staffStatus: "ACTIVE" as const,
};

describe("Pro Club Staff Roster Read Model V1", () => {
  it("accepts the exact privacy-minimized active roster shape", () => {
    assert.equal(validateProClubStaffRosterEntryV1(valid, context), true);
    assert.equal(isReviewerVisibleProClubStaffRosterEntryV1(valid, context), true);
  });

  it("allows null displayName without inventing identity", () => {
    assert.equal(
      validateProClubStaffRosterEntryV1({ ...valid, displayName: null }, context),
      true,
    );
  });

  it("rejects email, phone, invite and hidden privilege fields", () => {
    for (const extra of [
      { email: "staff@example.com" },
      { phone: "0800000000" },
      { inviteCode: "FUT-SECRET" },
      { isOwner: true },
      { permissions: ["ADMIN"] },
    ]) {
      assert.equal(validateProClubStaffRosterEntryV1({ ...valid, ...extra }, context), false);
    }
  });

  it("rejects cross-tenant and document identity mismatch", () => {
    assert.equal(
      validateProClubStaffRosterEntryV1(valid, { ...context, documentClubId: "other-club" }),
      false,
    );
    assert.equal(
      validateProClubStaffRosterEntryV1(valid, { ...context, documentId: "other-user" }),
      false,
    );
    assert.equal(
      validateProClubStaffRosterEntryV1({ ...valid, clubId: "other-club" }, context),
      false,
    );
    assert.equal(
      validateProClubStaffRosterEntryV1({ ...valid, userId: "other-user" }, context),
      false,
    );
  });

  it("keeps authorization role separate from functional staff role", () => {
    assert.equal(
      validateProClubStaffRosterEntryV1(
        { ...valid, authorizationRole: "OWNER", staffRole: "PHYSIO" },
        context,
      ),
      true,
    );
    assert.equal(
      validateProClubStaffRosterEntryV1(
        { ...valid, authorizationRole: "HEAD_COACH" },
        context,
      ),
      false,
    );
  });

  it("accepts historical states as valid data but hides them from the active reviewer roster", () => {
    const inactive = { ...valid, staffStatus: "INACTIVE" as const };
    const left = { ...valid, membershipStatus: "LEFT" as const, staffStatus: "LEFT" as const };

    assert.equal(validateProClubStaffRosterEntryV1(inactive, context), true);
    assert.equal(isReviewerVisibleProClubStaffRosterEntryV1(inactive, context), false);
    assert.equal(validateProClubStaffRosterEntryV1(left, context), true);
    assert.equal(isReviewerVisibleProClubStaffRosterEntryV1(left, context), false);
  });

  it("rejects malformed names and non-canonical identifiers", () => {
    assert.equal(validateProClubStaffRosterEntryV1({ ...valid, displayName: " Max Coach" }, context), false);
    assert.equal(validateProClubStaffRosterEntryV1({ ...valid, displayName: "" }, context), false);
    assert.equal(
      validateProClubStaffRosterEntryV1(valid, { ...context, userId: "staff/001", documentId: "staff/001" }),
      false,
    );
  });
});
