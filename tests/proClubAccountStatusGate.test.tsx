import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import type { Root } from "react-dom/client";
import type { User } from "../src/contexts/AuthContext";
import { createOrganizationResolutionResult, type OrganizationResolutionRequest } from "../src/lib/organizationRuntimeSelection";

test("App gates Pro Club entry by canonical account eligibility before rendering the portal", async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost:3000" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const account = (status: unknown = "Active"): User => ({
    uid: "staff", id: "staff", name: "Club Staff", role: "USER", requestedRole: "COACH", status,
  });
  let actualUser: User | null = account();
  let currentUser: User | null = actualUser;
  let activeMembership = true;
  let workspaceReads = 0;
  let authorityReads = 0;
  const mocks: Array<{ restore(): void }> = [];
  const unrelatedComponents = ["PlayerDashboard", "FitnessTesting", "CoachManagement", "TacticBoard",
    "DrillLibrary", "YouthPlayerManager", "YouthPlayerCV", "YouthDevelopmentReport", "ScoutDashboard",
    "ProPlayerManager", "ProPlayerCV", "RecoveryDashboard", "IDPDashboard", "WeeklyPeriodization", "Settings",
    "NotificationDrawer", "PostMatchStatsEntry", "StartingXIBuilder", "SuperadminPortal", "SubscriptionPaywall",
    "ConciergeDashboard", "Login", "JoinAcademy", "PendingApproval", "AccessDenied", "match/MatchWorkspace"];
  for (const name of unrelatedComponents) {
    mocks.push(t.mock.module(`../src/components/${name}.tsx`, {
      defaultExport: () => <div>{name}</div>,
    }));
  }
  mocks.push(
    t.mock.module("../src/components/Dashboard.tsx", { defaultExport: ({ onNavigate }: { onNavigate: (page: string) => void }) =>
      <div>Academy dashboard<button onClick={() => onNavigate("matches")}>Open Academy matches</button></div> }),
    t.mock.module("../src/hooks/useNetworkStatus.ts", { namedExports: { useNetworkStatus: () => ({ isOnline: true }) } }),
    t.mock.module("../src/contexts/LanguageContext.tsx", { namedExports: {
      useLanguage: () => ({ language: "en", setLanguage() {}, t: (key: string) => key }),
    } }),
    t.mock.module("../src/contexts/AuthContext.tsx", { namedExports: { useAuth: () => ({
      actualUser, currentUser, logout() {}, hasPermission: () => true,
    }) } }),
    t.mock.module("../src/contexts/AcademyContext.tsx", { namedExports: { useAcademy: () => ({
      settings: { squads: ["First team"], name: "Academy A" }, academyId: "academy-a",
      accessState: "ACTIVE_MEMBERSHIP", loading: false, error: null,
    }) } }),
    t.mock.module("../src/contexts/SuperAdminSupportContext.tsx", { namedExports: { useSuperAdminSupport: () => ({
      isSupportActive: false, presentationRole: null, exitSupportMode() {},
    }) } }),
    t.mock.module("../src/components/superadmin/SuperAdminSupportBar.tsx", { namedExports: { SuperAdminSupportBar: () => null } }),
    t.mock.module("../src/lib/firestore/proClubOnboardingRepository.ts", { namedExports: {
      isProClubReviewer: () => false,
      proClubOnboardingRepository: {
        async loadWorkspace() {
          ++workspaceReads;
          assert.equal(activeMembership, true, "Workspace must retain its membership boundary");
          return { organizationName: "Test United", membershipAuthorizationRole: "MEMBER", staffRole: "HEAD_COACH" };
        },
      },
    } }),
    t.mock.module("../src/lib/organizationRuntimeProClubAuthorityBridge.ts", { namedExports: {
      async resolveProClubRuntimeAuthority(request: OrganizationResolutionRequest) {
        ++authorityReads;
        assert.equal(request.uid, "staff");
        assert.equal(request.organizationId, "club-a");
        return { sourceState: activeMembership ? "FOUND" : "MISSING",
          runtimeResult: createOrganizationResolutionResult(request, activeMembership ? "AUTHORIZED" : "REJECTED") };
      },
    } }),
  );
  const { default: App } = await import("../src/App");
  const { OrganizationRuntimeProvider } = await import("../src/contexts/OrganizationRuntimeContext");
  const container = dom.window.document.getElementById("root")!;
  let root: Root | null = null;
  const content = () => container.textContent ?? "";
  const buttons = () => [...container.querySelectorAll("button")];
  async function render() {
    await act(async () => { root!.render(<OrganizationRuntimeProvider><App /></OrganizationRuntimeProvider>); });
  }
  async function mount(user = account()) {
    await act(async () => { root?.unmount(); });
    actualUser = user; currentUser = user; activeMembership = true;
    root = createRoot(container);
    await render();
  }
  async function click(label: string) {
    const button = buttons().find((item) => item.textContent?.trim() === label);
    assert.ok(button, `Missing button: ${label}`);
    await act(async () => { button.click(); });
  }
  async function openWorkspace() {
    await click("Join or open a Pro Club");
    await click("Club workspace");
    const input = container.querySelector<HTMLInputElement>("#club-workspace-reference")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "club-a");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  }
  function assertNoPortal() {
    assert.doesNotMatch(content(), /Your club starts here|Test United|Pro Club workspace/);
  }
  try {
    for (const status of ["Active", "ACTIVE"]) {
      await t.test(`${status} account with ACTIVE membership opens the workspace`, async () => {
        await mount(account(status)); await openWorkspace();
        assert.match(content(), /Test United/);
        assert.match(content(), /Your club membership is active/);
      });
    }
    for (const status of ["REJECTED", "PENDING", "Pending", "Inactive", "INACTIVE", "SUSPENDED"]) {
      await t.test(`${status} replaces an open workspace even while its membership remains ACTIVE`, async () => {
        await mount(); await openWorkspace();
        assert.match(content(), /Test United/);
        const readsBefore = [workspaceReads, authorityReads];
        actualUser = account(status); currentUser = actualUser;
        await render();
        assertNoPortal(); assert.match(content(), /AccessDenied/);
        assert.equal(activeMembership, true);
        assert.deepEqual([workspaceReads, authorityReads], readsBefore);
      });
    }
    for (const status of [undefined, null, "", "active", { status: "ACTIVE" }]) {
      await t.test(`invalid canonical status ${JSON.stringify(status)} cannot inherit presented ACTIVE status`, async () => {
        await mount(); await openWorkspace();
        actualUser = { ...account(), status };
        // Deliberately retain the prior presented user and cached authorized runtime.
        await render(); assertNoPortal(); assert.match(content(), /AccessDenied/);
      });
    }
    await t.test("initial REJECTED account offers no route into Pro Club", async () => {
      const readsBefore = [workspaceReads, authorityReads];
      await mount(account("REJECTED"));
      assertNoPortal();
      assert.ok(!buttons().some((button) => /Pro Club/.test(button.textContent ?? "")));
      assert.deepEqual([workspaceReads, authorityReads], readsBefore);
    });
    await t.test("missing canonical account blocks an already selected portal despite a retained presented user", async () => {
      await mount(); await openWorkspace();
      actualUser = null;
      await render(); assertNoPortal();
      currentUser = null;
      await render(); assertNoPortal(); assert.match(content(), /Login/);
    });
    await t.test("allowed account without membership cannot render the workspace", async () => {
      await mount(); activeMembership = false;
      const readsBefore = workspaceReads;
      await openWorkspace();
      assert.match(content(), /This club workspace is unavailable for your account/);
      assert.doesNotMatch(content(), /Test United/);
      assert.equal(workspaceReads, readsBefore);
    });
    for (const role of ["ADMIN", "COACH"] as const) {
      await t.test(`valid Academy ${role} keeps its dashboard and match route`, async () => {
        await mount({ ...account(), role });
        assert.match(content(), /Academy dashboard/);
        await click("Open Academy matches");
        assert.match(content(), /match\/MatchWorkspace/);
        assertNoPortal();
      });
    }
    await t.test("Academy staff onboarding and pending account destinations remain intact", async () => {
      await mount(); await click("Continue to Academy / account");
      assert.match(content(), /JoinAcademy/);
      await mount(account("Inactive"));
      assert.match(content(), /JoinAcademy/);
      await mount({ ...account("PENDING"), requestedRole: "SCOUT" });
      assert.match(content(), /PendingApproval/);
    });
  } finally {
    await act(async () => { root?.unmount(); });
    mocks.forEach((mock) => mock.restore());
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
