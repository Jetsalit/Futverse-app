import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "../src/contexts/AuthContext.js";
import {
  buildRecentActivities,
  deriveDashboardAlerts,
  deriveEffectiveRoleCounts,
  parseAuditLog,
  searchDashboardData,
} from "../src/components/superadmin/dashboardModel.js";

function user(overrides: Partial<User>): User {
  return {
    id: "user-id",
    name: "Test User",
    role: "USER",
    ...overrides,
  };
}

describe("SuperAdmin Dashboard model", () => {
  it("counts only effective roles and never requested roles", () => {
    const counts = deriveEffectiveRoleCounts([
      user({ id: "coach", role: "COACH" }),
      user({ id: "player", role: "PLAYER" }),
      user({ id: "parent", role: "PARENT" }),
      user({ id: "scout", role: "SCOUT" }),
      user({ id: "pending-coach", role: "USER", requestedRole: "COACH" }),
      user({ id: "pending-player", role: "USER", requestedRole: "PLAYER" }),
    ]);

    assert.deepEqual(counts, {
      coaches: 1,
      playerAccounts: 1,
      parents: 1,
      scouts: 1,
    });
  });

  it("searches only the supplied in-memory datasets", () => {
    const users = [user({ id: "u1", name: "Ada Coach", email: "ada@example.com", role: "COACH" })];
    const academies = [{ id: "academy-1", name: "North Star Academy" }];
    const claims = [{ id: "claim-1", playerName: "Niran", futId: "FUT-001", userEmail: "family@example.com" }];

    assert.equal(searchDashboardData({ query: "ada@", users, academies, claims })[0]?.type, "user");
    assert.equal(searchDashboardData({ query: "north", users, academies, claims })[0]?.type, "academy");
    assert.equal(searchDashboardData({ query: "FUT-001", users, academies, claims })[0]?.type, "claim");
    assert.deepEqual(searchDashboardData({ query: "x", users, academies, claims }), []);
  });

  it("omits unavailable lazy sources from alert derivation", () => {
    const alerts = deriveDashboardAlerts({
      pendingUsers: 2,
      paymentApprovals: 1,
      profileClaims: null,
      errorReports: null,
    });

    assert.deepEqual(alerts.map((alert) => alert.id), ["pending-users", "payment-approvals"]);
  });

  it("maps audit actors from users already in memory", () => {
    const parsed = parseAuditLog("log-1", {
      action: "USER_APPROVED",
      approvedBy: "admin-1",
      targetEmail: "target@example.com",
      timestamp: "2026-08-08T10:00:00.000Z",
    });
    const activities = buildRecentActivities(
      [parsed],
      [user({ id: "admin-1", name: "HQ Admin", role: "SUPERADMIN" })],
    );

    assert.equal(activities[0]?.action, "User approved");
    assert.equal(activities[0]?.actor, "HQ Admin");
    assert.equal(activities[0]?.target, "target@example.com");
  });

  it("falls back safely for sparse audit records", () => {
    const activities = buildRecentActivities(
      [parseAuditLog("log-2", { action: "CUSTOM_EVENT" })],
      [],
    );

    assert.equal(activities[0]?.action, "custom event");
    assert.equal(activities[0]?.actor, "System");
    assert.equal(activities[0]?.target, "—");
  });
});
