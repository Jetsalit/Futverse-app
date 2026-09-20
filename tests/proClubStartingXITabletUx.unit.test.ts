import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = {
  workspace: "src/components/pro-club/operations/ProClubMatchStartingXIWorkspace.tsx",
  editor: "src/components/pro-club/operations/ProClubStartingXI11v11.tsx",
  rosterDrawer: "src/components/pro-club/operations/ProClubMatchRosterDrawer.tsx",
  playerPicker: "src/components/pro-club/operations/ProClubStartingXIPlayerPicker.tsx",
};

test("tablet UX collapses roster management into Match Squad summary plus drawer", () => {
  const workspace = readFileSync(files.workspace, "utf8");
  const drawer = readFileSync(files.rosterDrawer, "utf8");

  assert.match(workspace, /Match Squad · {matchRoster\.length} players/);
  assert.match(workspace, /Manage Roster/);
  assert.match(workspace, /<ProClubMatchRosterDrawer/);
  assert.doesNotMatch(workspace, /<h4 className="font-black text-white">Add from First Team<\/h4>/);
  assert.doesNotMatch(workspace, /max-h-72 space-y-2 overflow-y-auto/);

  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /Selected {matchRoster\.length}/);
  assert.match(drawer, /First Team/);
  assert.match(drawer, /Search player, jersey, position or FUTID/);
  assert.match(drawer, /onRemove\(player\.playerKey\)/);
  assert.match(drawer, /onAdd\(player\.playerKey\)/);
});

test("Starting XI removes persistent Available Players panel and uses contextual picker", () => {
  const editor = readFileSync(files.editor, "utf8");
  const picker = readFileSync(files.playerPicker, "utf8");

  assert.doesNotMatch(editor, />Available Players</);
  assert.match(editor, /<ProClubStartingXIPlayerPicker/);
  assert.match(editor, /setPlayerPickerMode\("STARTER"\)/);
  assert.match(editor, /setPlayerPickerMode\("SUBSTITUTE"\)/);
  assert.match(editor, /\+ Add Substitute/);

  assert.match(picker, /mode === "STARTER"/);
  assert.match(picker, /Select Player/);
  assert.match(picker, /Add Substitute/);
  assert.match(picker, /filterProClubStartingXIPlayerViews/);
  assert.match(picker, /role="dialog"/);
});

test("tablet landscape gives pitch primary space and tactical tools one tabbed side panel", () => {
  const editor = readFileSync(files.editor, "utf8");

  assert.match(
    editor,
    /lg:grid-cols-\[minmax\(0,1\.45fr\)_minmax\(300px,0\.75fr\)\]/,
  );
  assert.doesNotMatch(
    editor,
    /lg:grid-cols-\[minmax\(0,1fr\)_280px\]/,
  );

  for (const label of ["Roles", "Game Model", "Set Pieces", "Shootout"]) {
    assert.equal(editor.includes('"' + label + '"'), true, label);
  }

  assert.match(editor, /activeTacticalPanel === "ROLES"/);
  assert.match(editor, /activeTacticalPanel === "GAME_MODEL"/);
  assert.match(editor, /activeTacticalPanel === "SET_PIECES"/);
  assert.match(editor, /activeTacticalPanel === "SHOOTOUT"/);
  assert.match(editor, /lg:sticky lg:top-4/);
});

test("roster drawer remains mounted independently of fixed or CUSTOM formation rendering", () => {
  const workspace = readFileSync(files.workspace, "utf8");

  const drawerIndex = workspace.indexOf("<ProClubMatchRosterDrawer");
  const loadingBranchIndex = workspace.indexOf("{loadingMatch ? (");
  const customBranchIndex = workspace.indexOf('startingXI?.formation === "CUSTOM"');

  assert.notEqual(drawerIndex, -1);
  assert.notEqual(loadingBranchIndex, -1);
  assert.notEqual(customBranchIndex, -1);
  assert.equal(
    drawerIndex < loadingBranchIndex,
    true,
    "Manage Roster drawer must mount outside formation-specific rendering",
  );
});

test("Starting XI save action is persistent across tactical tabs instead of living inside Set Pieces", () => {
  const editor = readFileSync(files.editor, "utf8");

  const tabsIndex = editor.indexOf('["ROLES", "Roles"]');
  const saveIndex = editor.indexOf("Save Starting XI");
  const rolesBranchIndex = editor.indexOf('activeTacticalPanel === "ROLES"');
  const setPiecesBranchIndex = editor.indexOf('activeTacticalPanel === "SET_PIECES"');

  assert.notEqual(tabsIndex, -1);
  assert.notEqual(saveIndex, -1);
  assert.notEqual(rolesBranchIndex, -1);
  assert.notEqual(setPiecesBranchIndex, -1);
  assert.equal(saveIndex < rolesBranchIndex, true);
  assert.equal(saveIndex < setPiecesBranchIndex, true);
  assert.equal((editor.match(/Save Starting XI/g) ?? []).length, 1);
});

test("tablet interaction surfaces keep touch-sized controls and persistence separation", () => {
  const workspace = readFileSync(files.workspace, "utf8");
  const editor = readFileSync(files.editor, "utf8");
  const drawer = readFileSync(files.rosterDrawer, "utf8");
  const picker = readFileSync(files.playerPicker, "utf8");

  assert.match(workspace, /min-h-11/);
  assert.match(editor, /min-h-11/);
  assert.match(drawer, /min-h-11/);
  assert.match(picker, /min-h-11/);

  for (const source of [editor, drawer, picker]) {
    for (const forbidden of [
      /firebase\/firestore/,
      /\bsetDoc\b/,
      /\bupdateDoc\b/,
      /\bwriteBatch\b/,
      /\brunTransaction\b/,
    ]) {
      assert.doesNotMatch(source, forbidden);
    }
  }
});
