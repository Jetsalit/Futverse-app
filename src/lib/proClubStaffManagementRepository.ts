import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";
import {
  isProClubMembershipStatus,
  isProClubStaffRole,
  isProClubStaffStatus,
  isValidDocumentIdentifier,
} from "./proClubModel";
import type { ProClubStaffManagementActionV1 } from "./proClubStaffManagementTransition";
import type {
  ProClubMembershipStatus,
  ProClubStaffRole,
  ProClubStaffStatus,
} from "../types/ProClub";

export type ProClubStaffManagementClientErrorCode =
  | "AUTH_CHANGED"
  | "SELF_MANAGEMENT_BLOCKED"
  | "REVIEWER_REQUIRED"
  | "TARGET_UNAVAILABLE"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_DATA"
  | "UNAVAILABLE"
  | "NETWORK";

export class ProClubStaffManagementClientError extends Error {
  constructor(readonly code: ProClubStaffManagementClientErrorCode) {
    super(code);
    this.name = "ProClubStaffManagementClientError";
  }
}

export function proClubStaffManagementErrorMessage(error: unknown): string {
  if (!(error instanceof ProClubStaffManagementClientError)) {
    return "We could not update this staff member. Check your connection and try again.";
  }

  switch (error.code) {
    case "AUTH_CHANGED":
      return "Your sign-in changed. Sign in again before managing staff.";
    case "SELF_MANAGEMENT_BLOCKED":
      return "You cannot change your own staff access from this screen.";
    case "REVIEWER_REQUIRED":
      return "Only an authorized club owner or administrator can manage this staff member.";
    case "TARGET_UNAVAILABLE":
      return "This staff member is no longer available. Reload the staff roster and try again.";
    case "CONFLICT":
      return "This staff record changed. Reload the staff roster before trying again.";
    case "RATE_LIMITED":
      return "Too many staff management attempts. Please try again later.";
    case "INVALID_DATA":
      return "The staff update could not be verified. Reload the page before continuing.";
    case "UNAVAILABLE":
      return "Staff management is unavailable right now. Please try again later.";
    default:
      return "We could not update this staff member. Check your connection and try again.";
  }
}

export interface ProClubStaffManagementClientRequestV1 {
  clubId: string;
  targetUid: string;
  action: ProClubStaffManagementActionV1;
}

export interface ProClubStaffManagementClientResponseV1 {
  ok: true;
  action: ProClubStaffManagementActionV1["type"];
  staffRole: ProClubStaffRole;
  membershipStatus: ProClubMembershipStatus;
  staffStatus: ProClubStaffStatus;
}

export type ManageProClubStaffCallableCaller = (
  data: ProClubStaffManagementClientRequestV1,
) => Promise<{ data: unknown }>;

function normalizeFunctionCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== "string") return "";
  return code.startsWith("functions/") ? code.slice("functions/".length) : code;
}

function mapCallableError(error: unknown): ProClubStaffManagementClientError {
  switch (normalizeFunctionCode(error)) {
    case "unauthenticated":
      return new ProClubStaffManagementClientError("AUTH_CHANGED");
    case "permission-denied":
      return new ProClubStaffManagementClientError("REVIEWER_REQUIRED");
    case "not-found":
      return new ProClubStaffManagementClientError("TARGET_UNAVAILABLE");
    case "aborted":
      return new ProClubStaffManagementClientError("CONFLICT");
    case "resource-exhausted":
      return new ProClubStaffManagementClientError("RATE_LIMITED");
    case "invalid-argument":
      return new ProClubStaffManagementClientError("INVALID_DATA");
    case "failed-precondition":
    case "unavailable":
    case "deadline-exceeded":
    case "internal":
      return new ProClubStaffManagementClientError("UNAVAILABLE");
    default:
      return new ProClubStaffManagementClientError("NETWORK");
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== keys.length ||
    !actualKeys.every((key) => keys.includes(key))
  ) {
    return null;
  }
  return record;
}

function isExactManagementActionV1(
  value: unknown,
): value is ProClubStaffManagementActionV1 {
  const action = exactRecord(
    value,
    (value as { type?: unknown })?.type === "CHANGE_ROLE"
      ? ["type", "staffRole"]
      : ["type"],
  );
  if (!action || typeof action.type !== "string") return false;

  if (action.type === "CHANGE_ROLE") {
    return isProClubStaffRole(action.staffRole);
  }

  return (
    action.type === "DEACTIVATE" ||
    action.type === "REACTIVATE" ||
    action.type === "MARK_LEFT"
  );
}

function assertRequest(
  request: ProClubStaffManagementClientRequestV1,
  expectedUid: string,
): void {
  if (
    !isValidDocumentIdentifier(request.clubId) ||
    !isValidDocumentIdentifier(request.targetUid) ||
    !isExactManagementActionV1(request.action)
  ) {
    throw new ProClubStaffManagementClientError("INVALID_DATA");
  }

  if (request.targetUid === expectedUid) {
    throw new ProClubStaffManagementClientError("SELF_MANAGEMENT_BLOCKED");
  }
}

export function parseProClubStaffManagementResponseV1(
  value: unknown,
  requestedAction: ProClubStaffManagementActionV1,
): ProClubStaffManagementClientResponseV1 {
  if (!isExactManagementActionV1(requestedAction)) {
    throw new ProClubStaffManagementClientError("INVALID_DATA");
  }

  const record = exactRecord(value, [
    "ok",
    "action",
    "staffRole",
    "membershipStatus",
    "staffStatus",
  ]);

  if (
    !record ||
    record.ok !== true ||
    record.action !== requestedAction.type ||
    !isProClubStaffRole(record.staffRole) ||
    !isProClubMembershipStatus(record.membershipStatus) ||
    !isProClubStaffStatus(record.staffStatus) ||
    record.membershipStatus === "REVOKED"
  ) {
    throw new ProClubStaffManagementClientError("INVALID_DATA");
  }

  switch (requestedAction.type) {
    case "CHANGE_ROLE":
      if (
        record.staffRole !== requestedAction.staffRole ||
        record.membershipStatus !== "ACTIVE" ||
        record.staffStatus !== "ACTIVE"
      ) {
        throw new ProClubStaffManagementClientError("INVALID_DATA");
      }
      break;

    case "DEACTIVATE":
      if (
        record.membershipStatus !== "INACTIVE" ||
        record.staffStatus !== "INACTIVE"
      ) {
        throw new ProClubStaffManagementClientError("INVALID_DATA");
      }
      break;

    case "REACTIVATE":
      if (
        record.membershipStatus !== "ACTIVE" ||
        record.staffStatus !== "ACTIVE"
      ) {
        throw new ProClubStaffManagementClientError("INVALID_DATA");
      }
      break;

    case "MARK_LEFT":
      if (
        record.membershipStatus !== "LEFT" ||
        record.staffStatus !== "LEFT"
      ) {
        throw new ProClubStaffManagementClientError("INVALID_DATA");
      }
      break;
  }

  return {
    ok: true,
    action: record.action as ProClubStaffManagementActionV1["type"],
    staffRole: record.staffRole,
    membershipStatus: record.membershipStatus,
    staffStatus: record.staffStatus,
  };
}

export const defaultManageProClubStaffCaller: ManageProClubStaffCallableCaller =
  async (data) => {
    const callable = httpsCallable<
      ProClubStaffManagementClientRequestV1,
      unknown
    >(functions, "manageProClubStaffV1");
    return await callable(data);
  };

export function createProClubStaffManagementRepository(
  getActorUid: () => string | null,
  caller: ManageProClubStaffCallableCaller = defaultManageProClubStaffCaller,
) {
  function assertActor(expectedUid: string): void {
    if (
      !isValidDocumentIdentifier(expectedUid) ||
      getActorUid() !== expectedUid
    ) {
      throw new ProClubStaffManagementClientError("AUTH_CHANGED");
    }
  }

  return {
    async manageStaff(
      request: ProClubStaffManagementClientRequestV1,
      expectedUid: string,
    ): Promise<ProClubStaffManagementClientResponseV1> {
      assertActor(expectedUid);
      assertRequest(request, expectedUid);

      let result: { data: unknown };
      try {
        // requesterUid is deliberately absent. The callable derives identity from Firebase Auth.
        result = await caller({
          clubId: request.clubId,
          targetUid: request.targetUid,
          action: request.action,
        });
      } catch (error) {
        assertActor(expectedUid);
        throw mapCallableError(error);
      }

      assertActor(expectedUid);
      return parseProClubStaffManagementResponseV1(
        result.data,
        request.action,
      );
    },
  };
}

export const proClubStaffManagementRepository =
  createProClubStaffManagementRepository(
    () => auth.currentUser?.uid ?? null,
  );
