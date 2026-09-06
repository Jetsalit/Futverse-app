import {
  planProClubStaffManagementTransitionV1,
  ProClubStaffManagementTransitionError,
  type ProClubStaffManagementActionV1,
  type ProClubStaffManagementPlanV1,
} from "../../../src/lib/proClubStaffManagementTransition.ts";
import type {
  ProClubAuthorizationRole,
  ProClubMembershipStatus,
  ProClubStaffRole,
  ProClubStaffStatus,
} from "../../../src/types/ProClub.ts";

export const STAFF_MANAGEMENT_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INVALID_DATA: "INVALID_DATA",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ProClubStaffManagementErrorCode =
  (typeof STAFF_MANAGEMENT_ERROR_CODES)[keyof typeof STAFF_MANAGEMENT_ERROR_CODES];

export class ProClubStaffManagementServiceError extends Error {
  constructor(
    readonly code: ProClubStaffManagementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProClubStaffManagementServiceError";
  }
}

export interface ProClubStaffManagementRequestV1 {
  clubId: string;
  targetUid: string;
  action: ProClubStaffManagementActionV1;
}

export interface ProClubStaffManagementSourceV1 {
  readClub(clubId: string): Promise<unknown | null>;
  readMembership(clubId: string, uid: string): Promise<unknown | null>;
  readStaffAssignment(clubId: string, uid: string): Promise<unknown | null>;
  applyAtomicPlan(input: {
    clubId: string;
    targetUid: string;
    requesterUid: string;
    plan: ProClubStaffManagementPlanV1;
  }): Promise<void>;
}

export interface ProClubStaffManagementServiceV1 {
  manageStaff(input: {
    requesterUid: string;
    requestBody: unknown;
  }): Promise<ProClubStaffManagementPlanV1>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("/");
}

function parseRequest(value: unknown): ProClubStaffManagementRequestV1 {
  const record = asRecord(value);
  if (!record) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
      "Request body is invalid.",
    );
  }
  const keys = Object.keys(record);
  if (keys.length !== 3 || !keys.every((key) => ["clubId", "targetUid", "action"].includes(key))) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
      "Request body is invalid.",
    );
  }
  if (!isIdentifier(record.clubId) || !isIdentifier(record.targetUid)) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
      "Request body is invalid.",
    );
  }

  const action = asRecord(record.action);
  if (!action || typeof action.type !== "string") {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
      "Request body is invalid.",
    );
  }
  if (action.type === "CHANGE_ROLE") {
    const actionKeys = Object.keys(action);
    if (actionKeys.length !== 2 || !actionKeys.every((key) => ["type", "staffRole"].includes(key))) {
      throw new ProClubStaffManagementServiceError(
        STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
        "Request body is invalid.",
      );
    }
    return {
      clubId: record.clubId,
      targetUid: record.targetUid,
      action: { type: "CHANGE_ROLE", staffRole: action.staffRole as ProClubStaffRole },
    };
  }
  if (["DEACTIVATE", "REACTIVATE", "MARK_LEFT"].includes(action.type) && Object.keys(action).length === 1) {
    return {
      clubId: record.clubId,
      targetUid: record.targetUid,
      action: { type: action.type as "DEACTIVATE" | "REACTIVATE" | "MARK_LEFT" },
    };
  }
  throw new ProClubStaffManagementServiceError(
    STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
    "Request body is invalid.",
  );
}

function parseClub(value: unknown): { status: "ACTIVE" | "INACTIVE" } {
  const record = asRecord(value);
  if (!record || (record.status !== "ACTIVE" && record.status !== "INACTIVE")) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical club data is invalid.",
    );
  }
  return { status: record.status };
}

function parseMembership(value: unknown): {
  authorizationRole: ProClubAuthorizationRole;
  status: ProClubMembershipStatus;
} {
  const record = asRecord(value);
  if (!record) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical membership data is invalid.",
    );
  }
  const role = record.authorizationRole;
  const status = record.status;
  if (
    !["OWNER", "ADMIN", "MEMBER"].includes(role as string) ||
    !["ACTIVE", "INACTIVE", "LEFT", "REVOKED"].includes(status as string)
  ) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical membership data is invalid.",
    );
  }
  return {
    authorizationRole: role as ProClubAuthorizationRole,
    status: status as ProClubMembershipStatus,
  };
}

function parseStaff(value: unknown): {
  staffRole: ProClubStaffRole;
  status: ProClubStaffStatus;
} {
  const record = asRecord(value);
  if (!record) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical staff data is invalid.",
    );
  }
  const role = record.staffRole;
  const status = record.status;
  if (
    ![
      "TECHNICAL_DIRECTOR", "MANAGER", "HEAD_COACH", "ASSISTANT_COACH",
      "GK_COACH", "FITNESS_COACH", "ANALYST", "PHYSIO", "TEAM_MANAGER", "STAFF",
    ].includes(role as string) ||
    !["ACTIVE", "INACTIVE", "LEFT"].includes(status as string)
  ) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical staff data is invalid.",
    );
  }
  return { staffRole: role as ProClubStaffRole, status: status as ProClubStaffStatus };
}

function mapTransitionError(error: ProClubStaffManagementTransitionError): never {
  switch (error.code) {
    case "REVIEWER_REQUIRED":
    case "OWNER_ACTION_REQUIRED":
    case "OWNER_TARGET_PROTECTED":
    case "SELF_MANAGEMENT_BLOCKED":
      throw new ProClubStaffManagementServiceError(
        STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN,
        "Staff management authority required.",
      );
    case "INVALID_TRANSITION":
    case "NO_CHANGE":
      throw new ProClubStaffManagementServiceError(
        STAFF_MANAGEMENT_ERROR_CODES.CONFLICT,
        "Staff management state changed or action is not applicable.",
      );
    default:
      throw new ProClubStaffManagementServiceError(
        STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
        "Staff management request is invalid.",
      );
  }
}

export function createProClubStaffManagementServiceV1(
  source: ProClubStaffManagementSourceV1,
): ProClubStaffManagementServiceV1 {
  return {
    async manageStaff({ requesterUid, requestBody }) {
      if (!isIdentifier(requesterUid)) {
        throw new ProClubStaffManagementServiceError(
          STAFF_MANAGEMENT_ERROR_CODES.UNAUTHORIZED,
          "Authentication required.",
        );
      }
      const request = parseRequest(requestBody);

      const clubRaw = await source.readClub(request.clubId);
      if (clubRaw === null) {
        throw new ProClubStaffManagementServiceError(
          STAFF_MANAGEMENT_ERROR_CODES.NOT_FOUND,
          "Club is unavailable.",
        );
      }
      const club = parseClub(clubRaw);
      if (club.status !== "ACTIVE") {
        throw new ProClubStaffManagementServiceError(
          STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN,
          "Staff management authority required.",
        );
      }

      const actorMembershipRaw = await source.readMembership(request.clubId, requesterUid);
      if (actorMembershipRaw === null) {
        throw new ProClubStaffManagementServiceError(
          STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN,
          "Staff management authority required.",
        );
      }
      const actorMembership = parseMembership(actorMembershipRaw);

      const [targetMembershipRaw, targetStaffRaw] = await Promise.all([
        source.readMembership(request.clubId, request.targetUid),
        source.readStaffAssignment(request.clubId, request.targetUid),
      ]);
      if (targetMembershipRaw === null || targetStaffRaw === null) {
        throw new ProClubStaffManagementServiceError(
          STAFF_MANAGEMENT_ERROR_CODES.NOT_FOUND,
          "Staff target is unavailable.",
        );
      }
      const targetMembership = parseMembership(targetMembershipRaw);
      const targetStaff = parseStaff(targetStaffRaw);

      let plan: ProClubStaffManagementPlanV1;
      try {
        plan = planProClubStaffManagementTransitionV1(
          {
            clubId: request.clubId,
            actorUid: requesterUid,
            authorizationRole: actorMembership.authorizationRole,
            membershipStatus: actorMembership.status,
          },
          {
            clubId: request.clubId,
            userId: request.targetUid,
            authorizationRole: targetMembership.authorizationRole,
            membershipStatus: targetMembership.status,
            staffRole: targetStaff.staffRole,
            staffStatus: targetStaff.status,
          },
          request.action,
        );
      } catch (error) {
        if (error instanceof ProClubStaffManagementTransitionError) {
          mapTransitionError(error);
        }
        throw error;
      }

      await source.applyAtomicPlan({
        clubId: request.clubId,
        targetUid: request.targetUid,
        requesterUid,
        plan,
      });
      return plan;
    },
  };
}
