import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/hooks/useDrillDatabase.ts", import.meta.url), "utf8");

test("1. useDrillDatabase reads actualUser from useAuth()", () => {
  assert.match(source, /const\s*\{\s*actualUser\s*\}\s*=\s*useAuth\(\)/s);
});

test("2. authenticated identity derives from actualUser.uid or actualUser.id", () => {
  assert.match(source, /const\s*authenticatedUid\s*=\s*actualUser\?\.uid\s*\|\|\s*actualUser\?\.id\s*\|\|\s*null/s);
});

test("3. no unknown_user ownership fallback exists", () => {
  assert.doesNotMatch(source, /unknown_user/i);
  assert.doesNotMatch(source, /currentUser\?\.id\s*\|\|\s*['\"]unknown_user['\"]/i);
});

test("4. saveDrill fail-closes when authenticated UID is absent", () => {
  assert.match(source, /saveDrill\s*=\s*async\s*\([^)]*\)\s*=>\s*\{\s*if\s*\(\s*!authenticatedUid\s*\)/s);
});

test("5. saveDrill writes created_by using authenticated UID", () => {
  assert.match(source, /created_by:\s*authenticatedUid/s);
});

test("6. updateDrill fail-closes when authenticated UID is absent", () => {
  assert.match(source, /updateDrill\s*=\s*async\s*\([^)]*\)\s*=>\s*\{\s*if\s*\(\s*!authenticatedUid\s*\)/s);
});

test("7. updateDrill rejects or strips attempted created_by mutation", () => {
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(updates,\s*['\"]created_by['\"]\)/s);
  assert.match(source, /delete\s+safeUpdates\.created_by/s);
});

test("8. updateDrill writes to root /drills/{id}", () => {
  assert.match(source, /doc\(db,\s*['\"]drills['\"],\s*id\)/s);
});

test("9. deleteDrill fail-closes when authenticated UID is absent", () => {
  assert.match(source, /deleteDrill\s*=\s*async\s*\([^)]*\)\s*=>\s*\{\s*if\s*\(\s*!authenticatedUid\s*\)/s);
});

test("10. deleteDrill writes to root /drills/{id}", () => {
  assert.match(source, /doc\(db,\s*['\"]drills['\"],\s*id\)/s);
});

test("11. myDrills compares drill.created_by against authenticated UID", () => {
  assert.match(source, /myDrills\s*=\s*drills\.filter\(d\s*=>\s*d\.created_by\s*===\s*authenticatedUid\)/s);
});

test("12. returned currentUser identity equals authenticated UID", () => {
  assert.match(source, /currentUser:\s*authenticatedUid/s);
});

test("13. global root /drills remains the intended collection", () => {
  assert.match(source, /collection\(db,\s*['\"]drills['\"]\)/s);
  assert.doesNotMatch(source, /collection\(db,\s*['\"]academies['\"].*['\"]drills['\"]/s);
});

test("14. no academies/{academyId}/drills migration was introduced", () => {
  assert.doesNotMatch(source, /academies\s*[,\/]\s*.*drills|['\"]academies['\"].*['\"]drills['\"]/s);
  assert.doesNotMatch(source, /doc\(db,\s*['\"]academies['\"]/s);
});
