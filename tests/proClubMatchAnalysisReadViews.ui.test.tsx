import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

import {
  ProClubMatchAnalysisOverview,
  ProClubMatchAnalysisReport,
} from "../src/components/pro-club/operations/ProClubMatchAnalysisReadViews";
import {
  createDefaultProClubAnalysisTopics,
  createEmptyProClubMatchAnalysis,
  createProClubAnalysisTopicSnapshot,
  type ProClubMatchAnalysis,
} from "../src/lib/proClubMatchAnalysis";

const TEAM_LOGO = "data:image/webp;base64,dGVhbQ==";
const OPPONENT_LOGO = "data:image/webp;base64,b3Bwb25lbnQ=";

function sampleAnalysis(): ProClubMatchAnalysis {
  const topics = createDefaultProClubAnalysisTopics()
    .filter((topic) => topic.id === "build-up" || topic.id === "pressing")
    .map((topic) => ({
      ...topic,
      includeInAnalysis: topic.id === "build-up",
      includeInSummary: topic.id === "pressing",
    }));
  const empty = createEmptyProClubMatchAnalysis({
    matchId: "match-a",
    clubName: "Lampang United",
    clubLogoUrl: TEAM_LOGO,
    competitionName: "Thai League 3",
    opponentName: "Riverside FC",
    kickoffAt: "2026-09-27T12:00:00.000Z",
    topicSnapshot: createProClubAnalysisTopicSnapshot(topics),
  });
  return {
    ...empty,
    status: "COMPLETED",
    revision: 3,
    opponentSnapshot: {
      teamId: "riverside-fc",
      name: "Riverside FC",
      logoUrl: OPPONENT_LOGO,
    },
    sections: {
      ...empty.sections,
      FORMATION_LINEUP: {
        ...empty.sections.FORMATION_LINEUP,
        formation: "4-3-3",
        slots: empty.sections.FORMATION_LINEUP.slots.map((slot, index) => index === 0
          ? { ...slot, playerName: "Keeper One", jerseyNumber: 1 }
          : slot),
        notes: "Compact mid-block",
      },
      IN_POSSESSION_ATT: { topicValues: { "build-up": "Short" }, notes: "Build through the left." },
      OUT_DEF: { topicValues: { pressing: "High" }, notes: "Press after backward passes." },
      KEY_MAN: { players: [{
        id: "key-1",
        name: "Noah Striker",
        position: "ST",
        jerseyNumber: 9,
        preferredFoot: "RIGHT",
        dangerLevel: 5,
        pace: 4,
        aerialThreat: 3,
        oneVsOne: 5,
        workRate: 4,
        strengths: "Runs behind",
        weaknesses: "Leaves space",
        notes: "Track the blind-side run.",
      }] },
      ANALYSIS: {
        strengths: "Fast transitions",
        weaknesses: "Space behind fullbacks",
        keyObservations: "Narrow build-up",
        keyThreats: "Right winger",
        areasToExploit: "Switch to the far side",
        tacticalNotes: "Keep the left winger high",
      },
      SET_PIECES: {
        attackingCorners: "Short corner to draw the near marker",
        defendingCorners: "One player on the edge",
        freeKicks: "Direct from central range",
        throwIns: "Long throw on the right",
        penalties: "No pattern noted",
      },
      ATTACKING_PATTERNS: {
        selected: ["wide-attack", "through-ball"],
        notes: "Switch then attack the channel.",
      },
    },
  };
}

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const values: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
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

test("Overview displays saved lineup and all seven persisted sections without editable fields", () => {
  const markup = renderToStaticMarkup(
    <ProClubMatchAnalysisOverview analysis={sampleAnalysis()} onEdit={() => {}} />,
  );
  for (const value of [
    "Lampang United", "Riverside FC", "Thai League 3", "4-3-3",
    "Compact mid-block", "Build through the left.", "Press after backward passes.",
    "Noah Striker", "Fast transitions", "Short corner to draw the near marker",
    "Wide Attack", "Switch then attack the channel.",
  ]) {
    assert.ok(markup.includes(value), "Overview should include saved value: " + value);
  }
  assert.match(markup, /data-section="FORMATION_LINEUP"/);
  assert.match(markup, /data-section="IN_POSSESSION_ATT"/);
  assert.match(markup, /data-section="OUT_DEF"/);
  assert.match(markup, /data-section="KEY_MAN"/);
  assert.match(markup, /data-section="ANALYSIS"/);
  assert.match(markup, /data-section="SET_PIECES"/);
  assert.match(markup, /data-section="ATTACKING_PATTERNS"/);
  assert.match(markup, new RegExp(TEAM_LOGO));
  assert.match(markup, new RegExp(OPPONENT_LOGO));
  assert.doesNotMatch(markup, /<textarea|<input|<select/i);
  assert.match(markup, /Edit Analysis/);
  assert.match(markup, /pro-club-analysis-workspace/);
  assert.match(markup, /pro-club-analysis-marker-badge/);
  assert.match(markup, /pro-club-analysis-marker-name/);
  assert.match(markup, /pro-club-analysis-rating--5/);
  assert.match(markup, /pro-club-analysis-rating--4/);
  assert.match(markup, /pro-club-analysis-rating--3/);
  assert.match(markup, /Game Model summary/);
  const outDefStart = markup.indexOf('data-section="OUT_DEF"');
  const keyManStart = markup.indexOf('data-section="KEY_MAN"');
  const outDefMarkup = markup.slice(outDefStart, keyManStart);
  assert.match(outDefMarkup, /No Game Model topics are included in Analysis/);
  assert.doesNotMatch(outDefMarkup, /Pressing/);
  const analysisStart = markup.indexOf('data-section="ANALYSIS"');
  const setPiecesStart = markup.indexOf('data-section="SET_PIECES"');
  assert.match(markup.slice(analysisStart, setPiecesStart), /Pressing/);
});

test("Report uses saved data and its print action opens browser print", async () => {
  const analysis = sampleAnalysis();
  const markup = renderToStaticMarkup(
    <ProClubMatchAnalysisReport analysis={analysis} />,
  );
  assert.match(markup, /Lampang United/);
  assert.match(markup, /Riverside FC/);
  assert.match(markup, new RegExp(TEAM_LOGO));
  assert.match(markup, new RegExp(OPPONENT_LOGO));
  assert.match(markup, /data-section="FORMATION_LINEUP"/);
  assert.match(markup, /data-section="IN_POSSESSION_ATT"/);
  assert.match(markup, /data-section="OUT_DEF"/);
  assert.match(markup, /data-section="KEY_MAN"/);
  assert.match(markup, /data-section="ANALYSIS"/);
  assert.match(markup, /data-section="SET_PIECES"/);
  assert.match(markup, /data-section="ATTACKING_PATTERNS"/);
  assert.match(markup, /Print or Save as PDF/);
  assert.match(markup, /pro-club-analysis-report/);
  assert.match(markup, /pro-club-analysis-marker-badge/);
  assert.match(markup, /pro-club-analysis-marker-name/);
  const css = readFileSync("src/index.css", "utf8");
  assert.match(css, /\.pro-club-analysis-report\s*\{[\s\S]*background:\s*var\(--pc-bg/);
  assert.match(css, /@media print\s*\{[\s\S]*\.pro-club-analysis-report\s*\{[\s\S]*background:\s*#fff/);
  assert.match(css, /\.pro-club-analysis-report \[data-section\][\s\S]*background:\s*#fff/);

  const runtime = setupDom();
  let printCalls = 0;
  try {
    runtime.dom.window.print = () => { printCalls += 1; };
    await act(async () => {
      runtime.root.render(<ProClubMatchAnalysisReport analysis={analysis} />);
    });
    const print = [...runtime.container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Print or Save as PDF"));
    assert.ok(print);
    await act(async () => {
      print.dispatchEvent(new runtime.dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(printCalls, 1);
  } finally {
    await act(async () => runtime.root.unmount());
    runtime.cleanup();
  }
});
