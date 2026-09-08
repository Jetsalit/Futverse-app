import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE,
  isFunctionBackedProClubWebAvailable,
} from "../src/config/runtimeCapabilities.ts";
import {
  ProClubControlPlaneApiError,
  assertProClubServerControlPlaneAvailable,
} from "../src/lib/proClubProvisioningControlPlaneApi.ts";
import { defaultCallableCaller } from "../src/lib/firestore/proClubOnboardingRepository.ts";
import { OnboardingError } from "../src/lib/proClubOnboarding.ts";

test("production/non-Vite runtime is fail-closed while explicit DEV is available", () => {
  assert.equal(isFunctionBackedProClubWebAvailable({}), false);
  assert.equal(isFunctionBackedProClubWebAvailable({ dev: false }), false);
  assert.equal(isFunctionBackedProClubWebAvailable({ dev: true }), true);

  // Node test execution has no Vite DEV environment and therefore models the
  // fail-closed production boundary.
  assert.equal(FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE, false);
});

test("control-plane guard blocks Spark before any server request can begin", () => {
  assert.throws(
    () => assertProClubServerControlPlaneAvailable(false),
    (error: unknown) =>
      error instanceof ProClubControlPlaneApiError &&
      error.code === "ERROR_SERVER_CONTROL_PLANE_UNAVAILABLE_ON_SPARK" &&
      error.httpStatus === 0,
  );

  assert.doesNotThrow(() => assertProClubServerControlPlaneAvailable(true));
});

test("default staff candidate callable is fail-closed on Spark production", async () => {
  await assert.rejects(
    () => defaultCallableCaller({ clubId: "club-1", email: "coach@example.com" }),
    (error: unknown) =>
      error instanceof OnboardingError && error.code === "UNAVAILABLE",
  );
});

test("Spark UI gates only Function-backed controls and preserves Firestore onboarding surface", () => {
  const provisioningUi = readFileSync(
    "src/components/superadmin/ProClubProvisioningControlPlane.tsx",
    "utf8",
  );
  const pendingStaffUi = readFileSync(
    "src/components/pro-club/PendingStaffRequests.tsx",
    "utf8",
  );
  const staffOnboardingUi = readFileSync(
    "src/components/pro-club/StaffOnboarding.tsx",
    "utf8",
  );

  assert.match(provisioningUi, /FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/);
  assert.match(provisioningUi, /Pro Club server control plane unavailable/);
  assert.match(pendingStaffUi, /Invite staff is unavailable on the Spark production web app/);
  assert.match(pendingStaffUi, /Pending request review remains available/);

  assert.doesNotMatch(staffOnboardingUi, /FUNCTION_BACKED_PRO_CLUB_WEB_AVAILABLE/);
  assert.match(staffOnboardingUi, /requestMembership/);
  assert.match(staffOnboardingUi, /Check invitation/);
});

test("production gating has no environment-variable escape hatch", () => {
  const capabilitySource = readFileSync("src/config/runtimeCapabilities.ts", "utf8");
  assert.doesNotMatch(capabilitySource, /VITE_PRO_CLUB_SERVER_CONTROL_PLANE/);
  assert.doesNotMatch(capabilitySource, /process\.env/);
  assert.match(capabilitySource, /environment\.dev === true/);
});
