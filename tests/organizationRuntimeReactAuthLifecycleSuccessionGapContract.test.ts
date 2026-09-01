import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const addendum = read(
  "docs/ORGANIZATION_RUNTIME_SELECTION_V1_REACT_AUTH_LIFECYCLE_SUCCESSION_GAP_FREEZE.md",
);

const reactContract = read(
  "docs/ORGANIZATION_RUNTIME_SELECTION_V1_REACT_AUTH_LIFECYCLE_FREEZE.md",
);

const proClubContract = read(
  "docs/ORGANIZATION_RUNTIME_SELECTION_V1_PRO_CLUB_AUTHORITY_BRIDGE_FREEZE.md",
);

const selectionContractTest = read(
  "tests/organizationRuntimeSelectionContract.test.ts",
);

const proClubContractTest = read(
  "tests/organizationRuntimeProClubAuthorityBridgeContract.test.ts",
);

const mainSource = read("src/main.tsx");

const providerAbsencePattern =
  /assert\.doesNotMatch\(\s*mainSource,\s*\/OrganizationRuntimeProvider\|OrganizationProvider\/,\s*\);/g;

const assertProviderSuccessionState = (
  providerMounted: boolean,
  selectionCount: number,
  proClubCount: number,
) => {
  if (providerMounted) {
    assert.equal(selectionCount, 0);
    assert.equal(proClubCount, 0);
    return;
  }

  assert.equal(selectionCount, 1);
  assert.equal(proClubCount, 1);
};

test(
  "React Auth Lifecycle Contract Succession Gap Freeze",
  async (t) => {
    await t.test("freezes exact remediation baseline", () => {
      assert.match(
        addendum,
        /a7dbb9b78ac57b2857718d9cfda6d94e20dc178f/,
      );

      assert.match(
        addendum,
        /fix\/organization-runtime-react-auth-lifecycle-contract-succession-gap/,
      );
    });

    await t.test("provider guards follow the authorized succession state", () => {
      const selectionCount =
        selectionContractTest.match(providerAbsencePattern)?.length ?? 0;

      const proClubCount =
        proClubContractTest.match(providerAbsencePattern)?.length ?? 0;

      const providerMounted =
        /<OrganizationRuntimeProvider\b[^>]*>/.test(mainSource);

      assertProviderSuccessionState(
        providerMounted,
        selectionCount,
        proClubCount,
      );

      assert.equal(
        selectionCount + proClubCount,
        providerMounted ? 0 : 2,
      );
    });

    await t.test("succession state guard rejects partial migration", () => {
      assert.doesNotThrow(() =>
        assertProviderSuccessionState(false, 1, 1),
      );

      assert.doesNotThrow(() =>
        assertProviderSuccessionState(true, 0, 0),
      );

      for (const [selectionCount, proClubCount] of [
        [0, 1],
        [1, 0],
        [1, 1],
      ] as const) {
        assert.throws(() =>
          assertProviderSuccessionState(
            true,
            selectionCount,
            proClubCount,
          ),
        );
      }
    });

    await t.test("newer React contract already authorizes Selection succession", () => {
      assert.match(
        reactContract,
        /tests\/organizationRuntimeSelectionContract\.test\.ts/,
      );

      assert.match(
        reactContract,
        /PHASE-SPECIFIC ABSENCE GUARD != PERMANENT ARCHITECTURE BAN/,
      );
    });

    await t.test("newer React contract omitted Pro Club test succession", () => {
      const section =
        reactContract.match(
          /## 17\. Future implementation candidate([\s\S]*?)## 18\. Required later implementation tests/,
        );

      assert.ok(section);
      assert.doesNotMatch(
        section[1],
        /organizationRuntimeProClubAuthorityBridgeContract\.test\.ts/,
      );
    });

    await t.test("historical Pro Club contract explicitly reserved later React integration", () => {
      assert.match(
        proClubContract,
        /## 15\. No provider or UI integration/,
      );

      assert.match(
        proClubContract,
        /React\/provider integration requires a later dedicated slice\./,
      );
    });

    await t.test("addendum authorizes exactly one additional legacy test", () => {
      assert.match(
        addendum,
        /tests\/organizationRuntimeProClubAuthorityBridgeContract\.test\.ts/,
      );

      assert.match(
        addendum,
        /No other assertion in that file is approved for modification\./,
      );

      assert.match(
        addendum,
        /may modify exactly five paths/,
      );
    });

    await t.test("production implementation scope remains exactly two source paths", () => {
      assert.match(
        addendum,
        /src\/contexts\/OrganizationRuntimeContext\.tsx/,
      );

      assert.match(
        addendum,
        /src\/main\.tsx/,
      );

      assert.match(
        addendum,
        /No additional production source path is approved\./,
      );
    });

    await t.test("authenticated actor and protected boundaries remain frozen", () => {
      assert.match(addendum, /actualUser\.uid/);
      assert.match(addendum, /currentUser\.uid/);

      for (const protectedPath of [
        "src/contexts/AuthContext.tsx",
        "src/contexts/AcademyContext.tsx",
        "src/contexts/SupportPresentedUserBridge.tsx",
        "src/contexts/SuperAdminSupportContext.tsx",
        "src/contexts/SuperAdminNonStaffSupportContext.tsx",
        "src/lib/organizationRuntimeSelection.ts",
        "package.json",
      ]) {
        assert.ok(
          addendum.includes(`\`${protectedPath}\``),
          `missing protected path: ${protectedPath}`,
        );
      }
    });

    await t.test("addendum itself is exactly a two-file Contract Freeze", () => {
      assert.match(
        addendum,
        /ORGANIZATION_RUNTIME_SELECTION_V1_REACT_AUTH_LIFECYCLE_SUCCESSION_GAP_FREEZE\.md/,
      );

      assert.match(
        addendum,
        /organizationRuntimeReactAuthLifecycleSuccessionGapContract\.test\.ts/,
      );

      assert.match(
        addendum,
        /No production source file may change during this remediation\./,
      );

      assert.match(
        addendum,
        /No existing file may change during this remediation\./,
      );
    });
  },
);
