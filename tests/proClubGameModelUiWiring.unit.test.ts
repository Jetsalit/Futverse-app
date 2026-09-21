import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = {
  dashboard: "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  editor: "src/components/pro-club/operations/ProClubGameModel.tsx",
  matchWorkspace: "src/components/pro-club/operations/ProClubMatchStartingXIWorkspace.tsx",
  startingXI: "src/components/pro-club/operations/ProClubStartingXI11v11.tsx",
  matchDomain: "src/lib/proClubMatchStartingXI.ts",
  matchRepository: "src/lib/firestore/proClubMatchStartingXIRepository.ts",
};

test("dashboard exposes one live Game Model workspace without a second persistence implementation", () => {
  const dashboard = readFileSync(files.dashboard, "utf8");
  const editor = readFileSync(files.editor, "utf8");

  assert.match(dashboard, /"GAME_MODEL"/);
  assert.match(dashboard, /<ProClubGameModel authority=\{authority\}/);
  assert.match(editor, /getProClubGameModel/);
  assert.match(editor, /saveProClubGameModel/);
  assert.match(editor, /GAME_MODEL_PHASES\.map/);

  for (const forbidden of [
    /firebase\/firestore/,
    /\bsetDoc\b/,
    /\bupdateDoc\b/,
    /\bwriteBatch\b/,
    /\brunTransaction\b/,
  ]) {
    assert.doesNotMatch(editor, forbidden);
  }
});

test("Game Model editor keeps the four phases fixed and text freely editable", () => {
  const editor = readFileSync(files.editor, "utf8");

  assert.match(editor, /textarea/);
  assert.match(editor, /onChange=\{\(event\) => updatePhase\(phase, event\.target\.value\)\}/);
  assert.match(editor, /Save Game Model/);
  assert.match(editor, /The four phases are fixed/);
  assert.doesNotMatch(editor, /Add Phase|Delete Phase/);
});

test("new unsaved Match plans seed from Team Game Model while saved plans keep their snapshot", () => {
  const workspace = readFileSync(files.matchWorkspace, "utf8");

  assert.match(workspace, /getProClubGameModel\(clubId\)/);
  assert.match(
    workspace,
    /startingXI\?\.gameModelSnapshot[\s\S]*teamGameModel\?\.phases[\s\S]*createEmptyGameModelTextSnapshot/,
  );
  assert.match(workspace, /initialGameModelSnapshot=/);
});

test("Starting XI Game Model is editable and included in Save Starting XI payload", () => {
  const editor = readFileSync(files.startingXI, "utf8");

  assert.match(editor, /activeTacticalPanel === "GAME_MODEL"/);
  assert.match(editor, /value=\{gameModelSnapshot\[phase\]\}/);
  assert.match(editor, /setGameModelSnapshot/);
  assert.match(editor, /gameModelSnapshot: \{ \.\.\.gameModelSnapshot \}/);
  assert.doesNotMatch(editor, /GAME_MODEL_COPY/);
});

test("Starting XI persistence normalizes legacy documents and writes a four-phase snapshot", () => {
  const domain = readFileSync(files.matchDomain, "utf8");
  const repository = readFileSync(files.matchRepository, "utf8");

  assert.match(domain, /gameModelSnapshot\?: GameModelTextSnapshot/);
  assert.match(domain, /validateGameModelTextSnapshot/);
  assert.match(repository, /legacyStartingXIKeys/);
  assert.match(repository, /gameModelSnapshot/);
  assert.match(repository, /createEmptyGameModelTextSnapshot/);
});
