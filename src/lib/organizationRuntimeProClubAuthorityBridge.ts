import {
  createOrganizationResolutionResult,
  type OrganizationResolutionRequest,
  type OrganizationResolutionResult,
  type OrganizationResolutionStatus,
} from "./organizationRuntimeSelection";

import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
} from "./firestore/proClubOrganizationAdapter";

import {
  firestoreProClubReadOps,
  type ProClubReadOps,
  type ProClubReadState,
} from "./firestore/proClubReadAdapter";


export interface ProClubRuntimeAuthorityBridgeResult {
  readonly authority: Readonly<ProClubOrganizationAuthority> | null;
  readonly sourceState: ProClubReadState | null;
  readonly runtimeResult: OrganizationResolutionResult | null;
}

export type ProClubMobileEntryAuthorityStage =
  | "CLUB"
  | "MEMBERSHIP"
  | "STAFF_ROLE";

export type ProClubMobileEntryTimingEvent =
  | {
      readonly stage: ProClubMobileEntryAuthorityStage;
      readonly state: "STARTED";
    }
  | {
      readonly stage: ProClubMobileEntryAuthorityStage;
      readonly state: "COMPLETED";
      readonly durationMs: number;
    };

export type ProClubMobileEntryTimingObserver =
  (event: ProClubMobileEntryTimingEvent) => void;

function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function authorityStageForPath(
  path: readonly string[],
): ProClubMobileEntryAuthorityStage | null {
  if (path.length === 2 && path[0] === "proClubs") return "CLUB";
  if (path.length === 4 && path[0] === "proClubs" && path[2] === "members") {
    return "MEMBERSHIP";
  }
  if (path.length === 4 && path[0] === "proClubs" && path[2] === "staff") {
    return "STAFF_ROLE";
  }
  return null;
}

function instrumentAuthorityReads(
  ops: ProClubReadOps,
  observeTiming?: ProClubMobileEntryTimingObserver,
): ProClubReadOps {
  if (!observeTiming) return ops;

  return {
    async readDocument(path) {
      const stage = authorityStageForPath(path);
      if (stage === null) return ops.readDocument(path);

      const startedAt = monotonicNow();
      observeTiming(Object.freeze({ stage, state: "STARTED" }));

      try {
        return await ops.readDocument(path);
      } finally {
        observeTiming(Object.freeze({
          stage,
          state: "COMPLETED",
          durationMs: Math.max(0, monotonicNow() - startedAt),
        }));
      }
    },
  };
}


function createBridgeResult(
  sourceState: ProClubReadState,
  request: unknown,
  status: OrganizationResolutionStatus,
  authority: Readonly<ProClubOrganizationAuthority> | null = null,
): ProClubRuntimeAuthorityBridgeResult {
  return Object.freeze({
    authority,
    sourceState,
    runtimeResult:
      createOrganizationResolutionResult(
        request,
        status,
      ),
  });
}


export async function resolveProClubRuntimeAuthority(
  request: unknown,
  ops?: ProClubReadOps,
  observeTiming?: ProClubMobileEntryTimingObserver,
): Promise<ProClubRuntimeAuthorityBridgeResult> {

  /*
   * Provenance gate.
   *
   * Organization Runtime Selection is the sole owner of trusted resolution
   * requests. Using its result factory here ensures a structural lookalike
   * request cannot reach the Pro Club authority resolver.
   */
  const trustedFailureResult =
    createOrganizationResolutionResult(
      request,
      "ERROR",
    );

  if (trustedFailureResult === null) {
    return Object.freeze({
      sourceState: null,
      runtimeResult: null,
      authority: null,
    });
  }

  const trustedRequest =
    request as OrganizationResolutionRequest;


  /*
   * This bridge supports Pro Club only.
   *
   * A trusted Academy request fails closed without invoking any Pro Club
   * authority read.
   */
  if (
    trustedRequest.organizationType !==
    "PRO_CLUB"
  ) {
    return Object.freeze({
      sourceState: null,
      runtimeResult: trustedFailureResult,
      authority: null,
    });
  }


  /*
   * Canonical authority ownership remains entirely inside the existing
   * Pro Club Organization Adapter.
   */
  const authorityResult =
    await resolveProClubOrganizationAuthority(
      trustedRequest.organizationId,
      trustedRequest.uid,
      instrumentAuthorityReads(
        ops ?? firestoreProClubReadOps,
        observeTiming,
      ),
    );


  /*
   * Preserve every upstream source state exactly.
   */
  if (authorityResult.state === "MISSING") {
    return createBridgeResult(
      "MISSING",
      request,
      "REJECTED",
    );
  }

  if (
    authorityResult.state ===
    "PERMISSION_DENIED"
  ) {
    return createBridgeResult(
      "PERMISSION_DENIED",
      request,
      "ERROR",
    );
  }

  if (
    authorityResult.state ===
    "INVALID_DATA"
  ) {
    return createBridgeResult(
      "INVALID_DATA",
      request,
      "ERROR",
    );
  }

  if (authorityResult.state === "ERROR") {
    return createBridgeResult(
      "ERROR",
      request,
      "ERROR",
    );
  }


  /*
   * FOUND still requires exact identity integrity.
   *
   * No returned identifier may be repaired, normalized, substituted, or
   * inferred.
   */
  if (
    authorityResult.value.organizationType !==
      "PRO_CLUB" ||
    authorityResult.value.organizationId !==
      trustedRequest.organizationId ||
    authorityResult.value.userId !==
      trustedRequest.uid
  ) {
    return createBridgeResult(
      "FOUND",
      request,
      "ERROR",
    );
  }


  /*
   * Membership authority is canonical.
   *
   * Football staff role is intentionally not inspected here and therefore
   * cannot independently grant tenant authority.
   */
  if (
    authorityResult.value
      .hasMembershipAuthority
  ) {
    return createBridgeResult(
      "FOUND",
      request,
      "AUTHORIZED",
      Object.freeze({ ...authorityResult.value }),
    );
  }

  return createBridgeResult(
    "FOUND",
    request,
    "REJECTED",
  );
}
