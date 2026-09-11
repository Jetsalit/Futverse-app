import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const controlSource = readFileSync(
  "src/components/superadmin/ProClubStaffOnboardingControlPlane.tsx",
  "utf8",
);
const navigationSource = readFileSync(
  "src/components/superadmin/SuperAdminPortalNavigation.tsx",
  "utf8",
);

test("SuperAdmin onboarding UI is exposed only as explicit global control-plane surface", () => {
  assert.match(navigationSource, /ProClubStaffOnboardingControlPlane/);
  assert.match(navigationSource, /activeSection\.id === "organizations"/);
  assert.match(navigationSource, /Pro Club Staff Onboarding/);
});

test("UI binds write eligibility to actual ACTIVE SuperAdmin and blocks support mode", () => {
  assert.match(controlSource, /isExactActiveSuperAdmin\(actualUser\)/);
  assert.match(controlSource, /&& !isSupportActive/);
  assert.match(controlSource, /actual authenticated ACTIVE SuperAdmin actor/);
  assert.match(controlSource, /Support\/presentation mode never grants onboarding write authority/);
});

test("UI uses exact Account Reference path and never enables browser email lookup", () => {
  assert.match(controlSource, /Account Reference \/ UID/);
  assert.match(controlSource, /No email directory lookup is performed/);
  assert.doesNotMatch(controlSource, /resolveCandidate/);
  assert.doesNotMatch(controlSource, /FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/);
});

test("UI delegates issue approve and reject to audited runtime adapter", () => {
  assert.match(controlSource, /proClubSuperAdminOnboardingControlRepository\.issueInvitation/);
  assert.match(controlSource, /proClubSuperAdminOnboardingControlRepository\.loadPending/);
  assert.match(controlSource, /proClubSuperAdminOnboardingControlRepository\.reviewClaim/);
  assert.match(controlSource, /"APPROVED"/);
  assert.match(controlSource, /"REJECTED"/);
  assert.match(controlSource, /membership authority is fixed to/i);
  assert.match(controlSource, /HEAD_COACH/);
});
