import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fitnessSource = readFileSync(path.join(repoRoot, "src/components/FitnessTesting.tsx"), "utf8");
const youthSource = readFileSync(path.join(repoRoot, "src/components/YouthPlayerManager.tsx"), "utf8");

test("FitnessTesting uses academyId from useAcademy", () => {
  assert.match(fitnessSource, /const\s*\{\s*settings\s*,\s*academyId\s*\}\s*=\s*useAcademy\s*\(\s*\)/);
});

test("FitnessTesting reads academy tenant players", () => {
  assert.match(
    fitnessSource,
    /collection\s*\(\s*db\s*,\s*"academies"\s*,\s*academyId\s*,\s*"players"\s*\)/,
  );
});

test("FitnessTesting creates under academy tenant players", () => {
  assert.match(
    fitnessSource,
    /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*"academies"\s*,\s*academyId\s*,\s*"players"\s*\)/,
  );
});

test("FitnessTesting updates under academy tenant players", () => {
  assert.match(
    fitnessSource,
    /updateDoc\s*\(\s*doc\s*\(\s*db\s*,\s*"academies"\s*,\s*academyId\s*,\s*"players"\s*,\s*editingPlayerId\s*\)/,
  );
});

test("FitnessTesting contains no root players collection path", () => {
  assert.doesNotMatch(fitnessSource, /collection\s*\(\s*db\s*,\s*"players"\s*\)/);
});

test("FitnessTesting contains no root players document path", () => {
  assert.doesNotMatch(fitnessSource, /doc\s*\(\s*db\s*,\s*"players"\s*,\s*[^\n]*\)/);
});

test("FitnessTesting fail-closes when academyId is missing", () => {
  assert.match(
    fitnessSource,
    /if\s*\(\s*!academyId\s*\)\s*\{[\s\S]*?setPlayers\s*\(\s*\[\s*\]\s*\)\s*;[\s\S]*?setLoading\s*\(\s*false\s*\)\s*;[\s\S]*?return\s*;[\s\S]*?\}/,
  );
});

test("YouthPlayerManager uses academyId from useAcademy", () => {
  assert.match(youthSource, /const\s*\{\s*settings\s*,\s*academyId\s*\}\s*=\s*useAcademy\s*\(\s*\)/);
});

test("YouthPlayerManager reads academy tenant players", () => {
  assert.match(
    youthSource,
    /collection\s*\(\s*db\s*,\s*"academies"\s*,\s*academyId\s*,\s*"players"\s*\)/,
  );
});

test("YouthPlayerManager creates under academy tenant players", () => {
  assert.match(
    youthSource,
    /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*"academies"\s*,\s*academyId\s*,\s*"players"\s*\)/,
  );
});

test("YouthPlayerManager updates under academy tenant players", () => {
  assert.match(
    youthSource,
    /updateDoc\s*\(\s*doc\s*\(\s*db\s*,\s*"academies"\s*,\s*academyId\s*,\s*"players"\s*,\s*editingPlayerId\s*\)/,
  );
});

test("YouthPlayerManager deletes under academy tenant players", () => {
  assert.match(
    youthSource,
    /deleteDoc\s*\(\s*doc\s*\(\s*db\s*,\s*"academies"\s*,\s*academyId\s*,\s*"players"\s*,\s*playerToDelete\s*\)/,
  );
});

test("YouthPlayerManager contains no root players collection path", () => {
  assert.doesNotMatch(youthSource, /collection\s*\(\s*db\s*,\s*"players"\s*\)/);
});

test("YouthPlayerManager contains no root players document path", () => {
  assert.doesNotMatch(youthSource, /doc\s*\(\s*db\s*,\s*"players"\s*,\s*[^\n]*\)/);
});

test("YouthPlayerManager fail-closes when academyId is missing", () => {
  assert.match(
    youthSource,
    /if\s*\(\s*!academyId\s*\)\s*\{[\s\S]*?setPlayers\s*\(\s*\[\s*\]\s*\)\s*;[\s\S]*?setLoading\s*\(\s*false\s*\)\s*;[\s\S]*?return\s*;[\s\S]*?\}/,
  );
});
