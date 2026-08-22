import assert from "node:assert/strict";
import test from "node:test";

import {
  searchDashboardData,
  resolveDashboardSearchSelection,
  type SuperAdminTab,
} from "../src/components/superadmin/dashboardModel";
import {
  SUPERADMIN_PRIMARY_NAVIGATION,
  findSuperAdminSectionForTab,
  getSuperAdminPrimarySection,
  isSuperAdminTabInSection,
} from "../src/components/superadmin/superAdminNavigationModel";

const EXPECTED_TABS: readonly SuperAdminTab[] = [
  "dashboard",
  "approvals",
  "users",
  "relationships",
  "academies",
  "system_logs",
  "profile_claims",
  "payment_approvals",
  "observation_metrics",
  "bootstrap_legacy",
];

test("1. every existing SuperAdmin tab belongs to exactly one primary section", () => {
  const mappedTabs = SUPERADMIN_PRIMARY_NAVIGATION.flatMap(
    (section) => section.tabs,
  );

  assert.equal(mappedTabs.length, EXPECTED_TABS.length);
  assert.equal(new Set(mappedTabs).size, EXPECTED_TABS.length);

  assert.deepEqual(
    [...mappedTabs].sort(),
    [...EXPECTED_TABS].sort(),
  );
});

test("2. every tab-based section has a valid default tab", () => {
  for (const section of SUPERADMIN_PRIMARY_NAVIGATION) {
    if (section.kind !== "tabs") {
      assert.equal(section.defaultTab, null);
      assert.equal(section.tabs.length, 0);
      continue;
    }

    assert.ok(section.defaultTab);
    assert.ok(section.tabs.includes(section.defaultTab));
  }
});

test("3. Command Center owns only the dashboard view", () => {
  assert.deepEqual(
    getSuperAdminPrimarySection("command_center")?.tabs,
    ["dashboard"],
  );
});

test("4. Users & Access composes account and relationship views", () => {
  assert.equal(
    isSuperAdminTabInSection("approvals", "users_access"),
    true,
  );
  assert.equal(
    isSuperAdminTabInSection("users", "users_access"),
    true,
  );
  assert.equal(
    isSuperAdminTabInSection("relationships", "users_access"),
    true,
  );
  assert.equal(
    isSuperAdminTabInSection("profile_claims", "users_access"),
    true,
  );
});

test("5. Organizations owns the Academy directory", () => {
  assert.equal(
    findSuperAdminSectionForTab("academies")?.id,
    "organizations",
  );
});

test("6. Integrity Center owns Bootstrap Legacy", () => {
  assert.equal(
    findSuperAdminSectionForTab("bootstrap_legacy")?.id,
    "integrity_center",
  );
});

test("7. Audit Logs owns the system audit view", () => {
  assert.equal(
    findSuperAdminSectionForTab("system_logs")?.id,
    "audit_logs",
  );
});

test("8. preserved unavailable tools remain addressable", () => {
  assert.equal(
    findSuperAdminSectionForTab("observation_metrics")?.id,
    "support_tools",
  );
  assert.equal(
    findSuperAdminSectionForTab("payment_approvals")?.id,
    "support_tools",
  );
});

test("9. Notifications remains a shell destination", () => {
  const section = getSuperAdminPrimarySection("notifications");

  assert.equal(section?.kind, "shell");
  assert.equal(section?.defaultTab, null);
});

test("10. Reports remains an action destination", () => {
  const section = getSuperAdminPrimarySection("reports");

  assert.equal(section?.kind, "action");
  assert.equal(section?.defaultTab, null);
});

test("11. academy search results target Organizations academy directory", () => {
  const results = searchDashboardData({
    query: "Talum",
    users: [],
    academies: [
      {
        id: "academy-talumball",
        name: "Talumball Academy",
      },
    ],
    claims: [],
  });

  assert.equal(results.length, 1);

  const result = results[0];
  assert.ok(result);

  assert.equal(result.type, "academy");
  assert.equal(result.tab, "academies");
  assert.equal(
    findSuperAdminSectionForTab(result.tab)?.id,
    "organizations",
  );
});

test("12. academy search selection resolves Academy Directory filter", () => {
  const [result] = searchDashboardData({
    query: "Talum",
    users: [],
    academies: [
      {
        id: "academy-talumball",
        name: "Talumball Academy",
      },
    ],
    claims: [],
  });

  assert.ok(result);

  assert.deepEqual(
    resolveDashboardSearchSelection(result),
    {
      tab: "academies",
      accountQuery: "",
      academyQuery: "Talumball Academy",
      claimQuery: "",
    },
  );
});

test("13. search selection resolves account-specific query", () => {
  const [result] = searchDashboardData({
    query: "coach",
    users: [
      {
        id: "coach-1",
        uid: "coach-1",
        name: "Max Coach",
        email: "maxcoach@example.com",
        role: "COACH",
      } as any,
    ],
    academies: [],
    claims: [],
  });

  assert.ok(result);

  assert.deepEqual(
    resolveDashboardSearchSelection(result),
    {
      tab: "users",
      accountQuery: "maxcoach@example.com",
      academyQuery: "",
      claimQuery: "",
    },
  );
});

test("14. claim search selection resolves Profile Claims FUTID query", () => {
  const [result] = searchDashboardData({
    query: "FUT-0001",
    users: [],
    academies: [],
    claims: [
      {
        id: "claim-1",
        playerName: "Pandin",
        futId: "FUT-0001",
        userEmail: "parent@example.com",
      },
    ],
  });

  assert.ok(result);
  assert.equal(result.tab, "profile_claims");
  assert.equal(result.searchValue, "FUT-0001");

  assert.deepEqual(
    resolveDashboardSearchSelection(result),
    {
      tab: "profile_claims",
      accountQuery: "",
      academyQuery: "",
      claimQuery: "FUT-0001",
    },
  );
});

test("15. Support Tools description uses production-facing language", () => {
  const section = getSuperAdminPrimarySection("support_tools");

  assert.ok(section);

  assert.match(
    section.description,
    /match-observation configuration/i,
  );

  assert.equal(
    /provisional|deferred/i.test(section.description),
    false,
  );
});
