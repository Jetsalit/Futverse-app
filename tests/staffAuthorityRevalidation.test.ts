import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supportContextCode = fs.readFileSync(
  path.resolve(__dirname, "../src/contexts/SuperAdminSupportContext.tsx"),
  "utf8",
);
const rootCode = fs.readFileSync(
  path.resolve(__dirname, "../src/SupportAwareRoot.tsx"),
  "utf8",
);

describe("staff Work As authority revalidation", () => {
  it("does not immediately invalidate an active Work As session on cache fallback", () => {
    assert.match(
      supportContextCode,
      /if \(snapshot\.metadata\.fromCache\) \{[\s\S]*setIsStaffAuthorityRevalidating\(true\);[\s\S]*getDocFromServer\(memberRef\)/,
    );
    assert.doesNotMatch(
      supportContextCode,
      /if \(snapshot\.metadata\.fromCache\) \{[\s\S]{0,220}invalidateWorkMode\(\s*"Authoritative target Membership data lost/,
    );
  });

  it("preserves exact UID, Academy, role validation during server revalidation", () => {
    assert.match(
      supportContextCode,
      /isExactActiveStaffMembershipForRole\(\s*serverSnapshot\.data\(\),\s*expectedUid,\s*expectedAcademyId,\s*serverSnapshot\.id,\s*tenantRole/s,
    );
  });

  it("still invalidates when authoritative server revalidation fails", () => {
    assert.match(
      supportContextCode,
      /invalidateWorkMode\(\s*"Target Membership failed authoritative server revalidation\."/,
    );
    assert.match(
      supportContextCode,
      /invalidateWorkMode\(\s*"Unable to revalidate target Membership from server\."/,
    );
  });

  it("blocks tenant actions while staff authority is being revalidated", () => {
    assert.match(rootCode, /isStaffAuthorityRevalidating/);
    assert.match(rootCode, /<SuperAdminStaffAuthorityGate \/>/);
  });
});
