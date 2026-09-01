import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyOrganizationResolution,
  beginOrganizationResolution,
  bindOrganizationRuntimeUid,
  clearOrganizationRuntime,
  createOrganizationResolutionResult,
  createOrganizationRuntimeState,
  createOrganizationSelection,
  getOrganizationSelectionKey,
  getOrganizationResolutionRequest,
  isOrganizationRuntimeAuthorized,
  isValidAuthenticatedUid,
  isValidOrganizationId,
  selectOrganization,
  type OrganizationResolutionResult,
  type OrganizationRuntimeState,
} from "../src/lib/organizationRuntimeSelection";

const UID = "account/uid-1";

function boundRuntime(uid: string = UID): OrganizationRuntimeState {
  return bindOrganizationRuntimeUid(createOrganizationRuntimeState(), uid);
}

function resolvingRuntime(
  organizationType: "ACADEMY" | "PRO_CLUB" = "ACADEMY",
  organizationId = "organization-1",
  uid: string = UID,
): OrganizationRuntimeState {
  return beginOrganizationResolution(
    selectOrganization(boundRuntime(uid), organizationType, organizationId),
  );
}

function resolutionFor(
  state: OrganizationRuntimeState,
  status: OrganizationResolutionResult["status"] = "AUTHORIZED",
): OrganizationResolutionResult {
  const request = getOrganizationResolutionRequest(state);
  assert.notEqual(request, null);
  const result = createOrganizationResolutionResult(request, status);
  assert.notEqual(result, null);
  return result;
}

function authorizedRuntime(
  organizationType: "ACADEMY" | "PRO_CLUB" = "ACADEMY",
  organizationId = "organization-1",
  uid: string = UID,
): OrganizationRuntimeState {
  const resolving = resolvingRuntime(organizationType, organizationId, uid);
  return applyOrganizationResolution(resolving, resolutionFor(resolving));
}

describe("organization selection identity and validation", () => {
  it("accepts valid ACADEMY and PRO_CLUB selections", () => {
    assert.deepEqual(createOrganizationSelection("ACADEMY", "academy-1"), {
      organizationType: "ACADEMY",
      organizationId: "academy-1",
    });
    assert.deepEqual(createOrganizationSelection("PRO_CLUB", "club-1"), {
      organizationType: "PRO_CLUB",
      organizationId: "club-1",
    });
  });

  it("rejects every unsupported organization type", () => {
    assert.equal(createOrganizationSelection("CLUB", "club-1"), null);
    assert.equal(createOrganizationSelection("academy", "academy-1"), null);
    assert.equal(createOrganizationSelection(null, "academy-1"), null);
  });

  it("rejects malformed organization IDs without repairing them", () => {
    for (const id of [
      "",
      ".",
      "..",
      " leading",
      "trailing ",
      "org/id",
      "org\u0000id",
      7,
    ]) {
      assert.equal(isValidOrganizationId(id), false);
      assert.equal(createOrganizationSelection("ACADEMY", id), null);
    }
  });

  it("validates authenticated UIDs independently from organization IDs", () => {
    assert.equal(isValidAuthenticatedUid("account/users/uid-1"), true);
    assert.equal(isValidOrganizationId("account/users/uid-1"), false);
    for (const uid of ["", " uid", "uid ", "uid\u0007", 7]) {
      assert.equal(isValidAuthenticatedUid(uid), false);
    }
  });

  it("uses deterministic collision-safe structural identity", () => {
    assert.equal(
      getOrganizationSelectionKey("ACADEMY", "a:b"),
      '["ACADEMY","a:b"]',
    );
    assert.equal(
      getOrganizationSelectionKey("ACADEMY", "a:b"),
      getOrganizationSelectionKey("ACADEMY", "a:b"),
    );
    assert.notEqual(
      getOrganizationSelectionKey("ACADEMY", "same-id"),
      getOrganizationSelectionKey("PRO_CLUB", "same-id"),
    );
    assert.equal(getOrganizationSelectionKey("CLUB", "same-id"), null);
  });
});

describe("organization runtime lifecycle", () => {
  it("selection records intent and never grants authority", () => {
    const selected = selectOrganization(boundRuntime(), "ACADEMY", "academy-1");
    assert.equal(selected.status, "SELECTED");
    assert.equal(selected.authorizationProof, null);
    assert.equal(isOrganizationRuntimeAuthorized(selected), false);
  });

  it("invalid selection and UID attempts clear existing authority", () => {
    const authorized = authorizedRuntime();
    for (const cleared of [
      selectOrganization(authorized, "CLUB", "organization-1"),
      selectOrganization(authorized, "ACADEMY", " organization-1"),
      bindOrganizationRuntimeUid(authorized, " invalid-uid"),
    ]) {
      assert.equal(cleared.status, "UNSELECTED");
      assert.equal(cleared.selection, null);
      assert.equal(cleared.authorizationProof, null);
      assert.equal(isOrganizationRuntimeAuthorized(cleared), false);
    }
  });

  it("performs the legitimate lifecycle through a distinct immutable proof", () => {
    const initial = createOrganizationRuntimeState();
    assert.equal(initial.status, "UNSELECTED");

    const bound = bindOrganizationRuntimeUid(initial, UID);
    const selected = selectOrganization(bound, "ACADEMY", "academy-1");
    const resolving = beginOrganizationResolution(selected);
    const authorized = applyOrganizationResolution(
      resolving,
      resolutionFor(resolving),
    );

    assert.equal(selected.status, "SELECTED");
    assert.equal(resolving.status, "RESOLVING");
    assert.equal(authorized.status, "AUTHORIZED");
    assert.equal(isOrganizationRuntimeAuthorized(authorized), true);
    assert.notEqual(authorized.authorizationProof, authorized.selection);
    assert.equal(Object.isFrozen(authorized.authorizationProof), true);
    assert.deepEqual(authorized.authorizationProof, {
      uid: UID,
      organizationType: "ACADEMY",
      organizationId: "academy-1",
      generation: resolving.generation,
    });
  });

  it("switching A to B clears A authority before B can resolve", () => {
    const authorizedA = authorizedRuntime("ACADEMY", "academy-a");
    const selectedB = selectOrganization(authorizedA, "PRO_CLUB", "club-b");

    assert.equal(isOrganizationRuntimeAuthorized(authorizedA), true);
    assert.equal(selectedB.status, "SELECTED");
    assert.deepEqual(selectedB.selection, {
      organizationType: "PRO_CLUB",
      organizationId: "club-b",
    });
    assert.equal(selectedB.authorizationProof, null);
    assert.equal(isOrganizationRuntimeAuthorized(selectedB), false);
    assert.ok(selectedB.generation > authorizedA.generation);
  });

  it("rejects stale generation, UID, organization type, and organization ID", () => {
    const cases: Array<
      (result: OrganizationResolutionResult) => OrganizationResolutionResult
    > = [
      (result) => ({ ...result, generation: result.generation - 1 }),
      (result) => ({ ...result, uid: "other-uid" }),
      (result) => ({ ...result, organizationType: "PRO_CLUB" }),
      (result) => ({ ...result, organizationId: "other-id" }),
    ];

    for (const makeStale of cases) {
      const resolving = resolvingRuntime();
      const result = makeStale(resolutionFor(resolving));
      const unchanged = applyOrganizationResolution(resolving, result);
      assert.equal(unchanged, resolving);
      assert.equal(isOrganizationRuntimeAuthorized(unchanged), false);
    }
  });

  it("rejects a canonical result replayed across equivalent runtime instances", () => {
    const runtimeA = resolvingRuntime("ACADEMY", "same-org", UID);
    const oldRuntimeAResult = resolutionFor(runtimeA);

    const runtimeB = resolvingRuntime("ACADEMY", "same-org", UID);
    assert.equal(runtimeB.generation, runtimeA.generation);
    assert.deepEqual(runtimeB.selection, runtimeA.selection);

    const replayed = applyOrganizationResolution(
      runtimeB,
      oldRuntimeAResult,
    );
    assert.equal(replayed, runtimeB);
    assert.equal(isOrganizationRuntimeAuthorized(replayed), false);

    const runtimeBResult = resolutionFor(runtimeB);
    const authorized = applyOrganizationResolution(runtimeB, runtimeBResult);
    assert.equal(authorized.status, "AUTHORIZED");
    assert.equal(isOrganizationRuntimeAuthorized(authorized), true);
  });

  it("logout and authenticated UID change clear all runtime authority", () => {
    const resolving = resolvingRuntime();
    const pendingResult = resolutionFor(resolving);
    const authorized = applyOrganizationResolution(resolving, pendingResult);
    const logout = bindOrganizationRuntimeUid(authorized, null);
    assert.equal(logout.status, "UNSELECTED");
    assert.equal(logout.uid, null);
    assert.equal(logout.selection, null);
    assert.equal(logout.authorizationProof, null);
    assert.equal(isOrganizationRuntimeAuthorized(logout), false);

    const changedUid = bindOrganizationRuntimeUid(
      authorized,
      "account/users/uid-2",
    );
    assert.equal(changedUid.status, "UNSELECTED");
    assert.equal(changedUid.uid, "account/users/uid-2");
    assert.equal(changedUid.selection, null);
    assert.equal(changedUid.authorizationProof, null);
    assert.equal(isOrganizationRuntimeAuthorized(changedUid), false);

    const stale = applyOrganizationResolution(
      changedUid,
      pendingResult,
    );
    assert.equal(stale, changedUid);
    assert.equal(isOrganizationRuntimeAuthorized(stale), false);
  });

  it("keeps REJECTED and ERROR results unauthorized", () => {
    for (const status of ["REJECTED", "ERROR"] as const) {
      const resolving = resolvingRuntime();
      const result = applyOrganizationResolution(
        resolving,
        resolutionFor(resolving, status),
      );
      assert.equal(result.status, status);
      assert.equal(result.authorizationProof, null);
      assert.equal(isOrganizationRuntimeAuthorized(result), false);
    }
  });

  it("fails closed for invalid lifecycle transitions", () => {
    const unselected = boundRuntime();
    assert.equal(beginOrganizationResolution(unselected), unselected);

    const selected = selectOrganization(unselected, "ACADEMY", "academy-1");
    assert.equal(
      applyOrganizationResolution(selected, {
        status: "AUTHORIZED",
        uid: UID,
        organizationType: "ACADEMY",
        organizationId: "academy-1",
        generation: selected.generation,
      }),
      selected,
    );

    const authorized = authorizedRuntime();
    assert.equal(beginOrganizationResolution(authorized), authorized);
    assert.equal(isOrganizationRuntimeAuthorized(authorized), true);
  });

  it("reset is deterministic and invalidates pending results", () => {
    const resolving = resolvingRuntime();
    const pendingResult = resolutionFor(resolving);
    const cleared = clearOrganizationRuntime(resolving);

    assert.deepEqual(cleared, {
      status: "UNSELECTED",
      uid: UID,
      selection: null,
      generation: resolving.generation + 1,
      authorizationProof: null,
    });
    assert.equal(isOrganizationRuntimeAuthorized(cleared), false);
    assert.equal(applyOrganizationResolution(cleared, pendingResult), cleared);
  });
});

describe("module-owned runtime provenance", () => {
  const fabricatedSelected = {
    status: "SELECTED",
    uid: UID,
    selection: {
      organizationType: "ACADEMY",
      organizationId: "academy-1",
    },
    generation: 2,
    authorizationProof: null,
  } as OrganizationRuntimeState;

  const fabricatedResolving = {
    ...fabricatedSelected,
    status: "RESOLVING",
  } as OrganizationRuntimeState;

  const fabricatedAuthorized = {
    ...fabricatedSelected,
    status: "AUTHORIZED",
    authorizationProof: {
      uid: UID,
      organizationType: "ACADEMY",
      organizationId: "academy-1",
      generation: 2,
    },
  } as OrganizationRuntimeState;

  it("requires a canonical result, not a request or structural lookalike", () => {
    const resolving = resolvingRuntime();
    const request = getOrganizationResolutionRequest(resolving);
    assert.notEqual(request, null);
    assert.equal(Object.isFrozen(request), true);

    assert.equal(applyOrganizationResolution(resolving, request), resolving);
    assert.equal(
      applyOrganizationResolution(resolving, {
        status: "AUTHORIZED",
        uid: resolving.uid,
        organizationType: resolving.selection?.organizationType,
        organizationId: resolving.selection?.organizationId,
        generation: resolving.generation,
      }),
      resolving,
    );
    assert.equal(
      createOrganizationResolutionResult({ ...request }, "AUTHORIZED"),
      null,
    );
    assert.equal(isOrganizationRuntimeAuthorized(resolving), false);
  });

  it("fabricated SELECTED cannot create a usable resolution", () => {
    const result = beginOrganizationResolution(fabricatedSelected);
    assert.equal(result.status, "UNSELECTED");
    assert.equal(isOrganizationRuntimeAuthorized(result), false);
    assert.equal(
      applyOrganizationResolution(result, {
        status: "AUTHORIZED",
        uid: UID,
        organizationType: "ACADEMY",
        organizationId: "academy-1",
        generation: 2,
      }),
      result,
    );
  });

  it("fabricated RESOLVING plus a matching result cannot authorize", () => {
    const result = applyOrganizationResolution(fabricatedResolving, {
      status: "AUTHORIZED",
      uid: UID,
      organizationType: "ACADEMY",
      organizationId: "academy-1",
      generation: 2,
    });
    assert.equal(result.status, "UNSELECTED");
    assert.equal(isOrganizationRuntimeAuthorized(result), false);
  });

  it("fabricated AUTHORIZED cannot be bound into legitimacy", () => {
    assert.equal(isOrganizationRuntimeAuthorized(fabricatedAuthorized), false);
    const result = bindOrganizationRuntimeUid(fabricatedAuthorized, UID);
    assert.equal(result.status, "UNSELECTED");
    assert.equal(isOrganizationRuntimeAuthorized(result), false);
  });

  it("fabricated state cannot be laundered by bind, select, or reset", () => {
    const attempts = [
      bindOrganizationRuntimeUid(fabricatedSelected, UID),
      selectOrganization(fabricatedSelected, "ACADEMY", "academy-1"),
      clearOrganizationRuntime(fabricatedSelected),
    ];

    for (const attempt of attempts) {
      assert.equal(attempt.status, "UNSELECTED");
      assert.equal(isOrganizationRuntimeAuthorized(attempt), false);
      const selected = selectOrganization(attempt, "ACADEMY", "academy-1");
      const resolving = beginOrganizationResolution(selected);
      const applied = applyOrganizationResolution(resolving, {
        status: "AUTHORIZED",
        uid: UID,
        organizationType: "ACADEMY",
        organizationId: "academy-1",
        generation: resolving.generation,
      });
      assert.equal(isOrganizationRuntimeAuthorized(applied), false);
    }
  });
});
