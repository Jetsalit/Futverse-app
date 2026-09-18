import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rosterSource = readFileSync(
  "src/components/pro-club/operations/ProClubSquadRoster.tsx",
  "utf8",
);
const editorModelSource = readFileSync(
  "src/components/pro-club/operations/proClubSquadRosterEditorModel.ts",
  "utf8",
);
const repositorySource = readFileSync(
  "src/lib/firestore/proClubSquadRosterRepository.ts",
  "utf8",
);

test("Release Player V1 uses an explicit confirmed action and preserves history", () => {
  assert.match(rosterSource, /Release Player/);
  assert.match(rosterSource, /Confirm Release/);
  assert.match(rosterSource, /Released Players \/ History/);
  assert.match(rosterSource, /releaseProClubSquadRosterPlayer/);
  assert.match(rosterSource, /partitionProClubSquadRoster/);
  assert.match(rosterSource, /currentRoster\.length/);
  assert.match(rosterSource, /releasedRoster\.length/);
});

test("First Team release path never exposes physical delete", () => {
  assert.doesNotMatch(rosterSource, /deleteDoc\s*\(/);
  assert.doesNotMatch(repositorySource, /deleteDoc\s*\(/);
  assert.match(repositorySource, /status:\s*"RELEASED"/);
});

test("RELEASED cannot be selected casually from the active editor status options", () => {
  assert.match(
    editorModelSource,
    /return \(\["ACTIVE", "INACTIVE"\] as const\)/,
  );
  assert.match(
    editorModelSource,
    /currentStatus === "RELEASED"[\s\S]*return \["RELEASED"\]/,
  );
});
