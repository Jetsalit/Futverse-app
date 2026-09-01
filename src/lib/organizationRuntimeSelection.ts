export const ORGANIZATION_TYPES = ["ACADEMY", "PRO_CLUB"] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export interface OrganizationSelection {
  readonly organizationType: OrganizationType;
  readonly organizationId: string;
}

export interface OrganizationAuthorizationProof {
  readonly uid: string;
  readonly organizationType: OrganizationType;
  readonly organizationId: string;
  readonly generation: number;
}

export interface OrganizationResolutionRequest {
  readonly uid: string;
  readonly organizationType: OrganizationType;
  readonly organizationId: string;
  readonly generation: number;
}

interface OrganizationRuntimeStateBase {
  readonly uid: string | null;
  readonly selection: OrganizationSelection | null;
  readonly generation: number;
  readonly authorizationProof: OrganizationAuthorizationProof | null;
}

export interface UnselectedOrganizationRuntimeState
  extends OrganizationRuntimeStateBase {
  readonly status: "UNSELECTED";
  readonly selection: null;
  readonly authorizationProof: null;
}

export interface SelectedOrganizationRuntimeState
  extends OrganizationRuntimeStateBase {
  readonly status: "SELECTED";
  readonly uid: string;
  readonly selection: OrganizationSelection;
  readonly authorizationProof: null;
}

export interface ResolvingOrganizationRuntimeState
  extends OrganizationRuntimeStateBase {
  readonly status: "RESOLVING";
  readonly uid: string;
  readonly selection: OrganizationSelection;
  readonly authorizationProof: null;
}

export interface AuthorizedOrganizationRuntimeState
  extends OrganizationRuntimeStateBase {
  readonly status: "AUTHORIZED";
  readonly uid: string;
  readonly selection: OrganizationSelection;
  readonly authorizationProof: OrganizationAuthorizationProof;
}

export interface RejectedOrganizationRuntimeState
  extends OrganizationRuntimeStateBase {
  readonly status: "REJECTED";
  readonly uid: string;
  readonly selection: OrganizationSelection;
  readonly authorizationProof: null;
}

export interface ErrorOrganizationRuntimeState
  extends OrganizationRuntimeStateBase {
  readonly status: "ERROR";
  readonly uid: string;
  readonly selection: OrganizationSelection;
  readonly authorizationProof: null;
}

export type OrganizationRuntimeState =
  | UnselectedOrganizationRuntimeState
  | SelectedOrganizationRuntimeState
  | ResolvingOrganizationRuntimeState
  | AuthorizedOrganizationRuntimeState
  | RejectedOrganizationRuntimeState
  | ErrorOrganizationRuntimeState;

export type OrganizationResolutionStatus =
  | "AUTHORIZED"
  | "REJECTED"
  | "ERROR";

export interface OrganizationResolutionResult {
  readonly status: OrganizationResolutionStatus;
  readonly uid: string;
  readonly organizationType: OrganizationType;
  readonly organizationId: string;
  readonly generation: number;
}

const trustedRuntimeStates = new WeakSet<object>();
const trustedAuthorizationProofs = new WeakSet<object>();
const trustedResolutionRequests = new WeakSet<object>();
const resolutionRequestsByState = new WeakMap<
  object,
  OrganizationResolutionRequest
>();
const resolutionRequestsByResult = new WeakMap<
  object,
  OrganizationResolutionRequest
>();

const untrustedFailClosedState = Object.freeze({
  status: "UNSELECTED",
  uid: null,
  selection: null,
  generation: 0,
  authorizationProof: null,
}) as UnselectedOrganizationRuntimeState;

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) ||
    typeof value === "function";
}

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function isGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function nextGeneration(generation: number): number | null {
  if (!isGeneration(generation) || generation >= Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return generation + 1;
}

function trustState<T extends OrganizationRuntimeState>(state: T): T {
  const immutableState = Object.freeze(state);
  trustedRuntimeStates.add(immutableState);
  return immutableState;
}

function createUnselectedState(
  uid: string | null,
  generation: number,
): UnselectedOrganizationRuntimeState {
  return trustState({
    status: "UNSELECTED",
    uid,
    selection: null,
    generation,
    authorizationProof: null,
  });
}

function isTrustedRuntimeState(
  state: unknown,
): state is OrganizationRuntimeState {
  return isObject(state) && trustedRuntimeStates.has(state);
}

function failClosed(): OrganizationRuntimeState {
  return untrustedFailClosedState;
}

export function isOrganizationType(value: unknown): value is OrganizationType {
  return value === "ACADEMY" || value === "PRO_CLUB";
}

export function isValidOrganizationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    value.trim() === value &&
    !value.includes("/") &&
    !containsControlCharacter(value) &&
    hasWellFormedUnicode(value)
  );
}

export function isValidAuthenticatedUid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !containsControlCharacter(value) &&
    hasWellFormedUnicode(value)
  );
}

export function createOrganizationSelection(
  organizationType: unknown,
  organizationId: unknown,
): OrganizationSelection | null {
  if (
    !isOrganizationType(organizationType) ||
    !isValidOrganizationId(organizationId)
  ) {
    return null;
  }

  return Object.freeze({ organizationType, organizationId });
}

export function getOrganizationSelectionKey(
  organizationType: unknown,
  organizationId: unknown,
): string | null {
  const selection = createOrganizationSelection(
    organizationType,
    organizationId,
  );
  return selection === null
    ? null
    : JSON.stringify([selection.organizationType, selection.organizationId]);
}

export function createOrganizationRuntimeState(): OrganizationRuntimeState {
  return createUnselectedState(null, 0);
}

export const createOrganizationRuntime = createOrganizationRuntimeState;

export function bindOrganizationRuntimeUid(
  state: OrganizationRuntimeState,
  uid: unknown,
): OrganizationRuntimeState {
  if (!isTrustedRuntimeState(state)) return failClosed();

  if (uid === null) {
    if (state.uid === null) return state;
    const generation = nextGeneration(state.generation);
    return generation === null
      ? failClosed()
      : createUnselectedState(null, generation);
  }

  if (!isValidAuthenticatedUid(uid)) {
    const generation = nextGeneration(state.generation);
    return generation === null
      ? failClosed()
      : createUnselectedState(null, generation);
  }

  if (uid === state.uid) return state;

  const generation = nextGeneration(state.generation);
  return generation === null
    ? failClosed()
    : createUnselectedState(uid, generation);
}

export function clearOrganizationRuntime(
  state: OrganizationRuntimeState,
): OrganizationRuntimeState {
  if (!isTrustedRuntimeState(state)) return failClosed();

  const generation = nextGeneration(state.generation);
  return generation === null
    ? failClosed()
    : createUnselectedState(state.uid, generation);
}

export function selectOrganization(
  state: OrganizationRuntimeState,
  organizationType: unknown,
  organizationId: unknown,
): OrganizationRuntimeState {
  if (!isTrustedRuntimeState(state)) return failClosed();

  const generation = nextGeneration(state.generation);
  if (generation === null) return failClosed();
  if (!isValidAuthenticatedUid(state.uid)) {
    return createUnselectedState(null, generation);
  }

  const selection = createOrganizationSelection(
    organizationType,
    organizationId,
  );
  if (selection === null) {
    return createUnselectedState(state.uid, generation);
  }

  return trustState({
    status: "SELECTED",
    uid: state.uid,
    selection,
    generation,
    authorizationProof: null,
  });
}

export function beginOrganizationResolution(
  state: OrganizationRuntimeState,
): OrganizationRuntimeState {
  if (!isTrustedRuntimeState(state)) return failClosed();
  if (state.status !== "SELECTED") return state;

  const request = Object.freeze({
    uid: state.uid,
    organizationType: state.selection.organizationType,
    organizationId: state.selection.organizationId,
    generation: state.generation,
  });
  trustedResolutionRequests.add(request);

  const resolvingState = trustState({
    status: "RESOLVING",
    uid: state.uid,
    selection: state.selection,
    generation: state.generation,
    authorizationProof: null,
  });
  resolutionRequestsByState.set(resolvingState, request);
  return resolvingState;
}

export function getOrganizationResolutionRequest(
  state: unknown,
): OrganizationResolutionRequest | null {
  if (!isTrustedRuntimeState(state) || state.status !== "RESOLVING") {
    return null;
  }

  const request = resolutionRequestsByState.get(state);
  return request !== undefined && trustedResolutionRequests.has(request)
    ? request
    : null;
}

export function createOrganizationResolutionResult(
  request: unknown,
  status: unknown,
): OrganizationResolutionResult | null {
  if (
    !isObject(request) ||
    !trustedResolutionRequests.has(request) ||
    (status !== "AUTHORIZED" && status !== "REJECTED" && status !== "ERROR")
  ) {
    return null;
  }

  const trustedRequest = request as OrganizationResolutionRequest;
  const result = Object.freeze({
    status,
    uid: trustedRequest.uid,
    organizationType: trustedRequest.organizationType,
    organizationId: trustedRequest.organizationId,
    generation: trustedRequest.generation,
  });
  resolutionRequestsByResult.set(result, trustedRequest);
  return result;
}

function getMatchingResolutionStatus(
  state: ResolvingOrganizationRuntimeState,
  result: unknown,
): OrganizationResolutionStatus | null {
  if (!isObject(result)) return null;

  const currentRequest = resolutionRequestsByState.get(state);
  if (
    currentRequest === undefined ||
    !trustedResolutionRequests.has(currentRequest) ||
    resolutionRequestsByResult.get(result) !== currentRequest
  ) {
    return null;
  }

  try {
    const candidate = result as Record<string, unknown>;
    const status = candidate.status;
    const uid = candidate.uid;
    const organizationType = candidate.organizationType;
    const organizationId = candidate.organizationId;
    const generation = candidate.generation;

    if (
      status !== "AUTHORIZED" &&
      status !== "REJECTED" &&
      status !== "ERROR"
    ) {
      return null;
    }

    return (
      isValidAuthenticatedUid(uid) &&
      isOrganizationType(organizationType) &&
      isValidOrganizationId(organizationId) &&
      isGeneration(generation) &&
      uid === state.uid &&
      organizationType === state.selection.organizationType &&
      organizationId === state.selection.organizationId &&
      generation === state.generation
    )
      ? status
      : null;
  } catch {
    return null;
  }
}

export function applyOrganizationResolution(
  state: OrganizationRuntimeState,
  result: unknown,
): OrganizationRuntimeState {
  if (!isTrustedRuntimeState(state)) return failClosed();
  if (state.status !== "RESOLVING") return state;
  const resolutionStatus = getMatchingResolutionStatus(state, result);
  if (resolutionStatus === null) return state;

  if (resolutionStatus === "AUTHORIZED") {
    const authorizationProof = Object.freeze({
      uid: state.uid,
      organizationType: state.selection.organizationType,
      organizationId: state.selection.organizationId,
      generation: state.generation,
    });
    trustedAuthorizationProofs.add(authorizationProof);

    return trustState({
      status: "AUTHORIZED",
      uid: state.uid,
      selection: state.selection,
      generation: state.generation,
      authorizationProof,
    });
  }

  return trustState({
    status: resolutionStatus,
    uid: state.uid,
    selection: state.selection,
    generation: state.generation,
    authorizationProof: null,
  });
}

export function isOrganizationRuntimeAuthorized(state: unknown): boolean {
  if (!isTrustedRuntimeState(state)) return false;
  if (state.status !== "AUTHORIZED") return false;

  const proof = state.authorizationProof;
  return (
    trustedAuthorizationProofs.has(proof) &&
    Object.isFrozen(proof) &&
    proof.uid === state.uid &&
    proof.organizationType === state.selection.organizationType &&
    proof.organizationId === state.selection.organizationId &&
    proof.generation === state.generation
  );
}
