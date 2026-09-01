import {
  createOrganizationResolutionResult,
  type OrganizationResolutionRequest,
  type OrganizationResolutionResult,
  type OrganizationResolutionStatus,
} from "./organizationRuntimeSelection";

import {
  resolveProClubOrganizationAuthority,
} from "./firestore/proClubOrganizationAdapter";

import type {
  ProClubReadOps,
  ProClubReadState,
} from "./firestore/proClubReadAdapter";


export interface ProClubRuntimeAuthorityBridgeResult {
  readonly sourceState: ProClubReadState | null;
  readonly runtimeResult: OrganizationResolutionResult | null;
}


function createBridgeResult(
  sourceState: ProClubReadState,
  request: unknown,
  status: OrganizationResolutionStatus,
): ProClubRuntimeAuthorityBridgeResult {
  return Object.freeze({
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
      ops,
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
    );
  }

  return createBridgeResult(
    "FOUND",
    request,
    "REJECTED",
  );
}