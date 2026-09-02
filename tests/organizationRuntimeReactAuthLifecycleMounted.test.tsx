import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

type AuthActor = { uid: string } | null;

let actualUser: AuthActor = null;

test(
  "OrganizationRuntimeProvider mounted React lifecycle",
  async (t) => {
    const authModule = t.mock.module(
      "../src/contexts/AuthContext.tsx",
      {
        namedExports: {
          useAuth: () => ({ actualUser }),
        },
      },
    );

    const {
      OrganizationRuntimeProvider,
      useOrganizationRuntime,
    } = await import("../src/contexts/OrganizationRuntimeContext.tsx");

    const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>");
    const globalNames = [
      "window",
      "document",
      "navigator",
      "HTMLElement",
      "Node",
      "fetch",
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

    let fetchCalls = 0;
    const unexpectedFetch: typeof fetch = (...args) => {
      fetchCalls += 1;
      throw new Error(`OrganizationRuntimeProvider unexpectedly fetched ${args[0]}`);
    };

    replaceGlobal("window", dom.window);
    replaceGlobal("document", dom.window.document);
    replaceGlobal("navigator", dom.window.navigator);
    replaceGlobal("HTMLElement", dom.window.HTMLElement);
    replaceGlobal("Node", dom.window.Node);
    replaceGlobal("fetch", unexpectedFetch);
    replaceGlobal("IS_REACT_ACT_ENVIRONMENT", true);

    let root: Root | null = null;
    const states: unknown[] = [];

    function RuntimeProbe() {
      states.push(useOrganizationRuntime().runtimeState);
      return null;
    }

    const render = async (uid: string | null, strictMode = false) => {
      actualUser = uid === null ? null : { uid };
      states.length = 0;

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

      const runtimeState = states.at(-1);
      assert.ok(runtimeState, "production consumer did not receive context state");
      return runtimeState as {
        readonly status: string;
        readonly uid: string | null;
        readonly selection: unknown;
        readonly authorizationProof: unknown;
      };
    };

    const assertClean = (state: {
      readonly status: string;
      readonly uid: string | null;
      readonly selection: unknown;
      readonly authorizationProof: unknown;
    }, uid: string | null) => {
      assert.equal(state.status, "UNSELECTED");
      assert.equal(state.uid, uid);
      assert.equal(state.selection, null);
      assert.equal(state.authorizationProof, null);
    };

    try {
      root = createRoot(dom.window.document.getElementById("root")!);

      const initial = await render(null);
      assertClean(initial, null);

      const actorA = await render("uid-a");
      assertClean(actorA, "uid-a");

      const sameActorA = await render("uid-a");
      assert.strictEqual(
        sameActorA,
        actorA,
        "same authenticated UID must keep the mounted runtime owner state",
      );

      const actorB = await render("uid-b");
      assertClean(actorB, "uid-b");
      assert.notStrictEqual(
        actorB,
        actorA,
        "UID change must create a clean runtime owner state",
      );

      await act(async () => {
        root?.unmount();
      });
      root = createRoot(dom.window.document.getElementById("root")!);

      const reloggedActorA = await render("uid-a");
      assertClean(reloggedActorA, "uid-a");
      assert.notStrictEqual(
        reloggedActorA,
        actorA,
        "unmount and re-login must not leak the prior runtime state",
      );

      await act(async () => {
        root?.unmount();
      });
      root = createRoot(dom.window.document.getElementById("root")!);

      const strictActor = await render("uid-a", true);
      assertClean(strictActor, "uid-a");
      assert.ok(states.length >= 1, "StrictMode did not render the production consumer");
      assert.ok(
        states.every((state) => {
          const value = state as {
            readonly status: string;
            readonly uid: string | null;
            readonly selection: unknown;
            readonly authorizationProof: unknown;
          };
          return (
            value.status === "UNSELECTED" &&
            value.uid === "uid-a" &&
            value.selection === null &&
            value.authorizationProof === null
          );
        }),
        "StrictMode must only expose clean fail-closed runtime state",
      );
      assert.equal(fetchCalls, 0, "provider must not perform network work");
    } finally {
      await act(async () => {
        root?.unmount();
      });
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
    }
  },
);
