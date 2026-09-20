import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

// Bundle the real App with external service/UI boundaries replaced. Splitting
// preserves a genuinely deferred module evaluation (including load failures).
test("Pro Club module delivery respects eligibility, progress and recovery", async t => {
  const require = createRequire(import.meta.url);
  const dom = new JSDOM('<div id="root"></div>', { url: "https://test.invalid" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const fixture = {
    user: { uid: "actor", id: "actor", status: "ACTIVE", role: "USER", requestedRole: "COACH", supportPresentation: false },
    imports: 0, mounts: 0, logouts: 0,
    gate: Promise.resolve(),
  };
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true, entryFixture: fixture })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const mocks: Record<string, string> = {
    AuthContext: `export const useAuth = () => ({actualUser: globalThis.entryFixture.user, currentUser: globalThis.entryFixture.user, hasPermission: () => false, logout: () => {globalThis.entryFixture.logouts++}});`,
    AcademyContext: `const settings = {squads: []}; export const useAcademy = () => ({settings, academyId: null, accessState: "NO_ACADEMY", loading: false});`,
    LanguageContext: `export const useLanguage = () => ({language:"en", setLanguage:()=>{}, t:(key)=>key});`,
    SuperAdminSupportContext: `export const useSuperAdminSupport = () => ({isSupportActive:false});`,
    useNetworkStatus: `export const useNetworkStatus = () => ({isOnline:true});`,
  };
  async function loadApp() {
    const dir = await mkdtemp(join(tmpdir(), "pro-club-entry-test-"));
    const result = await build({ entryPoints: [resolve("src/App.tsx")], bundle: true, splitting: true,
      format: "esm", platform: "node", outdir: dir, outExtension: { ".js": ".mjs" }, write: false, jsx: "automatic",
      plugins: [{ name: "entry-boundaries", setup(b) {
        b.onResolve({ filter: /^(react|react\/jsx-runtime|lucide-react)$/ }, args => ({ path: require.resolve(args.path), external: true }));
        b.onResolve({ filter: /contexts\/|hooks\/useNetworkStatus/ }, args => {
          const name = args.path.split("/").at(-1)!;
          return mocks[name] ? { path: name, namespace: "fixture" } : undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
        b.onResolve({ filter: /components\// }, args => ({ path: args.path, namespace: "component" }));
        b.onLoad({ filter: /.*/, namespace: "component" }, args => {
          if (args.path.endsWith("ProClubPortal")) return { loader: "jsx", contents: `import React from 'react'; globalThis.entryFixture.imports++; await globalThis.entryFixture.gate; export default function Portal(){globalThis.entryFixture.mounts++; return <div>Club ready</div>}` };
          if (args.path.endsWith("EmptyState")) return { loader: "jsx", contents: `import React from 'react'; export function EmptyState(p){return <button onClick={p.onPrimaryAction}>{p.primaryActionLabel}</button>}` };
          return { loader: "jsx", contents: `import React from 'react'; export const SuperAdminSupportBar = () => null; export default function Placeholder(){return <div>Other destination</div>}` };
        });
      }}] });
    for (const file of result.outputFiles) await writeFile(file.path, file.text);
    let timer: ReturnType<typeof setTimeout>;
    try {
      return (await Promise.race([
        import(pathToFileURL(join(dir, "App.mjs")).href),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("App import blocked by eagerly loaded Pro Club module")), 500); }),
      ])).default;
    } finally { clearTimeout(timer!); }
  }
  let root = createRoot(dom.window.document.getElementById("root")!);
  const text = () => dom.window.document.body.textContent ?? "";
  const click = async (label: string) => {
    const button = [...dom.window.document.querySelectorAll("button")].find(b => b.textContent?.includes(label));
    assert.ok(button, label);
    await act(async () => { button.click(); });
  };
  const settle = async () => { await act(async () => { await new Promise(r => setTimeout(r, 30)); }); };
  const reset = async () => {
    await act(async () => root.unmount());
    root = createRoot(dom.window.document.getElementById("root")!);
    fixture.imports = 0; fixture.mounts = 0; fixture.logouts = 0;
    fixture.user.status = "ACTIVE"; fixture.user.supportPresentation = false;
  };
  try {
    await t.test("entry remains navigable while its module is pending", async () => {
      let release!: () => void;
      fixture.gate = new Promise(resolve => { release = resolve; });
      const App = await loadApp();
      await act(async () => root.render(<App />));
      await click("Join or open a Pro Club");
      await settle();
      assert.match(text(), /Loading Pro Club/);
      assert.equal(fixture.mounts, 0);
      await click("Sign out");
      assert.equal(fixture.logouts, 1);
      await click("Back to FutVerse");
      release(); await settle();
      assert.equal(fixture.mounts, 0);
    });
    await t.test("failed module offers navigation and explicit reload", async () => {
      await reset();
      let reject!: (error: Error) => void;
      fixture.gate = new Promise((_, fail) => { reject = fail; });
      const App = await loadApp();
      await act(async () => root.render(<App />));
      await click("Join or open a Pro Club"); await settle();
      const errors = t.mock.method(console, "error", () => {});
      await act(async () => { reject(new Error("offline")); });
      await settle();
      assert.match(text(), /Unable to load Pro Club/);
      assert.match(text(), /Reload/);
      await click("Back to FutVerse");
      errors.mock.restore();
    });
    await t.test("ineligible and support accounts do not preload", async () => {
      for (const mode of ["REJECTED", "SUPPORT"]) {
        await reset(); fixture.gate = Promise.resolve();
        fixture.user.status = mode === "REJECTED" ? "REJECTED" : "ACTIVE";
        fixture.user.supportPresentation = mode === "SUPPORT";
        const App = await loadApp();
        await act(async () => root.render(<App />)); await settle();
        assert.equal(fixture.imports, 0);
      }
    });
    await t.test("idle preload downloads code without mounting data consumers", async () => {
      await reset(); fixture.gate = Promise.resolve();
      let idle: (() => void) | undefined;
      Object.assign(dom.window, { requestIdleCallback: (cb: () => void) => { idle = cb; return 1; }, cancelIdleCallback: () => {} });
      const App = await loadApp();
      await act(async () => root.render(<App />));
      assert.ok(idle);
      await act(async () => idle!()); await settle();
      assert.equal(fixture.imports, 1);
      assert.equal(fixture.mounts, 0);
      await click("Join or open a Pro Club"); await settle();
      assert.match(text(), /Club ready/);
    });
    await t.test("cancelled idle callback cannot preload after account revocation", async () => {
      await reset(); fixture.gate = Promise.resolve();
      let idle: (() => void) | undefined;
      Object.assign(dom.window, { requestIdleCallback: (cb: () => void) => { idle = cb; return 7; }, cancelIdleCallback: () => {} });
      const App = await loadApp();
      await act(async () => root.render(<App />));
      assert.ok(idle);
      fixture.user = { ...fixture.user, status: "REJECTED" };
      await act(async () => root.render(<App />));
      await act(async () => idle!()); await settle();
      assert.equal(fixture.imports, 0);
    });
    await t.test("Safari timer fallback preloads without mounting the portal", async () => {
      await reset(); fixture.gate = Promise.resolve();
      Reflect.deleteProperty(dom.window, "requestIdleCallback");
      Reflect.deleteProperty(dom.window, "cancelIdleCallback");
      const App = await loadApp();
      await act(async () => root.render(<App />));
      await act(async () => { await new Promise(r => setTimeout(r, 1100)); });
      await settle();
      assert.equal(fixture.imports, 1);
      assert.equal(fixture.mounts, 0);
    });
    await t.test("speculative preload failure remains handled and navigation offers reload", async () => {
      await reset();
      let reject!: (error: Error) => void;
      fixture.gate = new Promise((_, fail) => { reject = fail; });
      let idle: (() => void) | undefined;
      Object.assign(dom.window, { requestIdleCallback: (cb: () => void) => { idle = cb; return 9; }, cancelIdleCallback: () => {} });
      const App = await loadApp();
      await act(async () => root.render(<App />));
      await act(async () => idle!()); await settle();
      reject(new Error("preload offline")); await settle();
      assert.equal(fixture.mounts, 0);
      assert.doesNotMatch(text(), /Unable to load/);
      const errors = t.mock.method(console, "error", () => {});
      await click("Join or open a Pro Club"); await settle();
      assert.match(text(), /Reload/);
      errors.mock.restore();
    });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  }
});
