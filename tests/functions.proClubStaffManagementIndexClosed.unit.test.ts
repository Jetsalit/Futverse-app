import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const indexSource = readFileSync("functions/src/index.ts", "utf8");

function extractManagementBlock(): string {
  const marker = "export const manageProClubStaffV1 = onCall(";
  const start = indexSource.indexOf(marker);
  assert.ok(start >= 0, "manageProClubStaffV1 export must exist");
  return indexSource.slice(start, start + 2200);
}

test("Staff Management callable is wired only through hardened server dependencies", () => {
  assert.ok(indexSource.includes("createRateLimitedProClubStaffManagementServiceV1"));
  assert.ok(indexSource.includes("createFirestoreProClubStaffManagementSourceV1"));
  assert.ok(indexSource.includes("createFirestoreProClubStaffManagementRateLimiterV1"));
  assert.ok(indexSource.includes("executeManageProClubStaffCallableV1"));

  const managementSetup = indexSource.slice(
    indexSource.indexOf("let cachedStaffManagementService"),
    indexSource.indexOf("export const manageProClubStaffV1"),
  );
  assert.ok(managementSetup.includes("createRateLimitedProClubStaffManagementServiceV1(source, rateLimiter)"));
  assert.equal(managementSetup.includes("createProClubStaffManagementServiceV1("), false);
});

test("Staff Management callable has exact privileged mutation resource and App Check limits", () => {
  const block = extractManagementBlock();
  assert.match(block, /region:\s*"asia-southeast1"/);
  assert.match(block, /enforceAppCheck:\s*true/);
  assert.match(block, /timeoutSeconds:\s*15/);
  assert.match(block, /memory:\s*"256MiB"/);
  assert.match(block, /concurrency:\s*10/);
  assert.match(block, /maxInstances:\s*5/);
});

test("Staff Management callable derives actor only from verified auth context and forwards App Check context", () => {
  const block = extractManagementBlock();
  assert.ok(block.includes("uid: request.auth.uid"));
  assert.ok(block.includes("appId: request.app.appId"));
  assert.ok(block.includes("data: request.data"));
  assert.ok(block.includes("enforceAppCheck: true"));
  assert.ok(block.includes("logger: safeStaffManagementCallableLogger"));
  assert.equal(block.includes("request.data.requesterUid"), false);
});
