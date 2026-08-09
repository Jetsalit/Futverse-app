import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const playerDashboardPath = path.resolve(
  __dirname,
  "../src/components/PlayerDashboard.tsx"
);
const code = fs.readFileSync(playerDashboardPath, "utf8");

describe("PlayerDashboard Access Security & Profile Resolution Contract", () => {
  it("proves linkedPlayerLookupForUser is imported and used", () => {
    assert.match(
      code,
      /import\s+.*linkedPlayerLookupForUser.*\s+from\s+["']\.\.\/lib\/nonStaffPlayerAccess["']/
    );
    assert.match(code, /linkedPlayerLookupForUser\(currentUser\)/);
  });

  it("proves PLAYER path uses lookup.academyId in subcollection query", () => {
    assert.match(
      code,
      /collection\(\s*db,\s*["']academies["'],\s*lookup\.academyId,\s*["']players["']\s*\)/
    );
  });

  it("proves PLAYER query uses linkedUserId == lookup.uid", () => {
    assert.match(
      code,
      /where\(\s*["']linkedUserId["'],\s*["']==["'],\s*lookup\.uid\s*\)/
    );
  });

  it("proves PARENT path uses exact lookup.playerId in document path", () => {
    assert.match(
      code,
      /doc\(\s*db,\s*["']academies["'],\s*lookup\.academyId,\s*["']players["'],\s*lookup\.playerId\s*\)/
    );
  });

  it("proves root Academy collection scan is absent", () => {
    assert.doesNotMatch(code, /collection\(\s*db,\s*["']academies["']\s*\)/);
  });

  it("proves collectionGroup query is absent", () => {
    assert.doesNotMatch(code, /collectionGroup/);
  });

  it("proves automatic academyId writeback to user document is absent", () => {
    assert.doesNotMatch(code, /updateDoc\s*\(\s*doc\s*\(\s*db,\s*["']users["']/);
    assert.doesNotMatch(code, /activeAcademyId/);
  });

  it("proves MOCK_PROFILE is not used as authenticated profile fallback", () => {
    assert.doesNotMatch(code, /MOCK_PROFILE/);
    assert.match(code, /useState<any>\(null\)/);
  });

  it("proves duplicate PLAYER query resolution fails closed", () => {
    assert.match(code, /snapshot\.size\s*===\s*1/);
    assert.match(code, /console\.error\(/);
    assert.match(
      code,
      /Data integrity error:\s*Multiple player documents found/
    );
  });

  it("proves UNAVAILABLE resolution fails closed", () => {
    assert.match(
      code,
      /lookup\.type\s*===\s*["']UNAVAILABLE["'][\s\S]*setPlayerProfile\(null\)/
    );
  });
});
