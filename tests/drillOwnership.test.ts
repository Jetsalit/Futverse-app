import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/hooks/useDrillDatabase.ts", import.meta.url), "utf8");

test("1. useDrillDatabase reads both actual and presented identity", () => {
  assert.match(source, /const\s*\{\s*actualUser,\s*currentUser\s*\}\s*=\s*useAuth\(\)/s);
  assert.match(source, /resolveAssistedRecordIdentity\(actualUser,\s*currentUser\)/s);
});

test("2. authenticated actor and record owner are resolved separately", () => {
  assert.match(source, /const\s*authenticatedUid\s*=\s*identity\.actorUid/s);
  assert.match(source, /const\s*ownerUid\s*=\s*identity\.ownerUid/s);
});

test("3. no unknown_user ownership fallback exists", () => {
  assert.doesNotMatch(source, /unknown_user/i);
});

test("4. saveDrill fail-closes without both actor and owner", () => {
  assert.match(source, /if\s*\(\s*!authenticatedUid\s*\|\|\s*!ownerUid\s*\)/s);
});

test("5. saveDrill preserves presented owner and records assisted actor", () => {
  assert.match(source, /created_by:\s*ownerUid/s);
  assert.match(source, /recorded_by:\s*authenticatedUid/s);
  assert.match(source, /entry_mode:\s*['\"]ASSISTED['\"]/s);
});

test("6. updateDrill is constrained to presented owner scope", () => {
  assert.match(source, /target\.created_by\s*!==\s*ownerUid/s);
  assert.match(source, /Cannot update drill outside the presented owner scope/s);
});

test("7. updateDrill keeps ownership and assisted audit fields immutable from caller", () => {
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(updates,\s*['\"]created_by['\"]\)/s);
  assert.match(source, /delete\s+safeUpdates\.created_by/s);
  assert.match(source, /delete\s+safeUpdates\.recorded_by/s);
  assert.match(source, /delete\s+safeUpdates\.entry_mode/s);
});

test("8. deleteDrill is constrained to presented owner scope", () => {
  assert.match(source, /Cannot delete drill outside the presented owner scope/s);
});

test("9. myDrills follows presented owner identity", () => {
  assert.match(source, /myDrills\s*=\s*drills\.filter\(d\s*=>\s*d\.created_by\s*===\s*ownerUid\)/s);
});

test("10. returned currentUser identity equals presented owner UID", () => {
  assert.match(source, /currentUser:\s*ownerUid/s);
});

test("11. global root drills collection remains unchanged", () => {
  assert.match(source, /collection\(db,\s*['\"]drills['\"]\)/s);
  assert.doesNotMatch(source, /collection\(db,\s*['\"]academies['\"].*['\"]drills['\"]/s);
});

test("12. no academies/{academyId}/drills migration was introduced", () => {
  assert.doesNotMatch(source, /academies\s*[,\/]\s*.*drills|['\"]academies['\"].*['\"]drills['\"]/s);
  assert.doesNotMatch(source, /doc\(db,\s*['\"]academies['\"]/s);
});
