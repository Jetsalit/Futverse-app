import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  bindOrganizationRuntimeUid,
  createOrganizationRuntime,
  type OrganizationRuntimeState,
} from "../lib/organizationRuntimeSelection";

interface OrganizationRuntimeContextValue {
  readonly runtimeState: OrganizationRuntimeState;
}

const OrganizationRuntimeContext =
  createContext<OrganizationRuntimeContextValue | undefined>(undefined);

function RuntimeActorOwner({
  actorUid,
  children,
}: {
  actorUid: string | null;
  children: ReactNode;
}) {
  const [runtimeState] = useState<OrganizationRuntimeState>(() =>
    bindOrganizationRuntimeUid(createOrganizationRuntime(), actorUid),
  );

  const value = useMemo<OrganizationRuntimeContextValue>(
    () => ({ runtimeState }),
    [runtimeState],
  );

  return (
    <OrganizationRuntimeContext.Provider value={value}>
      {children}
    </OrganizationRuntimeContext.Provider>
  );
}

export function OrganizationRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { actualUser } = useAuth();
  const actorUid = actualUser?.uid ?? null;

  const actorKey =
    actorUid === null ? "unauthenticated" : `authenticated:${actorUid}`;

  return (
    <RuntimeActorOwner key={actorKey} actorUid={actorUid}>
      {children}
    </RuntimeActorOwner>
  );
}

export function useOrganizationRuntime() {
  const context = useContext(OrganizationRuntimeContext);

  if (context === undefined) {
    throw new Error(
      "useOrganizationRuntime must be used within an OrganizationRuntimeProvider",
    );
  }

  return context;
}
