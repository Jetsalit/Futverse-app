import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const loginPath = path.join(repoRoot, "src/components/Login.tsx");
const helperPath = path.join(repoRoot, "src/lib/firestore/registration.ts");
const loginSource = readFileSync(loginPath, "utf8");
const helperSource = readFileSync(helperPath, "utf8");
const loginAst = ts.createSourceFile(
  loginPath,
  loginSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

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

function functionInitializer(functionName: string): ts.ArrowFunction {
  const declaration = descendants(
    loginAst,
    (node): node is ts.VariableDeclaration =>
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === functionName,
  )[0];
  assert.ok(declaration?.initializer && ts.isArrowFunction(declaration.initializer));
  return declaration.initializer;
}

function callCount(root: ts.Node, callName: string): number {
  return descendants(
    root,
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === callName,
  ).length;
}

test("1 deterministic registration log IDs preserve the exact Firebase UID", () => {
  assert.match(
    helperSource,
    /return\s+`\$\{REGISTRATION_LOG_ID_PREFIX\}\$\{uid\}`/,
  );
  assert.match(helperSource, /REGISTRATION_LOG_ID_PREFIX\s*=\s*"user_registered_"/);
  assert.doesNotMatch(helperSource, /random|crypto|Date\.now|Math\.random/i);
});

test("2 shared helper atomically commits one User and one registration log", () => {
  assert.match(helperSource, /const\s+batch\s*=\s*writeBatch\(db\)/);
  assert.equal((helperSource.match(/batch\.set\(/g) ?? []).length, 2);
  assert.match(helperSource, /batch\.set\(doc\(db,\s*"users",\s*user\.uid\)/);
  assert.match(
    helperSource,
    /batch\.set\(doc\(db,\s*"logs",\s*registrationLogId\(user\.uid\)\)/,
  );
  assert.match(helperSource, /await\s+batch\.commit\(\)/);
  assert.doesNotMatch(helperSource, /\baddDoc\b/);
});

test("3 helper binds registration identity and metadata to Firebase values", () => {
  assert.match(helperSource, /uid:\s*user\.uid/);
  assert.match(helperSource, /email:\s*user\.email/);
  assert.match(helperSource, /userId:\s*user\.uid/);
  assert.match(helperSource, /requestedRole:\s*canonicalUserData\.requestedRole/);
  assert.match(helperSource, /timestamp:\s*serverTimestamp\(\)/);
});

test("4 both Login registration flows use the shared atomic helper", () => {
  assert.equal(callCount(functionInitializer("handleGoogleSignIn"), "createUserWithRegistrationLog"), 1);
  assert.equal(callCount(functionInitializer("handleSubmit"), "createUserWithRegistrationLog"), 1);
});

test("5 Login contains no direct registration-log writer", () => {
  assert.doesNotMatch(loginSource, /\baddDoc\b/);
  assert.doesNotMatch(loginSource, /USER_REGISTERED/);
  assert.doesNotMatch(loginSource, /collection\s*\(\s*db\s*,\s*["']logs["']/);
});

test("6 existing-user branches cannot call the registration helper", () => {
  const googleHandler = functionInitializer("handleGoogleSignIn").getText(loginAst);
  const submitHandler = functionInitializer("handleSubmit").getText(loginAst);
  assert.match(
    googleHandler,
    /if\s*\(\s*!userSnap\.exists\(\)\s*\)[\s\S]*createUserWithRegistrationLog[\s\S]*else\s*\{[\s\S]*lastLogin/,
  );
  assert.match(
    submitHandler,
    /if\s*\(\s*!isLoginView\s*\)[\s\S]*createUserWithRegistrationLog[\s\S]*else\s*\{[\s\S]*signInWithEmailAndPassword/,
  );
  assert.equal((googleHandler.match(/createUserWithRegistrationLog/g) ?? []).length, 1);
  assert.equal((submitHandler.match(/createUserWithRegistrationLog/g) ?? []).length, 1);
});

test("7 registration code cannot derive privileged authority from metadata", () => {
  assert.doesNotMatch(`${loginSource}\n${helperSource}`, /assignedRole\s*=\s*"(?:SUPERADMIN|DATA_ADMIN|ADMIN|COACH)"/);
  assert.doesNotMatch(`${loginSource}\n${helperSource}`, /user\.email\s*===?[\s\S]{0,80}(?:SUPERADMIN|DATA_ADMIN|ADMIN|COACH)/i);
});
