import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bindOrganizationRuntimeUid,
  createOrganizationRuntime,
} from "../src/lib/organizationRuntimeSelection";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contextSource = read(
  "src/contexts/OrganizationRuntimeContext.tsx",
);

const mainSource = read(
  "src/main.tsx",
);

const authSource = read(
  "src/contexts/AuthContext.tsx",
);

const academySource = read(
  "src/contexts/AcademyContext.tsx",
);

const legacyContractTest = read(
  "tests/organizationRuntimeSelectionContract.test.ts",
);

test(
  "Organization Runtime Selection V1 React Auth Lifecycle Implementation",
  async (t) => {
    await t.test("public provider accepts children only", () => {
      assert.match(
        contextSource,
        /export function OrganizationRuntimeProvider\(\{\s*children,\s*\}:\s*\{\s*children:\s*ReactNode;\s*\}\)/s,
      );
    });

    await t.test("runtime actor derives only from actualUser", () => {
      assert.match(
        contextSource,
        /const \{ actualUser \} = useAuth\(\);/,
      );
      assert.match(
        contextSource,
        /const actorUid = actualUser\?\.uid \?\? null;/,
      );
      assert.doesNotMatch(
        contextSource,
        /const\s+\{\s*currentUser/,
      );
    });

    await t.test("support-presented currentUser cannot become actor", () => {
      assert.match(
        authSource,
        /const currentUser = supportPresentedUser \?\? actualUser;/,
      );
      assert.doesNotMatch(
        contextSource,
        /currentUser\?*\.uid|currentUser\.uid/,
      );
    });

    await t.test("private runtime owner receives only derived actor UID", () => {
      assert.match(
        contextSource,
        /function RuntimeActorOwner\(\{\s*actorUid,\s*children,\s*\}/s,
      );
      assert.match(
        contextSource,
        /<RuntimeActorOwner key=\{actorKey\} actorUid=\{actorUid\}>/,
      );
    });

    await t.test("actor key separates unauthenticated and authenticated namespaces", () => {
      assert.ok(
        contextSource.includes(
          'actorUid === null ? "unauthenticated" : `authenticated:${actorUid}`',
        ),
      );
    });

    await t.test("coordination effect remains inside the keyed runtime owner", () => {
      assert.match(
        contextSource,
        /\buseEffect\b/,
      );
      assert.match(
        contextSource,
        /<RuntimeActorOwner key=\{actorKey\} actorUid=\{actorUid\}>/,
      );
    });

    await t.test("runtime owner initializes through frozen pure lifecycle APIs", () => {
      assert.match(
        contextSource,
        /bindOrganizationRuntimeUid\(createOrganizationRuntime\(\), actorUid\)/,
      );
    });

    await t.test("provider composes the approved runtime lifecycle API succession", () => {
      for (const requiredApi of [
        "bindOrganizationRuntimeUid",
        "createOrganizationRuntime",
        "selectOrganization",
        "beginOrganizationResolution",
        "getOrganizationResolutionRequest",
        "applyOrganizationResolution",
      ]) {
        assert.match(
          contextSource,
          new RegExp(`\\b${requiredApi}\\b`),
          `required runtime API missing: ${requiredApi}`,
        );
      }

      assert.doesNotMatch(
        contextSource,
        /\bclearOrganizationRuntime\b|\bcreateOrganizationResolutionResult\b|\bisOrganizationRuntimeAuthorized\b/,
      );
      assert.match(
        contextSource,
        /const selected = selectOrganization\(\s*current,\s*"PRO_CLUB",\s*organizationId,\s*\);\s*return beginOrganizationResolution\(selected\);/s,
      );
      assert.match(
        contextSource,
        /const request = getOrganizationResolutionRequest\(runtimeState\);/,
      );
      assert.match(
        contextSource,
        /setRuntimeState\(\(current\) =>\s*applyOrganizationResolution\(current, bridgeResult\.runtimeResult\),\s*\);/s,
      );
    });

    await t.test("provider consumes only the reviewed Pro Club authority bridge", () => {
      assert.match(
        contextSource,
        /from "\.\.\/lib\/organizationRuntimeProClubAuthorityBridge"/,
      );
      assert.match(
        contextSource,
        /resolveProClubRuntimeAuthority\(request\)/,
      );
    });

    await t.test("provider performs no Firestore or Firebase network work", () => {
      assert.doesNotMatch(
        contextSource,
        /firebase\/firestore|from\s+["'][^"']*firebase["']|\bdb\b|\bdoc\(|\bonSnapshot\(/,
      );
    });

    await t.test("provider performs no persistence", () => {
      assert.doesNotMatch(
        contextSource,
        /localStorage|sessionStorage|IndexedDB|document\.cookie|activeProClubId|activeOrganizationId|activeOrganizationType/,
      );
    });

    await t.test("context surface exposes runtimeState and narrow Pro Club selection only", () => {
      assert.match(
        contextSource,
        /interface OrganizationRuntimeContextValue\s*\{\s*readonly runtimeState: OrganizationRuntimeState;\s*readonly selectProClub: \(organizationId: string\) => void;\s*\}/s,
      );
      assert.doesNotMatch(
        contextSource,
        /readonly (?:setRuntimeState|uid|generation|resolutionRequest|resolutionResult|authorizationProof|ops|membershipAuthority)\b/,
      );
    });

    await t.test("consumer hook fails closed outside provider", () => {
      assert.match(
        contextSource,
        /if \(context === undefined\)[\s\S]*useOrganizationRuntime must be used within an OrganizationRuntimeProvider/,
      );
    });

    await t.test("provider is directly beneath AuthProvider", () => {
      assert.match(
        mainSource,
        /<AuthProvider>\s*<OrganizationRuntimeProvider>/s,
      );
    });

    await t.test("provider remains above support and Academy providers", () => {
      const runtimeIndex =
        mainSource.indexOf("<OrganizationRuntimeProvider>");

      const superAdminIndex =
        mainSource.indexOf("<SuperAdminSupportProvider>");

      const nonStaffIndex =
        mainSource.indexOf("<SuperAdminNonStaffSupportProvider>");

      const supportBridgeIndex =
        mainSource.indexOf("<SupportPresentedUserBridge>");

      const academyIndex =
        mainSource.indexOf("<AcademyProvider>");

      assert.ok(runtimeIndex >= 0);
      assert.ok(runtimeIndex < superAdminIndex);
      assert.ok(superAdminIndex < nonStaffIndex);
      assert.ok(nonStaffIndex < supportBridgeIndex);
      assert.ok(supportBridgeIndex < academyIndex);
    });

    await t.test("same authenticated UID preserves pure runtime identity", () => {
      const initial =
        bindOrganizationRuntimeUid(
          createOrganizationRuntime(),
          "uid-a",
        );

      const refreshed =
        bindOrganizationRuntimeUid(
          initial,
          "uid-a",
        );

      assert.equal(refreshed, initial);
    });

    await t.test("UID A to UID B starts B fail closed and unselected", () => {
      const actorA =
        bindOrganizationRuntimeUid(
          createOrganizationRuntime(),
          "uid-a",
        );

      const actorB =
        bindOrganizationRuntimeUid(
          actorA,
          "uid-b",
        );

      assert.equal(actorB.uid, "uid-b");
      assert.equal(actorB.status, "UNSELECTED");
      assert.equal(actorB.selection, null);
      assert.equal(actorB.authorizationProof, null);
      assert.ok(actorB.generation > actorA.generation);
    });

    await t.test("logout or null actor clears prior actor state", () => {
      const actor =
        bindOrganizationRuntimeUid(
          createOrganizationRuntime(),
          "uid-a",
        );

      const loggedOut =
        bindOrganizationRuntimeUid(
          actor,
          null,
        );

      assert.equal(loggedOut.uid, null);
      assert.equal(loggedOut.status, "UNSELECTED");
      assert.equal(loggedOut.selection, null);
      assert.equal(loggedOut.authorizationProof, null);
    });

    await t.test("Academy authority implementation remains present and separate", () => {
      assert.match(
        academySource,
        /currentUser\?\.activeAcademyId\s*\?\?\s*null/,
      );
      assert.match(
        academySource,
        /resolveExactMembershipSnapshot/,
      );
    });

    await t.test("legacy phase-specific provider absence guard is retired", () => {
      assert.doesNotMatch(
        legacyContractTest,
        /assert\.doesNotMatch\(\s*mainSource,\s*\/OrganizationRuntimeProvider\|OrganizationProvider\//s,
      );

      assert.match(
        legacyContractTest,
        /assert\.match\(\s*mainSource,\s*\/<OrganizationRuntimeProvider>\//s,
      );
    });

    await t.test("legacy historical Contract assertion remains preserved", () => {
      assert.match(
        legacyContractTest,
        /No shared React provider is approved in this Contract Freeze/,
      );
      assert.match(
        legacyContractTest,
        /Current Match Workspace remains Academy-specific/,
      );
    });

    await t.test("implementation introduces no organization-selection UI", () => {
      assert.doesNotMatch(
        contextSource,
        /organization picker|organization selector|Pro Club picker|dashboard picker|command center picker/i,
      );
    });
  },
);
