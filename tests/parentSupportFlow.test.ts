import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const read = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, relative), "utf8");

const dashboard = read("../src/components/Dashboard.tsx");
const playerDashboard = read("../src/components/PlayerDashboard.tsx");
const parentLink = read("../src/components/superadmin/SuperAdminParentLinkLauncher.tsx");
const root = read("../src/SupportAwareRoot.tsx");

describe("Parent support flow", () => {
  it("PARENT dashboard uses the canonical linked-player dashboard", () => {
    assert.match(dashboard, /currentUser\?\.role\s*===\s*"PARENT"/);
    assert.match(dashboard, /return\s*<PlayerDashboard\s+onNavigate=\{onNavigate\}\s*\/>/);
  });

  it("normal and Work As Parent/Player share PlayerDashboard instead of a duplicate shell", () => {
    assert.match(playerDashboard, /linkedPlayerLookupForUser\(currentUser\)/);
    assert.match(root, /<App\s+key=\{appKey\}\s*\/>/);
    assert.doesNotMatch(root, /SuperAdminNonStaffWorkAsShell/);
  });

  it("Parent Link writes association and audit in one Firestore transaction", () => {
    assert.match(parentLink, /runTransaction\(db,\s*async\s*\(transaction\)/);
    assert.match(parentLink, /transaction\.set\(associationRef/);
    assert.match(parentLink, /transaction\.set\(logRef/);
    assert.match(parentLink, /SUPERADMIN_PARENT_PLAYER_LINKED/);
  });

  it("new Parent Link does not require a forbidden read of a missing association", () => {
    assert.doesNotMatch(parentLink, /transaction\.get\(associationRef\)/);
    assert.doesNotMatch(parentLink, /getDocFromServer\(associationRef\)/);
  });

  it("Parent Link preserves exact canonical five-field association schema", () => {
    assert.match(
      parentLink,
      /transaction\.set\(associationRef,\s*\{\s*userId:\s*parentUid,\s*academyId,\s*playerId,\s*role:\s*"PARENT",\s*status:\s*"ACTIVE",\s*\}\)/s,
    );
  });
});
