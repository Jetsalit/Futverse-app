import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const files = {
  dashboard: "src/components/pro-club/operations/ProClubTeamDashboard.tsx",
  workspace: "src/components/pro-club/operations/ProClubMatchStartingXIWorkspace.tsx",
  editor: "src/components/pro-club/operations/ProClubStartingXI11v11.tsx",
};

test("MATCHES production tab mounts the reviewed Match Starting XI workspace", () => {
  const dashboard = readFileSync(files.dashboard, "utf8");

  assert.match(
    dashboard,
    /import ProClubMatchStartingXIWorkspace from "\.\/ProClubMatchStartingXIWorkspace"/,
  );
  assert.match(
    dashboard,
    /case "MATCHES":[\s\S]*return value;/,
  );
  assert.match(
    dashboard,
    /activeTab === "MATCHES"[\s\S]*<ProClubMatchStartingXIWorkspace authority=\{authority\}/,
  );
  assert.equal(
    dashboard.includes('if (nextTab === "MATCHES") return'),
    false,
  );
  assert.doesNotMatch(dashboard, /title="Matches"[\s\S]*Coming soon/i);
});

test("workspace owns repository access while the Starting XI editor stays presentation-only", () => {
  const workspace = readFileSync(files.workspace, "utf8");
  const editor = readFileSync(files.editor, "utf8");

  for (const symbol of [
    "listProClubMatches",
    "createProClubMatch",
    "addProClubMatchRosterPlayer",
    "removeProClubMatchRosterPlayer",
    "getProClubStartingXI",
    "saveProClubStartingXI",
    "getProClubShootout",
    "saveProClubShootout",
  ]) {
    assert.match(workspace, new RegExp("\\b" + symbol + "\\b"));
  }

  assert.match(workspace, /listProClubSquadRoster/);
  assert.match(workspace, /startingXI\?\.revision \?\? 0/);
  assert.match(workspace, /shootout\?\.revision \?\? 0/);

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

test("wiring exposes canonical Match roster control and fixed-formation persistence only", () => {
  const workspace = readFileSync(files.workspace, "utf8");
  const editor = readFileSync(files.editor, "utf8");

  assert.match(workspace, /Match roster/);
  assert.match(workspace, /Add from First Team/);
  assert.match(workspace, /CUSTOM formation/);
  assert.match(editor, /Save Starting XI/);
  assert.match(editor, /Save Shootout Order/);
  assert.match(editor, /setPieceAssignments/);

  assert.doesNotMatch(workspace, /startingXIAudit/);
  assert.doesNotMatch(workspace, /Player Communication.*save/is);
});


test("workspace applies lifecycle-specific editability and does not remount on saved revision changes", () => {
  const workspace = readFileSync(files.workspace, "utf8");

  assert.match(
    workspace,
    /startingXIWritable=\{[\s\S]*match\.status === "DRAFT"[\s\S]*match\.status === "SCHEDULED"/,
  );
  assert.match(
    workspace,
    /shootoutWritable=\{[\s\S]*match\.status === "IN_PROGRESS"/,
  );
  assert.match(
    workspace,
    /key=\{\`\$\{match\.matchId\}:\$\{match\.rosterRevision\}\`\}/,
  );
  assert.doesNotMatch(
    workspace,
    /key=\{[^}]*startingXI\?\.revision/,
  );
  assert.doesNotMatch(
    workspace,
    /key=\{[^}]*shootout\?\.revision/,
  );
});

test("editor separates Starting XI and shootout guards and allows saved shootout removal", () => {
  const editor = readFileSync(files.editor, "utf8");

  assert.match(editor, /const startingXIEditable = authorCanEdit && startingXIWritable/);
  assert.match(editor, /const shootoutEditable = authorCanEdit && shootoutWritable/);
  assert.match(editor, /if \(!startingXIEditable \|\| !onSaveStartingXI\) return/);
  assert.match(editor, /if \(!shootoutEditable \|\| !onSaveShootout\) return/);
  assert.match(editor, /function removePenaltyTaker\(playerKey: string\)/);
  assert.match(editor, /onClick=\{\(\) => removePenaltyTaker\(player\.playerKey\)\}/);
});
