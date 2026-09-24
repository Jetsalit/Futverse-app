import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

test("Fitness grid offers a dated save and keeps recorded results read-only", async () => {
  const module = await import("../src/components/FitnessTesting.tsx");
  const Grid = (module as typeof module & { FitnessTestingGrid?: React.ComponentType<any> }).FitnessTestingGrid;
  assert.ok(Grid, "FitnessTestingGrid must expose the usable entry controls");

  const html = renderToStaticMarkup(React.createElement(Grid, {
    players: [{ id: "player-a", firstName: "Player", lastName: "A", position: "CM", ageGroup: "U15", dob: "2011-01-01", age: 15, fitness_status: "Fit", avatar: "" }],
    testData: { "player-a": { vertical_jump: "43" } },
    savedData: { "player-a": { speed_10m: 1.82 } },
    setTestData: () => {},
    observedOn: "2026-09-24",
    onObservedOnChange: () => {},
    canRecordResults: true,
    resultsLoading: false,
    saving: false,
    pendingCount: 1,
    onSaveResults: () => {},
    entryMessage: null,
    onEditPlayer: () => {},
    onDeletePlayer: () => {},
    filterAge: "All",
    setFilterAge: () => {},
    squads: ["U15"],
    onAddPlayer: () => {},
  }));
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector<HTMLInputElement>('input[type="date"]')?.value, "2026-09-24");
  const sprint = document.querySelector<HTMLInputElement>('input[aria-label="10 m sprint for Player A"]');
  assert.equal(sprint?.value, "1.82");
  assert.equal(sprint?.disabled, true);
  const jump = document.querySelector<HTMLInputElement>('input[aria-label="Vertical jump for Player A"]');
  assert.equal(jump?.value, "43");
  assert.equal(jump?.disabled, false);
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Save 1 result"));
  assert.ok(save);
  assert.equal(save.disabled, false);
});

test("Fitness report renders persisted observation history with dates and units", async () => {
  const module = await import("../src/components/FitnessTesting.tsx");
  const History = (module as typeof module & { FitnessResultHistory?: React.ComponentType<any> }).FitnessResultHistory;
  assert.ok(History, "FitnessResultHistory must render stored observations");

  const html = renderToStaticMarkup(React.createElement(History, {
    history: [
      { id: "speed-result", playerId: "player-a", observedOn: "2026-09-24", definitionKey: "speed_10m", definitionName: "10 m sprint", value: 1.82, unit: "s" },
    ],
    loading: false,
    error: null,
  }));
  const document = new JSDOM(html).window.document;
  assert.match(document.body.textContent ?? "", /2026-09-24/);
  assert.match(document.body.textContent ?? "", /10 m sprint/);
  assert.match(document.body.textContent ?? "", /1\.82 s/);
});
