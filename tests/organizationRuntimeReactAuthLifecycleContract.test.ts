import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const contract = read(
  "docs/ORGANIZATION_RUNTIME_SELECTION_V1_REACT_AUTH_LIFECYCLE_FREEZE.md",
);

const runtimeModel = read(
  "src/lib/organizationRuntimeSelection.ts",
);

const proClubBridge = read(
  "src/lib/organizationRuntimeProClubAuthorityBridge.ts",
);

const authContext = read(
  "src/contexts/AuthContext.tsx",
);

const academyContext = read(
  "src/contexts/AcademyContext.tsx",
);

const supportPresentedUserBridge = read(
  "src/contexts/SupportPresentedUserBridge.tsx",
);

const mainSource = read(
  "src/main.tsx",
);

test(
  "Organization Runtime Selection V1 React Auth Lifecycle Contract Freeze",
  async (t) => {
    await t.test("freezes approved baseline and contract branch", () => {
      assert.ok(
        contract.includes(
          "fc8114787cd8a665fc7acad2bab28c368c274b24",
        ),
      );

      assert.ok(
        contract.includes(
          "feat/organization-runtime-selection-v1-react-auth-lifecycle-contract",
        ),
      );
    });

    await t.test("preserves selection-not-authority invariant", () => {
      assert.ok(
        contract.includes("`SELECTION != AUTHORITY`"),
      );

      assert.ok(
        contract.includes(
          "does not authorize a Pro Club",
        ),
      );
    });

    await t.test("freezes real authenticated actor identity", () => {
      assert.match(
        authContext,
        /const currentUser = supportPresentedUser \?\? actualUser;/,
      );

      assert.match(
        authContext,
        /id:\s*firebaseUser\.uid,\s*uid:\s*firebaseUser\.uid,/s,
      );

      assert.ok(
        contract.includes("`actualUser.uid`"),
      );

      assert.ok(
        contract.includes("`currentUser.uid`"),
      );

      assert.ok(
        contract.includes(
          "`PRESENTED USER != AUTHENTICATED ACTOR`",
        ),
      );
    });

    await t.test("keeps support presentation outside actor authority", () => {
      assert.match(
        supportPresentedUserBridge,
        /const \{ actualUser, setSupportPresentedUser \} = useAuth\(\);/,
      );

      assert.ok(
        contract.includes(
          "Support presentation must never replace the Organization Runtime actor.",
        ),
      );
    });

    await t.test(
      "forbids external actor injection and non-lifecycle runtime APIs",
      () => {
        assert.ok(
          contract.includes(
            "`CALLER INPUT != AUTHENTICATED ACTOR AUTHORITY`",
          ),
        );

        assert.ok(
          contract.includes(
            "`children`\n\nis the only public provider prop approved",
          ),
        );

        for (const forbiddenProp of [
          "`uid`",
          "`user`",
          "`currentUser`",
          "`runtimeState`",
          "`authorizationProof`",
        ]) {
          assert.ok(
            contract.includes(forbiddenProp),
            `missing provider input boundary: ${forbiddenProp}`,
          );
        }

        assert.ok(
          contract.includes(
            "### RUNTIME LIFECYCLE API ALLOWLIST",
          ),
        );

        for (const forbiddenApi of [
          "clearOrganizationRuntime",
          "selectOrganization",
          "beginOrganizationResolution",
          "getOrganizationResolutionRequest",
          "createOrganizationResolutionResult",
          "applyOrganizationResolution",
          "isOrganizationRuntimeAuthorized",
        ]) {
          assert.match(
            runtimeModel,
            new RegExp(
              `export (?:const|function) ${forbiddenApi}`,
            ),
          );

          assert.ok(
            contract.includes(`\`${forbiddenApi}\``),
            `missing forbidden lifecycle API: ${forbiddenApi}`,
          );
        }

        assert.ok(
          contract.includes(
            "No other Organization Runtime function may be invoked by this lifecycle",
          ),
        );

        assert.ok(
          contract.includes(
            "`AUTH LIFECYCLE != ORGANIZATION SELECTION OR AUTHORITY RESOLUTION`",
          ),
        );
      },
    );
    await t.test("approves exact future provider placement", () => {
      assert.ok(
        contract.includes("`OrganizationRuntimeProvider`"),
      );

      assert.ok(
        contract.includes(
          "`AuthProvider`\n\n-> `OrganizationRuntimeProvider`",
        ),
      );

      for (const provider of [
        "SuperAdminSupportProvider",
        "SuperAdminNonStaffSupportProvider",
        "SupportPresentedUserBridge",
        "AcademyProvider",
      ]) {
        assert.ok(
          contract.includes(`\`${provider}\``),
          `missing preserved provider boundary: ${provider}`,
        );
      }

      assert.match(
        mainSource,
        /<AuthProvider>/,
      );

      assert.match(
        mainSource,
        /<SuperAdminSupportProvider>/,
      );

      assert.match(
        mainSource,
        /<AcademyProvider>/,
      );

      assert.ok(
        contract.includes(
          "`tests/organizationRuntimeSelectionContract.test.ts`",
        ),
      );

      assert.ok(
        contract.includes(
          "phase-specific provider-absence guard",
        ),
      );

      assert.ok(
        contract.includes(
          "`PHASE-SPECIFIC ABSENCE GUARD != PERMANENT ARCHITECTURE BAN`",
        ),
      );
    });

    await t.test("requires existing pure runtime ownership", () => {
      for (const api of [
        "createOrganizationRuntime",
        "bindOrganizationRuntimeUid",
      ]) {
        assert.match(
          runtimeModel,
          new RegExp(
            `export (?:const|function) ${api}`,
          ),
        );

        assert.ok(
          contract.includes(`\`${api}\``),
        );
      }
    });

    await t.test("freezes null and UID-change fail-closed semantics", () => {
      assert.match(
        runtimeModel,
        /if \(uid === null\)[\s\S]*createUnselectedState\(null, generation\)/,
      );

      assert.match(
        runtimeModel,
        /if \(uid === state\.uid\) return state;/,
      );

      assert.match(
        runtimeModel,
        /createUnselectedState\(uid, generation\)/,
      );

      assert.ok(
        contract.includes(
          "`NO STALE ACTOR AUTHORITY RENDER WINDOW`",
        ),
      );

      assert.ok(
        contract.includes(
          "must not rely on an after-render effect",
        ),
      );
    });

    await t.test("preserves same-UID identity semantics", () => {
      assert.ok(
        contract.includes(
          "same exact Firebase UID",
        ),
      );

      assert.ok(
        contract.includes(
          "Actor identity is the exact authenticated UID.",
        ),
      );
    });

    await t.test("preserves AuthContext unchanged", () => {
      assert.ok(
        contract.includes(
          "`src/contexts/AuthContext.tsx`",
        ),
      );

      assert.ok(
        contract.includes(
          "This slice must not modify:",
        ),
      );
    });

    await t.test("preserves Academy authority unchanged", () => {
      assert.match(
        academyContext,
        /currentUser\?\.activeAcademyId\s*\?\?\s*null/,
      );

      assert.match(
        academyContext,
        /resolveExactMembershipSnapshot/,
      );

      assert.ok(
        contract.includes(
          "Academy authority remains unchanged.",
        ),
      );

      assert.ok(
        contract.includes(
          "`OrganizationRuntimeProvider` must not replace `AcademyProvider`.",
        ),
      );
    });

    await t.test("keeps Pro Club resolution closed", () => {
      assert.match(
        proClubBridge,
        /export async function resolveProClubRuntimeAuthority/,
      );

      assert.ok(
        contract.includes(
          "`resolveProClubRuntimeAuthority(request, ops?)`",
        ),
      );

      assert.ok(
        contract.includes(
          "is not consumed by this lifecycle slice",
        ),
      );

      assert.ok(
        contract.includes(
          "must not import or invoke:",
        ),
      );
    });

    await t.test("keeps selection UI and discovery closed", () => {
      for (const boundary of [
        "organization selector",
        "Pro Club picker",
        "account-wide organization relationships",
        "collection-group organization discovery",
      ]) {
        assert.ok(
          contract.includes(boundary),
          `missing closed boundary: ${boundary}`,
        );
      }
    });

    await t.test("forbids persistence and generic pointers", () => {
      for (const persistence of [
        "Firestore",
        "`localStorage`",
        "`sessionStorage`",
        "cookies",
        "IndexedDB",
        "`activeProClubId`",
        "persisted `activeOrganizationId`",
        "persisted `activeOrganizationType`",
      ]) {
        assert.ok(
          contract.includes(persistence),
          `missing persistence boundary: ${persistence}`,
        );
      }
    });

    await t.test("forbids mutation and authority network work", () => {
      for (const mutation of [
        "setDoc",
        "updateDoc",
        "deleteDoc",
        "addDoc",
        "writeBatch",
        "runTransaction",
      ]) {
        assert.ok(
          contract.includes(`\`${mutation}\``),
        );
      }

      assert.ok(
        contract.includes(
          "performs no Firestore read or write",
        ),
      );

      assert.ok(
        contract.includes(
          "must not perform organization authority network resolution",
        ),
      );
    });

    await t.test("freezes minimal first context surface", () => {
      assert.ok(contract.includes("`runtimeState`"));
      assert.ok(contract.includes("`useOrganizationRuntime`"));

      assert.ok(
        contract.includes(
          "does not approve public organization-selection actions",
        ),
      );
    });

    await t.test("freezes exact later implementation scope", () => {
      for (const path of [
        "src/contexts/OrganizationRuntimeContext.tsx",
        "src/main.tsx",
        "tests/organizationRuntimeReactAuthLifecycle.test.ts",
      ]) {
        assert.ok(
          contract.includes(`\`${path}\``),
          `missing future implementation path: ${path}`,
        );
      }

      for (const protectedPath of [
        "src/contexts/AuthContext.tsx",
        "src/contexts/AcademyContext.tsx",
        "src/contexts/SupportPresentedUserBridge.tsx",
        "src/contexts/SuperAdminSupportContext.tsx",
        "src/contexts/SuperAdminNonStaffSupportContext.tsx",
        "firestore.rules",
      ]) {
        assert.ok(
          contract.includes(`\`${protectedPath}\``),
          `missing protected path: ${protectedPath}`,
        );
      }
    });

    await t.test("freezes exact Contract Freeze scope", () => {
      assert.ok(
        contract.includes(
          "`docs/ORGANIZATION_RUNTIME_SELECTION_V1_REACT_AUTH_LIFECYCLE_FREEZE.md`",
        ),
      );

      assert.ok(
        contract.includes(
          "`tests/organizationRuntimeReactAuthLifecycleContract.test.ts`",
        ),
      );

      assert.ok(
        contract.includes(
          "No existing production source file may change during Contract Freeze.",
        ),
      );
    });

    await t.test("requires independent Team 2 review", () => {
      assert.ok(
        contract.includes(
          "Team 1 must not approve its own work for commit.",
        ),
      );

      assert.ok(
        contract.includes(
          "Only Team 2 GREEN may advance",
        ),
      );
    });
  },
);