import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSuperAdminRelationshipInventoryOwner,
} from "../src/components/superadmin/superAdminRelationshipInventoryOwner";

import type {
  SuperAdminRelationshipInventory,
  SuperAdminRelationshipInventoryResult,
} from "../src/lib/firestore/superAdminRelationshipReadAdapter";

function inventory(
  marker: string,
): SuperAdminRelationshipInventory {
  return {
    marker,
  } as unknown as SuperAdminRelationshipInventory;
}

function readyResult(
  marker: string,
): SuperAdminRelationshipInventoryResult {
  return {
    state: "READY",
    inventory: inventory(marker),
  };
}

function unavailableResult(
  message: string,
): SuperAdminRelationshipInventoryResult {
  return {
    state: "UNAVAILABLE",
    error: new Error(message),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

describe("superAdminRelationshipInventoryOwner", () => {
  it("1. starts IDLE and performs no read before a consumer activates", () => {
    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return readyResult("unexpected");
        },
      });

    assert.deepEqual(owner.getState(), {
      status: "IDLE",
      generation: 0,
      inventory: null,
      errorMessage: null,
    });

    assert.equal(loadCount, 0);
  });

  it("2. non-consumer activation never starts the expensive inventory read", async () => {
    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return readyResult("unexpected");
        },
      });

    await owner.activate("dashboard");
    await owner.activate("approvals");
    await owner.activate("academies");

    assert.equal(loadCount, 0);
    assert.equal(owner.getState().status, "IDLE");
  });

  it("3. first Accounts activation loads one authoritative snapshot", async () => {
    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return readyResult("accounts");
        },
      });

    await owner.activate("users");

    assert.equal(loadCount, 1);
    assert.equal(owner.getState().status, "READY");
    assert.equal(
      (owner.getState().inventory as unknown as { marker: string }).marker,
      "accounts",
    );
  });

  it("4. READY inventory is shared across Accounts and Relationships without duplicate reads", async () => {
    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return readyResult("shared");
        },
      });

    await owner.activate("users");
    await owner.activate("relationships");
    await owner.activate("users");

    assert.equal(loadCount, 1);
    assert.equal(owner.getState().status, "READY");
  });

  it("5. repeated consumer activation while LOADING does not start a duplicate request", async () => {
    let loadCount = 0;

    const pending = deferred<SuperAdminRelationshipInventoryResult>();

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return pending.promise;
        },
      });

    const first = owner.activate("users");
    const second = owner.activate("relationships");

    assert.equal(loadCount, 1);
    assert.equal(owner.getState().status, "LOADING");

    pending.resolve(readyResult("one-request"));

    await Promise.all([first, second]);

    assert.equal(loadCount, 1);
    assert.equal(owner.getState().status, "READY");
  });

  it("6. explicit refresh fails closed while reading and replaces READY with the newer snapshot", async () => {
    const refreshRequest =
      deferred<SuperAdminRelationshipInventoryResult>();

    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;

          if (loadCount === 1) {
            return readyResult("first");
          }

          return refreshRequest.promise;
        },
      });

    await owner.activate("relationships");

    const refresh = owner.refresh();

    assert.equal(loadCount, 2);
    assert.equal(owner.getState().status, "LOADING");
    assert.equal(owner.getState().inventory, null);

    refreshRequest.resolve(readyResult("refreshed"));

    await refresh;

    assert.equal(owner.getState().status, "READY");
    assert.equal(
      (owner.getState().inventory as unknown as { marker: string }).marker,
      "refreshed",
    );
  });

  it("7. an older request cannot overwrite a newer refresh result", async () => {
    const firstRequest =
      deferred<SuperAdminRelationshipInventoryResult>();

    const secondRequest =
      deferred<SuperAdminRelationshipInventoryResult>();

    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;

          return loadCount === 1
            ? firstRequest.promise
            : secondRequest.promise;
        },
      });

    const first = owner.activate("users");
    const second = owner.refresh();

    assert.equal(loadCount, 2);

    secondRequest.resolve(readyResult("newer"));

    await second;

    assert.equal(owner.getState().status, "READY");
    assert.equal(
      (owner.getState().inventory as unknown as { marker: string }).marker,
      "newer",
    );

    firstRequest.resolve(readyResult("older"));

    await first;

    assert.equal(owner.getState().status, "READY");
    assert.equal(
      (owner.getState().inventory as unknown as { marker: string }).marker,
      "newer",
    );
  });

  it("8. authoritative read failure publishes UNAVAILABLE with no partial inventory", async () => {
    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () =>
          unavailableResult("server unavailable"),
      });

    await owner.activate("relationships");

    assert.equal(owner.getState().status, "UNAVAILABLE");
    assert.equal(owner.getState().inventory, null);
    assert.equal(
      owner.getState().errorMessage,
      "server unavailable",
    );
  });

  it("9. invalidation while a consumer is active revokes authority and immediately refreshes", async () => {
    const secondRequest =
      deferred<SuperAdminRelationshipInventoryResult>();

    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;

          if (loadCount === 1) {
            return readyResult("before-mutation");
          }

          return secondRequest.promise;
        },
      });

    await owner.activate("users");

    const invalidation = owner.invalidate();

    assert.equal(loadCount, 2);
    assert.equal(owner.getState().status, "LOADING");
    assert.equal(owner.getState().inventory, null);

    secondRequest.resolve(readyResult("after-mutation"));

    await invalidation;

    assert.equal(owner.getState().status, "READY");
    assert.equal(
      (owner.getState().inventory as unknown as { marker: string }).marker,
      "after-mutation",
    );
  });

  it("10. invalidation outside consumer tabs stays STALE and defers the read until next consumer activation", async () => {
    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return readyResult("after-reactivation");
        },
      });

    await owner.activate("dashboard");
    await owner.invalidate();

    assert.equal(loadCount, 0);
    assert.equal(owner.getState().status, "STALE");
    assert.equal(owner.getState().inventory, null);

    await owner.activate("users");

    assert.equal(loadCount, 1);
    assert.equal(owner.getState().status, "READY");
  });

  it("11. invalidating an in-flight consumer request starts a newer generation and rejects the old result", async () => {
    const firstRequest =
      deferred<SuperAdminRelationshipInventoryResult>();

    const secondRequest =
      deferred<SuperAdminRelationshipInventoryResult>();

    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;

          return loadCount === 1
            ? firstRequest.promise
            : secondRequest.promise;
        },
      });

    const initialLoad = owner.activate("relationships");
    const replacementLoad = owner.invalidate();

    assert.equal(loadCount, 2);
    assert.equal(owner.getState().status, "LOADING");

    secondRequest.resolve(readyResult("replacement"));
    await replacementLoad;

    firstRequest.resolve(readyResult("obsolete"));
    await initialLoad;

    assert.equal(owner.getState().status, "READY");
    assert.equal(
      (owner.getState().inventory as unknown as { marker: string }).marker,
      "replacement",
    );
  });

  it("12. dispose prevents an in-flight request from publishing after Portal lifetime ends", async () => {
    const pending =
      deferred<SuperAdminRelationshipInventoryResult>();

    const publishedStates: string[] = [];

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => pending.promise,
        onStateChange: (state) => {
          publishedStates.push(state.status);
        },
      });

    const loading = owner.activate("users");

    assert.deepEqual(publishedStates, ["LOADING"]);

    owner.dispose();

    pending.resolve(readyResult("too-late"));

    await loading;

    assert.deepEqual(
      publishedStates,
      ["LOADING"],
      "Disposed owner must not publish a late READY result",
    );
  });

  it("13. leaving the consumer group revokes READY authority until re-entry revalidates", async () => {
    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;

          return readyResult(
            loadCount === 1
              ? "first-consumer-visit"
              : "revalidated-after-return",
          );
        },
      });

    await owner.activate("relationships");

    assert.equal(loadCount, 1);
    assert.equal(owner.getState().status, "READY");

    await owner.activate("dashboard");

    assert.equal(
      owner.getState().status,
      "STALE",
      "Leaving Accounts/Relationships must revoke point-in-time authority",
    );

    assert.equal(owner.getState().inventory, null);
    assert.equal(loadCount, 1);

    await owner.activate("relationships");

    assert.equal(loadCount, 2);
    assert.equal(owner.getState().status, "READY");

    assert.equal(
      (owner.getState().inventory as unknown as { marker: string }).marker,
      "revalidated-after-return",
    );
  });

  it("14. moving directly between Accounts and Relationships keeps the shared READY snapshot", async () => {
    let loadCount = 0;

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return readyResult("shared-direct-switch");
        },
      });

    await owner.activate("users");

    const readyBeforeSwitch = owner.getState();

    await owner.activate("relationships");

    assert.equal(loadCount, 1);
    assert.equal(owner.getState(), readyBeforeSwitch);

    await owner.activate("users");

    assert.equal(loadCount, 1);
    assert.equal(owner.getState(), readyBeforeSwitch);
  });

  it("15. thrown loader errors fail closed as UNAVAILABLE", async () => {
    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          throw new Error("network exploded");
        },
      });

    await owner.activate("users");

    assert.equal(owner.getState().status, "UNAVAILABLE");
    assert.equal(owner.getState().inventory, null);
    assert.equal(
      owner.getState().errorMessage,
      "network exploded",
    );
  });

  it("16. blank thrown loader errors use the stable fail-closed message", async () => {
    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          throw new Error("   ");
        },
      });

    await owner.activate("relationships");

    assert.equal(owner.getState().status, "UNAVAILABLE");
    assert.equal(owner.getState().inventory, null);

    assert.equal(
      owner.getState().errorMessage,
      "Unable to read authoritative relationship inventory.",
    );
  });

  it("17. dispose makes future activate refresh and invalidate operations inert", async () => {
    let loadCount = 0;
    const publishedStates: string[] = [];

    const owner =
      createSuperAdminRelationshipInventoryOwner({
        loadInventory: async () => {
          loadCount += 1;
          return readyResult("before-dispose");
        },
        onStateChange: (state) => {
          publishedStates.push(state.status);
        },
      });

    await owner.activate("users");

    assert.equal(owner.getState().status, "READY");
    assert.equal(loadCount, 1);

    const stateAtDispose = owner.getState();
    const publicationsAtDispose = [...publishedStates];

    owner.dispose();

    await owner.activate("relationships");
    await owner.refresh();
    await owner.invalidate();

    assert.equal(loadCount, 1);
    assert.equal(owner.getState(), stateAtDispose);

    assert.deepEqual(
      publishedStates,
      publicationsAtDispose,
    );
  });
});
