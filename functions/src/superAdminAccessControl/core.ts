export type AccessControlErrorCode =
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "FAILED_PRECONDITION"
  | "NOT_FOUND";

export class SuperAdminAccessControlError extends Error {
  constructor(readonly code: AccessControlErrorCode, message: string) {
    super(message);
    this.name = "SuperAdminAccessControlError";
  }
}

export type OrganizationType = "ACADEMY" | "PRO_CLUB";
export type ProClubAction =
  | "ACCESS_ASSIGNED"
  | "STAFF_ROLE_ASSIGNED"
  | "STAFF_ROLE_CHANGED"
  | "ACCESS_REACTIVATED";
export type AcademyAction =
  | "ACADEMY_MEMBERSHIP_ASSIGNED"
  | "ACADEMY_ROLE_CHANGED"
  | "ACCESS_REACTIVATED"
  | "ACADEMY_SPECIALTY_ASSIGNED"
  | "ACADEMY_SPECIALTY_REACTIVATED";
export type AccessAction = ProClubAction | AcademyAction;

export interface ProClubExpectedState {
  membership: { authorizationRole: string; status: string } | null;
  staff: { staffRole: string; status: string } | null;
  pointerExists: boolean;
}

export interface AcademyExpectedState {
  membership: {
    role: string;
    status: string;
    source: string;
    joinedBy: string;
    approvalClaimId?: string;
  } | null;
  specialty: { specialty: string; status: string } | null;
}

interface ManageAccessBase {
  operation: "MANAGE_ACCESS";
  organizationType: OrganizationType;
  organizationId: string;
  targetUid: string;
  presentationModeActive: false;
  expectedActionType: AccessAction | null;
  confirmedActionType: AccessAction | null;
  expectedState: ProClubExpectedState | AcademyExpectedState;
}

export type ManageAccessRequest =
  | (ManageAccessBase & {
      organizationType: "PRO_CLUB";
      desiredStaffRole: string;
    })
  | (ManageAccessBase & {
      organizationType: "ACADEMY";
      desiredAcademyRole: "ADMIN" | "COACH";
      desiredFitnessCoach: boolean;
    });

export interface SetAcademySpecialtyStatusRequest {
  operation: "SET_ACADEMY_SPECIALTY_STATUS";
  organizationId: string;
  targetUid: string;
  nextStatus: "ACTIVE" | "INACTIVE";
}

export type SuperAdminAccessControlRequest =
  | ManageAccessRequest
  | SetAcademySpecialtyStatusRequest;

export interface SuperAdminAccessControlInput {
  actorUid: string;
  request: SuperAdminAccessControlRequest;
}

export interface SuperAdminAccessControlResult {
  actionId: string | null;
  actionType: AccessAction | "ACADEMY_SPECIALTY_DEACTIVATED" | null;
  decisionState: string;
  previousState: unknown;
  newState: unknown;
}

export interface AccessStateDecision<Action extends string> {
  state:
    | "ASSIGN"
    | "ASSIGN_STAFF_ROLE"
    | "CHANGE_ROLE"
    | "REACTIVATE"
    | "SPECIALTY_CHANGE"
    | "ALREADY_ACTIVE"
    | "MANUAL_REVIEW";
  actionType: Action | null;
  requiresConfirmation: boolean;
  reason?: string;
}

export const PRO_CLUB_STAFF_ROLES = [
  "TECHNICAL_DIRECTOR",
  "MANAGER",
  "HEAD_COACH",
  "ASSISTANT_COACH",
  "GK_COACH",
  "FITNESS_COACH",
  "ANALYST",
  "PHYSIO",
  "TEAM_MANAGER",
  "STAFF",
] as const;

const PRO_ACTIONS = [
  "ACCESS_ASSIGNED", "STAFF_ROLE_ASSIGNED", "STAFF_ROLE_CHANGED", "ACCESS_REACTIVATED",
] as const;
const ACADEMY_ACTIONS = [
  "ACADEMY_MEMBERSHIP_ASSIGNED", "ACADEMY_ROLE_CHANGED", "ACCESS_REACTIVATED",
  "ACADEMY_SPECIALTY_ASSIGNED", "ACADEMY_SPECIALTY_REACTIVATED",
] as const;

function invalid(message: string): never {
  throw new SuperAdminAccessControlError("INVALID_ARGUMENT", message);
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function exactString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !value.includes("/");
}

function isAction(value: unknown, actions: readonly string[]): value is AccessAction {
  return value === null || (typeof value === "string" && actions.includes(value));
}

export function parseSuperAdminAccessControlRequest(value: unknown): SuperAdminAccessControlRequest {
  const input = recordOf(value);
  if (!input) invalid("Invalid access-control request.");

  if (input.operation === "SET_ACADEMY_SPECIALTY_STATUS") {
    if (!hasExactKeys(input, ["operation", "organizationId", "targetUid", "nextStatus"])
      || !exactString(input.organizationId)
      || !exactString(input.targetUid)
      || (input.nextStatus !== "ACTIVE" && input.nextStatus !== "INACTIVE")) {
      invalid("Invalid Academy specialty status request.");
    }
    return input as unknown as SetAcademySpecialtyStatusRequest;
  }

  if (input.operation !== "MANAGE_ACCESS" ||
    (input.organizationType !== "ACADEMY" && input.organizationType !== "PRO_CLUB") ||
    !exactString(input.organizationId) || !exactString(input.targetUid) ||
    input.presentationModeActive !== false ||
    !isAction(input.expectedActionType, input.organizationType === "PRO_CLUB" ? PRO_ACTIONS : ACADEMY_ACTIONS) ||
    !isAction(input.confirmedActionType, input.organizationType === "PRO_CLUB" ? PRO_ACTIONS : ACADEMY_ACTIONS) ||
    !recordOf(input.expectedState)) {
    invalid("Invalid access-control request.");
  }

  const baseKeys = [
    "operation", "organizationType", "organizationId", "targetUid", "presentationModeActive",
    "expectedActionType", "confirmedActionType", "expectedState",
  ];
  if (input.organizationType === "PRO_CLUB") {
    if (!hasExactKeys(input, [...baseKeys, "desiredStaffRole"]) ||
      typeof input.desiredStaffRole !== "string" ||
      !PRO_CLUB_STAFF_ROLES.includes(input.desiredStaffRole as typeof PRO_CLUB_STAFF_ROLES[number])) {
      invalid("Choose a canonical Pro Club staff role.");
    }
  } else if (!hasExactKeys(input, [...baseKeys, "desiredAcademyRole", "desiredFitnessCoach"]) ||
    (input.desiredAcademyRole !== "ADMIN" && input.desiredAcademyRole !== "COACH") ||
    typeof input.desiredFitnessCoach !== "boolean") {
    invalid("Choose a canonical Academy role and specialty.");
  }

  return input as unknown as ManageAccessRequest;
}

export function isExactDocumentId(value: unknown): value is string {
  return exactString(value);
}

export function isActiveStatus(value: unknown): boolean {
  return value === "ACTIVE" || value === "Active";
}

export function isCanonicalActiveSuperAdmin(value: unknown, actorUid: string): boolean {
  const actor = recordOf(value);
  return Boolean(actor && (actor.uid === undefined || actor.uid === actorUid) &&
    actor.role === "SUPERADMIN" && isActiveStatus(actor.status));
}

export function isEligibleTarget(value: unknown, targetUid: string, actorUid: string): boolean {
  const target = recordOf(value);
  return Boolean(target && (target.uid === undefined || target.uid === targetUid) &&
    targetUid !== actorUid && target.role !== "SUPERADMIN" && isActiveStatus(target.status));
}

function dateValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (value instanceof Date) return Number.isFinite(value.getTime());
  const candidate = recordOf(value);
  return Boolean(candidate && typeof candidate.toDate === "function");
}

function exactRecordKeys(value: Record<string, unknown>, required: readonly string[], allowed = required): boolean {
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.includes(key));
}

function proClubMembership(value: unknown): { authorizationRole: string; status: string } | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const candidate = recordOf(value);
  if (!candidate || !hasExactKeys(candidate, ["authorizationRole", "status"]) ||
    !["OWNER", "ADMIN", "MEMBER"].includes(String(candidate.authorizationRole)) ||
    !["ACTIVE", "INACTIVE", "LEFT", "REVOKED"].includes(String(candidate.status))) return "INVALID";
  return { authorizationRole: String(candidate.authorizationRole), status: String(candidate.status) };
}

function proClubStaff(value: unknown): { staffRole: string; status: string } | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const candidate = recordOf(value);
  if (!candidate || !hasExactKeys(candidate, ["staffRole", "status"]) ||
    !PRO_CLUB_STAFF_ROLES.includes(candidate.staffRole as typeof PRO_CLUB_STAFF_ROLES[number]) ||
    !["ACTIVE", "INACTIVE", "LEFT"].includes(String(candidate.status))) return "INVALID";
  return { staffRole: String(candidate.staffRole), status: String(candidate.status) };
}

function decision<Action extends string>(
  state: AccessStateDecision<Action>["state"], actionType: Action, requiresConfirmation: boolean, reason?: string,
): AccessStateDecision<Action>;
function decision(
  state: AccessStateDecision<never>["state"], actionType: null, requiresConfirmation: boolean, reason?: string,
): AccessStateDecision<never>;
function decision<Action extends string>(
  state: AccessStateDecision<Action>["state"], actionType: Action | null, requiresConfirmation: boolean, reason?: string,
): AccessStateDecision<Action> {
  return { state, actionType, requiresConfirmation, ...(reason ? { reason } : {}) };
}

export function resolveProClubAccessState(
  membershipValue: unknown, staffValue: unknown, desiredStaffRole: unknown,
): AccessStateDecision<ProClubAction> {
  if (!PRO_CLUB_STAFF_ROLES.includes(desiredStaffRole as typeof PRO_CLUB_STAFF_ROLES[number])) {
    return decision("MANUAL_REVIEW", null, false, "Choose a canonical Pro Club staff role.");
  }
  const membership = proClubMembership(membershipValue);
  const staff = proClubStaff(staffValue);
  if (membership === "INVALID" || staff === "INVALID") return decision("MANUAL_REVIEW", null, false, "The current Pro Club access record is malformed.");
  if (membership === null && staff === null) return decision("ASSIGN", "ACCESS_ASSIGNED", true);
  if (membership === null || membership.authorizationRole !== "MEMBER") return decision("MANUAL_REVIEW", null, false, "Only a canonical MEMBER relationship can use direct staff assignment.");
  if (membership.status === "LEFT" || membership.status === "REVOKED") return decision("MANUAL_REVIEW", null, false, "LEFT and REVOKED Pro Club access requires manual review.");
  if (staff === null && membership.status === "ACTIVE") return decision("ASSIGN_STAFF_ROLE", "STAFF_ROLE_ASSIGNED", true);
  if (staff === null && membership.status === "INACTIVE") return decision("REACTIVATE", "ACCESS_REACTIVATED", true);
  if (staff === null) return decision("MANUAL_REVIEW", null, false, "The Pro Club membership state is not supported.");
  if (staff.status === "LEFT") return decision("MANUAL_REVIEW", null, false, "LEFT staff assignments require manual review.");
  if (membership.status === "INACTIVE" && staff.status === "ACTIVE") return decision("MANUAL_REVIEW", null, false, "Active staff authority conflicts with an inactive membership.");
  if (membership.status === "ACTIVE" && staff.status === "INACTIVE") return decision("REACTIVATE", "ACCESS_REACTIVATED", true);
  if (membership.status === "INACTIVE" && staff.status === "INACTIVE") return decision("REACTIVATE", "ACCESS_REACTIVATED", true);
  if (membership.status !== "ACTIVE" || staff.status !== "ACTIVE") return decision("MANUAL_REVIEW", null, false, "The Pro Club access state is not supported.");
  if (staff.staffRole === desiredStaffRole) return decision("ALREADY_ACTIVE", null, false);
  return decision("CHANGE_ROLE", "STAFF_ROLE_CHANGED", true);
}

const ACADEMY_MEMBERSHIP_REQUIRED = ["userId", "academyId", "role", "status", "source", "joinedAt", "joinedBy", "updatedAt"] as const;
const ACADEMY_MEMBERSHIP_ALLOWED = [...ACADEMY_MEMBERSHIP_REQUIRED, "approvalClaimId"] as const;

export function canonicalAcademyMembership(value: unknown): Record<string, unknown> | null {
  const candidate = recordOf(value);
  if (!candidate || !exactRecordKeys(candidate, ACADEMY_MEMBERSHIP_REQUIRED, ACADEMY_MEMBERSHIP_ALLOWED) ||
    !isExactDocumentId(candidate.userId) || !isExactDocumentId(candidate.academyId) ||
    !isExactDocumentId(candidate.joinedBy) || !["ADMIN", "COACH"].includes(String(candidate.role)) ||
    !["PENDING", "ACTIVE", "SUSPENDED", "LEFT", "REVOKED"].includes(String(candidate.status)) ||
    !["CLAIM_APPROVAL", "SUPERADMIN_ASSIGNMENT", "LEGACY_MIGRATION", "INVITE"].includes(String(candidate.source)) ||
    !dateValue(candidate.joinedAt) || !dateValue(candidate.updatedAt)) return null;
  const hasClaimId = Object.hasOwn(candidate, "approvalClaimId");
  if (candidate.source === "CLAIM_APPROVAL") {
    if (!isExactDocumentId(candidate.approvalClaimId)) return null;
  } else if (hasClaimId) return null;
  return candidate;
}

export function isValidAcademySpecialty(value: unknown): boolean {
  const candidate = recordOf(value);
  return Boolean(candidate && hasExactKeys(candidate, ["schemaVersion", "specialty", "status", "createdAt", "createdBy", "updatedAt", "updatedBy"]) &&
    candidate.schemaVersion === 1 && candidate.specialty === "FITNESS_COACH" &&
    ["ACTIVE", "INACTIVE", "LEFT"].includes(String(candidate.status)) &&
    recordOf(candidate.createdAt) && typeof (candidate.createdAt as { toDate?: unknown }).toDate === "function" &&
    recordOf(candidate.updatedAt) && typeof (candidate.updatedAt as { toDate?: unknown }).toDate === "function" &&
    isExactDocumentId(candidate.createdBy) && isExactDocumentId(candidate.updatedBy));
}

export function resolveAcademyAccessState(
  membershipValue: unknown, specialtyValue: unknown, desiredRole: unknown, desiredFitnessCoach: unknown,
): AccessStateDecision<AcademyAction> {
  if (desiredRole !== "ADMIN" && desiredRole !== "COACH") return decision("MANUAL_REVIEW", null, false, "Choose the canonical Academy ADMIN or COACH role.");
  if (typeof desiredFitnessCoach !== "boolean") return decision("MANUAL_REVIEW", null, false, "The Fitness Coach selection is invalid.");
  const membershipMissing = membershipValue === null || membershipValue === undefined;
  const specialtyMissing = specialtyValue === null || specialtyValue === undefined;
  const membership = membershipMissing ? null : canonicalAcademyMembership(membershipValue);
  if (!membershipMissing && !membership) return decision("MANUAL_REVIEW", null, false, "The current Academy membership is malformed.");
  const specialty = specialtyMissing ? null : isValidAcademySpecialty(specialtyValue) ? recordOf(specialtyValue) : "INVALID";
  if (specialty === "INVALID") return decision("MANUAL_REVIEW", null, false, "The current Academy specialty record is malformed.");
  if (!membership && specialty) return decision("MANUAL_REVIEW", null, false, "An Academy specialty exists without its canonical membership.");
  if (desiredFitnessCoach && desiredRole !== "COACH") return decision("MANUAL_REVIEW", null, false, "FITNESS_COACH requires an Academy COACH membership.");
  if (!membership) return decision("ASSIGN", "ACADEMY_MEMBERSHIP_ASSIGNED", true);
  const specialtyStatus = specialty ? String(specialty.status) : null;
  if (["LEFT", "REVOKED", "PENDING"].includes(String(membership.status))) return decision("MANUAL_REVIEW", null, false, `${membership.status} Academy membership requires manual review.`);
  if (membership.status === "SUSPENDED") {
    if (membership.role !== desiredRole) return decision("MANUAL_REVIEW", null, false, "Reactivate the suspended membership before changing its Academy role.");
    if (specialtyStatus === "ACTIVE" && membership.role !== "COACH") {
      return decision("MANUAL_REVIEW", null, false, "An active Fitness Coach specialty requires an active COACH membership.");
    }
    if (desiredFitnessCoach && specialtyStatus === "LEFT") return decision("MANUAL_REVIEW", null, false, "LEFT Fitness Coach specialties cannot be reactivated.");
    return decision("REACTIVATE", "ACCESS_REACTIVATED", true);
  }
  if (membership.status !== "ACTIVE") return decision("MANUAL_REVIEW", null, false, "The Academy membership state is not supported.");
  if (desiredFitnessCoach && desiredRole === "COACH" && specialtyStatus === "LEFT") return decision("MANUAL_REVIEW", null, false, "LEFT Fitness Coach specialties cannot be reactivated.");
  if (membership.role !== desiredRole) {
    if (desiredRole === "ADMIN" && specialtyStatus === "ACTIVE") return decision("MANUAL_REVIEW", null, false, "Deactivate the active Fitness Coach specialty before changing this membership to ADMIN.");
    return decision("CHANGE_ROLE", "ACADEMY_ROLE_CHANGED", true);
  }
  if (desiredFitnessCoach) {
    if (specialtyStatus === "LEFT") return decision("MANUAL_REVIEW", null, false, "LEFT Fitness Coach specialties cannot be reactivated.");
    if (specialtyStatus === "ACTIVE") return decision("ALREADY_ACTIVE", null, false);
    return decision("SPECIALTY_CHANGE", specialtyStatus === "INACTIVE" ? "ACADEMY_SPECIALTY_REACTIVATED" : "ACADEMY_SPECIALTY_ASSIGNED", true);
  }
  return decision("ALREADY_ACTIVE", null, false);
}

export function validFitnessCoachTransition(
  nextStatus: "ACTIVE" | "INACTIVE", membershipValue: unknown, targetUid: string, academyId: string, currentValue: unknown,
): "CREATE" | "UPDATE" {
  if (!isExactDocumentId(targetUid) || !isExactDocumentId(academyId)) throw new Error("Exact Academy and Coach IDs are required.");
  if (currentValue !== null && !isValidAcademySpecialty(currentValue)) throw new Error("The current specialty record is invalid.");
  const current = recordOf(currentValue);
  if (current?.status === "LEFT") throw new Error("LEFT is a terminal specialty status.");
  if (nextStatus === "ACTIVE") {
    const membership = recordOf(membershipValue);
    if (!membership || membership.userId !== targetUid || membership.academyId !== academyId ||
      membership.role !== "COACH" || membership.status !== "ACTIVE") {
      throw new Error("Assignment requires an exact active Coach membership.");
    }
  }
  if (currentValue === null) {
    if (nextStatus !== "ACTIVE") throw new Error("Deactivation requires an existing assignment.");
    return "CREATE";
  }
  return "UPDATE";
}

export function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return hasExactKeys(value, keys);
}

export function canonicalStateJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    const record = recordOf(item);
    if (!record) return item;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, normalize(record[key])]));
  };
  return JSON.stringify(normalize(value));
}
