import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as ts from "typescript";

import {
  deriveProClubWeeklyPeriodizationBoard,
  type ProClubWeeklyPeriodizationBoard,
} from "../src/lib/proClubWeeklyPeriodizationBoard";
import type { WeeklyTrainingSavedDraftDetail } from "../src/lib/proClubWeeklyTrainingSavedDraftReadModel";

type CanonicalDraft = WeeklyTrainingSavedDraftDetail["draft"];

function canonicalDraft(): CanonicalDraft {
  return {
    clubId: "club-a",
    authorUid: "head-coach-a",
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    secondaryObjective: "Protect the central lane after loss",
    headCoachNote: "Private Head Coach note",
    technicalDirectorNote: "Private Technical Director note",
    sessions: [
      {
        sessionDate: "2026-09-07",
        startTime: "09:00",
        location: "Training Ground A",
        objective: "Restore movement quality",
        phaseOfPlay: "GENERAL",
        plannedLoad: "LOW",
        durationMinutes: 60,
        blocks: [
          {
            blockType: "WARM_UP",
            title: "Movement preparation",
            durationMinutes: 15,
            coachingPoints: ["Control the range", "Keep rhythm relaxed"],
          },
          {
            blockType: "TECHNICAL",
            title: "Passing rhythm",
            durationMinutes: 45,
            drillReference: "drill-passing-rhythm",
            coachingPoints: ["Receive on the back foot"],
          },
        ],
      },
      {
        sessionDate: "2026-09-08",
        startTime: "16:00",
        location: "Training Ground B",
        objective: "Progress through two pressing lines",
        phaseOfPlay: "IN_POSSESSION",
        plannedLoad: "MODERATE",
        durationMinutes: 90,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Build-up against a front three",
            durationMinutes: 90,
            coachingPoints: ["Create the third-player option"],
          },
        ],
      },
      {
        sessionDate: "2026-09-09",
        startTime: "15:30",
        location: "Stadium",
        objective: "Counter-press immediately after loss",
        phaseOfPlay: "TRANSITION_TO_DEFEND",
        plannedLoad: "HIGH",
        durationMinutes: 75,
        blocks: [
          {
            blockType: "GAME",
            title: "Transition game",
            durationMinutes: 75,
            coachingPoints: ["Close the nearest forward lane"],
          },
        ],
      },
    ],
  };
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key);
      collectKeys(item, keys);
    }
  }
  return keys;
}

const FORBIDDEN_MATCH_DAY_KEYS = new Set([
  "matchdate",
  "matchday",
  "mdlabel",
]);
const MD_NOTATION = /^MD(?:[+-]\d+)?$/i;

function assertNoMatchDayConcepts(value: unknown, path = "board"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoMatchDayConcepts(item, `${path}[${index}]`),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.replace(/[_\s-]/g, "").toLowerCase();
      assert.equal(
        FORBIDDEN_MATCH_DAY_KEYS.has(normalizedKey),
        false,
        `unexpected Match-Day field at ${path}.${key}`,
      );
      assert.doesNotMatch(
        key,
        MD_NOTATION,
        `unexpected MD-style key at ${path}.${key}`,
      );
      assertNoMatchDayConcepts(item, `${path}.${key}`);
    }
    return;
  }

  if (typeof value === "string") {
    assert.doesNotMatch(
      value,
      MD_NOTATION,
      `unexpected MD-style value at ${path}`,
    );
  }
}

test("canonical Saved-DRAFT derives the exact presentation board", () => {
  const board = deriveProClubWeeklyPeriodizationBoard(canonicalDraft());

  assert.deepEqual(board, {
    weekStartDate: "2026-09-07",
    squadLabel: "First Team",
    mainObjective: "Build through pressure",
    secondaryObjective: "Protect the central lane after loss",
    sessions: [
      {
        sessionDate: "2026-09-07",
        dayOfWeek: "MONDAY",
        startTime: "09:00",
        location: "Training Ground A",
        objective: "Restore movement quality",
        phaseOfPlay: "GENERAL",
        plannedLoad: "LOW",
        durationMinutes: 60,
        blocks: [
          {
            blockType: "WARM_UP",
            title: "Movement preparation",
            durationMinutes: 15,
            coachingPoints: ["Control the range", "Keep rhythm relaxed"],
          },
          {
            blockType: "TECHNICAL",
            title: "Passing rhythm",
            durationMinutes: 45,
            drillReference: "drill-passing-rhythm",
            coachingPoints: ["Receive on the back foot"],
          },
        ],
      },
      {
        sessionDate: "2026-09-08",
        dayOfWeek: "TUESDAY",
        startTime: "16:00",
        location: "Training Ground B",
        objective: "Progress through two pressing lines",
        phaseOfPlay: "IN_POSSESSION",
        plannedLoad: "MODERATE",
        durationMinutes: 90,
        blocks: [
          {
            blockType: "TACTICAL",
            title: "Build-up against a front three",
            durationMinutes: 90,
            coachingPoints: ["Create the third-player option"],
          },
        ],
      },
      {
        sessionDate: "2026-09-09",
        dayOfWeek: "WEDNESDAY",
        startTime: "15:30",
        location: "Stadium",
        objective: "Counter-press immediately after loss",
        phaseOfPlay: "TRANSITION_TO_DEFEND",
        plannedLoad: "HIGH",
        durationMinutes: 75,
        blocks: [
          {
            blockType: "GAME",
            title: "Transition game",
            durationMinutes: 75,
            coachingPoints: ["Close the nearest forward lane"],
          },
        ],
      },
    ],
  });
});

test("derivation is deterministic and does not mutate its canonical input", () => {
  const draft = canonicalDraft();
  const before = structuredClone(draft);

  const first = deriveProClubWeeklyPeriodizationBoard(draft);
  const second = deriveProClubWeeklyPeriodizationBoard(draft);

  assert.deepEqual(first, second);
  assert.deepEqual(draft, before);
  assert.notEqual(first.sessions, draft.sessions);
  assert.notEqual(first.sessions[0].blocks, draft.sessions[0].blocks);
  assert.notEqual(
    first.sessions[0].blocks[0].coachingPoints,
    draft.sessions[0].blocks[0].coachingPoints,
  );
});

test("session and block order remain identical to the canonical draft", () => {
  const board = deriveProClubWeeklyPeriodizationBoard(canonicalDraft());

  assert.deepEqual(
    board.sessions.map((session) => session.objective),
    [
      "Restore movement quality",
      "Progress through two pressing lines",
      "Counter-press immediately after loss",
    ],
  );
  assert.deepEqual(
    board.sessions[0].blocks.map((block) => block.title),
    ["Movement preparation", "Passing rhythm"],
  );
});

test("LOW MODERATE and HIGH plannedLoad values are preserved exactly", () => {
  const board = deriveProClubWeeklyPeriodizationBoard(canonicalDraft());

  assert.deepEqual(
    board.sessions.map((session) => session.plannedLoad),
    ["LOW", "MODERATE", "HIGH"],
  );
});

test("weekend dayOfWeek comes only from sessionDate without Match-Day inference", () => {
  const draft = canonicalDraft();
  draft.sessions = [
    { ...draft.sessions[0], sessionDate: "2026-09-12" },
    { ...draft.sessions[1], sessionDate: "2026-09-13" },
  ];

  const board = deriveProClubWeeklyPeriodizationBoard(draft);

  assert.deepEqual(
    board.sessions.map((session) => session.dayOfWeek),
    ["SATURDAY", "SUNDAY"],
  );
  assertNoMatchDayConcepts(board);
});

test("optional secondaryObjective and drillReference remain absent when absent", () => {
  const draft = canonicalDraft();
  delete draft.secondaryObjective;

  const board = deriveProClubWeeklyPeriodizationBoard(draft);

  assert.equal("secondaryObjective" in board, false);
  assert.equal("drillReference" in board.sessions[0].blocks[0], false);
  assert.equal(
    board.sessions[0].blocks[1].drillReference,
    "drill-passing-rhythm",
  );
});

test("coaching points objective and phaseOfPlay preserve canonical meaning separately", () => {
  const board = deriveProClubWeeklyPeriodizationBoard(canonicalDraft());

  assert.deepEqual(board.sessions[0].blocks[0].coachingPoints, [
    "Control the range",
    "Keep rhythm relaxed",
  ]);
  assert.equal(board.sessions[1].objective, "Progress through two pressing lines");
  assert.equal(board.sessions[1].phaseOfPlay, "IN_POSSESSION");
  assert.equal("focus" in board.sessions[1], false);
});

test("board exposes no identity private load-alias or match-day fields", () => {
  const board: ProClubWeeklyPeriodizationBoard =
    deriveProClubWeeklyPeriodizationBoard(canonicalDraft());
  const keys = collectKeys(board);

  for (const forbidden of [
    "clubId",
    "authorUid",
    "headCoachNote",
    "technicalDirectorNote",
    "intensity",
    "load",
    "trainingLoad",
    "matchDate",
    "matchDay",
    "mdLabel",
  ]) {
    assert.equal(keys.has(forbidden), false, `unexpected board field: ${forbidden}`);
  }
  assertNoMatchDayConcepts(board);
});

test("derivation source has no IO persistence authorization clock or random dependency", () => {
  const implementationPath = "src/lib/proClubWeeklyPeriodizationBoard.ts";
  const source = readFileSync(implementationPath, "utf8");
  const sourceFile = ts.createSourceFile(
    implementationPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const importDeclarations = sourceFile.statements.filter(
    ts.isImportDeclaration,
  );
  const importEqualsDeclarations = sourceFile.statements.filter(
    ts.isImportEqualsDeclaration,
  );

  assert.equal(importDeclarations.length, 1);
  assert.equal(importEqualsDeclarations.length, 0);

  const approvedImport = importDeclarations[0];
  assert.ok(ts.isStringLiteral(approvedImport.moduleSpecifier));
  assert.equal(
    approvedImport.moduleSpecifier.text,
    "./proClubWeeklyTrainingSavedDraftReadModel",
  );
  assert.ok(approvedImport.importClause);
  assert.equal(approvedImport.importClause.isTypeOnly, true);
  assert.equal(approvedImport.importClause.name, undefined);
  assert.ok(
    approvedImport.importClause.namedBindings &&
      ts.isNamedImports(approvedImport.importClause.namedBindings),
  );
  assert.deepEqual(
    approvedImport.importClause.namedBindings.elements.map((element) => ({
      importedName: element.propertyName?.text ?? element.name.text,
      localName: element.name.text,
      elementIsTypeOnly: element.isTypeOnly,
    })),
    [
      {
        importedName: "WeeklyTrainingSavedDraftDetail",
        localName: "WeeklyTrainingSavedDraftDetail",
        elementIsTypeOnly: false,
      },
    ],
  );

  const forbiddenIdentifiers = new Set([
    "require",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "setTimeout",
    "setInterval",
    "getDoc",
    "getDocs",
    "setDoc",
    "addDoc",
    "updateDoc",
    "deleteDoc",
    "writeBatch",
    "runTransaction",
    "httpsCallable",
  ]);
  const forbiddenPropertyAccesses = new Set([
    "Math.random",
    "crypto.randomUUID",
    "crypto.getRandomValues",
    "performance.now",
    "process.env",
  ]);
  const violations: string[] = [];

  function location(node: ts.Node): string {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    return `${line + 1}:${character + 1}`;
  }

  function isApprovedDateUtcCall(call: ts.CallExpression): boolean {
    return (
      ts.isPropertyAccessExpression(call.expression) &&
      ts.isIdentifier(call.expression.expression) &&
      call.expression.expression.text === "Date" &&
      call.expression.name.text === "UTC" &&
      call.arguments.length === 3
    );
  }

  function isApprovedDateIdentifier(identifier: ts.Identifier): boolean {
    const parent = identifier.parent;
    if (
      ts.isNewExpression(parent) &&
      parent.expression === identifier &&
      parent.arguments?.length === 1
    ) {
      const [argument] = parent.arguments;
      return ts.isCallExpression(argument) && isApprovedDateUtcCall(argument);
    }

    if (
      ts.isPropertyAccessExpression(parent) &&
      parent.expression === identifier &&
      parent.name.text === "UTC" &&
      ts.isCallExpression(parent.parent) &&
      parent.parent.expression === parent &&
      isApprovedDateUtcCall(parent.parent)
    ) {
      const dateUtcCall = parent.parent;
      const constructor = dateUtcCall.parent;
      return (
        ts.isNewExpression(constructor) &&
        ts.isIdentifier(constructor.expression) &&
        constructor.expression.text === "Date" &&
        constructor.arguments?.length === 1 &&
        constructor.arguments[0] === dateUtcCall
      );
    }

    return false;
  }

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      violations.push(`dynamic import at ${location(node)}`);
    }

    if (ts.isIdentifier(node)) {
      if (node.text === "Date" && !isApprovedDateIdentifier(node)) {
        violations.push(`unapproved Date use at ${location(node)}`);
      }
      if (forbiddenIdentifiers.has(node.text)) {
        violations.push(`forbidden identifier ${node.text} at ${location(node)}`);
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const access = `${node.expression.text}.${node.name.text}`;
      if (forbiddenPropertyAccesses.has(access)) {
        violations.push(`forbidden property access ${access} at ${location(node)}`);
      }
    }

    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "env"
    ) {
      violations.push(`forbidden property access process["env"] at ${location(node)}`);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  assert.deepEqual(violations, []);
});
