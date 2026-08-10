import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import * as ts from "typescript";

const proPlayerManagerSource = readFileSync(
  new URL("../src/components/ProPlayerManager.tsx", import.meta.url),
  "utf8",
);

const sourceFile = ts.createSourceFile(
  "ProPlayerManager.tsx",
  proPlayerManagerSource,
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

function isRootProPlayersCollection(call: ts.CallExpression): boolean {
  return (
    isIdentifierNamed(call.expression, "collection") &&
    call.arguments.length === 2 &&
    isIdentifierNamed(call.arguments[0], "db") &&
    isStringNamed(call.arguments[1], "proPlayers")
  );
}

function isRootProPlayerDocument(
  call: ts.CallExpression,
  idExpression: string,
): boolean {
  return (
    isIdentifierNamed(call.expression, "doc") &&
    call.arguments.length === 3 &&
    isIdentifierNamed(call.arguments[0], "db") &&
    isStringNamed(call.arguments[1], "proPlayers") &&
    call.arguments[2].getText(sourceFile) === idExpression
  );
}

function requiredVariableInitializer(name: string): ts.Expression {
  const declaration = findNodes(ts.isVariableDeclaration).find(
    (candidate) =>
      ts.isIdentifier(candidate.name) && candidate.name.text === name,
  );

  assert.ok(declaration?.initializer, `${name} must have an initializer`);
  return declaration.initializer;
}

function roleChecksIn(node: ts.Node): Set<string> {
  const checks = findNodes(ts.isBinaryExpression, node)
    .filter(
      (expression) =>
        expression.operatorToken.kind ===
          ts.SyntaxKind.EqualsEqualsEqualsToken &&
        expression.left.getText(sourceFile) === "currentUser?.role" &&
        ts.isStringLiteralLike(expression.right),
    )
    .map((expression) => (expression.right as ts.StringLiteralLike).text);

  return new Set(checks);
}

function permissionGates(): ts.BinaryExpression[] {
  return findNodes(ts.isBinaryExpression).filter(
    (expression) =>
      expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      expression.left.getText(sourceFile) === "hasManagePermission",
  );
}

function containsJsxTag(node: ts.Node, tagName: string): boolean {
  return findNodes(
    (candidate): candidate is ts.JsxSelfClosingElement =>
      ts.isJsxSelfClosingElement(candidate) &&
      candidate.tagName.getText(sourceFile) === tagName,
    node,
  ).length > 0;
}

function containsCall(node: ts.Node, functionName: string): boolean {
  return findNodes(
    (candidate): candidate is ts.CallExpression =>
      ts.isCallExpression(candidate) &&
      isIdentifierNamed(candidate.expression, functionName),
    node,
  ).length > 0;
}

function sourceContainsCodeName(name: string): boolean {
  const normalizedName = name.toLowerCase();
  return findNodes(
    (node): node is ts.Identifier | ts.StringLiteralLike =>
      (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
      node.text.toLowerCase() === normalizedName,
  ).length > 0;
}

describe("ProPlayerManager access contract", () => {
  test("uses the root proPlayers collection", () => {
    const rootCollectionCalls = callsNamed("collection").filter(
      isRootProPlayersCollection,
    );

    assert.ok(
      rootCollectionCalls.length > 0,
      "Expected collection(db, \"proPlayers\")",
    );
  });

  test("runtime onSnapshot listener reads the root proPlayers collection", () => {
    const listenerRef = requiredVariableInitializer("proPlayersRef");
    assert.ok(
      ts.isCallExpression(listenerRef) &&
        isRootProPlayersCollection(listenerRef),
      "proPlayersRef must point to the root proPlayers collection",
    );

    const listenerCalls = callsNamed("onSnapshot");
    assert.equal(listenerCalls.length, 1);
    assert.ok(isIdentifierNamed(listenerCalls[0].arguments[0], "proPlayersRef"));
  });

  test("create writes to the root proPlayers collection", () => {
    const createCalls = callsNamed("addDoc");
    assert.equal(createCalls.length, 1);

    const target = createCalls[0].arguments[0];
    assert.ok(
      target && ts.isCallExpression(target) && isRootProPlayersCollection(target),
    );
  });

  test("update writes to root proPlayers/{id}", () => {
    const updateCalls = callsNamed("updateDoc");
    assert.equal(updateCalls.length, 1);

    const target = updateCalls[0].arguments[0];
    assert.ok(
      target &&
        ts.isCallExpression(target) &&
        isRootProPlayerDocument(target, "editingPlayer.id"),
    );
  });

  test("delete writes to root proPlayers/{id}", () => {
    const deleteCalls = callsNamed("deleteDoc");
    assert.equal(deleteCalls.length, 1);

    const target = deleteCalls[0].arguments[0];
    assert.ok(
      target &&
        ts.isCallExpression(target) &&
        isRootProPlayerDocument(target, "id"),
    );
  });

  test("hasManagePermission explicitly permits SUPERADMIN", () => {
    const roleChecks = roleChecksIn(
      requiredVariableInitializer("hasManagePermission"),
    );
    assert.ok(roleChecks.has("SUPERADMIN"));
  });

  test("hasManagePermission explicitly permits ADMIN", () => {
    const roleChecks = roleChecksIn(
      requiredVariableInitializer("hasManagePermission"),
    );
    assert.ok(roleChecks.has("ADMIN"));
  });

  test("hasManagePermission does not permit PLAYER", () => {
    const roleChecks = roleChecksIn(
      requiredVariableInitializer("hasManagePermission"),
    );
    assert.ok(!roleChecks.has("PLAYER"));
  });

  test("hasManagePermission does not permit PARENT", () => {
    const roleChecks = roleChecksIn(
      requiredVariableInitializer("hasManagePermission"),
    );
    assert.ok(!roleChecks.has("PARENT"));
  });

  test("hasManagePermission does not permit COACH", () => {
    const roleChecks = roleChecksIn(
      requiredVariableInitializer("hasManagePermission"),
    );
    assert.ok(!roleChecks.has("COACH"));
  });

  test("add/manage UI controls are gated by hasManagePermission", () => {
    assert.ok(
      permissionGates().some(
        (gate) =>
          containsJsxTag(gate.right, "UserPlus") &&
          containsCall(gate.right, "setIsAddModalOpen"),
      ),
    );
  });

  test("edit controls are gated by hasManagePermission", () => {
    assert.ok(
      permissionGates().some(
        (gate) =>
          containsJsxTag(gate.right, "Edit2") &&
          containsCall(gate.right, "setEditingPlayer"),
      ),
    );
  });

  test("delete controls are gated by hasManagePermission", () => {
    assert.ok(
      permissionGates().some(
        (gate) =>
          containsJsxTag(gate.right, "Trash2") &&
          containsCall(gate.right, "handleDelete"),
      ),
    );
  });

  test("does not introduce an ownerUid migration field", () => {
    assert.equal(sourceContainsCodeName("ownerUid"), false);
  });

  test("does not introduce an ownerId migration field", () => {
    assert.equal(sourceContainsCodeName("ownerId"), false);
  });

  test("does not introduce a linkedUserId migration field", () => {
    assert.equal(sourceContainsCodeName("linkedUserId"), false);
  });

  test("does not introduce a createdBy migration field", () => {
    assert.equal(sourceContainsCodeName("createdBy"), false);
  });

  test("does not migrate proPlayers under academies/{academyId}", () => {
    const firestorePathCalls = [
      ...callsNamed("collection"),
      ...callsNamed("doc"),
    ];

    assert.ok(
      firestorePathCalls.every(
        (call) =>
          !findNodes(ts.isStringLiteralLike, call).some(
            (literal) => literal.text === "academies",
          ),
      ),
    );
  });

  test("does not use a nested proPlayers subcollection path", () => {
    const proPlayerPathCalls = [
      ...callsNamed("collection"),
      ...callsNamed("doc"),
    ].filter((call) => call.getText(sourceFile).includes('"proPlayers"'));

    assert.ok(proPlayerPathCalls.length > 0);
    assert.ok(
      proPlayerPathCalls.every(
        (call) =>
          isRootProPlayersCollection(call) ||
          (isIdentifierNamed(call.expression, "doc") &&
            call.arguments.length === 3 &&
            isIdentifierNamed(call.arguments[0], "db") &&
            isStringNamed(call.arguments[1], "proPlayers")),
      ),
    );
  });

  test("does not introduce a second runtime write collection or path", () => {
    const directWriterNames = ["addDoc", "setDoc", "updateDoc", "deleteDoc"];
    const directWrites = directWriterNames.flatMap((name) => callsNamed(name));

    assert.equal(callsNamed("addDoc").length, 1);
    assert.equal(callsNamed("updateDoc").length, 1);
    assert.equal(callsNamed("deleteDoc").length, 1);
    assert.equal(callsNamed("setDoc").length, 0);
    assert.equal(callsNamed("writeBatch").length, 0);
    assert.equal(callsNamed("runTransaction").length, 0);
    assert.equal(directWrites.length, 3);
  });
});
