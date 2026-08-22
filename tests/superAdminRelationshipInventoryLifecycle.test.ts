import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  beginSuperAdminRelationshipInventoryLoad,
  createSuperAdminRelationshipInventoryLifecycleState,
  invalidateSuperAdminRelationshipInventory,
  isSuperAdminRelationshipInventoryConsumerTab,
  resolveSuperAdminRelationshipInventoryReady,
  resolveSuperAdminRelationshipInventoryUnavailable,
  shouldLoadSuperAdminRelationshipInventoryOnActivation,
} from "../src/components/superadmin/superAdminRelationshipInventoryLifecycle";

import type {
  SuperAdminRelationshipInventory,
} from "../src/lib/firestore/superAdminRelationshipReadAdapter";

const inventoryA = {
  marker: "inventory-a",
} as unknown as SuperAdminRelationshipInventory;

const inventoryB = {
  marker: "inventory-b",
} as unknown as SuperAdminRelationshipInventory;

function readyState(
  inventory: SuperAdminRelationshipInventory = inventoryA,
) {
  const initial =
    createSuperAdminRelationshipInventoryLifecycleState();

  const loading =
    beginSuperAdminRelationshipInventoryLoad(initial);

  return resolveSuperAdminRelationshipInventoryReady(
    loading,
    loading.generation,
    inventory,
  );
}

describe("superAdminRelationshipInventoryLifecycle", () => {
  it("1. starts IDLE with no authoritative snapshot", () => {
    const state =
      createSuperAdminRelationshipInventoryLifecycleState();

    assert.deepEqual(state, {
      status: "IDLE",
      generation: 0,
      inventory: null,
      errorMessage: null,
    });
  });

  it("2. only Accounts and Relationships activate the shared inventory", () => {
    assert.equal(
      isSuperAdminRelationshipInventoryConsumerTab("users"),
      true,
    );

    assert.equal(
      isSuperAdminRelationshipInventoryConsumerTab("relationships"),
      true,
    );

    assert.equal(
      isSuperAdminRelationshipInventoryConsumerTab("dashboard"),
      false,
    );

    assert.equal(
      isSuperAdminRelationshipInventoryConsumerTab("approvals"),
      false,
    );

    assert.equal(
      isSuperAdminRelationshipInventoryConsumerTab("academies"),
      false,
    );
  });

  it("3. IDLE activation requires a load while READY and LOADING do not duplicate reads", () => {
    const initial =
      createSuperAdminRelationshipInventoryLifecycleState();

    assert.equal(
      shouldLoadSuperAdminRelationshipInventoryOnActivation(initial),
      true,
    );

    const loading =
      beginSuperAdminRelationshipInventoryLoad(initial);

    assert.equal(
      shouldLoadSuperAdminRelationshipInventoryOnActivation(loading),
      false,
    );

    const ready =
      resolveSuperAdminRelationshipInventoryReady(
        loading,
        loading.generation,
        inventoryA,
      );

    assert.equal(
      shouldLoadSuperAdminRelationshipInventoryOnActivation(ready),
      false,
    );
  });

  it("4. beginning a load increments generation and fails closed while reading", () => {
    const previousReady = readyState();

    const loading =
      beginSuperAdminRelationshipInventoryLoad(previousReady);

    assert.equal(loading.status, "LOADING");
    assert.equal(
      loading.generation,
      previousReady.generation + 1,
    );

    assert.equal(
      loading.inventory,
      null,
      "A refreshing snapshot must not remain presented as authoritative",
    );

    assert.equal(loading.errorMessage, null);
  });

  it("5. the current generation may publish a READY authoritative snapshot", () => {
    const initial =
      createSuperAdminRelationshipInventoryLifecycleState();

    const loading =
      beginSuperAdminRelationshipInventoryLoad(initial);

    const ready =
      resolveSuperAdminRelationshipInventoryReady(
        loading,
        loading.generation,
        inventoryA,
      );

    assert.equal(ready.status, "READY");
    assert.equal(ready.generation, loading.generation);
    assert.equal(ready.inventory, inventoryA);
    assert.equal(ready.errorMessage, null);
  });

  it("6. an older READY response can never overwrite a newer request", () => {
    const initial =
      createSuperAdminRelationshipInventoryLifecycleState();

    const firstLoad =
      beginSuperAdminRelationshipInventoryLoad(initial);

    const secondLoad =
      beginSuperAdminRelationshipInventoryLoad(firstLoad);

    const staleResult =
      resolveSuperAdminRelationshipInventoryReady(
        secondLoad,
        firstLoad.generation,
        inventoryA,
      );

    assert.equal(staleResult, secondLoad);
    assert.equal(staleResult.status, "LOADING");
    assert.equal(staleResult.inventory, null);

    const latestResult =
      resolveSuperAdminRelationshipInventoryReady(
        staleResult,
        secondLoad.generation,
        inventoryB,
      );

    assert.equal(latestResult.status, "READY");
    assert.equal(latestResult.inventory, inventoryB);
  });

  it("7. current-generation read failure is UNAVAILABLE and exposes no partial snapshot", () => {
    const loading =
      beginSuperAdminRelationshipInventoryLoad(
        createSuperAdminRelationshipInventoryLifecycleState(),
      );

    const unavailable =
      resolveSuperAdminRelationshipInventoryUnavailable(
        loading,
        loading.generation,
        "server read failed",
      );

    assert.equal(unavailable.status, "UNAVAILABLE");
    assert.equal(unavailable.inventory, null);
    assert.equal(
      unavailable.errorMessage,
      "server read failed",
    );
  });

  it("8. an older failure cannot replace a newer READY snapshot", () => {
    const initial =
      createSuperAdminRelationshipInventoryLifecycleState();

    const firstLoad =
      beginSuperAdminRelationshipInventoryLoad(initial);

    const secondLoad =
      beginSuperAdminRelationshipInventoryLoad(firstLoad);

    const ready =
      resolveSuperAdminRelationshipInventoryReady(
        secondLoad,
        secondLoad.generation,
        inventoryB,
      );

    const staleFailure =
      resolveSuperAdminRelationshipInventoryUnavailable(
        ready,
        firstLoad.generation,
        "old request failed",
      );

    assert.equal(staleFailure, ready);
    assert.equal(staleFailure.status, "READY");
    assert.equal(staleFailure.inventory, inventoryB);
  });

  it("9. invalidation revokes a READY snapshot immediately and increments generation", () => {
    const ready = readyState();

    const stale =
      invalidateSuperAdminRelationshipInventory(ready);

    assert.equal(stale.status, "STALE");
    assert.equal(
      stale.generation,
      ready.generation + 1,
    );

    assert.equal(
      stale.inventory,
      null,
      "Invalidated evidence must not remain visible as current authority",
    );

    assert.equal(stale.errorMessage, null);

    assert.equal(
      shouldLoadSuperAdminRelationshipInventoryOnActivation(stale),
      true,
    );
  });

  it("10. invalidating an in-flight request prevents that response from publishing", () => {
    const loading =
      beginSuperAdminRelationshipInventoryLoad(
        createSuperAdminRelationshipInventoryLifecycleState(),
      );

    const invalidated =
      invalidateSuperAdminRelationshipInventory(loading);

    const oldResponse =
      resolveSuperAdminRelationshipInventoryReady(
        invalidated,
        loading.generation,
        inventoryA,
      );

    assert.equal(oldResponse, invalidated);
    assert.equal(oldResponse.status, "STALE");
    assert.equal(oldResponse.inventory, null);
  });

  it("11. UNAVAILABLE is eligible for retry on the next consumer activation", () => {
    const loading =
      beginSuperAdminRelationshipInventoryLoad(
        createSuperAdminRelationshipInventoryLifecycleState(),
      );

    const unavailable =
      resolveSuperAdminRelationshipInventoryUnavailable(
        loading,
        loading.generation,
        "temporary server failure",
      );

    assert.equal(
      shouldLoadSuperAdminRelationshipInventoryOnActivation(
        unavailable,
      ),
      true,
    );
  });

  it("12. explicit refresh from READY creates a new generation instead of reusing the cached snapshot", () => {
    const ready = readyState();

    const refresh =
      beginSuperAdminRelationshipInventoryLoad(ready);

    assert.equal(refresh.status, "LOADING");
    assert.equal(
      refresh.generation,
      ready.generation + 1,
    );

    assert.equal(refresh.inventory, null);
  });

  it("13. repeated invalidation while already STALE is idempotent", () => {
    const ready = readyState();

    const firstInvalidation =
      invalidateSuperAdminRelationshipInventory(ready);

    const repeatedInvalidation =
      invalidateSuperAdminRelationshipInventory(
        firstInvalidation,
      );

    assert.equal(
      repeatedInvalidation,
      firstInvalidation,
      "Once authority is already revoked, repeated invalidation should not churn generation",
    );

    assert.equal(
      repeatedInvalidation.generation,
      firstInvalidation.generation,
    );

    assert.equal(repeatedInvalidation.status, "STALE");
    assert.equal(repeatedInvalidation.inventory, null);
  });

  it("14. blank read errors normalize to a stable fail-closed message", () => {
    const loading =
      beginSuperAdminRelationshipInventoryLoad(
        createSuperAdminRelationshipInventoryLifecycleState(),
      );

    const unavailable =
      resolveSuperAdminRelationshipInventoryUnavailable(
        loading,
        loading.generation,
        "   ",
      );

    assert.equal(unavailable.status, "UNAVAILABLE");

    assert.equal(
      unavailable.errorMessage,
      "Unable to read authoritative relationship inventory.",
    );

    assert.equal(unavailable.inventory, null);
  });

  it("15. matching generation cannot publish READY when lifecycle is no longer LOADING", () => {
    const ready = readyState(inventoryA);

    const unexpectedSecondReady =
      resolveSuperAdminRelationshipInventoryReady(
        ready,
        ready.generation,
        inventoryB,
      );

    assert.equal(unexpectedSecondReady, ready);
    assert.equal(unexpectedSecondReady.status, "READY");
    assert.equal(unexpectedSecondReady.inventory, inventoryA);
  });

  it("16. matching generation cannot publish UNAVAILABLE when lifecycle is STALE", () => {
    const loading =
      beginSuperAdminRelationshipInventoryLoad(
        createSuperAdminRelationshipInventoryLifecycleState(),
      );

    const stale =
      invalidateSuperAdminRelationshipInventory(loading);

    const unexpectedFailure =
      resolveSuperAdminRelationshipInventoryUnavailable(
        stale,
        stale.generation,
        "late failure",
      );

    assert.equal(unexpectedFailure, stale);
    assert.equal(unexpectedFailure.status, "STALE");
    assert.equal(unexpectedFailure.inventory, null);
    assert.equal(unexpectedFailure.errorMessage, null);
  });
});
