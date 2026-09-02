import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read(
  "docs/ORGANIZATION_RUNTIME_SELECTION_V1_PRO_CLUB_AUTHORITY_COORDINATION_FREEZE.md",
);
const runtimeContext = read(
  "src/contexts/OrganizationRuntimeContext.tsx",
);
const runtimeModel = read(
  "src/lib/organizationRuntimeSelection.ts",
);
const proClubBridge = read(
  "src/lib/organizationRuntimeProClubAuthorityBridge.ts",
);
const proClubAdapter = read(
  "src/lib/firestore/proClubOrganizationAdapter.ts",
);
const authContext = read("src/contexts/AuthContext.tsx");
const academyContext = read("src/contexts/AcademyContext.tsx");
const supportPresentedUserBridge = read(
  "src/contexts/SupportPresentedUserBridge.tsx",
);
const superAdminSupportContext = read(
  "src/contexts/SuperAdminSupportContext.tsx",
);
const superAdminNonStaffSupportContext = read(
  "src/contexts/SuperAdminNonStaffSupportContext.tsx",
);
const mainSource = read("src/main.tsx");

test(
  "Organization Runtime Selection V1 Pro Club Authority Coordination Contract Freeze",
  async (t) => {
    await t.test("freezes exact predecessor baseline and contract branch", () => {
      assert.ok(
        contract.includes("be0300c2d5a9dbc03d5660d6d344d2098ffc000e"),
      );
      assert.ok(
        contract.includes(
          "feat/organization-runtime-selection-v1-pro-club-authority-coordination-contract",
        ),
      );
      assert.ok(contract.includes("predecessor React Auth Lifecycle"));
      assert.ok(contract.includes("PR #48"));
    });

    await t.test("preserves selection-not-authority", () => {
      assert.ok(contract.includes("`SELECTION != AUTHORITY`"));
      assert.ok(contract.includes("Selecting a Pro Club represents runtime intent only"));
      assert.ok(contract.includes("No phase may be bypassed to produce `AUTHORIZED`"));
    });

    await t.test("freezes the authenticated actor boundary", () => {
      assert.match(runtimeContext, /const \{ actualUser \} = useAuth\(\);/);
      assert.match(runtimeContext, /const actorUid = actualUser\?\.uid \?\? null;/);
      assert.match(
        authContext,
        /const currentUser = supportPresentedUser \?\? actualUser;/,
      );
      assert.ok(contract.includes("`actualUser.uid`"));
      assert.ok(contract.includes("`currentUser.uid`"));
      assert.ok(contract.includes("`PRESENTED USER != AUTHENTICATED ACTOR`"));
      assert.ok(contract.includes("a UI-supplied UID"));
      assert.ok(contract.includes("account role"));
      assert.ok(contract.includes("presentation role"));
    });

    await t.test("requires the existing pure runtime API chain", () => {
      for (const api of [
        "selectOrganization",
        "beginOrganizationResolution",
        "getOrganizationResolutionRequest",
        "applyOrganizationResolution",
      ]) {
        assert.match(runtimeModel, new RegExp(`export function ${api}\\b`));
        assert.ok(contract.includes(`\`${api}\``));
      }
      assert.ok(
        contract.includes(
          "`UNSELECTED -> SELECTED -> RESOLVING -> AUTHORIZED | REJECTED | ERROR`",
        ),
      );
      assert.match(runtimeModel, /trustedResolutionRequests/);
      assert.match(runtimeModel, /generation === state\.generation/);
    });

    await t.test("requires the existing Pro Club bridge and canonical adapter", () => {
      assert.match(
        proClubBridge,
        /export async function resolveProClubRuntimeAuthority\(/,
      );
      assert.match(
        proClubBridge,
        /resolveProClubOrganizationAuthority\(\s*trustedRequest\.organizationId,\s*trustedRequest\.uid,/s,
      );
      assert.match(
        proClubAdapter,
        /export async function resolveProClubOrganizationAuthority\(/,
      );
      assert.ok(
        contract.includes("`resolveProClubRuntimeAuthority(request, ops?)`"),
      );
      assert.ok(contract.includes("must not duplicate runtime lifecycle logic"));
      assert.ok(contract.includes("must not duplicate\nPro Club document"));
    });

    await t.test("freezes narrow selection intent and forbids authority injection", () => {
      assert.ok(
        contract.includes(
          '`selectOrganization("PRO_CLUB", organizationId)`',
        ),
      );
      for (const forbiddenInput of [
        "UID",
        "generation",
        "resolution request",
        "runtime authority result",
        "authorization proof",
        "bridge `ops`",
        "Membership authority",
        "runtime state",
      ]) {
        assert.ok(
          contract.includes(forbiddenInput),
          `missing forbidden public input: ${forbiddenInput}`,
        );
      }
      assert.ok(contract.includes("Public provider props\nremain children-only"));
    });

    await t.test("requires current-state application and stale-result rejection", () => {
      assert.ok(contract.includes("setRuntimeState((current) =>"));
      assert.ok(
        contract.includes("applyOrganizationResolution(current, result)"),
      );
      assert.ok(contract.includes("A resolving -> select B -> A returns"));
      assert.ok(contract.includes("A resolving -> logout -> A returns"));
      assert.ok(
        contract.includes(
          "A resolving -> authenticated UID changes -> A returns",
        ),
      );
      assert.ok(contract.includes("unmount/remount"));
      assert.ok(contract.includes("StrictMode or duplicate execution"));
      assert.ok(contract.includes("request identity"));
      assert.ok(contract.includes("effect cleanup"));
      assert.ok(contract.includes("in-flight guard"));
      assert.ok(contract.includes("No\nclient-side authority cache is approved"));
    });

    await t.test("preserves exact bridge authority mapping", () => {
      for (const mapping of [
        "`FOUND + hasMembershipAuthority=true -> AUTHORIZED`",
        "`FOUND + hasMembershipAuthority=false -> REJECTED`",
        "`MISSING -> REJECTED`",
        "`PERMISSION_DENIED -> ERROR`",
        "`INVALID_DATA -> ERROR`",
        "`ERROR -> ERROR`",
        "`identity mismatch/integrity failure -> ERROR`",
      ]) {
        assert.ok(contract.includes(mapping), `missing mapping: ${mapping}`);
      }
      assert.match(
        proClubBridge,
        /authorityResult\.value\s*\.hasMembershipAuthority/s,
      );
      assert.match(
        proClubBridge,
        /authorityResult\.value\.userId\s*!==\s*trustedRequest\.uid/,
      );
      assert.ok(contract.includes("A `staffRole` alone must never authorize"));
    });

    await t.test("keeps Academy outside Pro Club coordination", () => {
      assert.match(
        proClubBridge,
        /trustedRequest\.organizationType\s*!==\s*"PRO_CLUB"/s,
      );
      assert.match(
        academyContext,
        /doc\(db, "academies", activeAcademyId, "members", uid\)/,
      );
      assert.match(academyContext, /resolveExactMembershipSnapshot/);
      assert.ok(contract.includes("must not call the Pro Club bridge"));
      assert.ok(contract.includes("`AcademyProvider` authority"));
      assert.ok(contract.includes("`activeAcademyId` compatibility"));
      assert.ok(contract.includes("Academy Firestore Rules"));
      assert.ok(contract.includes("Academy Match authority"));
      assert.ok(contract.includes("SuperAdmin Academy workspace behavior"));
    });

    await t.test("preserves SuperAdmin and support identity boundaries", () => {
      assert.match(supportPresentedUserBridge, /const \{ actualUser,/);
      assert.match(superAdminSupportContext, /const \{ actualUser \} = useAuth\(\);/);
      assert.match(
        superAdminNonStaffSupportContext,
        /const \{ actualUser \} = useAuth\(\);/,
      );
      for (const boundary of [
        "`SuperAdminSupportContext`",
        "`SuperAdminNonStaffSupportContext`",
        "`SupportPresentedUserBridge`",
        "Work As Staff",
        "non-staff support",
        "support audit lifecycle",
      ]) {
        assert.ok(contract.includes(boundary), `missing support boundary: ${boundary}`);
      }
      assert.ok(
        contract.includes(
          "A support-presented identity must not bind the Organization Runtime actor",
        ),
      );
    });

    await t.test("preserves provider placement and keyed actor lifecycle", () => {
      assert.match(
        mainSource,
        /<AuthProvider>\s*<OrganizationRuntimeProvider>\s*<SuperAdminSupportProvider>/s,
      );
      assert.match(
        runtimeContext,
        /actorUid === null \? "unauthenticated" : `authenticated:\${actorUid}`/,
      );
      assert.ok(contract.includes("provider placement"));
      assert.ok(contract.includes("keyed authenticated actor lifecycle"));
    });

    await t.test("forbids persistence and generic authority pointers", () => {
      for (const persistence of [
        "Firestore persistence",
        "`localStorage`",
        "`sessionStorage`",
        "cookies",
        "`IndexedDB`",
        "URL persistence",
        "`activeProClubId`",
        "`activeOrganizationId`",
        "`activeOrganizationType`",
        "persisted generic organization role",
        "persisted generic authority",
      ]) {
        assert.ok(contract.includes(persistence), `missing boundary: ${persistence}`);
      }
      assert.ok(contract.includes("Organization Runtime remains in-memory"));
    });

    await t.test("forbids Firestore mutation authority", () => {
      for (const mutation of [
        "`setDoc`",
        "`updateDoc`",
        "`deleteDoc`",
        "`addDoc`",
        "`writeBatch`",
        "`runTransaction`",
      ]) {
        assert.ok(contract.includes(mutation), `missing mutation boundary: ${mutation}`);
        assert.doesNotMatch(proClubBridge, new RegExp(`\\b${mutation.slice(1, -1)}\\b`));
      }
      assert.ok(contract.includes("authority-resolution read path only"));
    });

    await t.test("keeps UI discovery and route authority closed", () => {
      for (const closedSurface of [
        "Organization Selector",
        "Academy/Pro Club switcher",
        "Dashboard picker",
        "Command Center picker",
        "navigation changes",
        "route-driven authority",
        "account-wide organization discovery",
        "Pro Club dashboard wiring",
      ]) {
        assert.ok(
          contract.includes(closedSurface),
          `missing closed UI surface: ${closedSurface}`,
        );
      }
    });

    await t.test("freezes narrow predecessor succession", () => {
      for (const predecessorProhibition of [
        "organization selection",
        "Pro Club bridge invocation",
        "network authority resolution",
        "context expansion",
      ]) {
        assert.ok(contract.includes(predecessorProhibition));
      }
      assert.ok(
        contract.includes(
          "may supersede only those\nphase-specific prohibitions required for Pro Club coordination",
        ),
      );
      assert.ok(
        contract.includes(
          "Predecessor tests must not be modified during this Contract Freeze",
        ),
      );
    });

    await t.test("freezes exact Contract and future implementation scope", () => {
      assert.ok(
        contract.includes(
          "modify `src/contexts/OrganizationRuntimeContext.tsx`",
        ),
      );
      assert.ok(contract.includes("add dedicated coordination tests"));
      assert.ok(
        contract.includes("No additional production file is approved automatically"),
      );
      assert.ok(
        contract.includes(
          "docs/ORGANIZATION_RUNTIME_SELECTION_V1_PRO_CLUB_AUTHORITY_COORDINATION_FREEZE.md",
        ),
      );
      assert.ok(
        contract.includes(
          "tests/organizationRuntimeProClubAuthorityCoordinationContract.test.ts",
        ),
      );
    });

    await t.test("freezes required future regression scenarios", () => {
      for (const requiredScenario of [
        "valid `PRO_CLUB` active Membership",
        "inactive Membership",
        "missing Membership",
        "permission denied",
        "invalid data",
        "upstream error",
        "exact UID mismatch",
        "exact organization ID mismatch",
        "exact organization type mismatch",
        "fabricated request",
        "stale generation",
        "switch A -> B while A is pending",
        "logout while pending",
        "authenticated UID change while pending",
        "same-UID lifecycle",
        "StrictMode or duplicate execution",
        "`ACADEMY` never calls the Pro Club bridge",
        "support-presented `currentUser` is not the actor",
        "no account-wide discovery exists",
      ]) {
        assert.ok(
          contract.includes(requiredScenario),
          `missing future scenario: ${requiredScenario}`,
        );
      }
    });

    await t.test("requires independent Team 2 review before commit", () => {
      assert.ok(contract.includes("Team 1 must not approve its own work for commit"));
      assert.ok(contract.includes("independent Team 2 review"));
      assert.ok(
        contract.includes(
          "The Contract Freeze must not be committed until Team 2 reports GREEN",
        ),
      );
    });
  },
);
