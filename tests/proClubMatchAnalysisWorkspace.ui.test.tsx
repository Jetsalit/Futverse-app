import assert from "node:assert/strict";
import type { Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import test from "node:test";

import type { ProClubMatchAnalysisWorkspaceServices } from "../src/components/pro-club/operations/ProClubMatchAnalysisWorkspace";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import type { ProClubMatchRecord } from "../src/lib/firestore/proClubMatchStartingXIRepository";
import {
  createDefaultProClubAnalysisTopics,
  createEmptyProClubMatchAnalysis,
  createProClubAnalysisTopicSnapshot,
  validateProClubMatchAnalysis,
  type ProClubMatchAnalysis,
} from "../src/lib/proClubMatchAnalysis";
import type {
  ProClubAnalysisGameModelRecord,
} from "../src/lib/firestore/proClubAnalysisGameModelRepository";
import type {
  ProClubAnalysisTeamLogoRecord,
  ProClubAnalysisOpponentTeamRecord,
} from "../src/lib/firestore/proClubAnalysisLogoRepository";

const CLUB = "club-a";

function installDomGlobals(dom: JSDOM) {
  const values: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(values)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  return originals;
}

// React decides which input events to listen to when it is first loaded, so initialize it
// after a DOM is present. Each test then swaps in its own isolated JSDOM window.
const bootstrapDom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
installDomGlobals(bootstrapDom);
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: ProClubMatchAnalysisWorkspace } = await import(
  "../src/components/pro-club/operations/ProClubMatchAnalysisWorkspace"
);

function authority(
  staffRole: ProClubOrganizationAuthority["staffRole"] = "ANALYST",
): ProClubOrganizationAuthority {
  return {
    organizationId: CLUB,
    organizationType: "PRO_CLUB",
    organizationName: "Lampang United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "analyst-a",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

function match(matchId = "match-a"): ProClubMatchRecord {
  return {
    matchId,
    schemaVersion: 1,
    status: "SCHEDULED",
    squadLabel: "First Team",
    competitionName: "Thai League 3",
    opponentName: "Riverside FC",
    kickoffAt: new Date("2026-09-27T12:00:00.000Z"),
    venueType: "HOME",
    rosterPlayerKeys: [],
    rosterRevision: 0,
    rosterMutationPlayerKey: null,
    rosterMutationKind: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    createdBy: "head-a",
    createdByRole: "HEAD_COACH",
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedBy: "head-a",
    updatedByRole: "HEAD_COACH",
  };
}

function gameModel(): ProClubAnalysisGameModelRecord {
  return {
    schemaVersion: 1,
    topics: createDefaultProClubAnalysisTopics(),
    revision: 0,
    createdAt: null,
    createdBy: null,
    updatedAt: null,
    updatedBy: null,
  };
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const originals = installDomGlobals(dom);
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root: Root = createRoot(container);
  return {
    dom, container, root,
    cleanup() {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      dom.window.close();
    },
  };
}

async function flushUi() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")]
    .find((item) => item.textContent?.trim() === name);
  assert.ok(found, "Expected button " + name);
  return found;
}

function input(container: HTMLElement, label: string): HTMLInputElement {
  const found = [...container.querySelectorAll("input")]
    .find((item) => item.getAttribute("aria-label") === label);
  assert.ok(found, "Expected input " + label);
  return found;
}

async function setInput(runtime: ReturnType<typeof setupDom>, element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(runtime.dom.window.HTMLInputElement.prototype, "value")?.set;
  assert.ok(setter);
  setter.call(element, value);
  await act(async () => {
    element.dispatchEvent(new runtime.dom.window.InputEvent("input", {
      bubbles: true,
      data: value,
      inputType: "insertText",
    }));
    element.dispatchEvent(new runtime.dom.window.Event("change", { bubbles: true }));
  });
}

async function selectValue(runtime: ReturnType<typeof setupDom>, element: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(runtime.dom.window.HTMLSelectElement.prototype, "value")?.set;
  assert.ok(setter);
  setter.call(element, value);
  await act(async () => element.dispatchEvent(new runtime.dom.window.Event("change", { bubbles: true })));
}

function servicesHarness(initialAnalysis: ProClubMatchAnalysis | null = null) {
  let savedAnalysis: ProClubMatchAnalysis | null = initialAnalysis
    ? structuredClone(initialAnalysis)
    : null;
  let currentModel = gameModel();
  let saves = 0;
  let completions = 0;
  let topicSaves = 0;
  let teamLogo: ProClubAnalysisTeamLogoRecord | null = null;
  let opponents: ProClubAnalysisOpponentTeamRecord[] = [];
  const services: ProClubMatchAnalysisWorkspaceServices = {
    async listMatches() { return [match()]; },
    async getGameModel() { return currentModel; },
    async saveGameModel(_clubId, topics, revision) {
      topicSaves += 1;
      currentModel = {
        schemaVersion: 1,
        topics: topics.map((topic) => ({ ...topic, choices: [...topic.choices] })),
        revision: revision + 1,
        createdAt: new Date("2026-09-27T10:00:00.000Z"),
        createdBy: "analyst-a",
        updatedAt: new Date("2026-09-27T10:01:00.000Z"),
        updatedBy: "analyst-a",
      };
      return currentModel;
    },
    async getAnalysis() { return savedAnalysis ? structuredClone(savedAnalysis) : null; },
    async saveDraft(_clubId, _matchId, analysis, revision) {
      const validation = validateProClubMatchAnalysis(analysis);
      assert.equal(validation.ok, true, validation.errors.join(" "));
      saves += 1;
      const {
        recoveryWarning,
        recoverySaveRequired,
        ...savedDraft
      } = structuredClone(analysis);
      void recoveryWarning;
      void recoverySaveRequired;
      savedAnalysis = {
        ...savedDraft,
        status: "DRAFT",
        revision: revision + 1,
        createdAt: new Date("2026-09-27T10:02:00.000Z"),
        createdBy: "analyst-a",
        updatedAt: new Date("2026-09-27T10:02:00.000Z"),
        updatedBy: "analyst-a",
      };
      return structuredClone(savedAnalysis);
    },
    async completeAnalysis(_clubId, _matchId, analysis, revision) {
      completions += 1;
      savedAnalysis = {
        ...structuredClone(analysis),
        status: "COMPLETED",
        revision: revision + 1,
        updatedAt: new Date("2026-09-27T10:03:00.000Z"),
        updatedBy: "analyst-a",
      };
      return structuredClone(savedAnalysis);
    },
    async getTeamLogo() { return teamLogo; },
    async getProfileLogo() { return "https://assets.example.test/lampang.png"; },
    async saveTeamLogo(_clubId, value) {
      teamLogo = value ? {
        schemaVersion: 1,
        logoUrl: (value as { dataUrl: string }).dataUrl,
        mimeType: "image/webp",
        width: 128,
        height: 128,
        byteSize: 3,
        createdAt: new Date(),
        createdBy: "analyst-a",
        updatedAt: new Date(),
        updatedBy: "analyst-a",
      } : null;
      return teamLogo;
    },
    async listOpponentTeams() { return opponents; },
    async saveOpponentTeam(_clubId, opponentId, name, value) {
      const record: ProClubAnalysisOpponentTeamRecord = {
        opponentId,
        name,
        schemaVersion: 1,
        logoUrl: value ? (value as { dataUrl: string }).dataUrl : null,
        mimeType: value ? "image/webp" : null,
        width: value ? 128 : null,
        height: value ? 128 : null,
        byteSize: value ? 3 : null,
        createdAt: new Date(),
        createdBy: "analyst-a",
        updatedAt: new Date(),
        updatedBy: "analyst-a",
      };
      opponents = [...opponents.filter((item) => item.opponentId !== opponentId), record];
      return record;
    },
  };
  return {
    services,
    state: () => ({ savedAnalysis, saves, completions, topicSaves, currentModel }),
  };
}

test("seven-section editor saves all opponent findings, reopens the Draft, and builds its Overview", async () => {
  const runtime = setupDom();
  const harness = servicesHarness();
  let root = runtime.root;
  const props = { authority: authority(), services: harness.services };
  try {
    await act(async () => runtime.root.render(<ProClubMatchAnalysisWorkspace {...props} />));
    await flushUi();

    const tabs = [...runtime.container.querySelectorAll('[role="tab"]')];
    assert.deepEqual(tabs.map((item) => item.textContent?.trim()), [
      "Formation / Lineup",
      "In Possession ATT",
      "Out DEF",
      "Key Man",
      "Analysis",
      "Set Pieces",
      "การเข้าทำ",
    ]);

    await selectValue(runtime, runtime.container.querySelector<HTMLSelectElement>('select[aria-label="Opponent formation"]')!, "CUSTOM");
    await setInput(runtime, input(runtime.container, "Player name slot 1"), "Keeper One");
    await setInput(runtime, input(runtime.container, "Shirt number slot 1"), "1");
    await setInput(runtime, input(runtime.container, "Horizontal position slot 1"), "48");
    assert.equal(runtime.container.querySelector<HTMLSelectElement>('select[aria-label="Opponent formation"]')?.value, "CUSTOM");

    await act(async () => tabs[1]?.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));
    await selectValue(runtime, runtime.container.querySelector<HTMLSelectElement>('select[aria-label="Build Up"]')!, "Short");

    await act(async () => tabs[2]?.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));
    await selectValue(runtime, runtime.container.querySelector<HTMLSelectElement>('select[aria-label="Pressing"]')!, "High");

    await act(async () => tabs[3]?.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => button(runtime.container, "Add Key Man").click());
    assert.match(runtime.container.textContent ?? "", /Save draft to refresh Overview and Report\./);
    const keyManName = runtime.container.querySelector<HTMLInputElement>('input[aria-label^="Key man name "]');
    assert.ok(keyManName);
    await setInput(runtime, keyManName, "Noah Striker");

    await act(async () => tabs[4]?.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));
    const strengths = [...runtime.container.querySelectorAll("textarea")]
      .find((item) => item.getAttribute("aria-label") === "Strengths");
    assert.ok(strengths);
    const textSetter = Object.getOwnPropertyDescriptor(runtime.dom.window.HTMLTextAreaElement.prototype, "value")?.set;
    assert.ok(textSetter);
    textSetter.call(strengths, "Fast transitions");
    await act(async () => strengths.dispatchEvent(new runtime.dom.window.Event("input", { bubbles: true })));

    await act(async () => tabs[5]?.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));
    const corners = [...runtime.container.querySelectorAll("textarea")]
      .find((item) => item.getAttribute("aria-label") === "Attacking corners");
    assert.ok(corners);
    textSetter.call(corners, "Short corner routine");
    await act(async () => corners.dispatchEvent(new runtime.dom.window.Event("input", { bubbles: true })));

    await act(async () => tabs[6]?.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));
    const pattern = [...runtime.container.querySelectorAll("input[type=checkbox]")]
      .find((item) => item.parentElement?.textContent?.includes("Wide Attack"));
    assert.ok(pattern);
    await act(async () => pattern.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));

    await act(async () => button(runtime.container, "Save Draft").click());
    await flushUi();
    assert.equal(harness.state().saves, 1, runtime.container.textContent ?? "");
    const saved = harness.state().savedAnalysis;
    assert.ok(saved);
    assert.equal(saved.sections.FORMATION_LINEUP.slots[0]?.playerName, "Keeper One");
    assert.equal(saved.sections.FORMATION_LINEUP.slots[0]?.x, 48);
    assert.equal(saved.sections.IN_POSSESSION_ATT.topicValues["build-up"], "Short");
    assert.equal(saved.sections.OUT_DEF.topicValues.pressing, "High");
    assert.equal(saved.sections.KEY_MAN.players[0]?.name, "Noah Striker");
    assert.equal(saved.sections.ANALYSIS.strengths, "Fast transitions");
    assert.equal(saved.sections.SET_PIECES.attackingCorners, "Short corner routine");
    assert.ok(saved.sections.ATTACKING_PATTERNS.selected.includes("wide-attack"));

    await act(async () => button(runtime.container, "Overview").click());
    assert.match(runtime.container.textContent ?? "", /Keeper One/);
    assert.match(runtime.container.textContent ?? "", /Noah Striker/);
    assert.match(runtime.container.textContent ?? "", /Fast transitions/);
    assert.match(runtime.container.textContent ?? "", /Short corner routine/);

    await act(async () => root.unmount());
    root = createRoot(runtime.container);
    await act(async () => root.render(<ProClubMatchAnalysisWorkspace {...props} />));
    await flushUi();
    await act(async () => {
      const formationTab = [...runtime.container.querySelectorAll('[role="tab"]')]
        .find((item) => item.textContent?.trim() === "Formation / Lineup");
      assert.ok(formationTab);
      formationTab.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(input(runtime.container, "Player name slot 1").value, "Keeper One");
    assert.equal(runtime.container.querySelector<HTMLSelectElement>('select[aria-label="Opponent formation"]')?.value, "CUSTOM");
  } finally {
    await act(async () => root.unmount());
    runtime.cleanup();
  }
});

test("Game Model manager adds an editable topic and saves it as a reusable template", async () => {
  const runtime = setupDom();
  const harness = servicesHarness();
  try {
    await act(async () => runtime.root.render(
      <ProClubMatchAnalysisWorkspace authority={authority()} services={harness.services} />,
    ));
    await flushUi();
    await setInput(runtime, input(runtime.container, "Player name slot 1"), "Keeper One");
    await act(async () => button(runtime.container, "Manage Game Model topics").click());
    assert.match(runtime.container.textContent ?? "", /Manage topics/);
    const initial = [...runtime.container.querySelectorAll('input[aria-label^="Topic name "]')].length;
    await act(async () => button(runtime.container, "Add Topic").click());
    assert.equal([...runtime.container.querySelectorAll('input[aria-label^="Topic name "]')].length, initial + 1);
    const newTopic = [...runtime.container.querySelectorAll<HTMLInputElement>('input[aria-label^="Topic name "]')]
      .find((item) => item.value === "New Topic");
    assert.ok(newTopic);
    await setInput(runtime, newTopic, "Opponent rotation");
    await act(async () => button(runtime.container, "Save topics").click());
    await flushUi();
    assert.equal(harness.state().topicSaves, 1);
    assert.ok(
      harness.state().currentModel.topics.some((topic) => topic.name === "Opponent rotation"),
      runtime.container.textContent ?? "",
    );
    assert.equal(input(runtime.container, "Player name slot 1").value, "Keeper One");
    await act(async () => button(runtime.container, "Save Draft").click());
    await flushUi();
    assert.equal(harness.state().savedAnalysis?.sections.FORMATION_LINEUP.slots[0]?.playerName, "Keeper One");
    assert.doesNotMatch(runtime.container.textContent ?? "", /Manage topics/);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("Game Model manager keeps persistence errors visible inside the topic dialog", async () => {
  const runtime = setupDom();
  const harness = servicesHarness();
  const services: ProClubMatchAnalysisWorkspaceServices = {
    ...harness.services,
    async saveGameModel() {
      throw new Error("The topic template changed in another session.");
    },
  };
  try {
    await act(async () => runtime.root.render(
      <ProClubMatchAnalysisWorkspace authority={authority()} services={services} />,
    ));
    await flushUi();
    await act(async () => button(runtime.container, "Manage Game Model topics").click());
    await act(async () => button(runtime.container, "Save topics").click());
    await flushUi();
    assert.match(runtime.container.querySelector('[role="alert"]')?.textContent ?? "", /changed in another session/);
    assert.match(runtime.container.textContent ?? "", /Manage topics/);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("switching matches confirms before discarding an unsaved Analysis draft", async () => {
  const runtime = setupDom();
  const harness = servicesHarness();
  const services: ProClubMatchAnalysisWorkspaceServices = {
    ...harness.services,
    async listMatches() { return [match("match-a"), match("match-b")]; },
  };
  let allowDiscard = false;
  let confirmations = 0;
  runtime.dom.window.confirm = () => {
    confirmations += 1;
    return allowDiscard;
  };
  try {
    await act(async () => runtime.root.render(
      <ProClubMatchAnalysisWorkspace authority={authority()} services={services} />,
    ));
    await flushUi();
    const keyManTab = [...runtime.container.querySelectorAll('[role="tab"]')]
      .find((item) => item.textContent?.trim() === "Key Man");
    assert.ok(keyManTab);
    await act(async () => keyManTab.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true })));
    await act(async () => button(runtime.container, "Add Key Man").click());
    const keyManName = runtime.container.querySelector<HTMLInputElement>('input[aria-label^="Key man name "]');
    assert.ok(keyManName);
    await setInput(runtime, keyManName, "Unsaved player");

    const matchSelector = runtime.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Analysis match"]',
    );
    assert.ok(matchSelector);
    const originalMatchId = matchSelector.value;
    const nextMatchId = [...matchSelector.options]
      .find((item) => item.value !== originalMatchId)?.value;
    assert.ok(nextMatchId);
    await selectValue(runtime, matchSelector, nextMatchId);
    await flushUi();
    assert.equal(confirmations, 1);
    assert.equal(matchSelector.value, originalMatchId);
    assert.equal(
      runtime.container.querySelector<HTMLInputElement>('input[aria-label^="Key man name "]')?.value,
      "Unsaved player",
    );
    assert.ok([...runtime.container.querySelectorAll("button")]
      .some((item) => item.textContent?.trim() === "Remove key man"));

    allowDiscard = true;
    await selectValue(runtime, matchSelector, nextMatchId);
    await flushUi();
    assert.equal(confirmations, 2);
    assert.equal(matchSelector.value, nextMatchId);
    assert.equal(
      runtime.container.querySelector('input[aria-label^="Key man name "]'),
      null,
    );
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("disables Analysis editing while a draft save is pending", async () => {
  const runtime = setupDom();
  const harness = servicesHarness();
  let releaseSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  const services: ProClubMatchAnalysisWorkspaceServices = {
    ...harness.services,
    async saveDraft(clubId, matchId, analysis, revision) {
      await pendingSave;
      return harness.services.saveDraft(clubId, matchId, analysis, revision);
    },
  };
  try {
    await act(async () => runtime.root.render(
      <ProClubMatchAnalysisWorkspace authority={authority()} services={services} />,
    ));
    await flushUi();
    const nameField = input(runtime.container, "Player name slot 1");
    await setInput(runtime, nameField, "Saved name");

    await act(async () => button(runtime.container, "Save Draft").click());
    await flushUi();
    assert.equal(nameField.disabled, true);
    assert.equal(runtime.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Analysis match"]',
    )?.disabled, true);
    releaseSave();
    await flushUi();
    assert.equal(nameField.disabled, false);
    assert.equal(runtime.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Analysis match"]',
    )?.disabled, false);
    assert.equal(harness.state().savedAnalysis?.sections.FORMATION_LINEUP.slots[0]?.playerName, "Saved name");
  } finally {
    releaseSave();
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("recovered Analysis warns and requires a draft save before completion", async () => {
  const runtime = setupDom();
  const base = createEmptyProClubMatchAnalysis({
    matchId: "match-a",
    clubName: "Lampang United",
    clubLogoUrl: null,
    competitionName: "Thai League 3",
    opponentName: "Riverside FC",
    kickoffAt: null,
    topicSnapshot: createProClubAnalysisTopicSnapshot(createDefaultProClubAnalysisTopics()),
  });
  const recovered: ProClubMatchAnalysis = {
    ...base,
    status: "DRAFT",
    revision: 1,
    createdAt: new Date("2026-09-27T10:00:00.000Z"),
    createdBy: "analyst-a",
    updatedAt: new Date("2026-09-27T10:00:00.000Z"),
    updatedBy: "analyst-a",
    recoveryWarning: true,
    recoverySaveRequired: true,
  };
  const harness = servicesHarness(recovered);
  try {
    await act(async () => runtime.root.render(
      <ProClubMatchAnalysisWorkspace authority={authority()} services={harness.services} />,
    ));
    await flushUi();
    assert.match(runtime.container.textContent ?? "", /Some saved Analysis values were malformed and have been reset/);
    assert.equal(button(runtime.container, "Save Draft").disabled, false);
    assert.equal(button(runtime.container, "Save Analysis").disabled, true);
    assert.equal(button(runtime.container, "Overview").disabled, true);
    assert.equal(button(runtime.container, "Report").disabled, true);
    await act(async () => button(runtime.container, "Save Draft").click());
    await flushUi();
    assert.doesNotMatch(runtime.container.textContent ?? "", /Some saved Analysis values were malformed/);
    assert.equal(button(runtime.container, "Save Analysis").disabled, false);
    assert.equal(button(runtime.container, "Overview").disabled, false);
    assert.equal(button(runtime.container, "Report").disabled, false);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});
