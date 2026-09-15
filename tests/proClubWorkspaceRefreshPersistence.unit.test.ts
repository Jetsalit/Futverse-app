import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import type { User } from "../src/contexts/AuthContext";

function activeUser(overrides: Partial<User> = {}): User {
  return {
    uid: "staff-a",
    id: "staff-a",
    name: "Staff A",
    role: "USER",
    requestedRole: "COACH",
    status: "Active",
    ...overrides,
  } as User;
}

test("Pro Club workspace session restores only navigation intent", async () => {
  const dom = new JSDOM("<!doctype html><div></div>", {
    url: "https://futverse.example/",
  });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: dom.window,
  });

  try {
    const {
      clearProClubWorkspaceSession,
      readProClubWorkspaceSession,
      rememberProClubWorkspaceSession,
    } = await import("../src/lib/proClubWorkspaceSession");
    const { appShellLandingPage } = await import("../src/contexts/academyAccessModel");

    clearProClubWorkspaceSession();
    assert.equal(readProClubWorkspaceSession(), null);
    assert.equal(appShellLandingPage(activeUser()), "dashboard");

    assert.equal(rememberProClubWorkspaceSession("club-a"), true);
    assert.equal(readProClubWorkspaceSession(), "club-a");
    assert.equal(appShellLandingPage(activeUser()), "pro_club");

    // The session stores only an exact club document id. It never stores role,
    // membership state, authorization proof, or a trusted runtime object.
    assert.deepEqual(
      Object.keys(dom.window.sessionStorage),
      ["futverse.proClub.workspace.v1"],
    );
    assert.equal(
      dom.window.sessionStorage.getItem("futverse.proClub.workspace.v1"),
      "club-a",
    );

    dom.window.sessionStorage.setItem(
      "futverse.proClub.workspace.v1",
      "invalid/club",
    );
    assert.equal(readProClubWorkspaceSession(), null);
    assert.equal(appShellLandingPage(activeUser()), "dashboard");

    assert.equal(rememberProClubWorkspaceSession("club-b"), true);
    assert.equal(
      appShellLandingPage(
        activeUser({ role: "SUPERADMIN", status: "Active" }),
      ),
      "superadmin",
    );

    clearProClubWorkspaceSession();
    assert.equal(appShellLandingPage(activeUser()), "dashboard");
  } finally {
    dom.window.close();
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  }
});
