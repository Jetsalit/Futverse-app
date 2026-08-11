import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(repoRoot, "src");
const authPath = path.join(sourceRoot, "contexts", "AuthContext.tsx");
const authSource = readFileSync(authPath, "utf8");
const authAst = ts.createSourceFile(
  authPath,
  authSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function descendants<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T,
): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}

function interfaceMemberNames(interfaceName: string): string[] {
  const declaration = authAst.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName,
  );
  assert.ok(declaration, `Expected interface ${interfaceName}`);
  return declaration.members.flatMap((member) =>
    member.name ? [member.name.getText(authAst)] : [],
  );
}

function providerValueProperties(): string[] {
  const provider = descendants(
    authAst,
    (node): node is ts.JsxOpeningElement =>
      ts.isJsxOpeningElement(node) &&
      node.tagName.getText(authAst) === "AuthContext.Provider",
  )[0];
  assert.ok(provider, "Expected AuthContext.Provider");
  const value = provider.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(authAst) === "value",
  );
  assert.ok(value?.initializer && ts.isJsxExpression(value.initializer));
  assert.ok(
    value.initializer.expression &&
      ts.isObjectLiteralExpression(value.initializer.expression),
  );
  return value.initializer.expression.properties.flatMap((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return [property.name.text];
    if (ts.isPropertyAssignment(property)) return [property.name.getText(authAst)];
    return [];
  });
}

const productionSources = sourceFiles(sourceRoot).map((filePath) => ({
  filePath,
  source: readFileSync(filePath, "utf8"),
  ast: ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ),
}));

test("1. AuthContextType no longer exposes any user-switching API", () => {
  const members = interfaceMemberNames("AuthContextType");
  for (const removedMember of [
    "impersonate",
    "stopImpersonating",
    "revertImpersonation",
    "isImpersonating",
  ]) {
    assert.ok(!members.includes(removedMember));
  }
});

test("2. AuthProvider no longer exports any user-switching API", () => {
  const properties = providerValueProperties();
  for (const removedProperty of [
    "impersonate",
    "stopImpersonating",
    "revertImpersonation",
    "isImpersonating",
  ]) {
    assert.ok(!properties.includes(removedProperty));
  }
});

test("3. structural production guard finds zero impersonation identifiers", () => {
  const forbidden = new Set([
    "impersonate",
    "stopImpersonating",
    "revertImpersonation",
    "isImpersonating",
    "canImpersonateUser",
  ]);
  const matches = productionSources.flatMap(({ filePath, ast }) =>
    descendants(ast, (node): node is ts.Identifier => ts.isIdentifier(node))
      .filter((identifier) => forbidden.has(identifier.text))
      .map((identifier) => `${path.relative(repoRoot, filePath)}:${identifier.text}`),
  );
  assert.deepEqual(matches, []);
});

test("4. no production source contains a residual impersonation call or UI branch", () => {
  const matches = productionSources.flatMap(({ filePath, source }) =>
    /\bimpersonat(?:e|ing|ion)\b|\b(?:stop|revert)Impersonation\b/i.test(source)
      ? [path.relative(repoRoot, filePath)]
      : [],
  );
  assert.deepEqual(matches, []);
});

test("5. no AuthContext function accepts a caller User and replaces currentUser", () => {
  const offenders = descendants(
    authAst,
    (node): node is ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration =>
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node),
  ).filter((fn) => {
    const acceptsUser = fn.parameters.some(
      (parameter) => parameter.type?.getText(authAst) === "User",
    );
    return acceptsUser && /\bsetCurrentUser\s*\(/.test(fn.getText(authAst));
  });
  assert.equal(offenders.length, 0);
});

test("6. Firebase Auth and the live canonical User snapshot remain identity sources", () => {
  assert.match(authSource, /onAuthStateChanged\s*\(\s*auth/);
  assert.match(authSource, /doc\s*\(\s*db\s*,\s*"users"\s*,\s*firebaseUser\.uid\s*\)/);
  assert.match(authSource, /onSnapshot\s*\(\s*userRef/);
  assert.match(authSource, /setActualUser\s*\(\s*fullUser\s*\)/);
  assert.match(authSource, /setCurrentUser\s*\(\s*fullUser\s*\)/);
  assert.doesNotMatch(authSource, /\bdefaultUser\b/);
  assert.match(authSource, /else\s*\{\s*setActualUser\s*\(\s*null\s*\);\s*setCurrentUser\s*\(\s*null\s*\)/);
});

test("7. currentUser setters remain confined to AuthContext", () => {
  const externalSetters = productionSources.flatMap(({ filePath, source }) =>
    filePath === authPath || !/\bsetCurrentUser\s*\(/.test(source)
      ? []
      : [path.relative(repoRoot, filePath)],
  );
  assert.deepEqual(externalSetters, []);
});

test("8. production Firestore calls do not consume root settings", () => {
  const rootSettingsCalls = productionSources.flatMap(({ filePath, ast }) =>
    descendants(
      ast,
      (node): node is ts.CallExpression => ts.isCallExpression(node),
    )
      .filter((call) => {
        if (!ts.isIdentifier(call.expression)) return false;
        if (call.expression.text !== "doc" && call.expression.text !== "collection") {
          return false;
        }
        return call.arguments.some(
          (argument) => ts.isStringLiteral(argument) && argument.text === "settings",
        );
      })
      .map((call) => `${path.relative(repoRoot, filePath)}:${call.getStart(ast)}`),
  );
  assert.deepEqual(rootSettingsCalls, []);
});
