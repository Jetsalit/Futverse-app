import {
  planProClubStaffManagementTransitionV1,
  ProClubStaffManagementTransitionError,
  type ProClubAuthorizationRole,
  type ProClubMembershipStatus,
  type ProClubStaffManagementActionV1,
  type ProClubStaffManagementPlanV1,
  type ProClubStaffRole,
  type ProClubStaffStatus,
} from "./transition.js";
import type { ProClubStaffManagementRateLimiterV1 } from "./rateLimiter.js";

export const STAFF_MANAGEMENT_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST", UNAUTHORIZED: "UNAUTHORIZED", FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND", CONFLICT: "CONFLICT", RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INVALID_DATA: "INVALID_DATA", INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ProClubStaffManagementErrorCode = (typeof STAFF_MANAGEMENT_ERROR_CODES)[keyof typeof STAFF_MANAGEMENT_ERROR_CODES];
export class ProClubStaffManagementServiceError extends Error {
  constructor(readonly code: ProClubStaffManagementErrorCode, message: string) { super(message); this.name = "ProClubStaffManagementServiceError"; }
}
export interface ProClubStaffManagementRequestV1 { clubId: string; targetUid: string; action: ProClubStaffManagementActionV1; }
export interface ProClubStaffManagementSourceV1 {
  readClub(clubId: string): Promise<unknown | null>;
  readMembership(clubId: string, uid: string): Promise<unknown | null>;
  readStaffAssignment(clubId: string, uid: string): Promise<unknown | null>;
  applyAtomicPlan(input: { clubId: string; targetUid: string; requesterUid: string; plan: ProClubStaffManagementPlanV1 }): Promise<void>;
}
export interface ProClubStaffManagementServiceV1 { manageStaff(input: { requesterUid: string; requestBody: unknown; now?: Date }): Promise<ProClubStaffManagementPlanV1>; }

function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function isIdentifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("/"); }
function invalidRequest(): never { throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST, "Request body is invalid."); }
function parseRequest(value: unknown): ProClubStaffManagementRequestV1 {
  const r = asRecord(value); if (!r) return invalidRequest();
  const keys = Object.keys(r); if (keys.length !== 3 || !keys.every((k) => ["clubId","targetUid","action"].includes(k))) return invalidRequest();
  if (!isIdentifier(r.clubId) || !isIdentifier(r.targetUid)) return invalidRequest();
  const a = asRecord(r.action); if (!a || typeof a.type !== "string") return invalidRequest();
  if (a.type === "CHANGE_ROLE") {
    const ak = Object.keys(a); if (ak.length !== 2 || !ak.every((k) => ["type","staffRole"].includes(k))) return invalidRequest();
    return { clubId: r.clubId, targetUid: r.targetUid, action: { type: "CHANGE_ROLE", staffRole: a.staffRole as ProClubStaffRole } };
  }
  if (["DEACTIVATE","REACTIVATE","MARK_LEFT"].includes(a.type) && Object.keys(a).length === 1) return { clubId: r.clubId, targetUid: r.targetUid, action: { type: a.type as "DEACTIVATE"|"REACTIVATE"|"MARK_LEFT" } };
  return invalidRequest();
}
function parseClub(value: unknown): { status: "ACTIVE"|"INACTIVE" } {
  const r = asRecord(value); if (!r || (r.status !== "ACTIVE" && r.status !== "INACTIVE")) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA, "Canonical club data is invalid.");
  return { status: r.status };
}
function parseMembership(value: unknown): { authorizationRole: ProClubAuthorizationRole; status: ProClubMembershipStatus } {
  const r = asRecord(value); if (!r || !["OWNER","ADMIN","MEMBER"].includes(r.authorizationRole as string) || !["ACTIVE","INACTIVE","LEFT","REVOKED"].includes(r.status as string)) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA, "Canonical membership data is invalid.");
  return { authorizationRole: r.authorizationRole as ProClubAuthorizationRole, status: r.status as ProClubMembershipStatus };
}
function parseStaff(value: unknown): { staffRole: ProClubStaffRole; status: ProClubStaffStatus } {
  const r = asRecord(value); if (!r || !["TECHNICAL_DIRECTOR","MANAGER","HEAD_COACH","ASSISTANT_COACH","GK_COACH","FITNESS_COACH","ANALYST","PHYSIO","TEAM_MANAGER","STAFF"].includes(r.staffRole as string) || !["ACTIVE","INACTIVE","LEFT"].includes(r.status as string)) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA, "Canonical staff data is invalid.");
  return { staffRole: r.staffRole as ProClubStaffRole, status: r.status as ProClubStaffStatus };
}
function mapTransitionError(error: ProClubStaffManagementTransitionError): never {
  if (["REVIEWER_REQUIRED","OWNER_ACTION_REQUIRED","OWNER_TARGET_PROTECTED","SELF_MANAGEMENT_BLOCKED"].includes(error.code)) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN, "Staff management authority required.");
  if (["INVALID_TRANSITION","NO_CHANGE"].includes(error.code)) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.CONFLICT, "Staff management state changed or action is not applicable.");
  throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.INVALID_REQUEST, "Staff management request is invalid.");
}
function createService(source: ProClubStaffManagementSourceV1, rateLimiter?: ProClubStaffManagementRateLimiterV1): ProClubStaffManagementServiceV1 {
  return { async manageStaff({ requesterUid, requestBody, now }) {
    if (!isIdentifier(requesterUid)) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.UNAUTHORIZED, "Authentication required.");
    const request = parseRequest(requestBody);
    const clubRaw = await source.readClub(request.clubId); if (clubRaw === null) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.NOT_FOUND, "Club is unavailable.");
    if (parseClub(clubRaw).status !== "ACTIVE") throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN, "Staff management authority required.");
    const actorRaw = await source.readMembership(request.clubId, requesterUid); if (actorRaw === null) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN, "Staff management authority required.");
    const actor = parseMembership(actorRaw);
    if (actor.status !== "ACTIVE" || (actor.authorizationRole !== "OWNER" && actor.authorizationRole !== "ADMIN")) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN, "Staff management authority required.");
    if (rateLimiter) { const q = await rateLimiter.consumeQuota(requesterUid, now); if (!q.allowed) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.RATE_LIMIT_EXCEEDED, "Too many staff management attempts. Please try again later."); }
    const [memberRaw, staffRaw] = await Promise.all([source.readMembership(request.clubId, request.targetUid), source.readStaffAssignment(request.clubId, request.targetUid)]);
    if (memberRaw === null || staffRaw === null) throw new ProClubStaffManagementServiceError(STAFF_MANAGEMENT_ERROR_CODES.NOT_FOUND, "Staff target is unavailable.");
    const member = parseMembership(memberRaw); const staff = parseStaff(staffRaw);
    let plan: ProClubStaffManagementPlanV1;
    try { plan = planProClubStaffManagementTransitionV1({ clubId: request.clubId, actorUid: requesterUid, authorizationRole: actor.authorizationRole, membershipStatus: actor.status }, { clubId: request.clubId, userId: request.targetUid, authorizationRole: member.authorizationRole, membershipStatus: member.status, staffRole: staff.staffRole, staffStatus: staff.status }, request.action); }
    catch (error) { if (error instanceof ProClubStaffManagementTransitionError) mapTransitionError(error); throw error; }
    await source.applyAtomicPlan({ clubId: request.clubId, targetUid: request.targetUid, requesterUid, plan }); return plan;
  }};
}
export function createProClubStaffManagementServiceV1(source: ProClubStaffManagementSourceV1): ProClubStaffManagementServiceV1 { return createService(source); }
export function createRateLimitedProClubStaffManagementServiceV1(source: ProClubStaffManagementSourceV1, rateLimiter: ProClubStaffManagementRateLimiterV1): ProClubStaffManagementServiceV1 { return createService(source, rateLimiter); }
