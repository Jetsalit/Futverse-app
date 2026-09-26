import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const sourceRoot = path.resolve("src/components");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }
    return /\.(tsx|jsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

test("Academy, Pro Club, and shared football UI use custom date/time inputs", () => {
  const files = sourceFiles(sourceRoot);
  const nativeDateTime = /<input\b[^>]*\btype\s*=\s*(["'])(?:date|time|datetime-local)\1/i;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, nativeDateTime, `${path.relative(sourceRoot, file)} exposes native locale date/time UI`);
  }
});

test("visible date and timestamp summaries use the shared Thai presentation foundation", () => {
  const requiredUses: Record<string, RegExp[]> = {
    "pro-club/operations/ProClubAttendance.tsx": [/FutVerseThaiDateInput/, /FutVerseThaiTimeInput/, /formatThaiDateShort/, /formatThaiTime/],
    "pro-club/operations/ProClubStaffSubmissions.tsx": [/FutVerseThaiDateInput/, /formatThaiDateLong/],
    "pro-club/operations/WeeklyPlannerBoard.tsx": [/FutVerseThaiTimeInput/, /formatThaiDateShort/],
    "match/MatchWorkspace.tsx": [/FutVerseThaiDateTimeInput/, /formatThaiDateLong/, /formatThaiTime/],
    "superadmin/RecentActivity.tsx": [/formatThaiDateShort/, /formatThaiTime/],
  };
  for (const [relativeFile, patterns] of Object.entries(requiredUses)) {
    const source = readFileSync(path.join(sourceRoot, relativeFile), "utf8");
    for (const pattern of patterns) {
      assert.match(source, pattern, `${relativeFile} must use ${pattern}`);
    }
  }
});

test("user-facing surfaces do not contain explicit English clocks or US numeric dates", () => {
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b|\b(?:AM|PM)\s*\d{1,2}:\d{2}\b/i,
      `${path.relative(sourceRoot, file)} contains a 12-hour clock display`);
    assert.doesNotMatch(source, /\bMM\/DD\/YYYY\b/, `${path.relative(sourceRoot, file)} contains a US date format`);
    assert.doesNotMatch(source, /\b\d{1,2}\/\d{1,2}\/\d{4}\b/, `${path.relative(sourceRoot, file)} contains a US numeric date display`);
  }
});

test("machine-locale date formatting is absent except the exact legacy drill storage writer", () => {
  // TacticBoard's drill.date is an explicitly preserved V1 persistence exception;
  // changing its Thai string to ISO would mix historic and future storage contracts.
  const legacyDrillWriter = path.join(sourceRoot, "TacticBoard.tsx");
  const expectedLegacyWriter = /date:\s*new Date\(\)\.toLocaleDateString\("th-TH",/;
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    if (file === legacyDrillWriter) {
      assert.match(source, expectedLegacyWriter, "preserve the narrowly scoped legacy drill.date writer");
      continue;
    }
    assert.doesNotMatch(source, /\.toLocale(?:DateString|TimeString|String)\s*\(/,
      `${path.relative(sourceRoot, file)} must use explicit Thai presentation helpers`);
  }
});

test("audited raw date interpolation is formatted at visible display boundaries", () => {
  const rawDateInterpolation = /\{\s*(?:composerDate|record\.targetSessionDate|entry\.targetSessionDate|entry\.sessionDate|drill\.date)\s*\}/;
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, rawDateInterpolation,
      `${path.relative(sourceRoot, file)} renders an audited canonical/legacy date without presentation handling`);
  }
});

test("canonical date strings in time metadata remain machine-readable, not visible text", () => {
  const files = sourceFiles(sourceRoot);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /<time\b[^>]*>\s*\{(?:[^}]*\.)?(?:sessionDate|observedOn|targetSessionDate)\}\s*<\/time>/i,
      `${path.relative(sourceRoot, file)} renders a canonical date directly inside <time>`);
  }
});

test("the shared presentation foundation pins Buddhist Era, Bangkok, and a 24-hour clock", () => {
  const formatter = readFileSync(path.resolve("src/lib/thaiDateTimePresentation.ts"), "utf8");
  assert.match(formatter, /th-TH-u-ca-buddhist/);
  assert.match(formatter, /Asia\/Bangkok/);
  assert.match(formatter, /hour12:\s*false/);
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\+\s*543\b/, `${path.relative(sourceRoot, file)} manually adjusts the Buddhist Era year`);
  }
});
