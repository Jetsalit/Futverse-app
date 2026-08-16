import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNonStaffSupportSubject,
  isExactActiveNonStaffSupportUser,
  isNonStaffSupportRole,
  resolveNonStaffPresentationRole,
} from "../src/lib/superAdminNonStaffSupportModel";

const parent = {
  uid: "parent-001",
  id: "parent-001",
  name: "Parent One",
  email: "parent@example.com",
  role: "PARENT" as const,
  status: "ACTIVE",
};

const player = {
  uid: "player-001",
  id: "player-001",
  name: "Player One",
  email: "player@example.com",
  role: "PLAYER" as const,
  status: "Active",
};

describe("superAdminNonStaffSupportModel", () => {
  it("accepts only PARENT and PLAYER roles", () => {
    assert.equal(isNonStaffSupportRole("PARENT"), true);
    assert.equal(isNonStaffSupportRole("PLAYER"), true);
    assert.equal(isNonStaffSupportRole("COACH"), false);
  });

  it("requires exact active target identity", () => {
    assert.equal(isExactActiveNonStaffSupportUser(parent, "parent-001"), true);
    assert.equal(isExactActiveNonStaffSupportUser(player, "player-001"), true);
    assert.equal(
      isExactActiveNonStaffSupportUser({ ...parent, status: "INACTIVE" }),
      false,
    );
    assert.equal(
      isExactActiveNonStaffSupportUser({ ...parent, uid: "parent/001" }),
      false,
    );
    assert.equal(isExactActiveNonStaffSupportUser(parent, "other-parent"), false);
  });

  it("builds support subject without changing authenticated actor", () => {
    assert.deepEqual(buildNonStaffSupportSubject(parent), {
      uid: "parent-001",
      role: "PARENT",
      displayName: "Parent One",
      email: "parent@example.com",
    });
  });

  it("resolves presentation role and fails closed for malformed session", () => {
    assert.equal(
      resolveNonStaffPresentationRole({
        academyId: "academy-001",
        subject: { uid: "parent-001", role: "PARENT" },
        startedAt: Date.now(),
      }),
      "PARENT",
    );
    assert.equal(
      resolveNonStaffPresentationRole({
        academyId: "academy/001",
        subject: { uid: "parent-001", role: "PARENT" },
        startedAt: Date.now(),
      }),
      "NONE",
    );
  });
});
