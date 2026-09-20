import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portal = readFileSync(
  "src/components/pro-club/ProClubPortal.tsx",
  "utf8",
);

test("fresh Pro Club discovery owns an explicit loading state before onboarding fallback renders", () => {
  assert.match(portal, /type ProClubDiscoveryState = "DISCOVERING" \| "OPENING" \| "COMPLETE"/);
  assert.match(portal, /useState<ProClubDiscoveryState>\(restoredClubReference \? "OPENING" : "DISCOVERING"\)/);
  assert.match(portal, /setDiscoveryState\("OPENING"\)/);
  assert.match(portal, /setDiscoveryState\("COMPLETE"\)/);
});

test("fresh discovery renders Opening your club instead of flashing onboarding or workspace reference", () => {
  assert.match(
    portal,
    /discoveryState !== "COMPLETE"\s*\?\s*\([\s\S]*Opening your club…[\s\S]*\)\s*:\s*\(/,
  );
});

test("Pro Club portal uses the full desktop viewport with safe responsive gutters", () => {
  assert.doesNotMatch(portal, /max-w-5xl/);
  assert.match(
    portal,
    /<header[\s\S]*<div className="mx-auto flex w-full max-w-none flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">/,
  );
  assert.match(
    portal,
    /<main className="mx-auto w-full max-w-none space-y-7 px-4 py-7 sm:px-6 sm:py-10 lg:px-8">/,
  );
});
