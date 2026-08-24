import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "../src/contexts/AuthContext.js";
import {
  buildRecentActivities,
  deriveDashboardAlerts,
  deriveDashboardOperationalSignals,
  deriveEffectiveRoleCounts,
  deriveDashboardMetric,
  deriveDashboardSearchCoverage,
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
  it("keeps dashboard metric loading unavailable and ready states distinct", () => {
    assert.deepEqual(
      deriveDashboardMetric({
        loadState: "idle",
        value: 0,
      }),
      {
        state: "LOADING",
        value: null,
      },
    );

    assert.deepEqual(
      deriveDashboardMetric({
        loadState: "loading",
        value: 0,
      }),
      {
        state: "LOADING",
        value: null,
      },
    );

    assert.deepEqual(
      deriveDashboardMetric({
        loadState: "unavailable",
        value: 0,
      }),
      {
        state: "UNAVAILABLE",
        value: null,
      },
    );

    assert.deepEqual(
      deriveDashboardMetric({
        loadState: "loaded",
        value: 0,
      }),
      {
        state: "READY",
        value: 0,
      },
    );

    assert.deepEqual(
      deriveDashboardMetric({
        loadState: "loaded",
        value: 7,
      }),
      {
        state: "READY",
        value: 7,
      },
    );

    assert.deepEqual(
      deriveDashboardMetric({
        loadState: "loaded",
        value: null,
      }),
      {
        state: "UNAVAILABLE",
        value: null,
      },
    );

    assert.deepEqual(
      deriveDashboardMetric({
        loadState: "loaded",
        value: -1,
      }),
      {
        state: "UNAVAILABLE",
        value: null,
      },
    );
  });

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

  it("derives truthful dashboard search coverage", () => {
    assert.deepEqual(
      deriveDashboardSearchCoverage({
        users: "loaded",
        academies: "loaded",
        profileClaims: "loaded",
      }),
      {
        state: "READY",
        loadingSources: [],
        unavailableSources: [],
      },
    );

    assert.deepEqual(
      deriveDashboardSearchCoverage({
        users: "loading",
        academies: "loaded",
        profileClaims: "idle",
      }),
      {
        state: "LOADING",
        loadingSources: [
          "users",
          "profile-claims",
        ],
        unavailableSources: [],
      },
    );

    assert.deepEqual(
      deriveDashboardSearchCoverage({
        users: "loaded",
        academies: "unavailable",
        profileClaims: "loading",
      }),
      {
        state: "PARTIAL",
        loadingSources: [
          "profile-claims",
        ],
        unavailableSources: [
          "academies",
        ],
      },
    );
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

  it("derives only confirmed pending alerts when other sources are unavailable", () => {
    const alerts = deriveDashboardAlerts([
      {
        id: "user-approvals",
        state: "PENDING",
        count: 2,
      },
      {
        id: "profile-claims",
        state: "UNAVAILABLE",
        count: null,
      },
      {
        id: "payment-approvals",
        state: "NOT_CONNECTED",
        count: null,
      },
      {
        id: "error-reports",
        state: "UNAVAILABLE",
        count: null,
      },
    ]);

    assert.deepEqual(
      alerts.map((alert) => alert.id),
      ["pending-users"],
    );
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

  it("prefers explicit actorUid and targetUid in hardened audit records", () => {
    const parsed = parseAuditLog("log-atomic", {
      action: "USER_BULK_APPROVED",
      actorUid: "admin-atomic",
      targetUid: "target-atomic",
    });
    const activities = buildRecentActivities(
      [parsed],
      [user({ id: "admin-atomic", name: "Atomic Admin", role: "SUPERADMIN" })],
    );

    assert.equal(activities[0]?.action, "User bulk-approved");
    assert.equal(activities[0]?.actor, "Atomic Admin");
    assert.equal(activities[0]?.target, "target-atomic");
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

  it("derives truthful operational signal states", () => {
    const signals = deriveDashboardOperationalSignals({
      userApprovals: {
        loadState: "loaded",
        count: 2,
      },
      profileClaims: {
        loadState: "loaded",
        count: 0,
      },
    });

    assert.deepEqual(
      signals.map((signal) => ({
        id: signal.id,
        state: signal.state,
        count: signal.count,
      })),
      [
        {
          id: "user-approvals",
          state: "PENDING",
          count: 2,
        },
        {
          id: "profile-claims",
          state: "CLEAR",
          count: 0,
        },
        {
          id: "payment-approvals",
          state: "NOT_CONNECTED",
          count: null,
        },
        {
          id: "error-reports",
          state: "NOT_CONNECTED",
          count: null,
        },
      ],
    );
  });

  it("keeps loading and unavailable sources distinct", () => {
    const loading = deriveDashboardOperationalSignals({
      userApprovals: {
        loadState: "loading",
        count: null,
      },
      profileClaims: {
        loadState: "idle",
        count: null,
      },
    });

    assert.equal(loading[0]?.state, "LOADING");
    assert.equal(loading[1]?.state, "LOADING");

    const unavailable = deriveDashboardOperationalSignals({
      userApprovals: {
        loadState: "unavailable",
        count: null,
      },
      profileClaims: {
        loadState: "unavailable",
        count: null,
      },
    });

    assert.equal(unavailable[0]?.state, "UNAVAILABLE");
    assert.equal(unavailable[1]?.state, "UNAVAILABLE");
  });

  it("fails closed for invalid loaded counts", () => {
    const signals = deriveDashboardOperationalSignals({
      userApprovals: {
        loadState: "loaded",
        count: null,
      },
      profileClaims: {
        loadState: "loaded",
        count: -1,
      },
    });

    assert.equal(signals[0]?.state, "UNAVAILABLE");
    assert.equal(signals[1]?.state, "UNAVAILABLE");
  });
  it("derives action alerts from explicit operational signals", () => {
    const signals = deriveDashboardOperationalSignals({
      userApprovals: {
        loadState: "loaded",
        count: 2,
      },
      profileClaims: {
        loadState: "loaded",
        count: 0,
      },
    });

    const alerts = deriveDashboardAlerts(signals);

    assert.deepEqual(
      alerts.map((alert) => alert.id),
      ["pending-users"],
    );
  });

  it("never claims all-clear while operational coverage is incomplete", () => {
    const signals = deriveDashboardOperationalSignals({
      userApprovals: {
        loadState: "loaded",
        count: 0,
      },
      profileClaims: {
        loadState: "loaded",
        count: 0,
      },
    });

    const alerts = deriveDashboardAlerts(signals);

    assert.equal(
      alerts.some((alert) => alert.id === "all-clear"),
      false,
    );
  });

  it("claims all-clear only when every operational signal is explicitly CLEAR", () => {
    const alerts = deriveDashboardAlerts([
      {
        id: "user-approvals",
        state: "CLEAR",
        count: 0,
      },
      {
        id: "profile-claims",
        state: "CLEAR",
        count: 0,
      },
      {
        id: "payment-approvals",
        state: "CLEAR",
        count: 0,
      },
      {
        id: "error-reports",
        state: "CLEAR",
        count: 0,
      },
    ]);

    assert.deepEqual(
      alerts.map((alert) => alert.id),
      ["all-clear"],
    );
  });
  it("never routes Error Reports to System Logs", () => {
    const alerts = deriveDashboardAlerts([
      {
        id: "user-approvals",
        state: "CLEAR",
        count: 0,
      },
      {
        id: "profile-claims",
        state: "CLEAR",
        count: 0,
      },
      {
        id: "payment-approvals",
        state: "CLEAR",
        count: 0,
      },
      {
        id: "error-reports",
        state: "PENDING",
        count: 1,
      },
    ]);

    const errorAlert =
      alerts.find(
        (alert) => alert.id === "error-reports",
      );

    assert.ok(errorAlert);

    assert.equal(
      errorAlert.tab,
      undefined,
      "Error Reports must not proxy-route to System Logs",
    );
  });
});
