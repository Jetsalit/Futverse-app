import { createHash } from "node:crypto";

export const SERVER_TIMESTAMP_PLACEHOLDER = "<SERVER_TIMESTAMP_PLACEHOLDER>";
export const MIGRATION_ACTOR_PLACEHOLDER = "<MIGRATION_ACTOR_UID>";

export type TenantRole = "ADMIN" | "COACH";
export type BlockerCode =
  | "DUPLICATE_INVITE_CODE"
  | "INVALID_INVITE_CODE"
  | "MISSING_INVITE_CODE"
  | "INVITE_REGISTRY_CONFLICT"
  | "MISSING_UID"
  | "MISSING_ACADEMY_POINTER"
  | "ACADEMY_NOT_FOUND"
  | "ACADEMY_POINTER_CONFLICT"
  | "UNSUPPORTED_ROLE"
  | "ROLE_CONFLICT"
  | "USER_NOT_ACTIVE"
  | "EXISTING_MEMBERSHIP_CONFLICT"
  | "MULTIPLE_ACADEMY_ASSIGNMENTS"
  | "DISPLAY_NAME_ONLY_MAPPING"
  | "INVALID_EXISTING_MEMBERSHIP"
  | "DUPLICATE_UID"
  | "DUPLICATE_ACADEMY_ID"
  | "CONFLICTING_USER_IDENTITY"
  | "DUPLICATE_MEMBERSHIP_PATH";

export interface OfflineAcademy {
  id: string;
  name: string;
  inviteCode?: string | null;
  status?: string;
}

export interface OfflineUser {
  uid?: string | null;
  id?: string | null;
  email?: string;
  name?: string;
  role?: string | null;
  requestedRole?: string | null;
  status?: string | null;
  academyId?: string | null;
  activeAcademyId?: string | null;
  tenantRole?: string | null;
  academyName?: string | null;
  requestedAcademyName?: string | null;
  deleted?: boolean;
  disabled?: boolean;
}

export interface OfflineMembership {
  userId?: string;
  academyId?: string;
  role?: string;
  status?: string;
  source?: string;
  approvalClaimId?: string;
}

export interface OfflineAcademyInvite {
  inviteCode?: string;
  academyId?: string;
  status?: string;
}

export interface OfflineExport {
  exportedAt: string;
  academies: OfflineAcademy[];
  users: OfflineUser[];
  memberships: OfflineMembership[];
  academyInvites: OfflineAcademyInvite[];
}

export interface Blocker {
  code: BlockerCode;
  entityType: "ACADEMY" | "USER" | "MEMBERSHIP" | "ACADEMY_INVITE" | "INPUT";
  entityId: string;
  reviewLabel: string;
  currentValues: Record<string, unknown>;
  reason: string;
  recommendedManualAction: string;
}

export interface ProposedWrite<T extends Record<string, unknown>> {
  path: string;
  data: T;
  review: Record<string, string>;
}

export interface ClassifiedRecord {
  classification: "ALREADY_SATISFIED" | "MANUAL_REVIEW";
  entityType: "ACADEMY_INVITE" | "MEMBERSHIP";
  entityId: string;
  path: string;
  reason: string;
  currentValues: Record<string, unknown>;
}

export interface DryRunSummary {
  sensitive: true;
  notice: string;
  generatedAt: string;
  inputSha256: string;
  academyCount: number;
  userCount: number;
  inviteRecordsProposed: number;
  membershipsProposed: number;
  alreadySatisfiedRecords: number;
  manualReviewRecords: number;
  blockerCounts: Record<string, number>;
  safeToProceed: boolean;
}

export interface DryRunResult {
  summary: DryRunSummary;
  academyInvitePlan: ProposedWrite<Record<string, unknown>>[];
  membershipBackfillPlan: ProposedWrite<Record<string, unknown>>[];
  alreadySatisfied: ClassifiedRecord[];
  manualReview: ClassifiedRecord[];
  blockers: Blocker[];
}

export class InputValidationError extends Error {
  readonly issues: Blocker[];

  constructor(message: string, issues: Blocker[] = []) {
    super(message);
    this.name = "InputValidationError";
    this.issues = issues;
  }
}

const SUPPORTED_ROLES = new Set<TenantRole>(["ADMIN", "COACH"]);
const VALID_MEMBERSHIP_STATUSES = new Set([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "LEFT",
  "REVOKED",
]);
const VALID_MEMBERSHIP_SOURCES = new Set([
  "CLAIM_APPROVAL",
  "SUPERADMIN_ASSIGNMENT",
  "LEGACY_MIGRATION",
  "INVITE",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null
      && typeof value === "object"
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype
    ? value as Record<string, unknown>
    : null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUpper(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

export function isExactFirestoreIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value !== "."
    && value !== ".."
    && !value.includes("/")
    && value.trim() === value
    && Buffer.byteLength(value, "utf8") <= 1_500;
}

export function normalizeInviteCode(value: unknown): string {
  return normalizeUpper(value);
}

export function isValidInviteCode(value: string): boolean {
  return value.length <= 32 && /^FUT-[A-Z0-9-]+$/.test(value);
}

export function sha256Text(raw: string | Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}

function inputBlocker(
  code: "DUPLICATE_UID" | "DUPLICATE_ACADEMY_ID",
  entityId: string,
  reason: string,
): Blocker {
  return {
    code,
    entityType: "INPUT",
    entityId,
    reviewLabel: entityId,
    currentValues: { entityId },
    reason,
    recommendedManualAction: "Remove or reconcile duplicate input records before rerunning.",
  };
}

function presentIdentifier(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function assertExactIdentifier(value: unknown, location: string): asserts value is string {
  if (!isExactFirestoreIdentifier(value)) {
    throw new InputValidationError(
      `${location} must be an exact Firestore identifier: a trimmed non-empty string without /, . or .., up to 1,500 UTF-8 bytes.`,
    );
  }
}

function userIdentifier(user: OfflineUser): string {
  if (presentIdentifier(user.uid)) return user.uid as string;
  if (presentIdentifier(user.id)) return user.id as string;
  return "";
}

export function parseOfflineExport(raw: string): OfflineExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new InputValidationError(
      `Malformed JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const record = asRecord(parsed);
  if (!record) throw new InputValidationError("Input root must be a JSON object.");
  const arrayFields = ["academies", "users", "memberships", "academyInvites"] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(record[field])) {
      throw new InputValidationError(`Input field ${field} must be an array.`);
    }
    for (const [index, item] of record[field].entries()) {
      if (!asRecord(item)) {
        throw new InputValidationError(
          `Input field ${field}[${index}] must be a plain, non-null object.`,
        );
      }
    }
  }
  if (typeof record.exportedAt !== "string") {
    throw new InputValidationError("Input field exportedAt must be a string.");
  }

  const academies = record.academies as OfflineAcademy[];
  const users = record.users as OfflineUser[];
  const fatalIssues: Blocker[] = [];
  const academyIds = new Set<string>();
  for (const [index, academy] of academies.entries()) {
    assertExactIdentifier(academy.id, `academies[${index}].id`);
    const academyId = academy.id;
    if (academyIds.has(academyId)) {
      fatalIssues.push(inputBlocker(
        "DUPLICATE_ACADEMY_ID",
        academyId,
        `Academy document ID ${academyId} appears more than once.`,
      ));
    }
    academyIds.add(academyId);
  }

  const userIds = new Set<string>();
  for (const [index, user] of users.entries()) {
    const hasUid = presentIdentifier(user.uid);
    const hasId = presentIdentifier(user.id);
    if (hasUid) assertExactIdentifier(user.uid, `users[${index}].uid`);
    if (hasId) assertExactIdentifier(user.id, `users[${index}].id`);
    if (presentIdentifier(user.academyId)) {
      assertExactIdentifier(user.academyId, `users[${index}].academyId`);
    }
    if (presentIdentifier(user.activeAcademyId)) {
      assertExactIdentifier(user.activeAcademyId, `users[${index}].activeAcademyId`);
    }
    if (hasUid && hasId && user.uid !== user.id) {
      const label = reviewLabel(user);
      fatalIssues.push({
        code: "CONFLICTING_USER_IDENTITY",
        entityType: "INPUT",
        entityId: label,
        reviewLabel: label,
        currentValues: { uid: user.uid, id: user.id, email: user.email ?? null, name: user.name ?? null },
        reason: "User uid and id are both present but are not exactly equal.",
        recommendedManualAction: "Determine the authoritative Firebase Auth UID and make uid and id exactly equal before rerunning.",
      });
      continue;
    }
    const uid = userIdentifier(user);
    if (!uid) continue;
    if (userIds.has(uid)) {
      fatalIssues.push(inputBlocker(
        "DUPLICATE_UID",
        uid,
        `User UID ${uid} appears more than once.`,
      ));
    }
    userIds.add(uid);
  }

  const membershipPathRecords = new Map<string, Array<{ index: number; record: OfflineMembership }>>();
  const memberships = record.memberships as OfflineMembership[];
  for (const [index, membership] of memberships.entries()) {
    if (isExactFirestoreIdentifier(membership.academyId)
      && isExactFirestoreIdentifier(membership.userId)) {
      const path = `academies/${membership.academyId}/members/${membership.userId}`;
      const pathRecords = membershipPathRecords.get(path) || [];
      pathRecords.push({ index, record: membership });
      membershipPathRecords.set(path, pathRecords);
    }
  }
  for (const [path, pathRecords] of membershipPathRecords) {
    if (pathRecords.length < 2) continue;
    fatalIssues.push({
      code: "DUPLICATE_MEMBERSHIP_PATH",
      entityType: "INPUT",
      entityId: path,
      reviewLabel: path,
      currentValues: {
        path,
        records: pathRecords.map(({ index, record: membership }) => ({ index, record: membership })),
      },
      reason: "Multiple exported Membership records resolve to the same Firestore document path.",
      recommendedManualAction: "Recreate the export so each Firestore Membership path appears exactly once.",
    });
  }

  const academyInvites = record.academyInvites as OfflineAcademyInvite[];
  for (const [index, invite] of academyInvites.entries()) {
    if (presentIdentifier(invite.academyId)) {
      assertExactIdentifier(invite.academyId, `academyInvites[${index}].academyId`);
    }
  }
  if (fatalIssues.length > 0) {
    throw new InputValidationError("Fatal input-integrity conflicts make the input unsafe.", fatalIssues);
  }

  return {
    exportedAt: record.exportedAt,
    academies,
    users,
    memberships,
    academyInvites,
  };
}

function blockerKey(blocker: Blocker): string {
  return [blocker.code, blocker.entityType, blocker.entityId, blocker.reason].join("|");
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

function compareBlockers(a: Blocker, b: Blocker): number {
  return compareText(a.code, b.code)
    || compareText(a.entityType, b.entityType)
    || compareText(a.entityId, b.entityId)
    || compareText(a.reason, b.reason);
}

function compareClassified(a: ClassifiedRecord, b: ClassifiedRecord): number {
  return compareText(a.entityType, b.entityType)
    || compareText(a.entityId, b.entityId)
    || compareText(a.path, b.path);
}

function reviewLabel(user: OfflineUser): string {
  return normalizeText(user.email) || normalizeText(user.name) || userIdentifier(user) || "UNKNOWN_USER";
}

function membershipIsStructurallyValid(membership: OfflineMembership): boolean {
  const role = normalizeUpper(membership.role);
  const status = normalizeUpper(membership.status);
  const source = normalizeUpper(membership.source);
  if (!isExactFirestoreIdentifier(membership.userId)
    || !isExactFirestoreIdentifier(membership.academyId)) return false;
  if (!SUPPORTED_ROLES.has(role as TenantRole)) return false;
  if (!VALID_MEMBERSHIP_STATUSES.has(status) || !VALID_MEMBERSHIP_SOURCES.has(source)) return false;
  if (source === "CLAIM_APPROVAL" && !isExactFirestoreIdentifier(membership.approvalClaimId)) return false;
  if (source !== "CLAIM_APPROVAL" && normalizeText(membership.approvalClaimId)) return false;
  return true;
}

export function planDryRun(
  input: OfflineExport,
  inputSha256: string,
  generatedAt = new Date().toISOString(),
): DryRunResult {
  const academyInvitePlan: ProposedWrite<Record<string, unknown>>[] = [];
  const membershipBackfillPlan: ProposedWrite<Record<string, unknown>>[] = [];
  const alreadySatisfied: ClassifiedRecord[] = [];
  const manualReview: ClassifiedRecord[] = [];
  const blockers: Blocker[] = [];
  const blockerKeys = new Set<string>();
  const addBlocker = (blocker: Blocker) => {
    const key = blockerKey(blocker);
    if (!blockerKeys.has(key)) {
      blockerKeys.add(key);
      blockers.push(blocker);
    }
  };

  const academies = [...input.academies].sort((a, b) => compareText(a.id, b.id));
  const academyById = new Map(academies.map((academy) => [academy.id, academy]));
  const inviteGroups = new Map<string, OfflineAcademy[]>();

  for (const academy of academies) {
    const code = normalizeInviteCode(academy.inviteCode);
    if (!code) {
      addBlocker({
        code: "MISSING_INVITE_CODE",
        entityType: "ACADEMY",
        entityId: academy.id,
        reviewLabel: academy.name || academy.id,
        currentValues: { inviteCode: academy.inviteCode ?? null },
        reason: "Academy has no invite code.",
        recommendedManualAction: "Assign and approve a unique canonical FUT- invite code.",
      });
      continue;
    }
    if (!isValidInviteCode(code)) {
      addBlocker({
        code: "INVALID_INVITE_CODE",
        entityType: "ACADEMY",
        entityId: academy.id,
        reviewLabel: academy.name || academy.id,
        currentValues: { inviteCode: academy.inviteCode, normalizedInviteCode: code },
        reason: "Invite code is not FUT-[A-Z0-9-]+ or exceeds 32 characters.",
        recommendedManualAction: "Choose a valid unique code; do not truncate the existing value.",
      });
      continue;
    }
    const group = inviteGroups.get(code) || [];
    group.push(academy);
    inviteGroups.set(code, group);
  }

  const registryGroups = new Map<string, OfflineAcademyInvite[]>();
  for (const registry of input.academyInvites) {
    const code = normalizeInviteCode(registry.inviteCode);
    if (!code || !isValidInviteCode(code)) {
      addBlocker({
        code: "INVALID_INVITE_CODE",
        entityType: "ACADEMY_INVITE",
        entityId: code || "MISSING_INVITE_CODE",
        reviewLabel: code || "MISSING_INVITE_CODE",
        currentValues: {
          inviteCode: registry.inviteCode ?? null,
          academyId: registry.academyId ?? null,
          status: registry.status ?? null,
        },
        reason: "Existing registry record has a missing or invalid canonical invite code.",
        recommendedManualAction: "Inspect and repair the exported registry record manually.",
      });
      continue;
    }
    const group = registryGroups.get(code) || [];
    group.push(registry);
    registryGroups.set(code, group);
  }

  for (const [code, group] of [...inviteGroups.entries()].sort(([a], [b]) => compareText(a, b))) {
    if (group.length > 1) {
      for (const academy of group) {
        addBlocker({
          code: "DUPLICATE_INVITE_CODE",
          entityType: "ACADEMY",
          entityId: academy.id,
          reviewLabel: academy.name || academy.id,
          currentValues: { normalizedInviteCode: code, academyIds: group.map((item) => item.id).sort() },
          reason: `Normalized invite code ${code} belongs to multiple Academies.`,
          recommendedManualAction: "Assign unique codes and review all affected Claims before continuing.",
        });
      }
      continue;
    }

    const academy = group[0];
    const registryRecords = registryGroups.get(code) || [];
    const registryConflict = registryRecords.length > 1
      || registryRecords.some((record) => record.academyId !== academy.id)
      || registryRecords.some((record) => !["ACTIVE", "REVOKED"].includes(normalizeUpper(record.status)));
    if (registryConflict) {
      addBlocker({
        code: "INVITE_REGISTRY_CONFLICT",
        entityType: "ACADEMY_INVITE",
        entityId: code,
        reviewLabel: academy.name || academy.id,
        currentValues: {
          academyId: academy.id,
          registryRecords: registryRecords.map((record) => ({
            academyId: record.academyId ?? null,
            status: record.status ?? null,
          })),
        },
        reason: "Existing registry mapping is ambiguous, invalid, or points to another Academy.",
        recommendedManualAction: "Resolve the registry ownership conflict without overwriting either Academy silently.",
      });
      continue;
    }
    if (registryRecords.length === 1) {
      const registry = registryRecords[0];
      if (normalizeUpper(registry.status) === "ACTIVE") {
        alreadySatisfied.push({
          classification: "ALREADY_SATISFIED",
          entityType: "ACADEMY_INVITE",
          entityId: code,
          path: `academy_invites/${code}`,
          reason: "Canonical ACTIVE invite registry record already matches the Academy.",
          currentValues: { inviteCode: code, academyId: academy.id, status: "ACTIVE" },
        });
      } else {
        const classified: ClassifiedRecord = {
          classification: "MANUAL_REVIEW",
          entityType: "ACADEMY_INVITE",
          entityId: code,
          path: `academy_invites/${code}`,
          reason: "Registry record is REVOKED while the Academy export still references the code.",
          currentValues: { inviteCode: code, academyId: academy.id, status: "REVOKED" },
        };
        manualReview.push(classified);
        addBlocker({
          code: "INVITE_REGISTRY_CONFLICT",
          entityType: "ACADEMY_INVITE",
          entityId: code,
          reviewLabel: academy.name || academy.id,
          currentValues: classified.currentValues,
          reason: classified.reason,
          recommendedManualAction: "Confirm whether the code should remain revoked or be replaced with a new code.",
        });
      }
      continue;
    }

    academyInvitePlan.push({
      path: `academy_invites/${code}`,
      data: {
        inviteCode: code,
        academyId: academy.id,
        status: "ACTIVE",
        createdAt: SERVER_TIMESTAMP_PLACEHOLDER,
        createdBy: MIGRATION_ACTOR_PLACEHOLDER,
        updatedAt: SERVER_TIMESTAMP_PLACEHOLDER,
        updatedBy: MIGRATION_ACTOR_PLACEHOLDER,
      },
      review: { academyName: academy.name || "", academyId: academy.id },
    });
  }

  for (const [code, records] of registryGroups) {
    if (!inviteGroups.has(code)) {
      for (const record of records) {
        addBlocker({
          code: "INVITE_REGISTRY_CONFLICT",
          entityType: "ACADEMY_INVITE",
          entityId: code,
          reviewLabel: typeof record.academyId === "string" ? record.academyId : code,
          currentValues: {
            inviteCode: code,
            academyId: record.academyId ?? null,
            status: record.status ?? null,
          },
          reason: "Registry record has no matching Academy invite code in the offline export.",
          recommendedManualAction: "Confirm whether the registry record is stale, revoked, or missing an Academy export record.",
        });
      }
    }
  }

  const validMemberships: OfflineMembership[] = [];
  const invalidMembershipUserIds = new Set<string>();
  for (const membership of input.memberships) {
    if (!membershipIsStructurallyValid(membership)) {
      const invalidMembershipUserId = isExactFirestoreIdentifier(membership.userId)
        ? membership.userId
        : "";
      if (invalidMembershipUserId) invalidMembershipUserIds.add(invalidMembershipUserId);
      const entityId = `${isExactFirestoreIdentifier(membership.userId) ? membership.userId : "MISSING_UID"}@${isExactFirestoreIdentifier(membership.academyId) ? membership.academyId : "MISSING_ACADEMY"}`;
      addBlocker({
        code: "INVALID_EXISTING_MEMBERSHIP",
        entityType: "MEMBERSHIP",
        entityId,
        reviewLabel: entityId,
        currentValues: {
          userId: membership.userId ?? null,
          academyId: membership.academyId ?? null,
          role: membership.role ?? null,
          status: membership.status ?? null,
          source: membership.source ?? null,
          approvalClaimId: membership.approvalClaimId ?? null,
        },
        reason: "Existing Membership does not satisfy the Membership schema contract.",
        recommendedManualAction: "Repair or explicitly exclude the invalid Membership before planning writes.",
      });
      continue;
    }
    validMemberships.push(membership);
  }

  const membershipsByUser = new Map<string, OfflineMembership[]>();
  for (const membership of validMemberships) {
    const uid = membership.userId as string;
    const group = membershipsByUser.get(uid) || [];
    group.push(membership);
    membershipsByUser.set(uid, group);
  }

  const users = [...input.users].sort((a, b) => {
    const uidA = userIdentifier(a);
    const uidB = userIdentifier(b);
    return compareText(uidA || reviewLabel(a), uidB || reviewLabel(b));
  });
  for (const user of users) {
    const uid = userIdentifier(user);
    const label = reviewLabel(user);
    if (!isExactFirestoreIdentifier(uid)) {
      addBlocker({
        code: "MISSING_UID",
        entityType: "USER",
        entityId: uid || label,
        reviewLabel: label,
        currentValues: { uid: user.uid ?? null, id: user.id ?? null, email: user.email ?? null },
        reason: "User has no exact UID/document ID.",
        recommendedManualAction: "Resolve the authoritative Firebase Auth UID before considering Membership backfill.",
      });
      continue;
    }

    const globalRole = typeof user.role === "string" ? user.role : "";
    if (!SUPPORTED_ROLES.has(globalRole as TenantRole)) {
      addBlocker({
        code: "UNSUPPORTED_ROLE",
        entityType: "USER",
        entityId: uid,
        reviewLabel: label,
        currentValues: { role: user.role ?? null, requestedRole: user.requestedRole ?? null, tenantRole: user.tenantRole ?? null },
        reason: "Current authoritative global role is not exactly ADMIN or COACH.",
        recommendedManualAction: "Review the current global role manually; requestedRole and tenantRole cannot grant eligibility.",
      });
      continue;
    }
    const role = globalRole as TenantRole;
    const tenantRolePresent = user.tenantRole !== undefined
      && user.tenantRole !== null
      && user.tenantRole !== "";
    if (tenantRolePresent && user.tenantRole !== role) {
      addBlocker({
        code: "ROLE_CONFLICT",
        entityType: "USER",
        entityId: uid,
        reviewLabel: label,
        currentValues: { role: user.role ?? null, requestedRole: user.requestedRole ?? null, tenantRole: user.tenantRole ?? null },
        reason: "tenantRole conflicts with the effective ADMIN/COACH role.",
        recommendedManualAction: "Review and correct the authoritative tenant role manually.",
      });
      continue;
    }

    if (normalizeUpper(user.status) !== "ACTIVE" || user.deleted === true || user.disabled === true) {
      addBlocker({
        code: "USER_NOT_ACTIVE",
        entityType: "USER",
        entityId: uid,
        reviewLabel: label,
        currentValues: { status: user.status ?? null, deleted: user.deleted ?? false, disabled: user.disabled ?? false },
        reason: "User is not clearly active and must not receive an automatic ACTIVE Membership.",
        recommendedManualAction: "Confirm the user's current employment/access status before any backfill.",
      });
      continue;
    }

    const academyId = typeof user.academyId === "string" ? user.academyId : "";
    const activeAcademyId = typeof user.activeAcademyId === "string" ? user.activeAcademyId : "";
    if (academyId && activeAcademyId && academyId !== activeAcademyId) {
      addBlocker({
        code: "ACADEMY_POINTER_CONFLICT",
        entityType: "USER",
        entityId: uid,
        reviewLabel: label,
        currentValues: { academyId, activeAcademyId },
        reason: "academyId and activeAcademyId point to different Academies.",
        recommendedManualAction: "Determine the authoritative Academy assignment manually.",
      });
      continue;
    }
    const proposedAcademyId = activeAcademyId || academyId;
    if (!proposedAcademyId) {
      const displayName = normalizeText(user.academyName || user.requestedAcademyName);
      addBlocker({
        code: displayName ? "DISPLAY_NAME_ONLY_MAPPING" : "MISSING_ACADEMY_POINTER",
        entityType: "USER",
        entityId: uid,
        reviewLabel: label,
        currentValues: {
          academyId: user.academyId ?? null,
          activeAcademyId: user.activeAcademyId ?? null,
          academyName: user.academyName ?? user.requestedAcademyName ?? null,
        },
        reason: displayName
          ? "User has only a display-name Academy reference, which is not authoritative."
          : "User has no Academy document ID pointer.",
        recommendedManualAction: "Resolve an exact existing Academy document ID; never match by display name.",
      });
      continue;
    }
    if (!isExactFirestoreIdentifier(proposedAcademyId) || !academyById.has(proposedAcademyId)) {
      addBlocker({
        code: "ACADEMY_NOT_FOUND",
        entityType: "USER",
        entityId: uid,
        reviewLabel: label,
        currentValues: { academyId, activeAcademyId, proposedAcademyId },
        reason: "User points to an Academy document ID that is missing from the export.",
        recommendedManualAction: "Verify the Academy export and pointer; do not substitute a display name or UID.",
      });
      continue;
    }

    if (invalidMembershipUserIds.has(uid)) {
      continue;
    }

    const existingMemberships = membershipsByUser.get(uid) || [];
    const existingAcademyIds = [...new Set(existingMemberships.map((membership) => membership.academyId as string))];
    if (existingAcademyIds.length > 1) {
      addBlocker({
        code: "MULTIPLE_ACADEMY_ASSIGNMENTS",
        entityType: "USER",
        entityId: uid,
        reviewLabel: label,
        currentValues: { proposedAcademyId, existingAcademyIds: existingAcademyIds.sort() },
        reason: "User has existing Memberships in multiple Academies.",
        recommendedManualAction: "Review all Academy assignments and statuses before selecting any active tenant.",
      });
      continue;
    }
    if (existingMemberships.length > 0) {
      const existing = existingMemberships[0];
      const existingAcademyId = existing.academyId as string;
      const existingRole = normalizeUpper(existing.role);
      const existingStatus = normalizeUpper(existing.status);
      const path = `academies/${existingAcademyId}/members/${uid}`;
      if (existingAcademyId !== proposedAcademyId || existingRole !== role) {
        addBlocker({
          code: "EXISTING_MEMBERSHIP_CONFLICT",
          entityType: "MEMBERSHIP",
          entityId: `${proposedAcademyId}/${uid}`,
          reviewLabel: label,
          currentValues: { proposedAcademyId, proposedRole: role, existingAcademyId, existingRole, existingStatus },
          reason: "Existing Membership conflicts with the proposed Academy or role.",
          recommendedManualAction: "Reconcile the existing Membership and user pointers manually.",
        });
        continue;
      }
      if (existingStatus === "ACTIVE") {
        alreadySatisfied.push({
          classification: "ALREADY_SATISFIED",
          entityType: "MEMBERSHIP",
          entityId: uid,
          path,
          reason: "Identical ACTIVE Membership already exists.",
          currentValues: { userId: uid, academyId: proposedAcademyId, role, status: existingStatus },
        });
      } else {
        const classified: ClassifiedRecord = {
          classification: "MANUAL_REVIEW",
          entityType: "MEMBERSHIP",
          entityId: uid,
          path,
          reason: `Compatible Membership exists with non-ACTIVE status ${existingStatus}.`,
          currentValues: { userId: uid, academyId: proposedAcademyId, role, status: existingStatus },
        };
        manualReview.push(classified);
        addBlocker({
          code: "EXISTING_MEMBERSHIP_CONFLICT",
          entityType: "MEMBERSHIP",
          entityId: `${proposedAcademyId}/${uid}`,
          reviewLabel: label,
          currentValues: classified.currentValues,
          reason: classified.reason,
          recommendedManualAction: "Review the suspension/left/revocation history; never reactivate automatically.",
        });
      }
      continue;
    }

    membershipBackfillPlan.push({
      path: `academies/${proposedAcademyId}/members/${uid}`,
      data: {
        userId: uid,
        academyId: proposedAcademyId,
        role,
        status: "ACTIVE",
        source: "LEGACY_MIGRATION",
        joinedAt: SERVER_TIMESTAMP_PLACEHOLDER,
        joinedBy: MIGRATION_ACTOR_PLACEHOLDER,
        updatedAt: SERVER_TIMESTAMP_PLACEHOLDER,
      },
      review: { email: normalizeText(user.email), name: normalizeText(user.name) },
    });
  }

  academyInvitePlan.sort((a, b) => compareText(String(a.data.academyId), String(b.data.academyId))
    || compareText(String(a.data.inviteCode), String(b.data.inviteCode)));
  membershipBackfillPlan.sort((a, b) => compareText(String(a.data.academyId), String(b.data.academyId))
    || compareText(String(a.data.role), String(b.data.role))
    || compareText(String(a.data.userId), String(b.data.userId)));
  blockers.sort(compareBlockers);
  alreadySatisfied.sort(compareClassified);
  manualReview.sort(compareClassified);

  const blockerCounts: Record<string, number> = {};
  for (const blocker of blockers) blockerCounts[blocker.code] = (blockerCounts[blocker.code] || 0) + 1;
  const orderedBlockerCounts = Object.fromEntries(
    Object.entries(blockerCounts).sort(([a], [b]) => compareText(a, b)),
  );
  const summary: DryRunSummary = {
    sensitive: true,
    notice: "SENSITIVE OFFLINE REVIEW DATA: may contain emails, UIDs, and Academy identifiers.",
    generatedAt,
    inputSha256,
    academyCount: input.academies.length,
    userCount: input.users.length,
    inviteRecordsProposed: academyInvitePlan.length,
    membershipsProposed: membershipBackfillPlan.length,
    alreadySatisfiedRecords: alreadySatisfied.length,
    manualReviewRecords: manualReview.length,
    blockerCounts: orderedBlockerCounts,
    safeToProceed: blockers.length === 0 && manualReview.length === 0,
  };

  return {
    summary,
    academyInvitePlan,
    membershipBackfillPlan,
    alreadySatisfied,
    manualReview,
    blockers,
  };
}

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n") + "\n";
}

export function academyInvitePlanCsv(result: DryRunResult): string {
  return toCsv(
    ["path", "inviteCode", "academyId", "status", "academyName"],
    result.academyInvitePlan.map((item) => ({
      path: item.path,
      inviteCode: item.data.inviteCode,
      academyId: item.data.academyId,
      status: item.data.status,
      academyName: item.review.academyName,
    })),
  );
}

export function membershipPlanCsv(result: DryRunResult): string {
  return toCsv(
    ["path", "userId", "academyId", "role", "status", "source", "email", "name"],
    result.membershipBackfillPlan.map((item) => ({
      path: item.path,
      userId: item.data.userId,
      academyId: item.data.academyId,
      role: item.data.role,
      status: item.data.status,
      source: item.data.source,
      email: item.review.email,
      name: item.review.name,
    })),
  );
}

export function summaryMarkdown(summary: DryRunSummary): string {
  const blockerLines = Object.entries(summary.blockerCounts).length > 0
    ? Object.entries(summary.blockerCounts).map(([code, count]) => `- ${code}: ${count}`).join("\n")
    : "- None";
  return `# Offline Membership Backfill Dry-Run Summary

> **SENSITIVE:** This report may contain emails, UIDs, and Academy identifiers. Keep it offline and access-controlled.

- Generated: ${summary.generatedAt}
- Input SHA-256: \`${summary.inputSha256}\`
- Academies: ${summary.academyCount}
- Users: ${summary.userCount}
- Invite records proposed: ${summary.inviteRecordsProposed}
- Memberships proposed: ${summary.membershipsProposed}
- Already satisfied: ${summary.alreadySatisfiedRecords}
- Manual review: ${summary.manualReviewRecords}
- Safe to proceed: **${summary.safeToProceed ? "YES" : "NO"}**

## Blockers by code

${blockerLines}
`;
}
