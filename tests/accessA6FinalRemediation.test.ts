import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canImpersonateUser,
  hasClientPermission,
  isActivePrivilegedActor,
} from "../src/lib/privilegedAuthorization.js";
import {
  appRouteScope,
  appShellLandingPage,
  isExactActiveMembership,
  resolveExactMembershipSnapshot,
} from "../src/contexts/academyAccessModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const readSource = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

const authSource = readSource("src/contexts/AuthContext.tsx");
const academySource = readSource("src/contexts/AcademyContext.tsx");
const appSource = readSource("src/App.tsx");
const conciergeSource = readSource("src/components/ConciergeDashboard.tsx");
const superadminSource = readSource("src/components/SuperadminPortal.tsx");

const activeMembership = {
  userId: "user-1",
  academyId: "academy-1",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  source: "SUPERADMIN_ASSIGNMENT" as const,
  joinedAt: null,
  joinedBy: "super-1",
  updatedAt: null,
};

test("1. only exact Active and ACTIVE privileged statuses are accepted", () => {
  assert.equal(isActivePrivilegedActor({ role: "SUPERADMIN", status: "Active" }, ["SUPERADMIN"]), true);
  assert.equal(isActivePrivilegedActor({ role: "SUPERADMIN", status: "ACTIVE" }, ["SUPERADMIN"]), true);
  for (const status of ["Inactive", "INACTIVE", "PENDING", "REJECTED", "active", "Enabled", "", null, undefined, 1, {}]) {
    assert.equal(isActivePrivilegedActor({ role: "SUPERADMIN", status }, ["SUPERADMIN"]), false);
  }
});

test("2. active SUPERADMIN receives intended unrestricted client permission", () => {
  const actor = { role: "SUPERADMIN", status: "ACTIVE" };
  assert.equal(hasClientPermission(actor, actor, ["ADMIN"]), true);
  assert.equal(hasClientPermission(actor, actor, []), true);
});

test("3. inactive, missing, and malformed SUPERADMIN authority fails closed", () => {
  for (const status of ["Inactive", "INACTIVE", "PENDING", "REJECTED", undefined, null, {}, "UNKNOWN"]) {
    const actor = { role: "SUPERADMIN", status };
    assert.equal(hasClientPermission(actor, actor, ["SUPERADMIN"]), false);
  }
});

test("4. active assigned DATA_ADMIN impersonation remains valid", () => {
  const actor = { role: "DATA_ADMIN", status: "Active", assignedClients: ["target-1"] };
  assert.equal(canImpersonateUser(actor, { id: "target-1" }), true);
  assert.equal(canImpersonateUser(actor, { id: "target-2" }), false);
  assert.equal(hasClientPermission(actor, actor, ["DATA_ADMIN"]), true);
});

test("5. inactive or malformed DATA_ADMIN cannot impersonate", () => {
  for (const status of ["Inactive", "INACTIVE", "PENDING", "REJECTED", undefined, null, "active", {}]) {
    assert.equal(
      canImpersonateUser(
        { role: "DATA_ADMIN", status, assignedClients: ["target-1"] },
        { id: "target-1" },
      ),
      false,
    );
  }
  assert.equal(canImpersonateUser({ role: "DATA_ADMIN", status: "ACTIVE", assignedClients: ["target-1"] }, {}), false);
});

test("6. App gates privileged routes with the authoritative actualUser", () => {
  assert.match(appSource, /actualUser/);
  assert.match(appSource, /requiredPrivilegedRole/);
  assert.match(appSource, /isActivePrivilegedActor\s*\(\s*actualUser\s*,\s*\[requiredPrivilegedRole\]\s*\)/s);
  assert.match(appSource, /return\s+<AccessDenied/);
});

test("7. Firebase auth and live authoritative users uid snapshot remain actor sources", () => {
  assert.match(authSource, /onAuthStateChanged\s*\(\s*auth/);
  assert.match(authSource, /doc\s*\(\s*db\s*,\s*"users"\s*,\s*firebaseUser\.uid\s*\)/);
  assert.match(authSource, /onSnapshot\s*\(\s*userRef/);
  assert.match(authSource, /\.\.\.userData[\s\S]*id:\s*firebaseUser\.uid[\s\S]*uid:\s*firebaseUser\.uid/);
});

test("8. Concierge contains no hardcoded or synthesized User inventory", () => {
  assert.doesNotMatch(conciergeSource, /\bCLIENTS\b|:\s*User\[\]|from\s+["']\.\.\/contexts\/AuthContext["'];?\s*\nimport\s*\{\s*User/);
  assert.doesNotMatch(conciergeSource, /pep@|medical@|scout@|Coach Pep|Dr\. Somchai|Scout A/i);
});

test("9. Concierge exposes no local Log In As or impersonate action", () => {
  assert.doesNotMatch(conciergeSource, /Log In As|\bimpersonate\s*\(/i);
  assert.match(conciergeSource, /Firestore-backed Concierge assignment inventory is available/);
  assert.match(conciergeSource, /impersonation is disabled/i);
});

test("10. no production component calls impersonate with a local identity", () => {
  assert.doesNotMatch(conciergeSource, /\bimpersonate\b/);
  assert.doesNotMatch(superadminSource, /\bimpersonate\s*\(/);
  assert.match(superadminSource, /subscribeToUsers\s*\(/);
});

test("11. legacy academyId alone grants no AcademyContext", () => {
  assert.doesNotMatch(academySource, /currentUser\??\.academyId|legacyAcademyId|LEGACY_COMPATIBILITY|isLegacyCompatibility/);
  assert.match(academySource, /currentUser\?\.activeAcademyId\s*\?\?\s*null/);
});

test("12. activeAcademyId without a Membership resolves missing and grants no context", () => {
  assert.deepEqual(
    resolveExactMembershipSnapshot(false, null, "user-1", "user-1", "academy-1"),
    { state: "MEMBERSHIP_MISSING" },
  );
});

test("13. exact ACTIVE Membership enables the correct academy and tenantRole", () => {
  assert.equal(isExactActiveMembership(activeMembership, "user-1", "user-1", "academy-1"), true);
  assert.deepEqual(
    resolveExactMembershipSnapshot(true, activeMembership, "user-1", "user-1", "academy-1"),
    { state: "ACTIVE_MEMBERSHIP", membership: activeMembership },
  );
});

test("14. mismatched document, userId, or academyId fails closed", () => {
  assert.equal(isExactActiveMembership(activeMembership, "other", "user-1", "academy-1"), false);
  assert.equal(isExactActiveMembership({ ...activeMembership, userId: "other" }, "user-1", "user-1", "academy-1"), false);
  assert.equal(isExactActiveMembership({ ...activeMembership, academyId: "other" }, "user-1", "user-1", "academy-1"), false);
  assert.equal(isExactActiveMembership({ ...activeMembership, role: "PLAYER" }, "user-1", "user-1", "academy-1"), false);
});

test("15. non-ACTIVE, missing, and malformed Membership statuses fail closed exactly", () => {
  const expected = new Map<unknown, string>([
    ["PENDING", "MEMBERSHIP_PENDING"],
    ["SUSPENDED", "MEMBERSHIP_SUSPENDED"],
    ["REVOKED", "MEMBERSHIP_REVOKED"],
    ["LEFT", "MEMBERSHIP_LEFT"],
    ["active", "ERROR"],
    ["Active", "ERROR"],
    ["UNKNOWN", "ERROR"],
    [null, "ERROR"],
    [undefined, "ERROR"],
  ]);
  for (const [status, state] of expected) {
    const result = resolveExactMembershipSnapshot(
      true,
      { ...activeMembership, status },
      "user-1",
      "user-1",
      "academy-1",
    );
    assert.equal(result.state, state);
  }
});

test("16. revocation after activation cannot retain an authorized Membership", () => {
  const active = resolveExactMembershipSnapshot(true, activeMembership, "user-1", "user-1", "academy-1");
  const revoked = resolveExactMembershipSnapshot(
    true,
    { ...activeMembership, status: "REVOKED" },
    "user-1",
    "user-1",
    "academy-1",
  );
  assert.equal(active.state, "ACTIVE_MEMBERSHIP");
  assert.equal(revoked.state, "MEMBERSHIP_REVOKED");
  assert.equal("membership" in revoked, false);
  assert.match(academySource, /stopAcademyListener\(\);\s*clearTenantAccess\(\);/s);
});

test("17. Membership listener errors clear tenant authorization immediately", () => {
  assert.match(
    academySource,
    /\(membershipSnapshotError\)\s*=>\s*\{[\s\S]*?stopAcademyListener\(\);[\s\S]*?clearTenantAccess\(\);[\s\S]*?setAccessState/s,
  );
  assert.match(academySource, /membershipSnapshot\.metadata\.fromCache/);
  assert.match(academySource, /membershipSnapshot\.metadata\.hasPendingWrites/);
  assert.match(academySource, /includeMetadataChanges:\s*true/);
});

test("18. Academy/user switching and late snapshots are invalidated", () => {
  assert.match(academySource, /cancelled\s*=\s*true/);
  assert.match(academySource, /\+\+resolutionVersion/);
  assert.match(academySource, /currentVersion\s*!==\s*resolutionVersion/);
  assert.match(academySource, /unsubscribeMembership\?\.\(\)/);
  assert.match(academySource, /stopAcademyListener\(\)/);
  assert.match(academySource, /authorizedScopeKey\s*===\s*requestedScopeKey/);
});

test("19. tenant collection access requires the exact live ACTIVE Membership scope", () => {
  assert.match(academySource, /const\s+hasAuthorizedTenantContext\s*=\s*Boolean[\s\S]*isExactActiveMembership/s);
  assert.match(academySource, /getAcademyCollection[\s\S]*!hasAuthorizedTenantContext[\s\S]*throw new Error/s);
});

test("20. App accepts tenant staff routes only through ACTIVE_MEMBERSHIP", () => {
  assert.doesNotMatch(appSource, /LEGACY_COMPATIBILITY/);
  assert.match(appSource, /accessState\s*!==\s*"ACTIVE_MEMBERSHIP"/);
});

test("21. active global SUPERADMIN routes remain academy-independent", () => {
  const activeSuperadmin = { id: "super-1", name: "Super", role: "SUPERADMIN" as const, status: "ACTIVE" as const };
  const inactiveSuperadmin = { ...activeSuperadmin, status: "INACTIVE" as const };
  assert.equal(appShellLandingPage(activeSuperadmin, false), "superadmin");
  assert.equal(appShellLandingPage(inactiveSuperadmin, false), "dashboard");
  assert.equal(appRouteScope("superadmin"), "GLOBAL");
  assert.equal(appRouteScope("drills"), "GLOBAL");
});
