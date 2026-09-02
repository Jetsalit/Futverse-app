import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  applyOrganizationResolution,
  beginOrganizationResolution,
  bindOrganizationRuntimeUid,
  createOrganizationRuntime,
  getOrganizationResolutionRequest,
  selectOrganization,
  type OrganizationRuntimeState,
} from "../lib/organizationRuntimeSelection";
import {
  resolveProClubRuntimeAuthority,
  type ProClubRuntimeAuthorityBridgeResult,
} from "../lib/organizationRuntimeProClubAuthorityBridge";

interface OrganizationRuntimeContextValue {
  readonly runtimeState: OrganizationRuntimeState;
  readonly selectProClub: (organizationId: string) => void;
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
  const [runtimeState, setRuntimeState] = useState<OrganizationRuntimeState>(() =>
    bindOrganizationRuntimeUid(createOrganizationRuntime(), actorUid),
  );
  const authorityRequests = useRef(
    new WeakMap<object, Promise<ProClubRuntimeAuthorityBridgeResult>>(),
  );

  const selectProClub = useCallback((organizationId: string) => {
    setRuntimeState((current) => {
      const selected = selectOrganization(
        current,
        "PRO_CLUB",
        organizationId,
      );

      return beginOrganizationResolution(selected);
    });
  }, []);

  useEffect(() => {
    const request = getOrganizationResolutionRequest(runtimeState);
    if (request === null || request.organizationType !== "PRO_CLUB") return;

    let authorityRequest = authorityRequests.current.get(request);
    if (authorityRequest === undefined) {
      authorityRequest = resolveProClubRuntimeAuthority(request);
      authorityRequests.current.set(request, authorityRequest);
    }

    let mounted = true;

    void authorityRequest
      .then((bridgeResult) => {
        if (!mounted || bridgeResult.runtimeResult === null) return;

        setRuntimeState((current) =>
          applyOrganizationResolution(current, bridgeResult.runtimeResult),
        );
      })
      .catch(() => {
        // The bridge is expected to map read failures to a canonical ERROR
        // result. An unexpected rejection remains fail-closed in RESOLVING.
      });

    return () => {
      mounted = false;
    };
  }, [runtimeState]);

  const value = useMemo<OrganizationRuntimeContextValue>(
    () => ({ runtimeState, selectProClub }),
    [runtimeState, selectProClub],
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
