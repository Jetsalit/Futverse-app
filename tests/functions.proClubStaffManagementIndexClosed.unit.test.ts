import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const indexSource = readFileSync("functions/src/index.ts", "utf8");

test("Staff Management callable remains intentionally unexported in this slice", () => {
  assert.equal(indexSource.includes("manageProClubStaffV1"), false);
  assert.equal(indexSource.includes("proClubStaffManagement/callableHandler"), false);
  assert.equal(indexSource.includes("createRateLimitedProClubStaffManagementServiceV1"), false);
  assert.equal(indexSource.includes("createFirestoreProClubStaffManagementRateLimiterV1"), false);
});
