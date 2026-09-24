import assert from "node:assert/strict";
import test from "node:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import ProClubFitnessResults, {
  canCreateProClubFitnessResults,
  type ProClubFitnessResultsServices,
} from "../src/components/pro-club/operations/ProClubFitnessResults";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import type { ProClubSquadRosterRecord } from "../src/lib/firestore/proClubSquadRosterRepository";
import type {
  ProClubFitnessResultCreateInput,
  ProClubFitnessResultHistoryEntry,
} from "../src/lib/proClubFitnessResult";
import { FOOTBALL_FITNESS_TEST_CATALOGUE } from "../src/lib/fitnessTestFoundation";

function authority(
  staffRole: ProClubOrganizationAuthority["staffRole"] = "FITNESS_COACH",
  overrides: Partial<ProClubOrganizationAuthority> = {},
): ProClubOrganizationAuthority {
  return {
    organizationId: "club-a",
    organizationType: "PRO_CLUB",
    organizationName: "Test United",
    organizationLevel: "T1",
    organizationStatus: "ACTIVE",
    userId: "fitness-coach-a",
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
    ...overrides,
  };
}

function rosterPlayer(
  playerKey: string,
  status: ProClubSquadRosterRecord["status"] = "ACTIVE",
): ProClubSquadRosterRecord {
  return {
    playerKey,
    schemaVersion: 1,
    futId: null,
    firstName: playerKey === "player-key-a" ? "Ari" : "Bo",
    lastName: "Player",
    position: "CM",
    additionalPositions: [],
    jerseyNumber: playerKey === "player-key-a" ? 8 : 9,
    squadLabel: "First Team",
    status,
    createdAt: "2026-09-01T00:00:00.000Z",
    createdBy: "head-coach-a",
    updatedAt: "2026-09-01T00:00:00.000Z",
    updatedBy: "head-coach-a",
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
    HTMLInputElement: window.HTMLInputElement,
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
    dom,
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

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const element = [...container.querySelectorAll("input")]
    .find((candidate) => candidate.getAttribute("aria-label") === label);
  assert.ok(element, `Expected input ${label}.`);
  return element;
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const element = [...container.querySelectorAll("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  assert.ok(element, `Expected button ${label}.`);
  return element;
}

function createServices(): {
  services: ProClubFitnessResultsServices;
  calls: { dates: string[]; historyPlayers: string[]; creates: unknown[] };
  remote: Record<string, Record<string, Record<string, number>>>;
  histories: Record<string, ProClubFitnessResultHistoryEntry[]>;
} {
  const calls = { dates: [] as string[], historyPlayers: [] as string[], creates: [] as unknown[] };
  const remote: Record<string, Record<string, Record<string, number>>> = {
    "2026-09-24": { "player-key-a": { speed_10m: 1.82 } },
    "2026-09-25": { "player-key-a": { speed_30m: 4.15 } },
  };
  const histories: Record<string, ProClubFitnessResultHistoryEntry[]> = {
    "player-key-a": [
      {
        id: "fit-v1-history-a",
        playerKey: "player-key-a",
        observedOn: "2026-09-24",
        definitionId: "football:speed_10m:v1",
        definitionVersion: 1,
        definitionKey: "speed_10m",
        definitionName: "10 m sprint",
        value: 1.82,
        unit: "s",
      },
    ],
  };
  const services: ProClubFitnessResultsServices = {
    async listRoster() {
      return [rosterPlayer("player-key-a"), rosterPlayer("player-key-b", "INACTIVE")];
    },
    async listResultsForDate({ observedOn }) {
      calls.dates.push(observedOn);
      return structuredClone(remote[observedOn] ?? {});
    },
    async listHistory({ playerKey }) {
      calls.historyPlayers.push(playerKey);
      return structuredClone(histories[playerKey] ?? []);
    },
    async createResults(request) {
      calls.creates.push(request);
      return request.inputs.map((input, index) => {
        const { playerKey, observedOn, definitionId, definitionVersion, value } = input;
        const definitionKey = definitionId.split(":")[1];
        const definition = FOOTBALL_FITNESS_TEST_CATALOGUE.find((candidate) =>
          candidate.id === definitionId && candidate.version === definitionVersion,
        );
        remote[observedOn] ??= {};
        remote[observedOn][playerKey] ??= {};
        remote[observedOn][playerKey][definitionKey] = value;
        if (definition) {
          histories[playerKey] ??= [];
          histories[playerKey].push({
            id: `fit-v1-${calls.creates.length}-${index}`,
            playerKey,
            observedOn,
            definitionId,
            definitionVersion,
            definitionKey: definition.key,
            definitionName: definition.name,
            value,
            unit: definition.unit,
          });
        }
        return { kind: "DEFINITELY_CREATED" as const, resultId: `fit-v1-${calls.creates.length}-${index}` };
      });
    },
  };
  return { services, calls, remote, histories };
}

test("write authority is limited to active canonical FITNESS_COACH authority", () => {
  assert.equal(canCreateProClubFitnessResults(authority()), true);
  assert.equal(canCreateProClubFitnessResults(authority("HEAD_COACH")), false);
  assert.equal(canCreateProClubFitnessResults(authority("FITNESS_COACH", { organizationStatus: "INACTIVE" })), false);
  assert.equal(canCreateProClubFitnessResults(authority("FITNESS_COACH", { membershipStatus: "INACTIVE" })), false);
  assert.equal(canCreateProClubFitnessResults(authority("FITNESS_COACH", { hasMembershipAuthority: false })), false);
});

test("saved results are immutable, persisted refresh and date switching update the grid, and player history is shown", async () => {
  const runtime = setupDom();
  const { services, calls, remote, histories } = createServices();
  const auth = authority();
  try {
    await act(async () => {
      runtime.root.render(<ProClubFitnessResults authority={auth} services={services} />);
    });
    await flushUi();

    const savedSpeed = inputByLabel(runtime.container, "Ari Player · 10 m sprint");
    assert.equal(savedSpeed.value, "1.82");
    assert.equal(savedSpeed.disabled, true);
    assert.match(runtime.container.textContent ?? "", /Player history/);
    assert.match(runtime.container.textContent ?? "", /1\.82 s/);
    const initialHistoryReads = calls.historyPlayers.length;
    assert.ok(initialHistoryReads > 0, "selected player history initially loads");

    const newJump = inputByLabel(runtime.container, "Ari Player · Vertical jump");
    assert.equal(newJump.disabled, false);
    const valueSetter = Object.getOwnPropertyDescriptor(runtime.window.HTMLInputElement.prototype, "value")?.set;
    assert.ok(valueSetter);
    valueSetter.call(newJump, "42");
    await act(async () => {
      newJump.dispatchEvent(new runtime.window.Event("input", { bubbles: true }));
    });
    assert.equal(newJump.value, "42");
    await act(async () => findButton(runtime.container, "Save results").click());
    await flushUi();

    assert.equal(calls.creates.length, 1, runtime.container.textContent ?? "");
    assert.deepEqual(calls.creates[0], {
      clubId: "club-a",
      inputs: [{
        playerKey: "player-key-a",
        definitionId: "football:vertical_jump:v1",
        definitionVersion: 1,
        value: 42,
        observedOn: "2026-09-24",
      }],
    });
    assert.equal(inputByLabel(runtime.container, "Ari Player · Vertical jump").disabled, true);
    assert.equal(inputByLabel(runtime.container, "Ari Player · Vertical jump").value, "42");
    assert.equal(histories["player-key-a"].length, 2, "save persisted the new observation before history refresh");
    assert.ok(calls.historyPlayers.length > initialHistoryReads, "save re-reads history without changing player or remounting");
    assert.match(runtime.container.textContent ?? "", /42 cm/);

    remote["2026-09-24"]["player-key-a"].speed_30m = 4.2;
    const historyReadsBeforeManualRefresh = calls.historyPlayers.length;
    await act(async () => findButton(runtime.container, "Refresh saved results").click());
    await flushUi();
    assert.equal(inputByLabel(runtime.container, "Ari Player · 30 m sprint").value, "4.2");
    assert.ok(calls.historyPlayers.length > historyReadsBeforeManualRefresh, "manual refresh re-reads current player history");

    const dateInput = runtime.container.querySelector('input[type="date"]');
    assert.ok(dateInput);
    valueSetter.call(dateInput, "2026-09-25");
    await act(async () => {
      dateInput.dispatchEvent(new runtime.window.Event("input", { bubbles: true }));
    });
    await flushUi();

    assert.ok(calls.dates.includes("2026-09-25"));
    assert.equal(inputByLabel(runtime.container, "Ari Player · 30 m sprint").value, "4.15");
    assert.equal(inputByLabel(runtime.container, "Ari Player · 10 m sprint").value, "");
    assert.ok(calls.historyPlayers.includes("player-key-a"));
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("one bulk save maps partial outcomes and retains only the failed draft", async () => {
  const runtime = setupDom();
  const { services, calls, remote } = createServices();
  const submittedInputs: ProClubFitnessResultCreateInput[][] = [];
  const createPersisted = services.createResults;
  services.createResults = async (request) => {
    submittedInputs.push([...request.inputs]);
    const persisted = await createPersisted({
      ...request,
      inputs: request.inputs.slice(0, 1),
    });
    return [
      ...persisted,
      { kind: "WRITE_FAILED", resultId: "fit-v1-failed", error: new Error("denied") },
    ];
  };

  try {
    await act(async () => {
      runtime.root.render(<ProClubFitnessResults authority={authority()} services={services} />);
    });
    await flushUi();

    const jump = inputByLabel(runtime.container, "Ari Player · Vertical jump");
    const sprint = inputByLabel(runtime.container, "Ari Player · 30 m sprint");
    const valueSetter = Object.getOwnPropertyDescriptor(runtime.window.HTMLInputElement.prototype, "value")?.set;
    assert.ok(valueSetter);
    valueSetter.call(jump, "42");
    await act(async () => jump.dispatchEvent(new runtime.window.Event("input", { bubbles: true })));
    valueSetter.call(sprint, "4.3");
    await act(async () => sprint.dispatchEvent(new runtime.window.Event("input", { bubbles: true })));
    await act(async () => findButton(runtime.container, "Save results").click());
    await flushUi();

    assert.equal(calls.creates.length, 1, "one Save action makes one bulk repository request");
    assert.deepEqual(submittedInputs[0].map(({ definitionId, value }) => ({ definitionId, value })), [
      { definitionId: "football:vertical_jump:v1", value: 42 },
      { definitionId: "football:speed_30m:v1", value: 4.3 },
    ]);
    assert.equal(remote["2026-09-24"]["player-key-a"].vertical_jump, 42);
    assert.equal(inputByLabel(runtime.container, "Ari Player · Vertical jump").disabled, true);
    assert.equal(inputByLabel(runtime.container, "Ari Player · 30 m sprint").value, "4.3");
    assert.equal(inputByLabel(runtime.container, "Ari Player · 30 m sprint").disabled, false);
    assert.match(runtime.container.textContent ?? "", /1 observation\(s\) confirmed/);
    assert.match(runtime.container.textContent ?? "", /1 observation\(s\) could not be confirmed; their drafts remain available/);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("idempotent-equivalent bulk outcomes refresh the selected player's history", async () => {
  const runtime = setupDom();
  const { services, calls } = createServices();
  const createAndPersist = services.createResults;
  services.createResults = async (request) =>
    (await createAndPersist(request)).map((outcome) => ({
      ...outcome,
      kind: "ALREADY_COMMITTED_EQUIVALENT" as const,
    }));

  try {
    await act(async () => {
      runtime.root.render(<ProClubFitnessResults authority={authority()} services={services} />);
    });
    await flushUi();
    const initialHistoryReads = calls.historyPlayers.length;
    const jump = inputByLabel(runtime.container, "Ari Player · Vertical jump");
    const valueSetter = Object.getOwnPropertyDescriptor(runtime.window.HTMLInputElement.prototype, "value")?.set;
    assert.ok(valueSetter);
    valueSetter.call(jump, "42");
    await act(async () => jump.dispatchEvent(new runtime.window.Event("input", { bubbles: true })));
    await act(async () => findButton(runtime.container, "Save results").click());
    await flushUi();

    assert.ok(calls.historyPlayers.length > initialHistoryReads);
    assert.match(runtime.container.textContent ?? "", /42 cm/);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("active non-FITNESS_COACH staff can read persisted results without save controls", () => {
  const markup = renderToStaticMarkup(
    <ProClubFitnessResults authority={authority("HEAD_COACH")} services={createServices().services} />,
  );
  assert.match(markup, /Read-only Pro Club Fitness results/);
  assert.doesNotMatch(markup, />Save results</);
  assert.match(markup, /Testing date/);
});

test("a deterministic identity conflict is surfaced and the saved value is preserved", async () => {
  const runtime = setupDom();
  const { services, calls, remote, histories } = createServices();
  services.createResults = async ({ inputs }) => {
    return inputs.map((input) => {
      remote[input.observedOn][input.playerKey].vertical_jump = 40;
      const definition = FOOTBALL_FITNESS_TEST_CATALOGUE.find((candidate) =>
        candidate.id === input.definitionId && candidate.version === input.definitionVersion,
      );
      if (definition) {
        histories[input.playerKey] = [
          ...(histories[input.playerKey] ?? []).filter((entry) =>
            entry.definitionId !== input.definitionId ||
            entry.definitionVersion !== input.definitionVersion ||
            entry.observedOn !== input.observedOn,
          ),
          {
            id: "fit-v1-existing",
            playerKey: input.playerKey,
            observedOn: input.observedOn,
            definitionId: input.definitionId,
            definitionVersion: input.definitionVersion,
            definitionKey: definition.key,
            definitionName: definition.name,
            value: 40,
            unit: definition.unit,
          },
        ];
      }
      return { kind: "OBSERVATION_CONFLICT" as const, resultId: "fit-v1-existing" };
    });
  };
  try {
    await act(async () => {
      runtime.root.render(<ProClubFitnessResults authority={authority()} services={services} />);
    });
    await flushUi();
    const initialHistoryReads = calls.historyPlayers.length;
    const jump = inputByLabel(runtime.container, "Ari Player · Vertical jump");
    const valueSetter = Object.getOwnPropertyDescriptor(runtime.window.HTMLInputElement.prototype, "value")?.set;
    assert.ok(valueSetter);
    valueSetter.call(jump, "42");
    await act(async () => jump.dispatchEvent(new runtime.window.Event("input", { bubbles: true })));
    await act(async () => findButton(runtime.container, "Save results").click());
    await flushUi();

    assert.match(runtime.container.textContent ?? "", /identity conflict.*preserved without overwrite/i);
    assert.ok(calls.historyPlayers.length > initialHistoryReads, "conflict refresh re-reads player history");
    assert.match(runtime.container.textContent ?? "", /40 cm/);
    const saved = inputByLabel(runtime.container, "Ari Player · Vertical jump");
    assert.equal(saved.value, "40");
    assert.equal(saved.disabled, true);
    assert.equal(remote["2026-09-24"]["player-key-a"].vertical_jump, 40);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});

test("component adapts existing Pro Club roster and result repositories without direct Firestore mutations", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile("src/components/pro-club/operations/ProClubFitnessResults.tsx", "utf8"),
  );
  assert.match(source, /listProClubSquadRoster/);
  assert.match(source, /listProClubFitnessResultsForDate/);
  assert.match(source, /listProClubFitnessResultHistory/);
  assert.match(source, /createProClubFitnessResults/);
  assert.doesNotMatch(source, /createProClubFitnessResult(?!s)/);
  assert.doesNotMatch(source, /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  assert.doesNotMatch(source, /(?:update|delete|correct)ProClubFitnessResult/i);
});
