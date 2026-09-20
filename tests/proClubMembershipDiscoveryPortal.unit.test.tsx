import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createOrganizationResolutionResult } from "../src/lib/organizationRuntimeSelection";

interface DiscoveryRow {
  clubId: string;
}

interface Authority {
  organizationType: "PRO_CLUB";
  organizationId: string;
  userId: string;
  organizationName: string;
  organizationStatus: "ACTIVE";
  organizationLevel: "T3";
  membershipStatus: "ACTIVE";
  membershipAuthorizationRole: "MEMBER";
  hasMembershipAuthority: true;
  staffRole: "HEAD_COACH" | null;
}

test("Pro Club Membership Discovery V1 portal contract", async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "https://futverse.example/pro-club",
  });

  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  const uid = "coach-discovery";
  let discoveryRows: DiscoveryRow[] = [];
  let discoveryCalls: string[] = [];
  let workspaceLoads: string[] = [];
  let supportPresentation = false;
  let waitForAuthority: Promise<void> | null = null;
  let waitForDiscovery: Promise<void> | null = null;
  let discoveryFails = false;
  const resolutionRequests: Array<{ uid: string; organizationId: string }> = [];

  function authority(
    clubId: string,
    organizationName: string,
  ): Authority {
    return {
      organizationType: "PRO_CLUB",
      organizationId: clubId,
      userId: uid,
      organizationName,
      organizationStatus: "ACTIVE",
      organizationLevel: "T3",
      membershipStatus: "ACTIVE",
      membershipAuthorizationRole: "MEMBER",
      hasMembershipAuthority: true,
      staffRole: "HEAD_COACH",
    };
  }

  const authorities = new Map<string, Authority>([
    ["club-remembered", authority("club-remembered", "Remembered United")],
    ["club-alpha", authority("club-alpha", "Alpha United")],
    ["club-beta", authority("club-beta", "Beta City")],
  ]);

  const repo = {
    async inspectInvitation() {
      throw new Error("Invitation lookup is outside this targeted contract.");
    },
    async requestMembership() {
      throw new Error("Membership request is outside this targeted contract.");
    },
    async loadWorkspace(clubId: string, requestedUid: string) {
      workspaceLoads.push(clubId);
      assert.equal(requestedUid, uid);
      const value = authorities.get(clubId);
      if (!value) throw new Error("Canonical authority unavailable");
      return value;
    },
    async loadPending() {
      return [];
    },
    async reviewClaim() {
      throw new Error("Review is outside this targeted contract.");
    },
  };

  const mocks = [
    t.mock.module("../src/contexts/AuthContext.tsx", {
      namedExports: {
        useAuth: () => ({
          actualUser: { uid },
          currentUser: { uid, supportPresentation },
        }),
      },
    }),
    t.mock.module("../src/lib/firestore/proClubOnboardingRepository.ts", {
      namedExports: {
        proClubOnboardingRepository: repo,
        isProClubReviewer: () => false,
      },
    }),
    t.mock.module("../src/lib/firestore/proClubMembershipDiscoveryRepository.ts", {
      namedExports: {
        loadOwnProClubMembershipDiscoveries: async (requestedUid: string) => {
          discoveryCalls.push(requestedUid);
          if (waitForDiscovery) await waitForDiscovery;
          if (discoveryFails) throw new Error("Discovery unavailable");
          return discoveryRows;
        },
      },
    }),
    t.mock.module("../src/lib/organizationRuntimeProClubAuthorityBridge.ts", {
      namedExports: {
        resolveProClubRuntimeAuthority: async (
          request: { uid: string; organizationId: string },
        ) => {
          resolutionRequests.push(request);
          if (waitForAuthority) await waitForAuthority;
          const result = authorities.has(request.organizationId)
            ? "AUTHORIZED"
            : "REJECTED";
          return {
            authority: authorities.get(request.organizationId) ?? null,
            sourceState: result === "AUTHORIZED" ? "FOUND" : "MISSING",
            runtimeResult: createOrganizationResolutionResult(request, result),
          };
        },
      },
    }),
    t.mock.module("../src/components/pro-club/operations/ProClubOperationsDashboard.tsx", {
      defaultExport: () => <div>Operations dashboard</div>,
    }),
    t.mock.module("../src/components/pro-club/operations/ProClubTeamDashboard.tsx", {
      defaultExport: ({ authority }: { authority: Authority }) => (
        <div>Team dashboard {authority.organizationName}</div>
      ),
    }),
  ];

  const { default: ProClubPortal } = await import(
    "../src/components/pro-club/ProClubPortal"
  );
  const { OrganizationRuntimeProvider } = await import(
    "../src/contexts/OrganizationRuntimeContext"
  );
  const {
    clearProClubWorkspaceSession,
    rememberProClubWorkspaceSession,
  } = await import("../src/lib/proClubWorkspaceSession");

  const container = dom.window.document.getElementById("root")!;
  let root: Root | null = null;

  function text(): string {
    return container.textContent ?? "";
  }

  async function settle(rounds = 6): Promise<void> {
    for (let index = 0; index < rounds; index += 1) {
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  async function mountPortal(): Promise<void> {
    await act(async () => {
      root?.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <OrganizationRuntimeProvider>
          <ProClubPortal onBack={() => {}} onLogout={() => {}} />
        </OrganizationRuntimeProvider>,
      );
    });
    await settle();
  }

  async function mountPortalStrict(): Promise<void> {
    await act(async () => {
      root?.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <StrictMode>
          <OrganizationRuntimeProvider>
            <ProClubPortal onBack={() => {}} onLogout={() => {}} />
          </OrganizationRuntimeProvider>
        </StrictMode>,
      );
    });
    await settle();
  }

  function resetScenario(): void {
    clearProClubWorkspaceSession();
    discoveryRows = [];
    discoveryCalls = [];
    workspaceLoads = [];
    resolutionRequests.length = 0;
    supportPresentation = false;
    waitForAuthority = null;
    waitForDiscovery = null;
    discoveryFails = false;
  }

  function findButtonContaining(label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes(label),
    ) as HTMLButtonElement | undefined;
  }

  try {
    await t.test("re-entry cannot display retained authority during empty, failed or multiple-club discovery", async () => {
      for (const scenario of ["empty", "failed", "multiple"] as const) {
        resetScenario();
        discoveryRows = [{ clubId: "club-alpha" }];
        await mountPortal();
        assert.match(text(), /Team dashboard Alpha United/);
        await act(async () => root!.render(<OrganizationRuntimeProvider><div>FutVerse</div></OrganizationRuntimeProvider>));
        clearProClubWorkspaceSession();
        let release!: () => void;
        waitForDiscovery = new Promise(resolve => { release = resolve; });
        discoveryRows = scenario === "multiple" ? [{ clubId: "club-alpha" }, { clubId: "club-beta" }] : [];
        discoveryFails = scenario === "failed";
        await act(async () => root!.render(<OrganizationRuntimeProvider><ProClubPortal onBack={() => {}} onLogout={() => {}} /></OrganizationRuntimeProvider>));
        assert.doesNotMatch(text(), /Team dashboard/);
        assert.ok(container.querySelector('[role="status"]'));
        release(); await settle();
        assert.doesNotMatch(text(), /Team dashboard/);
        assert.match(text(), scenario === "multiple" ? /Choose your club/ : /Staff onboarding/);
        assert.equal(resolutionRequests.length, 1, "previous entry must not authorize this entry");
      }
    });
    await t.test("slow discovery shows retry and stale first response cannot reopen the wrong attempt", async () => {
      resetScenario();

      const originalSetTimeout = globalThis.setTimeout;
      const originalClearTimeout = globalThis.clearTimeout;
      Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        writable: true,
        value: ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
          originalSetTimeout(handler, timeout === 4000 ? 0 : timeout, ...args)) as typeof setTimeout,
      });
      Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        writable: true,
        value: originalClearTimeout,
      });

      let releaseFirst!: () => void;
      waitForDiscovery = new Promise(resolve => { releaseFirst = resolve; });
      discoveryRows = [{ clubId: "club-beta" }];

      try {
        await mountPortal();
        await settle();
        assert.match(text(), /This is taking longer than usual/);
        const retryButton = findButtonContaining("Try again");
        assert.ok(retryButton);
        assert.ok(findButtonContaining("Back"));
        assert.doesNotMatch(text(), /Team dashboard/);

        waitForDiscovery = null;
        discoveryRows = [{ clubId: "club-alpha" }];

        await act(async () => {
          retryButton.click();
        });
        await settle();

        assert.match(text(), /Team dashboard Alpha United/);
        assert.equal(resolutionRequests.at(-1)?.organizationId, "club-alpha");

        releaseFirst();
        await settle();

        assert.match(text(), /Team dashboard Alpha United/);
        assert.doesNotMatch(text(), /Beta City/);
        assert.equal(resolutionRequests.filter(({ organizationId }) => organizationId === "club-beta").length, 0);
      } finally {
        Object.defineProperty(globalThis, "setTimeout", {
          configurable: true,
          writable: true,
          value: originalSetTimeout,
        });
        Object.defineProperty(globalThis, "clearTimeout", {
          configurable: true,
          writable: true,
          value: originalClearTimeout,
        });
      }
    });

    await t.test("restored re-entry waits for a new authority generation", async () => {
      resetScenario();
      discoveryRows = [{ clubId: "club-alpha" }];
      await mountPortal();
      await act(async () => root!.render(<OrganizationRuntimeProvider><div>FutVerse</div></OrganizationRuntimeProvider>));
      let release!: () => void;
      waitForAuthority = new Promise(resolve => { release = resolve; });
      await act(async () => root!.render(<OrganizationRuntimeProvider><ProClubPortal onBack={() => {}} onLogout={() => {}} /></OrganizationRuntimeProvider>));
      assert.doesNotMatch(text(), /Team dashboard/);
      assert.equal(resolutionRequests.length, 2);
      release(); await settle();
      assert.match(text(), /Team dashboard Alpha United/);
      assert.deepEqual(workspaceLoads, []);
    });
    await t.test("pending restored authority shows only progress and safe navigation", async () => {
      resetScenario();
      let release!: () => void;
      waitForAuthority = new Promise(resolve => { release = resolve; });
      rememberProClubWorkspaceSession("club-remembered");
      await mountPortal();
      assert.ok(container.querySelector('[role="status"]'));
      assert.ok(findButtonContaining("Back to FutVerse"));
      assert.ok(findButtonContaining("Sign out"));
      assert.doesNotMatch(text(), /Your club starts here|Staff onboarding|Team dashboard/);
      release();
      await settle();
      assert.match(text(), /Remembered United/);
    });
    await t.test("active member without a staff role can enter", async () => {
      resetScenario();
      const player = { ...authority("club-player", "Player Club"), staffRole: null };
      authorities.set("club-player", player);
      discoveryRows = [{ clubId: "club-player" }];
      await mountPortal();
      assert.match(text(), /Player Club/);
      assert.deepEqual(workspaceLoads, []);
    });
    await t.test("support presentation cannot discover or enter a club", async () => {
      resetScenario();
      supportPresentation = true;
      await mountPortal();
      assert.match(text(), /Sign in with your own account/);
      assert.deepEqual(discoveryCalls, []);
      assert.deepEqual(resolutionRequests, []);
    });
    await t.test("remembered valid club remains the fastest canonical path", async () => {
      resetScenario();
      discoveryRows = [{ clubId: "club-alpha" }];
      assert.equal(rememberProClubWorkspaceSession("club-remembered"), true);

      await mountPortal();

      assert.equal(discoveryCalls.length, 0);
      assert.deepEqual(workspaceLoads, []);
      assert.equal(resolutionRequests.length, 1);
      assert.equal(resolutionRequests[0]?.uid, uid);
      assert.equal(resolutionRequests[0]?.organizationId, "club-remembered");
      assert.match(text(), /Remembered United/);
    });

    await t.test("one discovered canonical club opens automatically", async () => {
      resetScenario();
      discoveryRows = [{ clubId: "club-alpha" }];

      await mountPortal();

      assert.deepEqual(discoveryCalls, [uid]);
      assert.deepEqual(workspaceLoads, []);
      assert.equal(resolutionRequests.length, 1);
      assert.equal(resolutionRequests[0]?.organizationId, "club-alpha");
      assert.match(text(), /Alpha United/);
    });

    await t.test("one discovered canonical club still opens under React StrictMode", async () => {
      resetScenario();
      discoveryRows = [{ clubId: "club-alpha" }];

      await mountPortalStrict();

      assert.equal(resolutionRequests.length, 1);
      assert.equal(resolutionRequests[0]?.organizationId, "club-alpha");
      assert.match(text(), /Alpha United/);
    });

    await t.test("stale discovery pointer is authority-checked and cannot open a workspace", async () => {
      resetScenario();
      discoveryRows = [{ clubId: "club-stale" }];

      await mountPortal();

      assert.deepEqual(discoveryCalls, [uid]);
      assert.deepEqual(workspaceLoads, []);
      assert.equal(resolutionRequests.length, 1);
      assert.match(text(), /Staff onboarding/);
      assert.match(text(), /Club workspace/);
    });

    await t.test("zero valid candidates preserves onboarding and manual recovery", async () => {
      resetScenario();

      await mountPortal();

      assert.deepEqual(discoveryCalls, [uid]);
      assert.equal(resolutionRequests.length, 0);
      assert.ok(findButtonContaining("Staff onboarding"));
      const workspaceButton = findButtonContaining("Club workspace");
      assert.ok(workspaceButton);
      await act(async () => {
        workspaceButton.click();
      });
      assert.ok(container.querySelector("#club-workspace-reference"));
    });

    await t.test("manual club authority hang exposes retry without refresh and stale completion cannot override retry", async () => {
      resetScenario();

      const originalSetTimeout = globalThis.setTimeout;
      const originalClearTimeout = globalThis.clearTimeout;
      Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        writable: true,
        value: ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
          originalSetTimeout(handler, timeout === 4000 ? 0 : timeout, ...args)) as typeof setTimeout,
      });
      Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        writable: true,
        value: originalClearTimeout,
      });

      discoveryRows = [];
      await mountPortal();

      const workspaceButton = findButtonContaining("Club workspace");
      assert.ok(workspaceButton);
      await act(async () => {
        workspaceButton.click();
      });

      const input = container.querySelector("#club-workspace-reference") as HTMLInputElement | null;
      assert.ok(input);

      let releaseFirst!: () => void;
      waitForAuthority = new Promise(resolve => { releaseFirst = resolve; });

      await act(async () => {
        input.value = "club-alpha";
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      });

      const form = input.closest("form");
      assert.ok(form);

      try {
        await act(async () => {
          form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
        });
        await settle();

        assert.match(text(), /This is taking longer than usual/);
        const retryButton = findButtonContaining("Try again");
        assert.ok(retryButton);
        assert.ok(findButtonContaining("Back"));
        assert.doesNotMatch(text(), /Team dashboard/);

        waitForAuthority = null;

        await act(async () => {
          retryButton.click();
        });
        await settle();

        assert.match(text(), /Team dashboard Alpha United/);
        const requestsAfterRetry = resolutionRequests.length;
        assert.ok(requestsAfterRetry >= 2);

        releaseFirst();
        await settle();

        assert.match(text(), /Team dashboard Alpha United/);
        assert.equal(resolutionRequests.length, requestsAfterRetry);
      } finally {
        Object.defineProperty(globalThis, "setTimeout", {
          configurable: true,
          writable: true,
          value: originalSetTimeout,
        });
        Object.defineProperty(globalThis, "clearTimeout", {
          configurable: true,
          writable: true,
          value: originalClearTimeout,
        });
      }
    });

    await t.test("multiple canonical clubs require an authoritative-name choice", async () => {
      resetScenario();
      discoveryRows = [
        { clubId: "club-alpha" },
        { clubId: "club-beta" },
      ];

      await mountPortal();

      assert.deepEqual(discoveryCalls, [uid]);
      assert.deepEqual(workspaceLoads.sort(), ["club-alpha", "club-beta"]);
      assert.equal(
        resolutionRequests.length,
        0,
        "Discovery order must never auto-select the first valid club.",
      );

      const alphaButton = findButtonContaining("Alpha United");
      const betaButton = findButtonContaining("Beta City");
      assert.ok(alphaButton, "Selector must show authoritative Alpha United name.");
      assert.ok(betaButton, "Selector must show authoritative Beta City name.");
      assert.doesNotMatch(alphaButton.textContent ?? "", /club-alpha/);
      assert.doesNotMatch(betaButton.textContent ?? "", /club-beta/);

      await act(async () => {
        betaButton.click();
      });
      await settle();

      assert.equal(resolutionRequests.length, 1);
      assert.equal(resolutionRequests[0]?.organizationId, "club-beta");
      assert.match(text(), /Beta City/);
    });
  } finally {
    await act(async () => {
      root?.unmount();
    });
    for (const mock of mocks.reverse()) mock.restore();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
