import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const code = fs.readFileSync(
  path.resolve(__dirname, "../src/components/PlayerDashboard.tsx"),
  "utf8",
);

describe("PlayerDashboard authoritative association contract", () => {
  it("resolves through the authoritative association model", () => {
    assert.match(code, /resolveAuthoritativeAssociationSnapshot/);
    assert.match(code, /linkedPlayerLookupForUser\(currentUser\)/);
    assert.match(code, /collectionGroup\(db,\s*NONSTAFF_ASSOCIATION_COLLECTION\)/);
    assert.match(code, /where\("userId",\s*"==",\s*lookup\.uid\)/);
  });

  it("never uses legacy user pointers or Player linkedUserId as authority", () => {
    assert.equal((code.match(/user\.activeAcademyId/g) || []).length, 1);
    assert.equal((code.match(/user\.linkedPlayerId/g) || []).length, 1);
    assert.doesNotMatch(code, /where\(["']academyId["']/);
    assert.doesNotMatch(code, /where\(["']playerId["']/);
    assert.doesNotMatch(code, /linkedUserId/);
    assert.doesNotMatch(code, /collection\(\s*db,\s*["']academies["']/);
  });

  it("uses continuous metadata-aware association and exact player listeners", () => {
    assert.match(code, /onSnapshot\(\s*associationsQuery/);
    assert.match(code, /onSnapshot\(\s*playerReference/);
    assert.match(code, /includeMetadataChanges:\s*true/g);
    assert.match(
      code,
      /doc\(\s*db,\s*"academies",\s*association\.academyId,\s*"players",\s*association\.playerId/,
    );
    assert.doesNotMatch(code, /\bgetDoc(?:s)?\b/);
  });

  it("clears access for cache, pending writes, missing documents, and listener errors", () => {
    assert.match(code, /snapshot\.metadata\.fromCache/);
    assert.match(code, /snapshot\.metadata\.hasPendingWrites/);
    assert.match(code, /playerSnapshot\.metadata\.fromCache/);
    assert.match(code, /playerSnapshot\.metadata\.hasPendingWrites/);
    assert.match(code, /!playerSnapshot\.exists\(\)/);
    assert.ok((code.match(/clearResolvedProfiles\(\)/g) || []).length >= 5);
    assert.match(code, /Authoritative association listener failed/);
    assert.match(code, /Authoritative player listener failed/);
  });

  it("guards stale callbacks and unsubscribes on account switch or unmount", () => {
    assert.match(code, /currentVersion\s*!==\s*resolutionVersion/);
    assert.match(code, /\+\+resolutionVersion/);
    assert.match(code, /unsubscribeAssociations\?\.\(\)/);
    assert.match(code, /stopPlayerListeners\(\)/);
    assert.match(code, /\}, \[currentUser\]\)/);
    assert.match(code, /resolvedScopeKey\s*===\s*currentScopeKey/);
    assert.match(code, /user\.activeAcademyId\s*\?\?\s*null/);
  });

  it("supports multiple exact authorized profiles without roster listing", () => {
    assert.match(code, /resolution\.associations\.map/);
    assert.match(code, /visiblePlayerProfiles\.length\s*>\s*1/);
    assert.match(code, /setSelectedProfileKey/);
    assert.doesNotMatch(code, /collection\(\s*db,\s*"academies"/);
  });
});
