import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../functions/src/index.ts", import.meta.url), "utf8");

test("Pro Player claim submission callable is wired with App Check and staging-safe resource limits", () => {
  assert.match(source, /export const submitProPlayerOnboardingClaimV1 = onCall\(/);
  const start = source.indexOf("export const submitProPlayerOnboardingClaimV1");
  assert.notEqual(start, -1);
  const block = source.slice(start, start + 1200);
  assert.match(block, /enforceAppCheck:\s*true/);
  assert.match(block, /region:\s*"asia-southeast1"/);
  assert.match(block, /timeoutSeconds:\s*15/);
  assert.match(block, /maxInstances:\s*5/);
  assert.match(block, /executeSubmitProPlayerOnboardingClaimCallableV1/);
});

test("submission wiring does not reference identity issuance, canonical proPlayers writes or approval", () => {
  const start = source.indexOf("import {\n  createProPlayerClaimSubmissionServiceV1");
  assert.notEqual(start, -1);
  const block = source.slice(start);
  for (const forbidden of ["issuePlayerIdentity", "futIdRegistry", "playerIdentities", "proPlayers).doc", "approveProPlayer"]) {
    assert.equal(block.includes(forbidden), false);
  }
});
