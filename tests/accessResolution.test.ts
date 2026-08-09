import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "../src/contexts/AuthContext.js";
import {
  appShellLandingPage,
  classifyStaffMembership,
  isStaffOnboardingRequest,
  isStaffTenantRole,
  normalSuperAdminNeedsAcademyWorkspace,
  requiresStaffMembership,
} from "../src/contexts/academyAccessModel.js";
import {
  linkedPlayerLookupForUser,
  type NonStaffPlayerAccessInput,
} from "../src/lib/nonStaffPlayerAccess.js";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
    role: "USER",
    ...overrides,
  };
}

describe("Access Resolution Foundation", () => {
  it("requires staff Membership ONLY for ADMIN and COACH roles", () => {
    assert.equal(isStaffTenantRole("ADMIN"), true);
    assert.equal(isStaffTenantRole("COACH"), true);
    assert.equal(isStaffTenantRole("PLAYER"), false);
    assert.equal(isStaffTenantRole("PARENT"), false);
    assert.equal(isStaffTenantRole("SUPERADMIN"), false);
    assert.equal(isStaffTenantRole("USER"), false);
  });

  it("bypasses staff Membership gate for PLAYER and PARENT roles", () => {
    const player = makeUser({ role: "PLAYER", academyId: "academy-1" });
    const parent = makeUser({ role: "PARENT", academyId: "academy-1" });

    assert.equal(requiresStaffMembership(player), false);
    assert.equal(requiresStaffMembership(parent), false);
  });

  it("requires staff Membership for ADMIN and COACH users", () => {
    const admin = makeUser({ role: "ADMIN", academyId: "academy-1" });
    const coach = makeUser({ role: "COACH", academyId: "academy-1" });

    assert.equal(requiresStaffMembership(admin), true);
    assert.equal(requiresStaffMembership(coach), true);
  });

  it("routes direct SUPERADMIN to superadmin portal without staff Membership requirement", () => {
    const superadmin = makeUser({ role: "SUPERADMIN" });

    assert.equal(appShellLandingPage(superadmin, false), "superadmin");
    assert.equal(requiresStaffMembership(superadmin), false);
  });

  it("fails closed for direct SUPERADMIN accessing tenant routes without an academy workspace", () => {
    const superadmin = makeUser({ role: "SUPERADMIN" });

    assert.equal(normalSuperAdminNeedsAcademyWorkspace(superadmin, false, null, "dashboard"), true);
    assert.equal(normalSuperAdminNeedsAcademyWorkspace(superadmin, false, "academy-1", "dashboard"), false);
    assert.equal(normalSuperAdminNeedsAcademyWorkspace(superadmin, false, null, "superadmin"), false);
  });

  it("requires staff Membership for impersonated ADMIN/COACH users and lands on dashboard", () => {
    const impersonatedAdmin = makeUser({ role: "ADMIN", academyId: "academy-1" });

    assert.equal(appShellLandingPage(impersonatedAdmin, true), "dashboard");
    assert.equal(requiresStaffMembership(impersonatedAdmin), true);
  });

  it("never grants authorization via requestedRole or email", () => {
    const userWithStaffIntent = makeUser({
      role: "USER",
      requestedRole: "ADMIN",
      email: "admin@example.com",
    });

    assert.equal(requiresStaffMembership(userWithStaffIntent), false);
    assert.equal(isStaffOnboardingRequest(userWithStaffIntent), true);
  });

  it("maps inactive staff Membership states explicitly", () => {
    assert.equal(classifyStaffMembership("ACTIVE"), "ACTIVE_MEMBERSHIP");
    assert.equal(classifyStaffMembership("PENDING"), "MEMBERSHIP_PENDING");
    assert.equal(classifyStaffMembership("SUSPENDED"), "MEMBERSHIP_SUSPENDED");
    assert.equal(classifyStaffMembership("LEFT"), "MEMBERSHIP_LEFT");
    assert.equal(classifyStaffMembership("REVOKED"), "MEMBERSHIP_REVOKED");
    assert.equal(classifyStaffMembership("INVALID"), "ERROR");
    assert.equal(classifyStaffMembership(null), "MEMBERSHIP_MISSING");
  });

  it("resolves PLAYER and PARENT pointers with strict validation and returns UNAVAILABLE on malformed data", () => {
    const validPlayer: NonStaffPlayerAccessInput = { role: "PLAYER", academyId: "academy-1", id: "uid-123" };
    assert.deepEqual(linkedPlayerLookupForUser(validPlayer), {
      type: "PLAYER_QUERY",
      academyId: "academy-1",
      uid: "uid-123",
    });

    const validParent: NonStaffPlayerAccessInput = { role: "PARENT", academyId: "academy-1", linkedPlayerId: "player-789" };
    assert.deepEqual(linkedPlayerLookupForUser(validParent), {
      type: "PARENT_DOCUMENT",
      academyId: "academy-1",
      playerId: "player-789",
    });

    const malformedPlayer: NonStaffPlayerAccessInput = { role: "PLAYER", academyId: "academy/1", id: "uid-123" };
    assert.deepEqual(linkedPlayerLookupForUser(malformedPlayer), { type: "UNAVAILABLE" });

    const paddedParent: NonStaffPlayerAccessInput = { role: "PARENT", academyId: " academy-1 ", linkedPlayerId: "player-789" };
    assert.deepEqual(linkedPlayerLookupForUser(paddedParent), { type: "UNAVAILABLE" });

    const missingParentLink: NonStaffPlayerAccessInput = { role: "PARENT", academyId: "academy-1" };
    assert.deepEqual(linkedPlayerLookupForUser(missingParentLink), { type: "UNAVAILABLE" });
  });
});
