import type {
  SuperAdminRelationshipInventoryResult,
} from "../../lib/firestore/superAdminRelationshipReadAdapter";

import {
  beginSuperAdminRelationshipInventoryLoad,
  createSuperAdminRelationshipInventoryLifecycleState,
  invalidateSuperAdminRelationshipInventory,
  isSuperAdminRelationshipInventoryConsumerTab,
  resolveSuperAdminRelationshipInventoryReady,
  resolveSuperAdminRelationshipInventoryUnavailable,
  shouldLoadSuperAdminRelationshipInventoryOnActivation,
  type SuperAdminRelationshipInventoryLifecycleState,
} from "./superAdminRelationshipInventoryLifecycle";

export interface SuperAdminRelationshipInventoryOwnerDependencies {
  loadInventory: () => Promise<SuperAdminRelationshipInventoryResult>;
  onStateChange?: (
    state: SuperAdminRelationshipInventoryLifecycleState,
  ) => void;
}

export interface SuperAdminRelationshipInventoryOwner {
  getState: () => SuperAdminRelationshipInventoryLifecycleState;
  activate: (tab: string) => Promise<void>;
  refresh: () => Promise<void>;
  invalidate: () => Promise<void>;
  dispose: () => void;
}

function errorMessageFromThrownRead(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to read authoritative relationship inventory.";
}

export function createSuperAdminRelationshipInventoryOwner(
  dependencies: SuperAdminRelationshipInventoryOwnerDependencies,
): SuperAdminRelationshipInventoryOwner {
  let state =
    createSuperAdminRelationshipInventoryLifecycleState();

  let activeTab: string | null = null;
  let disposed = false;
  let inFlight: Promise<void> | null = null;

  const publish = (
    nextState: SuperAdminRelationshipInventoryLifecycleState,
  ) => {
    if (disposed || nextState === state) {
      return;
    }

    state = nextState;
    dependencies.onStateChange?.(state);
  };

  const performLoad = (): Promise<void> => {
    if (disposed) {
      return Promise.resolve();
    }

    const loadingState =
      beginSuperAdminRelationshipInventoryLoad(state);

    publish(loadingState);

    const requestGeneration = loadingState.generation;

    const request = (async () => {
      try {
        const result = await dependencies.loadInventory();

        if (disposed) {
          return;
        }

        if (result.state === "UNAVAILABLE") {
          publish(
            resolveSuperAdminRelationshipInventoryUnavailable(
              state,
              requestGeneration,
              result.error.message,
            ),
          );

          return;
        }

        publish(
          resolveSuperAdminRelationshipInventoryReady(
            state,
            requestGeneration,
            result.inventory,
          ),
        );
      } catch (error) {
        if (disposed) {
          return;
        }

        publish(
          resolveSuperAdminRelationshipInventoryUnavailable(
            state,
            requestGeneration,
            errorMessageFromThrownRead(error),
          ),
        );
      }
    })();

    inFlight = request;

    void request.finally(() => {
      if (inFlight === request) {
        inFlight = null;
      }
    });

    return request;
  };

  return {
    getState() {
      return state;
    },

    activate(tab: string) {
      if (disposed) {
        return Promise.resolve();
      }

      const previousTab = activeTab;
      const wasConsumer =
        previousTab !== null &&
        isSuperAdminRelationshipInventoryConsumerTab(previousTab);

      const isConsumer =
        isSuperAdminRelationshipInventoryConsumerTab(tab);

      activeTab = tab;

      if (!isConsumer) {
        if (wasConsumer) {
          publish(
            invalidateSuperAdminRelationshipInventory(state),
          );
        }

        return Promise.resolve();
      }

      if (
        shouldLoadSuperAdminRelationshipInventoryOnActivation(state)
      ) {
        return performLoad();
      }

      if (state.status === "LOADING" && inFlight) {
        return inFlight;
      }

      return Promise.resolve();
    },

    refresh() {
      if (disposed) {
        return Promise.resolve();
      }

      return performLoad();
    },

    invalidate() {
      if (disposed) {
        return Promise.resolve();
      }

      publish(
        invalidateSuperAdminRelationshipInventory(state),
      );

      if (
        activeTab !== null &&
        isSuperAdminRelationshipInventoryConsumerTab(activeTab)
      ) {
        return performLoad();
      }

      return Promise.resolve();
    },

    dispose() {
      disposed = true;
      activeTab = null;
      inFlight = null;
    },
  };
}
