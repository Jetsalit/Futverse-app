import type {
  SuperAdminRelationshipInventory,
} from "../../lib/firestore/superAdminRelationshipReadAdapter";

export type SuperAdminRelationshipInventoryLifecycleStatus =
  | "IDLE"
  | "LOADING"
  | "READY"
  | "UNAVAILABLE"
  | "STALE";

export interface SuperAdminRelationshipInventoryLifecycleState {
  status: SuperAdminRelationshipInventoryLifecycleStatus;
  generation: number;
  inventory: SuperAdminRelationshipInventory | null;
  errorMessage: string | null;
}

export function createSuperAdminRelationshipInventoryLifecycleState():
  SuperAdminRelationshipInventoryLifecycleState {
  return {
    status: "IDLE",
    generation: 0,
    inventory: null,
    errorMessage: null,
  };
}

export function isSuperAdminRelationshipInventoryConsumerTab(
  tab: string,
): boolean {
  return tab === "users" || tab === "relationships";
}

export function shouldLoadSuperAdminRelationshipInventoryOnActivation(
  state: SuperAdminRelationshipInventoryLifecycleState,
): boolean {
  return (
    state.status === "IDLE" ||
    state.status === "STALE" ||
    state.status === "UNAVAILABLE"
  );
}

export function beginSuperAdminRelationshipInventoryLoad(
  state: SuperAdminRelationshipInventoryLifecycleState,
): SuperAdminRelationshipInventoryLifecycleState {
  return {
    status: "LOADING",
    generation: state.generation + 1,
    inventory: null,
    errorMessage: null,
  };
}

export function resolveSuperAdminRelationshipInventoryReady(
  state: SuperAdminRelationshipInventoryLifecycleState,
  requestGeneration: number,
  inventory: SuperAdminRelationshipInventory,
): SuperAdminRelationshipInventoryLifecycleState {
  if (
    state.status !== "LOADING" ||
    state.generation !== requestGeneration
  ) {
    return state;
  }

  return {
    status: "READY",
    generation: state.generation,
    inventory,
    errorMessage: null,
  };
}

export function resolveSuperAdminRelationshipInventoryUnavailable(
  state: SuperAdminRelationshipInventoryLifecycleState,
  requestGeneration: number,
  errorMessage: string,
): SuperAdminRelationshipInventoryLifecycleState {
  if (
    state.status !== "LOADING" ||
    state.generation !== requestGeneration
  ) {
    return state;
  }

  const normalizedErrorMessage =
    errorMessage.trim() ||
    "Unable to read authoritative relationship inventory.";

  return {
    status: "UNAVAILABLE",
    generation: state.generation,
    inventory: null,
    errorMessage: normalizedErrorMessage,
  };
}

export function invalidateSuperAdminRelationshipInventory(
  state: SuperAdminRelationshipInventoryLifecycleState,
): SuperAdminRelationshipInventoryLifecycleState {
  if (state.status === "STALE") {
    return state;
  }

  return {
    status: "STALE",
    generation: state.generation + 1,
    inventory: null,
    errorMessage: null,
  };
}
