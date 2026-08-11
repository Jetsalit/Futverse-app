import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const authPath = path.join(repoRoot, "src/contexts/AuthContext.tsx");
const loginPath = path.join(repoRoot, "src/components/Login.tsx");
const registrationPath = path.join(repoRoot, "src/lib/firestore/registration.ts");
const authSource = readFileSync(authPath, "utf8");
const loginSource = readFileSync(loginPath, "utf8");
const registrationSource = readFileSync(registrationPath, "utf8");
const authAst = ts.createSourceFile(authPath, authSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const loginAst = ts.createSourceFile(loginPath, loginSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function descendants<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}

function interfaceMemberNames(sourceFile: ts.SourceFile, interfaceName: string): string[] {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === interfaceName,
  );
  assert.ok(declaration, `Expected interface ${interfaceName}`);
  return declaration.members.flatMap((member) => (member.name ? [member.name.getText(sourceFile)] : []));
}

function variableDeclarations(sourceFile: ts.SourceFile, variableName: string): ts.VariableDeclaration[] {
  return descendants(
    sourceFile,
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName,
  );
}

function variableInitializerText(sourceFile: ts.SourceFile, variableName: string): string {
  const declaration = variableDeclarations(sourceFile, variableName)[0];
  assert.ok(declaration?.initializer, `Expected initialized variable ${variableName}`);
  return declaration.initializer.getText(sourceFile);
}

function providerValueProperties(): string[] {
  const provider = descendants(
    authAst,
    (node): node is ts.JsxOpeningElement =>
      ts.isJsxOpeningElement(node) && node.tagName.getText(authAst) === "AuthContext.Provider",
  )[0];
  assert.ok(provider, "Expected AuthContext.Provider");
  const value = provider.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(authAst) === "value",
  );
  assert.ok(value?.initializer && ts.isJsxExpression(value.initializer));
  assert.ok(value.initializer.expression && ts.isObjectLiteralExpression(value.initializer.expression));
  return value.initializer.expression.properties.flatMap((property) => {
    if (ts.isShorthandPropertyAssignment(property)) return [property.name.text];
    if (ts.isPropertyAssignment(property)) return [property.name.getText(authAst)];
    return [];
  });
}

function callCount(sourceFile: ts.SourceFile, callName: string): number {
  return descendants(
    sourceFile,
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callName,
  ).length;
}

test("1 AuthContext subscribes to Firebase onAuthStateChanged", () => {
  assert.equal(callCount(authAst, "onAuthStateChanged"), 1);
});

test("2 AuthContext subscribes to users/{firebase uid}", () => {
  assert.match(authSource, /doc\s*\(\s*db\s*,\s*"users"\s*,\s*firebaseUser\.uid\s*\)/);
  assert.match(authSource, /onSnapshot\s*\(\s*userRef\s*,/);
});

test("3 authoritative user document supplies role", () => {
  assert.match(authSource, /const\s+userData\s*=\s*userDoc\.data\(\)\s+as\s+User/);
  const fullUser = variableInitializerText(authAst, "fullUser");
  assert.match(fullUser, /\.\.\.userData/);
  assert.doesNotMatch(fullUser, /\brole\s*:/);
});

test("4 AuthContext contains no hardcoded privileged email", () => {
  assert.doesNotMatch(authSource, /jetsalween@gmail\.com/i);
});

test("5 AuthContext contains no automatic SUPERADMIN promotion", () => {
  assert.doesNotMatch(authSource, /auto[- ]?promot|userData\.role\s*=|email[\s\S]{0,120}SUPERADMIN/i);
});

test("6 AuthContext contains no updateDoc role promotion", () => {
  assert.equal(callCount(authAst, "updateDoc"), 0);
  assert.doesNotMatch(authSource, /\bupdateDoc\b/);
});

test("7 AuthContextType does not expose setRole", () => {
  assert.ok(!interfaceMemberNames(authAst, "AuthContextType").includes("setRole"));
});

test("8 AuthContext has no setRole implementation", () => {
  assert.equal(variableDeclarations(authAst, "setRole").length, 0);
});

test("9 provider does not expose setRole", () => {
  assert.ok(!providerValueProperties().includes("setRole"));
});

test("10 AuthContextType does not expose mock login", () => {
  assert.ok(!interfaceMemberNames(authAst, "AuthContextType").includes("login"));
});

test("11 AuthContext has no login(user) local auth implementation", () => {
  assert.equal(variableDeclarations(authAst, "login").length, 0);
  assert.doesNotMatch(authSource, /login\s*:\s*\(\s*user\s*:\s*User/);
});

test("12 provider does not expose mock login", () => {
  assert.ok(!providerValueProperties().includes("login"));
});

test("13 missing user document fallback remains non-privileged USER", () => {
  assert.match(
    authSource,
    /else\s*\{\s*\/\/ Default user fallback[\s\S]*?const\s+defaultUser\s*:\s*User\s*=\s*\{[\s\S]*?role\s*:\s*"USER"/,
  );
});

test("14 actualUser/currentUser use the Firebase UID", () => {
  const fullUser = variableInitializerText(authAst, "fullUser");
  assert.match(fullUser, /id\s*:\s*firebaseUser\.uid/);
  assert.match(fullUser, /uid\s*:\s*firebaseUser\.uid/);
  assert.match(authSource, /setActualUser\s*\(\s*fullUser\s*\)/);
  assert.match(authSource, /setCurrentUser\s*\(\s*fullUser\s*\)/);
});

test("15 impersonation remains explicit and separate", () => {
  const impersonate = variableInitializerText(authAst, "impersonate");
  assert.match(impersonate, /canImpersonateUser\s*\(\s*actualUser\s*,\s*user\s*\)/);
  assert.match(impersonate, /setCurrentUser\s*\(\s*user\s*\)/);
  assert.doesNotMatch(impersonate, /setActualUser/);
});

test("16 Login uses Firebase sign-in flows", () => {
  assert.ok(callCount(loginAst, "signInWithEmailAndPassword") >= 1);
  assert.ok(callCount(loginAst, "signInWithPopup") >= 1);
});

test("17 Login no longer consumes mock login from useAuth", () => {
  assert.equal(callCount(loginAst, "useAuth"), 0);
  assert.doesNotMatch(loginSource, /\{\s*login\s*\}\s*=\s*useAuth/);
});

test("18 Login has no showDemo state", () => {
  assert.equal(variableDeclarations(loginAst, "showDemo").length, 0);
  assert.doesNotMatch(loginSource, /\bsetShowDemo\b/);
});

test("19 Login has no clickCount state", () => {
  assert.equal(variableDeclarations(loginAst, "clickCount").length, 0);
  assert.doesNotMatch(loginSource, /\bsetClickCount\b/);
});

test("20 Login has no five-click logo handler", () => {
  assert.equal(variableDeclarations(loginAst, "handleLogoClick").length, 0);
  assert.doesNotMatch(loginSource, /onClick\s*=\s*\{\s*handleLogoClick\s*\}/);
});

test("21 Login has no handleRoleLogin", () => {
  assert.equal(variableDeclarations(loginAst, "handleRoleLogin").length, 0);
  assert.doesNotMatch(loginSource, /\bhandleRoleLogin\b/);
});

test("22 Login contains no Demo Mode text", () => {
  assert.doesNotMatch(loginSource, /Demo Mode/i);
});

test("23 Login contains no Fast Login for Testing text", () => {
  assert.doesNotMatch(loginSource, /Fast Login for Testing/i);
});

test("24 Login contains no local role-login controls", () => {
  assert.doesNotMatch(loginSource, /Login as (Director|Head Coach|Scout|Parent|Concierge|Youth Player|Superadmin)/);
  assert.doesNotMatch(loginSource, /login\s*\(\s*\{\s*name\s*:/);
});

test("25 Login contains no hardcoded privileged email", () => {
  assert.doesNotMatch(loginSource, /jetsalween@gmail\.com/i);
});

test("26 Google first-user registration cannot assign SUPERADMIN from email", () => {
  const googleSignIn = variableInitializerText(loginAst, "handleGoogleSignIn");
  assert.doesNotMatch(googleSignIn, /SUPERADMIN|isSuperAdmin/i);
  assert.match(googleSignIn, /let\s+assignedRole\s*=\s*"USER"/);
});

test("27 email/password registration cannot assign SUPERADMIN from email", () => {
  const submit = variableInitializerText(loginAst, "handleSubmit");
  assert.doesNotMatch(submit, /SUPERADMIN|isSuperAdmin/i);
  assert.match(submit, /let\s+assignedRole\s*=\s*"USER"/);
});

test("28 requestedRole remains onboarding intent and registration log metadata", () => {
  assert.match(loginSource, /newData\.requestedRole\s*=\s*requestedRole/);
  assert.match(loginSource, /\brequestedRole\s*,/);
  assert.match(registrationSource, /requestedRole:\s*canonicalUserData\.requestedRole/);
});

test("29 PLAYER registration remains explicitly active in both registration flows", () => {
  const playerBranches = loginSource.match(
    /if\s*\(\s*requestedRole\s*===\s*"PLAYER"\s*\)\s*\{\s*assignedRole\s*=\s*"PLAYER";\s*status\s*=\s*"Active";/g,
  );
  assert.equal(playerBranches?.length, 2);
});

test("30 Login does not fabricate actualUser/currentUser or local auth storage", () => {
  assert.doesNotMatch(loginSource, /\bsetActualUser\b|\bsetCurrentUser\b|\blocalStorage\b|\bsessionStorage\b/);
});

test("31 targeted client auth files contain zero privileged-email occurrences", () => {
  assert.doesNotMatch(`${authSource}\n${loginSource}`, /jetsalween@gmail\.com/i);
});

test("32 AuthContext contains no helper equivalent to arbitrary mock login", () => {
  const localAuthFabricators = descendants(
    authAst,
    (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && Boolean(node.initializer),
  ).filter((declaration) => {
    const initializer = declaration.initializer!;
    if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) return false;
    const acceptsUser = initializer.parameters.some((parameter) => parameter.type?.getText(authAst) === "User");
    const body = initializer.body.getText(authAst);
    return acceptsUser && /setActualUser\s*\(/.test(body) && /setCurrentUser\s*\(/.test(body);
  });
  assert.equal(localAuthFabricators.length, 0);
});
