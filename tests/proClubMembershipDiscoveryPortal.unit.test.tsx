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
  staffRole: "HEAD_COACH";
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
          currentUser: { uid, supportPresentation: false },
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
          const result = authorities.has(request.organizationId)
            ? "AUTHORIZED"
            : "REJECTED";
          return {
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
  }

  function findButtonContaining(label: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes(label),
    ) as HTMLButtonElement | undefined;
  }

  try {
    await t.test("remembered valid club remains the fastest canonical path", async () => {
      resetScenario();
      discoveryRows = [{ clubId: "club-alpha" }];
      assert.equal(rememberProClubWorkspaceSession("club-remembered"), true);

      await mountPortal();

      assert.equal(discoveryCalls.length, 0);
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
      assert.ok(workspaceLoads.includes("club-alpha"));
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
      assert.deepEqual(workspaceLoads, ["club-stale"]);
      assert.equal(resolutionRequests.length, 0);
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
