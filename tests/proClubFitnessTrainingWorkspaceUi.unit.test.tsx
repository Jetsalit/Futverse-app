import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

import ProClubFitnessTrainingWorkspace, {
  type ProClubFitnessTrainingWorkspaceProps,
} from "../src/components/pro-club/operations/ProClubFitnessTrainingWorkspace";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import type { ProClubFitnessWeeklyTrainingReadV1Selection } from "../src/lib/proClubFitnessWeeklyTrainingRead";
import type { ProClubFitnessResultsServices } from "../src/components/pro-club/operations/ProClubFitnessResults";
import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository";

function authority(
  staffRole: ProClubOrganizationAuthority["staffRole"] = "HEAD_COACH",
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-a",
    organizationType: "PRO_CLUB",
    organizationName: "Test United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "head-coach-a",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const window = dom.window;
  const values: Record<string, unknown> = {
    window,
    document: window.document,
    navigator: window.navigator,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLButtonElement: window.HTMLButtonElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    MutationObserver: window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const original = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(values)) {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const root: Root = createRoot(container);
  return {
    window,
    container,
    root,
    cleanup() {
      for (const [name, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      dom.window.close();
    },
  };
}

async function flushUi() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function rosterPlayer(): ProClubSquadRosterRecord {
  return {
    playerKey: "player-a",
    schemaVersion: 1,
    futId: null,
    firstName: "Alex",
    lastName: "Active",
    position: "ST",
    additionalPositions: [],
    jerseyNumber: 9,
    squadLabel: "Senior",
    status: "ACTIVE",
    createdAt: null,
    createdBy: "coach-a",
    updatedAt: null,
    updatedBy: "coach-a",
  };
}

function resultServices(): ProClubFitnessResultsServices {
  return {
    async listRoster() { return [rosterPlayer()]; },
    async listPhotos() { return []; },
    async listResultsForDate() { return {}; },
    async listHistory() { return []; },
    async createResults() { return []; },
  };
}

function emptySelection(): ProClubFitnessWeeklyTrainingReadV1Selection {
  return {
    state: "NO_DATA",
    organization: { organizationType: "PRO_CLUB", organizationId: "club-a" },
    observations: [],
    prescription: null,
  };
}

function props(
  staffRole: ProClubOrganizationAuthority["staffRole"],
  loadWeeklyFitnessContext: NonNullable<ProClubFitnessTrainingWorkspaceProps["loadWeeklyFitnessContext"]>,
): ProClubFitnessTrainingWorkspaceProps {
  return {
    authority: authority(staffRole),
    organization: { organizationType: "PRO_CLUB", organizationId: "club-a" },
    canManageCatalogue: false,
    resultsServices: resultServices(),
    loadWeeklyFitnessContext,
  };
}

test("renders three horizontally usable tabs and loads no Fitness context before Weekly Training", async () => {
  const runtime = setupDom();
  let weeklyReads = 0;
  const loadWeeklyFitnessContext: NonNullable<ProClubFitnessTrainingWorkspaceProps["loadWeeklyFitnessContext"]> = async () => {
    weeklyReads += 1;
    return emptySelection();
  };
  try {
    await act(async () => {
      runtime.root.render(
        <ProClubFitnessTrainingWorkspace {...props("HEAD_COACH", loadWeeklyFitnessContext)} />,
      );
    });
    await flushUi();

    const tablist = runtime.container.querySelector('[role="tablist"]');
    assert.ok(tablist);
    assert.match(tablist.className, /overflow-x-auto/);
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    assert.deepEqual(tabs.map((tab) => tab.textContent?.trim()), [
      "Fitness Tests",
      "Fitness Results",
      "Weekly Training",
    ]);
    assert.equal(tabs[0]?.getAttribute("aria-selected"), "true");
    assert.match(runtime.container.textContent ?? "", /Fitness test catalogue/);
    assert.doesNotMatch(runtime.container.textContent ?? "", /Fitness results/);
    assert.equal(weeklyReads, 0, "tests surface must not load Fitness collection context");

    await act(async () => {
      (tabs[1] as HTMLButtonElement).dispatchEvent(
        new runtime.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await flushUi();
    assert.match(runtime.container.textContent ?? "", /Fitness results/);
    assert.doesNotMatch(runtime.container.textContent ?? "", /Fitness test catalogue/);
    assert.equal(weeklyReads, 0, "results surface must not load Weekly Training context");
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("non-Head-Coach Weekly Training shows authority guidance without a context read", async () => {
  const runtime = setupDom();
  let weeklyReads = 0;
  const loadWeeklyFitnessContext: NonNullable<ProClubFitnessTrainingWorkspaceProps["loadWeeklyFitnessContext"]> = async () => {
    weeklyReads += 1;
    return emptySelection();
  };
  try {
    await act(async () => {
      runtime.root.render(
        <ProClubFitnessTrainingWorkspace {...props("FITNESS_COACH", loadWeeklyFitnessContext)} />,
      );
    });
    await act(async () => {
      const weeklyTab = [...runtime.container.querySelectorAll('[role="tab"]')]
        .find((tab) => tab.textContent?.trim() === "Weekly Training");
      assert.ok(weeklyTab);
      (weeklyTab as HTMLButtonElement).dispatchEvent(
        new runtime.window.MouseEvent("click", { bubbles: true }),
      );
    });
    await flushUi();
    assert.match(runtime.container.textContent ?? "", /active Pro Club Head Coach authority is required/i);
    assert.doesNotMatch(runtime.container.textContent ?? "", /Fitness test catalogue|Fitness results/);
    assert.equal(weeklyReads, 0);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});
