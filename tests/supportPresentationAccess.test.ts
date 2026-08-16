import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requiresStaffMembership, isStaffOnboardingRequest } from "../src/contexts/academyAccessModel";
import { isFeatureEnabled } from "../src/config/featureFlags";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsCode = fs.readFileSync(
  path.resolve(__dirname, "../src/components/Settings.tsx"),
  "utf8",
);

const normalCoach = {
  uid: "coach-1",
  name: "Coach One",
  role: "COACH" as const,
  status: "ACTIVE",
};

const supportCoach = {
  ...normalCoach,
  supportPresentation: true,
};

describe("support presentation access isolation", () => {
  it("normal coach still requires authoritative membership", () => {
    assert.equal(requiresStaffMembership(normalCoach), true);
  });

  it("support-presented coach skips only the duplicate normal membership gate", () => {
    assert.equal(requiresStaffMembership(supportCoach), false);
  });

  it("normal onboarding requests are unchanged", () => {
    assert.equal(
      isStaffOnboardingRequest({
        uid: "user-1",
        name: "Pending Coach",
        role: "USER",
        requestedRole: "COACH",
        status: "Inactive",
      }),
      true,
    );
  });

  it("client-only support presentation never enters onboarding flow", () => {
    assert.equal(
      isStaffOnboardingRequest({
        uid: "user-1",
        name: "Presented User",
        role: "USER",
        requestedRole: "COACH",
        status: "ACTIVE",
        supportPresentation: true,
      }),
      false,
    );
  });

  it("settings accepts both normal active membership and authorized SuperAdmin workspace", () => {
    assert.match(
      settingsCode,
      /accessState\s*===\s*"ACTIVE_MEMBERSHIP"\s*\|\|\s*accessState\s*===\s*"SUPERADMIN_WORKSPACE"/s,
    );
    assert.doesNotMatch(
      settingsCode,
      /if\s*\(accessState\s*!==\s*"ACTIVE_MEMBERSHIP"/,
    );
  });

  it("Data Admin Concierge remains disabled until explicit rollout", () => {
    assert.equal(isFeatureEnabled("dataAdminConciergeEnabled"), false);
  });
});
