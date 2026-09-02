import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createOrganizationResolutionResult,
  isOrganizationRuntimeAuthorized,
  type OrganizationResolutionStatus,
  type OrganizationRuntimeState,
} from "../src/lib/organizationRuntimeSelection";
import type { ProClubRuntimeAuthorityBridgeResult } from "../src/lib/organizationRuntimeProClubAuthorityBridge";

type AuthActor = { uid: string } | null;
type RuntimeContextValue = {
  readonly runtimeState: OrganizationRuntimeState;
  readonly selectProClub: (organizationId: string) => void;
};

let actualUser: AuthActor = null;
let currentUser: AuthActor = null;
let resolveAuthority: (
  request: unknown,
) => Promise<ProClubRuntimeAuthorityBridgeResult>;

function bridgeResult(
  request: unknown,
  status: OrganizationResolutionStatus,
): ProClubRuntimeAuthorityBridgeResult {
  const runtimeResult = createOrganizationResolutionResult(request, status);
  assert.ok(runtimeResult, "bridge mock must receive a trusted production request");

  return Object.freeze({
    sourceState:
      status === "AUTHORIZED" ? "FOUND" :
      status === "REJECTED" ? "MISSING" : "ERROR",
    runtimeResult,
  });
}

function deferredAuthority() {
  let complete!: (result: ProClubRuntimeAuthorityBridgeResult) => void;
  const promise = new Promise<ProClubRuntimeAuthorityBridgeResult>((resolve) => {
    complete = resolve;
  });
  return { promise, complete };
}

test(
  "OrganizationRuntimeProvider mounted Pro Club authority coordination",
  async (t) => {
    const authorityRequests: unknown[] = [];
    resolveAuthority = async () => {
      throw new Error("authority mock was not configured");
    };

    const authModule = t.mock.module(
      "../src/contexts/AuthContext.tsx",
      {
        namedExports: {
          useAuth: () => ({ actualUser, currentUser }),
        },
      },
    );
    const bridgeModule = t.mock.module(
      "../src/lib/organizationRuntimeProClubAuthorityBridge.ts",
      {
        namedExports: {
          resolveProClubRuntimeAuthority: (request: unknown) => {
            authorityRequests.push(request);
            return resolveAuthority(request);
          },
        },
      },
    );

    const {
      OrganizationRuntimeProvider,
      useOrganizationRuntime,
    } = await import("../src/contexts/OrganizationRuntimeContext.tsx");

    const dom = new JSDOM(
      "<!doctype html><html><body><div id=\"root\"></div></body></html>",
    );
    const globalNames = [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "Node",
      "IS_REACT_ACT_ENVIRONMENT",
    ] as const;
    const originalGlobals = new Map(
      globalNames.map((name) => [
        name,
        Object.getOwnPropertyDescriptor(globalThis, name),
      ]),
    );

    const replaceGlobal = (name: string, value: unknown) => {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value,
      });
    };

    replaceGlobal("window", dom.window);
    replaceGlobal("document", dom.window.document);
    replaceGlobal("navigator", dom.window.navigator);
    replaceGlobal("HTMLElement", dom.window.HTMLElement);
    replaceGlobal("Node", dom.window.Node);
    replaceGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    let root: Root | null = null;
    let latestContext: RuntimeContextValue | null = null;
    const observedStates: OrganizationRuntimeState[] = [];

    function RuntimeProbe() {
      const context = useOrganizationRuntime();
      latestContext = context;
      observedStates.push(context.runtimeState);
      return null;
    }

    const render = async (
      actualUid: string | null,
      presentedUid: string | null = actualUid,
      strictMode = false,
    ) => {
      actualUser = actualUid === null ? null : { uid: actualUid };
      currentUser = presentedUid === null ? null : { uid: presentedUid };

      await act(async () => {
        root?.render(
          strictMode ? (
            <StrictMode>
              <OrganizationRuntimeProvider>
                <RuntimeProbe />
              </OrganizationRuntimeProvider>
            </StrictMode>
          ) : (
            <OrganizationRuntimeProvider>
              <RuntimeProbe />
            </OrganizationRuntimeProvider>
          ),
        );
      });

      assert.ok(latestContext, "production consumer did not receive context");
      return latestContext;
    };

    const selectProClub = async (organizationId: string) => {
      assert.ok(latestContext, "runtime context is not mounted");
      await act(async () => {
        latestContext?.selectProClub(organizationId);
      });
      assert.ok(latestContext, "runtime context disappeared after selection");
      return latestContext.runtimeState;
    };

    const complete = async (
      deferred: ReturnType<typeof deferredAuthority>,
      request: unknown,
      status: OrganizationResolutionStatus,
    ) => {
      await act(async () => {
        deferred.complete(bridgeResult(request, status));
        await deferred.promise;
      });
    };

    const reset = async () => {
      if (root !== null) {
        await act(async () => {
          root?.unmount();
        });
      }
      root = createRoot(dom.window.document.getElementById("root")!);
      latestContext = null;
      observedStates.length = 0;
      authorityRequests.length = 0;
      actualUser = null;
      currentUser = null;
      resolveAuthority = async () => {
        throw new Error("authority mock was not configured");
      };
    };

    try {
      await t.test("exposes only runtime state and narrow Pro Club intent", async () => {
        await reset();
        const context = await render("uid-a");
        assert.deepEqual(
          Object.keys(context).sort(),
          ["runtimeState", "selectProClub"].sort(),
        );
        assert.equal(context.runtimeState.status, "UNSELECTED");
        assert.equal(isOrganizationRuntimeAuthorized(context.runtimeState), false);
      });

      await t.test("fails closed when unauthenticated", async () => {
        await reset();
        await render(null);
        const state = await selectProClub("club-a");
        assert.equal(state.status, "UNSELECTED");
        assert.equal(state.uid, null);
        assert.equal(authorityRequests.length, 0);
        assert.equal(isOrganizationRuntimeAuthorized(state), false);
      });

      await t.test("moves valid intent through RESOLVING to AUTHORIZED", async () => {
        await reset();
        resolveAuthority = async (request) => bridgeResult(request, "AUTHORIZED");
        await render("uid-a");
        const state = await selectProClub("club-a");
        assert.equal(state.status, "AUTHORIZED");
        assert.equal(state.uid, "uid-a");
        assert.equal(state.selection.organizationType, "PRO_CLUB");
        assert.equal(state.selection.organizationId, "club-a");
        assert.equal(isOrganizationRuntimeAuthorized(state), true);
        assert.ok(observedStates.some(({ status }) => status === "RESOLVING"));
        assert.equal(authorityRequests.length, 1);
      });

      await t.test("maps rejected authority without granting access", async () => {
        await reset();
        resolveAuthority = async (request) => bridgeResult(request, "REJECTED");
        await render("uid-a");
        const state = await selectProClub("club-a");
        assert.equal(state.status, "REJECTED");
        assert.equal(state.authorizationProof, null);
        assert.equal(isOrganizationRuntimeAuthorized(state), false);
      });

      await t.test("maps authority errors fail closed", async () => {
        await reset();
        resolveAuthority = async (request) => bridgeResult(request, "ERROR");
        await render("uid-a");
        const state = await selectProClub("club-a");
        assert.equal(state.status, "ERROR");
        assert.equal(state.authorizationProof, null);
        assert.equal(isOrganizationRuntimeAuthorized(state), false);
      });

      await t.test("keeps a null bridge result fail closed", async () => {
        await reset();
        resolveAuthority = async () => Object.freeze({
          sourceState: null,
          runtimeResult: null,
        });
        await render("uid-a");
        const state = await selectProClub("club-a");
        assert.equal(state.status, "RESOLVING");
        assert.equal(state.authorizationProof, null);
        assert.equal(isOrganizationRuntimeAuthorized(state), false);
        assert.equal(authorityRequests.length, 1);
      });

      await t.test("keeps an unexpected bridge rejection fail closed", async () => {
        await reset();
        resolveAuthority = async () => {
          throw new Error("unexpected bridge rejection");
        };
        await render("uid-a");
        const state = await selectProClub("club-a");
        assert.equal(state.status, "RESOLVING");
        assert.equal(state.authorizationProof, null);
        assert.equal(isOrganizationRuntimeAuthorized(state), false);
        assert.equal(authorityRequests.length, 1);
      });

      await t.test("does not resolve invalid organization IDs", async () => {
        await reset();
        await render("uid-a");
        const state = await selectProClub("../club-a");
        assert.equal(state.status, "UNSELECTED");
        assert.equal(state.uid, "uid-a");
        assert.equal(authorityRequests.length, 0);
      });

      await t.test("uses actualUser rather than support-presented currentUser", async () => {
        await reset();
        let requestedUid: string | null = null;
        resolveAuthority = async (request) => {
          requestedUid = (request as { uid: string }).uid;
          return bridgeResult(request, "AUTHORIZED");
        };
        await render("actual-uid", "presented-uid");
        const state = await selectProClub("club-a");
        assert.equal(requestedUid, "actual-uid");
        assert.equal(state.uid, "actual-uid");
        assert.equal(state.authorizationProof?.uid, "actual-uid");
      });

      await t.test("rejects stale A completion after selecting B", async () => {
        await reset();
        const pendingA = deferredAuthority();
        const pendingB = deferredAuthority();
        resolveAuthority = (request) =>
          (request as { organizationId: string }).organizationId === "club-a"
            ? pendingA.promise
            : pendingB.promise;

        await render("uid-a");
        await selectProClub("club-a");
        const requestA = authorityRequests[0];
        await selectProClub("club-b");
        const requestB = authorityRequests[1];
        await complete(pendingB, requestB, "AUTHORIZED");
        const authorizedB = latestContext!.runtimeState;
        assert.equal(authorizedB.status, "AUTHORIZED");
        assert.equal(authorizedB.selection?.organizationId, "club-b");

        await complete(pendingA, requestA, "AUTHORIZED");
        assert.strictEqual(latestContext!.runtimeState, authorizedB);
        assert.equal(latestContext!.runtimeState.selection?.organizationId, "club-b");
      });

      await t.test("ignores pending completion after logout", async () => {
        await reset();
        const pending = deferredAuthority();
        resolveAuthority = () => pending.promise;
        await render("uid-a");
        await selectProClub("club-a");
        const request = authorityRequests[0];

        await render(null);
        const loggedOut = latestContext!.runtimeState;
        assert.equal(loggedOut.status, "UNSELECTED");
        assert.equal(loggedOut.uid, null);
        await complete(pending, request, "AUTHORIZED");
        assert.strictEqual(latestContext!.runtimeState, loggedOut);
        assert.equal(isOrganizationRuntimeAuthorized(loggedOut), false);
      });

      await t.test("ignores pending completion after authenticated UID change", async () => {
        await reset();
        const pending = deferredAuthority();
        resolveAuthority = () => pending.promise;
        await render("uid-a");
        await selectProClub("club-a");
        const request = authorityRequests[0];

        await render("uid-b");
        const actorB = latestContext!.runtimeState;
        assert.equal(actorB.status, "UNSELECTED");
        assert.equal(actorB.uid, "uid-b");
        await complete(pending, request, "AUTHORIZED");
        assert.strictEqual(latestContext!.runtimeState, actorB);
        assert.equal(isOrganizationRuntimeAuthorized(actorB), false);
      });

      await t.test("preserves runtime state across same-UID rerenders", async () => {
        await reset();
        resolveAuthority = async (request) => bridgeResult(request, "AUTHORIZED");
        await render("uid-a");
        const authorized = await selectProClub("club-a");
        const sameActor = await render("uid-a", "different-presented-uid");
        assert.strictEqual(sameActor.runtimeState, authorized);
        assert.equal(authorityRequests.length, 1);
      });

      await t.test("deduplicates StrictMode authority reads by request identity", async () => {
        await reset();
        resolveAuthority = async (request) => bridgeResult(request, "AUTHORIZED");
        await render("uid-a", "uid-a", true);
        const state = await selectProClub("club-a");
        assert.equal(state.status, "AUTHORIZED");
        assert.equal(authorityRequests.length, 1);
        assert.equal(isOrganizationRuntimeAuthorized(state), true);
      });

      await t.test("does not publish an old result after unmount and successor mount", async () => {
        await reset();
        const pending = deferredAuthority();
        resolveAuthority = () => pending.promise;
        await render("uid-a");
        await selectProClub("club-a");
        const request = authorityRequests[0];

        await reset();
        const successor = await render("uid-b");
        await complete(pending, request, "AUTHORIZED");
        assert.strictEqual(latestContext!.runtimeState, successor.runtimeState);
        assert.equal(successor.runtimeState.status, "UNSELECTED");
        assert.equal(successor.runtimeState.uid, "uid-b");
      });

      await t.test("issues Pro Club requests only and adds no Academy behavior", async () => {
        await reset();
        let requestedType: string | null = null;
        resolveAuthority = async (request) => {
          requestedType = (request as { organizationType: string }).organizationType;
          return bridgeResult(request, "AUTHORIZED");
        };
        const context = await render("uid-a");
        await selectProClub("club-a");
        assert.equal(requestedType, "PRO_CLUB");
        assert.equal("selectAcademy" in context, false);
      });

      await t.test("does not expose authority injection surfaces", async () => {
        await reset();
        const context = await render("uid-a");
        for (const forbiddenKey of [
          "setRuntimeState",
          "uid",
          "generation",
          "resolutionRequest",
          "resolutionResult",
          "authorizationProof",
          "ops",
          "membershipAuthority",
        ]) {
          assert.equal(forbiddenKey in context, false, forbiddenKey);
        }
      });
    } finally {
      if (root !== null) {
        await act(async () => {
          root?.unmount();
        });
      }
      bridgeModule.restore();
      authModule.restore();
      for (const name of globalNames) {
        const descriptor = originalGlobals.get(name);
        if (descriptor === undefined) {
          delete (globalThis as Record<string, unknown>)[name];
        } else {
          Object.defineProperty(globalThis, name, descriptor);
        }
      }
      dom.window.close();
      actualUser = null;
      currentUser = null;
    }
  },
);
