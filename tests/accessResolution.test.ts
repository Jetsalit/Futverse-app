import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyStaffMembership,
  isStaffOnboardingRequest,
  requiresStaffMembership,
} from "../src/contexts/academyAccessModel.ts";
import { linkedPlayerLookupForUser } from "../src/lib/nonStaffPlayerAccess.ts";
import type { Membership } from "../src/types/Membership.ts";
import type { UserRole } from "../src/contexts/AuthContext.tsx";

const membership = (
  role: "ADMIN" | "COACH",
  status: Membership["status"] = "ACTIVE",
): Membership => ({
  userId: "staff-1",
  academyId: "academy-a",
  role,
  status,
  source: "LEGACY_MIGRATION",
  joinedAt: null,
  joinedBy: "migration",
  updatedAt: null,
});

test("PLAYER with a legacy academyId bypasses the staff Membership gate", () => {
  const user = { role: "PLAYER" as const, academyId: "academy-a", id: "player-user" };
  assert.equal(requiresStaffMembership(user), false);
  assert.deepEqual(linkedPlayerLookupForUser(user), {
    kind: "PLAYER_QUERY",
    academyId: "academy-a",
    uid: "player-user",
  });
});

test("PARENT uses the exact linked Player and receives no staff authorization", () => {
  const user = {
    role: "PARENT" as const,
    academyId: "academy-a",
    linkedPlayerId: "player-1",
  };
  assert.equal(requiresStaffMembership(user), false);
  assert.deepEqual(linkedPlayerLookupForUser(user), {
    kind: "PARENT_DOCUMENT",
    academyId: "academy-a",
    playerId: "player-1",
  });
});

test("only effective ADMIN and COACH roles require staff Membership", () => {
  const matrix: Array<[UserRole, boolean]> = [
    ["ADMIN", true],
    ["COACH", true],
    ["PLAYER", false],
    ["PARENT", false],
    ["SCOUT", false],
    ["USER", false],
    ["DATA_ADMIN", false],
    ["SUPERADMIN", false],
  ];
  for (const [role, expected] of matrix) {
    assert.equal(requiresStaffMembership({ role }), expected, role);
  }
});

test("requestedRole and email never create staff authorization", () => {
  const user = {
    role: "PLAYER" as const,
    requestedRole: "COACH" as const,
    email: "futverse.coach@gmail.com",
  };
  assert.equal(requiresStaffMembership(user), false);
  assert.equal(isStaffOnboardingRequest(user), false);
  assert.deepEqual(
    linkedPlayerLookupForUser({ ...user, academyId: "academy-a" }),
    { kind: "UNAVAILABLE" },
  );
});

test("USER requestedRole can select onboarding UI but cannot authorize tenant data", () => {
  const user = { role: "USER" as const, requestedRole: "ADMIN" as const };
  assert.equal(requiresStaffMembership(user), false);
  assert.equal(isStaffOnboardingRequest(user), true);
});

test("ADMIN and COACH without Membership resolve missing", () => {
  assert.equal(classifyStaffMembership("staff-1", "academy-a", "ADMIN", null), "MISSING");
  assert.equal(classifyStaffMembership("staff-1", "academy-a", "COACH", null), "MISSING");
});

test("ACTIVE ADMIN and COACH Memberships resolve active", () => {
  assert.equal(classifyStaffMembership("staff-1", "academy-a", "ADMIN", membership("ADMIN")), "ACTIVE");
  assert.equal(classifyStaffMembership("staff-1", "academy-a", "COACH", membership("COACH")), "ACTIVE");
});

for (const status of ["PENDING", "SUSPENDED", "LEFT", "REVOKED"] as const) {
  test(`${status} Membership resolves its explicit access state`, () => {
    assert.equal(
      classifyStaffMembership("staff-1", "academy-a", "COACH", membership("COACH", status)),
      status,
    );
  });
}

test("Membership identity, Academy, and role mismatches fail closed", () => {
  assert.equal(classifyStaffMembership("other", "academy-a", "ADMIN", membership("ADMIN")), "ERROR");
  assert.equal(classifyStaffMembership("staff-1", "academy-b", "ADMIN", membership("ADMIN")), "ERROR");
  assert.equal(classifyStaffMembership("staff-1", "academy-a", "ADMIN", membership("COACH")), "ERROR");
});

test("invalid or missing non-staff pointers fail closed", () => {
  assert.deepEqual(
    linkedPlayerLookupForUser({ role: "PLAYER", id: "player-user", academyId: "academy/a" }),
    { kind: "UNAVAILABLE" },
  );
  assert.deepEqual(
    linkedPlayerLookupForUser({ role: "PARENT", academyId: "academy-a" }),
    { kind: "UNAVAILABLE" },
  );
});
