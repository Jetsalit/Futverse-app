import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(
  "src/components/pro-club/ProClubPortal.tsx",
  "utf8",
);

test("fresh Pro Club discovery owns an explicit loading state before onboarding fallback renders", () => {
  assert.match(portal, /type ProClubDiscoveryState = "DISCOVERING" \| "OPENING" \| "COMPLETE"/);
  assert.match(portal, /useState<ProClubDiscoveryState>\(restoredClubReference \? "COMPLETE" : "DISCOVERING"\)/);
  assert.match(portal, /setDiscoveryState\("OPENING"\)/);
  assert.match(portal, /setDiscoveryState\("COMPLETE"\)/);
});

test("fresh discovery renders Opening your club instead of flashing onboarding or workspace reference", () => {
  assert.match(
    portal,
    /discoveryState !== "COMPLETE"\s*\?\s*\([\s\S]*Opening your club…[\s\S]*\)\s*:\s*\(/,
  );
});
