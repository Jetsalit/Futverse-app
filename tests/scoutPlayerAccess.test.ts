import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import * as ts from "typescript";

const sourcePath = fileURLToPath(
  new URL("../src/components/ScoutDashboard.tsx", import.meta.url),
);
const scoutDashboardSource = readFileSync(sourcePath, "utf8");
const sourceFile = ts.createSourceFile(
  "ScoutDashboard.tsx",
  scoutDashboardSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function findNodes<T extends ts.Node>(
  predicate: (node: ts.Node) => node is T,
  root: ts.Node = sourceFile,
): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    node.forEachChild(visit);
  };
  visit(root);
  return matches;
}

function callsNamed(name: string): ts.CallExpression[] {
  return findNodes(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name,
  );
}

function isIdentifierNamed(node: ts.Node | undefined, name: string): boolean {
  return Boolean(node && ts.isIdentifier(node) && node.text === name);
}

function isStringNamed(node: ts.Node | undefined, value: string): boolean {
  return Boolean(node && ts.isStringLiteralLike(node) && node.text === value);
}

function isRootScoutPlayersCollection(call: ts.CallExpression): boolean {
  return (
    isIdentifierNamed(call.expression, "collection") &&
    call.arguments.length === 2 &&
    isIdentifierNamed(call.arguments[0], "db") &&
    isStringNamed(call.arguments[1], "scoutPlayers")
  );
}

function isRootScoutPlayerDocument(call: ts.CallExpression): boolean {
  return (
    isIdentifierNamed(call.expression, "doc") &&
    call.arguments.length === 3 &&
    isIdentifierNamed(call.arguments[0], "db") &&
    isStringNamed(call.arguments[1], "scoutPlayers")
  );
}

function requiredVariableInitializer(name: string): ts.Expression {
  const declaration = findNodes(ts.isVariableDeclaration).find(
    (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === name,
  );
  assert.ok(declaration?.initializer, `${name} must have an initializer`);
  return declaration.initializer;
}

function propertyName(node: ts.ObjectLiteralElementLike | ts.TypeElement): string | null {
  if (!("name" in node) || !node.name) return null;
  return ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)
    ? node.name.text
    : null;
}

function requiredObjectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment {
  const property = object.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) && propertyName(candidate) === name,
  );
  assert.ok(property, `${name} must be written explicitly`);
  return property;
}

function createPayload(): ts.ObjectLiteralExpression {
  const calls = callsNamed("addDoc");
  assert.equal(calls.length, 1);
  const payload = calls[0].arguments[1];
  assert.ok(payload && ts.isObjectLiteralExpression(payload));
  return payload;
}

function containsCall(node: ts.Node, functionName: string): boolean {
  return findNodes(
    (candidate): candidate is ts.CallExpression =>
      ts.isCallExpression(candidate) &&
      isIdentifierNamed(candidate.expression, functionName),
    node,
  ).length > 0;
}

function containsJsxTag(node: ts.Node, tagName: string): boolean {
  return findNodes(
    (candidate): candidate is ts.JsxSelfClosingElement =>
      ts.isJsxSelfClosingElement(candidate) &&
      candidate.tagName.getText(sourceFile) === tagName,
    node,
  ).length > 0;
}

function canEditGates(): ts.BinaryExpression[] {
  return findNodes(ts.isBinaryExpression).filter(
    (expression) =>
      expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      findNodes(
        (node): node is ts.Identifier =>
          ts.isIdentifier(node) && node.text === "canEdit",
        expression.left,
      ).length > 0,
  );
}

function ancestorSome(node: ts.Node, predicate: (candidate: ts.Node) => boolean): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (predicate(current)) return true;
    current = current.parent;
  }
  return false;
}

function allSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return allSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("ScoutDashboard access contract", () => {
  test("1. uses the root scoutPlayers collection", () => {
    assert.ok(callsNamed("collection").some(isRootScoutPlayersCollection));
  });

  test("2. global onSnapshot read remains on the root collection", () => {
    const listeners = callsNamed("onSnapshot");
    assert.equal(listeners.length, 1);
    const target = listeners[0].arguments[0];
    assert.ok(target && ts.isCallExpression(target) && isRootScoutPlayersCollection(target));
  });

  test("3. create remains on root scoutPlayers", () => {
    const call = callsNamed("addDoc")[0];
    const target = call.arguments[0];
    assert.ok(target && ts.isCallExpression(target) && isRootScoutPlayersCollection(target));
  });

  test("4. update remains on root scoutPlayers/{id}", () => {
    const calls = callsNamed("updateDoc");
    assert.equal(calls.length, 1);
    const target = calls[0].arguments[0];
    assert.ok(target && ts.isCallExpression(target) && isRootScoutPlayerDocument(target));
    assert.equal(target.arguments[2].getText(sourceFile), "editingPlayer.id");
  });

  test("5. delete remains on root scoutPlayers/{id}", () => {
    const calls = callsNamed("deleteDoc");
    assert.equal(calls.length, 1);
    const target = calls[0].arguments[0];
    assert.ok(target && ts.isCallExpression(target) && isRootScoutPlayerDocument(target));
    assert.equal(target.arguments[2].getText(sourceFile), "player.id");
  });

  test("6. useAuth obtains actualUser", () => {
    const declaration = findNodes(ts.isVariableDeclaration).find(
      (candidate) =>
        candidate.initializer &&
        ts.isCallExpression(candidate.initializer) &&
        isIdentifierNamed(candidate.initializer.expression, "useAuth"),
    );
    assert.ok(declaration && ts.isObjectBindingPattern(declaration.name));
    assert.ok(
      declaration.name.elements.some(
        (element) => ts.isIdentifier(element.name) && element.name.text === "actualUser",
      ),
    );
  });

  test("7. authenticated UID derives only from actualUser uid/id", () => {
    assert.equal(
      requiredVariableInitializer("authenticatedUid").getText(sourceFile),
      "actualUser?.uid || actualUser?.id || null",
    );
  });

  test("8. submittedBy is part of the ScoutPlayer contract", () => {
    const scoutInterface = findNodes(ts.isInterfaceDeclaration).find(
      (node) => node.name.text === "ScoutPlayer",
    );
    assert.ok(scoutInterface);
    assert.ok(scoutInterface.members.some((member) => propertyName(member) === "submittedBy"));
  });

  test("9. create writes submittedBy from authenticatedUid", () => {
    assert.equal(
      requiredObjectProperty(createPayload(), "submittedBy").initializer.getText(sourceFile),
      "authenticatedUid",
    );
  });

  test("10. create fail-closes before addDoc without authenticatedUid", () => {
    const guard = findNodes(ts.isIfStatement).find(
      (statement) => statement.expression.getText(sourceFile) === "!authenticatedUid",
    );
    assert.ok(guard);
    assert.ok(findNodes(ts.isThrowStatement, guard.thenStatement).length > 0);
    assert.ok(guard.end < callsNamed("addDoc")[0].pos);
  });

  test("11. non-admin creation forces Pending", () => {
    const value = requiredObjectProperty(createPayload(), "status").initializer;
    assert.ok(ts.isConditionalExpression(value));
    assert.equal(value.condition.getText(sourceFile), "canEdit");
    assert.ok(isStringNamed(value.whenFalse, "Pending"));
  });

  test("12. non-admin creation forces grade C", () => {
    const value = requiredObjectProperty(createPayload(), "grade").initializer;
    assert.ok(ts.isConditionalExpression(value));
    assert.equal(value.condition.getText(sourceFile), "canEdit");
    assert.ok(isStringNamed(value.whenFalse, "C"));
  });

  test("13. non-admin creation forces stars 3", () => {
    const value = requiredObjectProperty(createPayload(), "stars").initializer;
    assert.ok(ts.isConditionalExpression(value));
    assert.equal(value.condition.getText(sourceFile), "canEdit");
    assert.equal(value.whenFalse.getText(sourceFile), "3");
  });

  test("14. admin creation may retain admin evaluation values", () => {
    for (const [name, expected] of [["status", "p.status"], ["grade", "p.grade"], ["stars", "p.stars"]] as const) {
      const value = requiredObjectProperty(createPayload(), name).initializer;
      assert.ok(ts.isConditionalExpression(value));
      assert.match(value.whenTrue.getText(sourceFile), new RegExp(expected.replace(".", "\\.")));
    }
  });

  test("15. update strips submittedBy before writing", () => {
    const deletes = findNodes(ts.isDeleteExpression);
    assert.ok(deletes.some((node) => node.expression.getText(sourceFile) === "updates.submittedBy"));
    const update = callsNamed("updateDoc")[0];
    assert.equal(update.arguments[1].getText(sourceFile), "updates as any");
  });

  test("16. canEdit remains ADMIN/SUPERADMIN only", () => {
    const initializer = requiredVariableInitializer("canEdit");
    const permissions = findNodes(
      (node): node is ts.CallExpression =>
        ts.isCallExpression(node) && isIdentifierNamed(node.expression, "hasPermission"),
      initializer,
    ).flatMap((call) => findNodes(ts.isStringLiteralLike, call).map((literal) => literal.text));
    assert.deepEqual(new Set(permissions), new Set(["ADMIN", "SUPERADMIN"]));
  });

  test("17. edit controls remain gated by canEdit", () => {
    assert.ok(canEditGates().some((gate) => containsJsxTag(gate.right, "Edit2") && containsCall(gate.right, "onEdit")));
  });

  test("18. delete controls remain gated by canEdit", () => {
    assert.ok(canEditGates().some((gate) => containsJsxTag(gate.right, "Trash2") && containsCall(gate.right, "onDelete")));
  });

  test("19. general submit button remains available without canEdit gate", () => {
    const button = findNodes(ts.isJsxElement).find(
      (element) =>
        element.openingElement.tagName.getText(sourceFile) === "button" &&
        containsJsxTag(element, "Plus") &&
        containsCall(element, "setIsSubmitModalOpen"),
    );
    assert.ok(button);
    assert.equal(
      ancestorSome(button, (node) =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        node.left.getText(sourceFile) === "canEdit"),
      false,
    );
  });

  test("20. submitterRole remains descriptive profile data", () => {
    assert.ok(scoutDashboardSource.includes("submitterRole?: string"));
    assert.ok(findNodes(ts.isPropertyAssignment).some((property) => propertyName(property) === "submitterRole"));
  });

  test("21. submitterRole is not used as security identity", () => {
    assert.ok(!requiredVariableInitializer("authenticatedUid").getText(sourceFile).includes("submitterRole"));
    assert.equal(requiredObjectProperty(createPayload(), "submittedBy").initializer.getText(sourceFile), "authenticatedUid");
  });

  test("22. no academy-scoped scoutPlayers migration is introduced", () => {
    const scoutPaths = [...callsNamed("collection"), ...callsNamed("doc")].filter((call) =>
      call.getText(sourceFile).includes("scoutPlayers"),
    );
    assert.ok(scoutPaths.length > 0);
    assert.ok(scoutPaths.every((call) => !call.getText(sourceFile).includes("academies")));
  });

  test("23. no nested scoutPlayers runtime path is introduced", () => {
    const scoutPaths = [...callsNamed("collection"), ...callsNamed("doc")].filter((call) =>
      call.getText(sourceFile).includes("scoutPlayers"),
    );
    assert.ok(scoutPaths.every((call) => isRootScoutPlayersCollection(call) || isRootScoutPlayerDocument(call)));
  });

  test("24. ScoutDashboard is the only direct scoutPlayers runtime writer", () => {
    const srcRoot = join(dirname(sourcePath), "..");
    const writerPattern = /\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/;
    const writerFiles = allSourceFiles(srcRoot).filter((path) => {
      const source = readFileSync(path, "utf8");
      return source.includes("scoutPlayers") && writerPattern.test(source);
    });
    assert.deepEqual(writerFiles, [sourcePath]);
    assert.equal(callsNamed("addDoc").length, 1);
    assert.equal(callsNamed("updateDoc").length, 1);
    assert.equal(callsNamed("deleteDoc").length, 1);
    assert.equal(callsNamed("setDoc").length, 0);
  });
});
