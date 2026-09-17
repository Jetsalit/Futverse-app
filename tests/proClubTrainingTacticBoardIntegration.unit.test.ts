import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const composer = readFileSync(
  "src/components/pro-club/operations/WeeklyTrainingDraftComposer.tsx",
  "utf8",
);
const picker = readFileSync(
  "src/components/pro-club/operations/ProClubTrainingDrillReferencePicker.tsx",
  "utf8",
);
const tacticBoard = readFileSync("src/components/TacticBoard.tsx", "utf8");

test("Weekly Training block opens the existing Tactic Board integration without changing Weekly schema", () => {
  assert.match(
    composer,
    /import ProClubTrainingDrillReferencePicker from "\.\/ProClubTrainingDrillReferencePicker"/,
  );
  assert.match(composer, /Design in Tactic Board/);
  assert.match(composer, /setDrillPickerTarget\(\{ sessionIndex, blockIndex \}\)/);
  assert.match(composer, /drillReference:\s*drill\.id/);
});

test("Tactic Board integration reuses the existing drill database and TacticBoard component", () => {
  assert.match(picker, /import TacticBoard from "\.\.\/\.\.\/TacticBoard"/);
  assert.match(picker, /useDrillDatabase\(\)/);
  assert.match(picker, /myDrills/);
  assert.match(picker, /<TacticBoard/);
  assert.match(picker, /onSelectDrill\(drill\)/);
});

test("Tactic Board mode escapes the nested Training block into a full-page viewport workspace", () => {
  assert.match(
    picker,
    /aria-label="Weekly Training Tactic Board full-page workspace"/,
  );
  assert.match(
    picker,
    /className="fixed inset-0 z-\[100\] overflow-y-auto bg-slate-100/,
  );
  assert.match(picker, /Back to Weekly Training/);
  assert.match(picker, /<TacticBoard onBack=\{returnToLibrary\} editingDrill=\{editingDrill\} \/>/);
});

test("Tactic Board pitch markings use a dedicated dark line contract across every field template", () => {
  const pitchStart = tacticBoard.indexOf("{/* Pure CSS Pitch Markings */}");
  const pitchEnd = tacticBoard.indexOf("{/* Interactive Canvas Grid");

  assert.ok(pitchStart >= 0, "pitch markings section must exist");
  assert.ok(pitchEnd > pitchStart, "pitch markings section must be bounded");

  const pitchMarkings = tacticBoard.slice(pitchStart, pitchEnd);

  assert.match(pitchMarkings, /fieldType === "full"/);
  assert.match(pitchMarkings, /fieldType === "small"/);
  assert.match(pitchMarkings, /ring-\[#1f2937\]/);
  assert.match(pitchMarkings, /bg-\[#1f2937\]/);
  assert.match(pitchMarkings, /border-\[#1f2937\]/);
  assert.doesNotMatch(pitchMarkings, /(?:ring|bg|border)-slate-800/);
});

test("integration does not introduce a second Weekly Training persistence path", () => {
  for (const source of [composer, picker]) {
    assert.doesNotMatch(source, /collection\(db,\s*["']proClubs["']/);
    assert.doesNotMatch(source, /setDoc\(/);
    assert.doesNotMatch(source, /updateDoc\(/);
    assert.doesNotMatch(source, /writeBatch\(/);
  }
});
