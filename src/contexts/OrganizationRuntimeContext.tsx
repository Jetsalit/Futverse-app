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
  createOrganizationResolutionResult,
  isOrganizationRuntimeAuthorized,
  getOrganizationResolutionRequest,
  selectOrganization,
  type OrganizationRuntimeState,
} from "../lib/organizationRuntimeSelection";
import {
  resolveProClubRuntimeAuthority,
  type ProClubMobileEntryAuthorityStage,
  type ProClubRuntimeAuthorityBridgeResult,
} from "../lib/organizationRuntimeProClubAuthorityBridge";

export interface ProClubMobileEntryProgress {
  readonly stage: ProClubMobileEntryAuthorityStage | null;
  readonly startedAtMs: number | null;
  readonly completedDurationsMs: Partial<Record<ProClubMobileEntryAuthorityStage, number>>;
}

interface OrganizationRuntimeContextValue {
  readonly proClubAuthority: ProClubRuntimeAuthorityBridgeResult["authority"];
  readonly proClubEntryProgress: ProClubMobileEntryProgress;
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
  const [{ runtimeState, proClubAuthority, proClubEntryProgress }, setRuntimeState] = useState<{
    runtimeState: OrganizationRuntimeState;
    proClubAuthority: ProClubRuntimeAuthorityBridgeResult["authority"];
    proClubEntryProgress: ProClubMobileEntryProgress;
  }>(() => ({
    runtimeState: bindOrganizationRuntimeUid(createOrganizationRuntime(), actorUid),
    proClubAuthority: null,
    proClubEntryProgress: {
      stage: null,
      startedAtMs: null,
      completedDurationsMs: {},
    },
  }));
  const authorityRequests = useRef(
    new WeakMap<object, Promise<ProClubRuntimeAuthorityBridgeResult>>(),
  );

  const selectProClub = useCallback((organizationId: string) => {
    setRuntimeState((current) => {
      const selected = selectOrganization(
        current.runtimeState,
        "PRO_CLUB",
        organizationId,
      );

      return {
        runtimeState: beginOrganizationResolution(selected),
        proClubAuthority: null,
        proClubEntryProgress: {
          stage: null,
          startedAtMs: null,
          completedDurationsMs: {},
        },
      };
    });
  }, []);

  useEffect(() => {
    const request = getOrganizationResolutionRequest(runtimeState);
    if (request === null || request.organizationType !== "PRO_CLUB") return;

    let authorityRequest = authorityRequests.current.get(request);
    if (authorityRequest === undefined) {
      authorityRequest = resolveProClubRuntimeAuthority(
        request,
        undefined,
        (event) => {
          if (!mounted) return;
          setRuntimeState((current) => {
            if (getOrganizationResolutionRequest(current.runtimeState) !== request) return current;

            if (event.state === "STARTED") {
              return {
                ...current,
                proClubEntryProgress: {
                  ...current.proClubEntryProgress,
                  stage: event.stage,
                  startedAtMs: Date.now(),
                },
              };
            }

            return {
              ...current,
              proClubEntryProgress: {
                stage: current.proClubEntryProgress.stage === event.stage
                  ? null
                  : current.proClubEntryProgress.stage,
                startedAtMs: current.proClubEntryProgress.stage === event.stage
                  ? null
                  : current.proClubEntryProgress.startedAtMs,
                completedDurationsMs: {
                  ...current.proClubEntryProgress.completedDurationsMs,
                  [event.stage]: event.durationMs,
                },
              },
            };
          });
        },
      );
      authorityRequests.current.set(request, authorityRequest);
    }

    let mounted = true;

    void authorityRequest
      .then((bridgeResult) => {
        if (!mounted) return;
        setRuntimeState((current) => {
          if (getOrganizationResolutionRequest(current.runtimeState) !== request) return current;
          const next = applyOrganizationResolution(current.runtimeState, bridgeResult.runtimeResult);
          const authority = bridgeResult.authority;
          if (isOrganizationRuntimeAuthorized(next) &&
              bridgeResult.sourceState === "FOUND" && authority?.hasMembershipAuthority === true &&
              authority.organizationType === "PRO_CLUB" && authority.userId === request.uid &&
              authority.organizationId === request.organizationId && next.generation === request.generation) {
            return {
              runtimeState: next,
              proClubAuthority: authority,
              proClubEntryProgress: {
                ...current.proClubEntryProgress,
                stage: null,
                startedAtMs: null,
              },
            };
          }
          return {
            runtimeState: next.status === "REJECTED" || next.status === "ERROR" ? next :
              applyOrganizationResolution(current.runtimeState, createOrganizationResolutionResult(request, "ERROR")),
            proClubAuthority: null,
            proClubEntryProgress: {
              ...current.proClubEntryProgress,
              stage: null,
              startedAtMs: null,
            },
          };
        });
      })
      .catch(() => {
        if (!mounted) return;
        setRuntimeState(current => getOrganizationResolutionRequest(current.runtimeState) !== request ? current : {
          runtimeState: applyOrganizationResolution(current.runtimeState, createOrganizationResolutionResult(request, "ERROR")),
          proClubAuthority: null,
          proClubEntryProgress: {
            ...current.proClubEntryProgress,
            stage: null,
            startedAtMs: null,
          },
        });
      });

    return () => {
      mounted = false;
    };
  }, [runtimeState]);

  const value = useMemo<OrganizationRuntimeContextValue>(
    () => ({ runtimeState, selectProClub, proClubAuthority, proClubEntryProgress }),
    [runtimeState, selectProClub, proClubAuthority, proClubEntryProgress],
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
