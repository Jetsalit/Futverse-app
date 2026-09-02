import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyOrganizationResolution,
  beginOrganizationResolution,
  bindOrganizationRuntimeUid,
  createOrganizationResolutionResult,
  createOrganizationRuntime,
  getOrganizationResolutionRequest,
  isOrganizationRuntimeAuthorized,
  selectOrganization,
} from "../src/lib/organizationRuntimeSelection.ts";

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

type LifecycleValue = "UNSELECTED" | "AUTHORIZED";

interface LifecycleSnapshot {
  readonly actorUid: string | null;
  readonly value: LifecycleValue;
}

interface CapturedLifecycle {
  readonly token: number;
  publish(value: LifecycleValue): boolean;
  cleanup(): void;
}

const createAuthLifecycleOracle = (enforceSuccessionGuard = true) => {
  let currentToken = 0;
  let currentActorUid: string | null = null;
  let currentLifecycle: CapturedLifecycle | null = null;
  let snapshot: LifecycleSnapshot = Object.freeze({
    actorUid: null,
    value: "UNSELECTED",
  });

  const transition = (nextActorUid: string | null): CapturedLifecycle => {
    if (
      currentLifecycle !== null &&
      currentActorUid === nextActorUid
    ) {
      return currentLifecycle;
    }

    currentToken += 1;
    currentActorUid = nextActorUid;
    snapshot = Object.freeze({
      actorUid: nextActorUid,
      value: "UNSELECTED",
    });

    const token = currentToken;
    let active = true;

    const lifecycle: CapturedLifecycle = Object.freeze({
      token,
      publish(value) {
        if (
          enforceSuccessionGuard &&
          (
            !active ||
            nextActorUid === null ||
            token !== currentToken ||
            nextActorUid !== currentActorUid
          )
        ) {
          return false;
        }

        snapshot = Object.freeze({ actorUid: nextActorUid, value });
        return true;
      },
      cleanup() {
        active = false;

        if (token !== currentToken) return;

        currentToken += 1;
        currentActorUid = null;
        currentLifecycle = null;
        snapshot = Object.freeze({
          actorUid: null,
          value: "UNSELECTED",
        });
      },
    });

    currentLifecycle = lifecycle;
    return lifecycle;
  };

  return {
    read: (): LifecycleSnapshot => snapshot,
    transition,
  };
};

const runDelayedPredecessorScenario = (
  enforceSuccessionGuard: boolean,
) => {
  const oracle = createAuthLifecycleOracle(enforceSuccessionGuard);
  const predecessor = oracle.transition("uid-a");

  assert.equal(predecessor.publish("AUTHORIZED"), true);

  const successor = oracle.transition("uid-b");
  const failClosedBeforeSuccessorPublish = oracle.read();

  assert.deepEqual(failClosedBeforeSuccessorPublish, {
    actorUid: "uid-b",
    value: "UNSELECTED",
  });
  assert.equal(successor.publish("AUTHORIZED"), true);

  const predecessorAccepted = predecessor.publish("AUTHORIZED");

  return {
    oracle,
    predecessor,
    predecessorAccepted,
    successor,
  };
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

    await t.test("delayed predecessor callback cannot overwrite its successor", () => {
      const {
        oracle,
        predecessor,
        predecessorAccepted,
        successor,
      } = runDelayedPredecessorScenario(true);

      assert.equal(predecessorAccepted, false);
      assert.deepEqual(oracle.read(), {
        actorUid: "uid-b",
        value: "AUTHORIZED",
      });

      predecessor.cleanup();

      assert.deepEqual(oracle.read(), {
        actorUid: "uid-b",
        value: "AUTHORIZED",
      });
      assert.equal(successor.publish("AUTHORIZED"), true);
    });

    await t.test("cleanup and sign-out invalidate captured predecessor callbacks", () => {
      const cleanupOracle = createAuthLifecycleOracle();
      const cleanedLifecycle = cleanupOracle.transition("uid-a");

      cleanedLifecycle.cleanup();

      assert.equal(cleanedLifecycle.publish("AUTHORIZED"), false);
      assert.deepEqual(cleanupOracle.read(), {
        actorUid: null,
        value: "UNSELECTED",
      });

      const signOutOracle = createAuthLifecycleOracle();
      const authenticatedLifecycle = signOutOracle.transition("uid-a");

      assert.equal(authenticatedLifecycle.publish("AUTHORIZED"), true);
      signOutOracle.transition(null);

      assert.deepEqual(signOutOracle.read(), {
        actorUid: null,
        value: "UNSELECTED",
      });
      assert.equal(authenticatedLifecycle.publish("AUTHORIZED"), false);
      assert.deepEqual(signOutOracle.read(), {
        actorUid: null,
        value: "UNSELECTED",
      });
    });

    await t.test("same UID refresh preserves the active lifecycle and state", () => {
      const oracle = createAuthLifecycleOracle();
      const firstLifecycle = oracle.transition("uid-a");

      assert.equal(firstLifecycle.publish("AUTHORIZED"), true);

      const refreshedLifecycle = oracle.transition("uid-a");

      assert.equal(refreshedLifecycle, firstLifecycle);
      assert.equal(refreshedLifecycle.token, firstLifecycle.token);
      assert.deepEqual(oracle.read(), {
        actorUid: "uid-a",
        value: "AUTHORIZED",
      });
    });

    await t.test("guard-disabled negative control exposes stale overwrite", () => {
      const guarded = runDelayedPredecessorScenario(true);
      const unguarded = runDelayedPredecessorScenario(false);

      assert.equal(guarded.predecessorAccepted, false);
      assert.deepEqual(guarded.oracle.read(), {
        actorUid: "uid-b",
        value: "AUTHORIZED",
      });

      assert.equal(unguarded.predecessorAccepted, true);
      assert.deepEqual(unguarded.oracle.read(), {
        actorUid: "uid-a",
        value: "AUTHORIZED",
      });
    });

    await t.test("runtime selection rejects an org-A result after org-B succeeds", () => {
      const bound = bindOrganizationRuntimeUid(
        createOrganizationRuntime(),
        "uid-a",
      );
      const selectedA = selectOrganization(bound, "PRO_CLUB", "org-a");
      const resolvingA = beginOrganizationResolution(selectedA);
      const requestA = getOrganizationResolutionRequest(resolvingA);

      assert.ok(requestA);

      const resultA = createOrganizationResolutionResult(
        requestA,
        "AUTHORIZED",
      );
      const selectedB = selectOrganization(
        resolvingA,
        "PRO_CLUB",
        "org-b",
      );
      const resolvingB = beginOrganizationResolution(selectedB);
      const requestB = getOrganizationResolutionRequest(resolvingB);

      assert.ok(requestB);

      const resultB = createOrganizationResolutionResult(
        requestB,
        "AUTHORIZED",
      );

      const afterRacingA = applyOrganizationResolution(
        resolvingB,
        resultA,
      );

      assert.equal(afterRacingA, resolvingB);
      assert.equal(afterRacingA.status, "RESOLVING");
      assert.equal(afterRacingA.selection?.organizationId, "org-b");
      assert.equal(isOrganizationRuntimeAuthorized(afterRacingA), false);

      const authorizedB = applyOrganizationResolution(
        afterRacingA,
        resultB,
      );

      assert.equal(isOrganizationRuntimeAuthorized(authorizedB), true);
      assert.equal(authorizedB.selection?.organizationId, "org-b");

      const afterLateA = applyOrganizationResolution(authorizedB, resultA);

      assert.equal(afterLateA, authorizedB);
      assert.equal(isOrganizationRuntimeAuthorized(afterLateA), true);
      assert.equal(afterLateA.selection?.organizationId, "org-b");

      const signedOut = bindOrganizationRuntimeUid(resolvingA, null);
      const afterSignedOutA = applyOrganizationResolution(signedOut, resultA);

      assert.equal(afterSignedOutA, signedOut);
      assert.equal(afterSignedOutA.status, "UNSELECTED");
      assert.equal(afterSignedOutA.uid, null);
      assert.equal(isOrganizationRuntimeAuthorized(afterSignedOutA), false);
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

    await t.test("addendum remains exactly a two-path cumulative Contract Freeze", () => {
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
        /No third path may be added to the cumulative remediation diff\./,
      );
    });
  },
);
