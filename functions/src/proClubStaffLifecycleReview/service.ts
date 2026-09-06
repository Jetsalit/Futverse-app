import {
  ProClubStaffRosterError,
  STAFF_ROSTER_ERROR_CODES,
  isProClubAuthorizationRole,
  isProClubMembershipStatus,
  isProClubStaffRole,
  isProClubStaffStatus,
  isValidDocumentIdentifier,
  normalizeRosterDisplayName,
  parseCanonicalMembership,
  parseCanonicalStaffAssignment,
  validateRosterRequest,
  type ProClubAuthorizationRole,
  type ProClubMembershipStatus,
  type ProClubStaffRole,
  type ProClubStaffStatus,
} from "../proClubStaffRoster/core.js";

export const STAFF_LIFECYCLE_REVIEW_ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOO_MANY_RESULTS: "TOO_MANY_RESULTS",
  INVALID_DATA: "INVALID_DATA",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ProClubStaffLifecycleReviewErrorCode =
  (typeof STAFF_LIFECYCLE_REVIEW_ERROR_CODES)[keyof typeof STAFF_LIFECYCLE_REVIEW_ERROR_CODES];

export class ProClubStaffLifecycleReviewError extends Error {
  constructor(readonly code: ProClubStaffLifecycleReviewErrorCode, message: string) {
    super(message);
    this.name = "ProClubStaffLifecycleReviewError";
  }
}

export interface ProClubStaffLifecycleReviewDocumentV1 { id: string; data: unknown; }
export interface ProClubStaffLifecycleReviewSourceV1 {
  readClub(clubId: string): Promise<unknown | null>;
  readMembership(clubId: string, uid: string): Promise<unknown | null>;
  listStaffAssignments(clubId: string): Promise<readonly ProClubStaffLifecycleReviewDocumentV1[]>;
  listHistory(clubId: string): Promise<readonly ProClubStaffLifecycleReviewDocumentV1[]>;
  readUser(uid: string): Promise<unknown | null>;
}

export interface ProClubStaffLifecycleEntryV1 {
  schemaVersion: 1;
  clubId: string;
  userId: string;
  displayName: string | null;
  authorizationRole: ProClubAuthorizationRole;
  membershipStatus: "INACTIVE" | "LEFT";
  staffRole: ProClubStaffRole;
  staffStatus: "INACTIVE" | "LEFT";
}

export interface ProClubStaffLifecycleEventV1 {
  schemaVersion: 1;
  eventId: string;
  clubId: string;
  userId: string;
  action: "CHANGE_ROLE" | "DEACTIVATE" | "REACTIVATE" | "MARK_LEFT";
  previousAuthorizationRole: ProClubAuthorizationRole;
  nextAuthorizationRole: ProClubAuthorizationRole;
  previousMembershipStatus: ProClubMembershipStatus;
  nextMembershipStatus: ProClubMembershipStatus;
  previousStaffRole: ProClubStaffRole;
  nextStaffRole: ProClubStaffRole;
  previousStaffStatus: ProClubStaffStatus;
  nextStaffStatus: ProClubStaffStatus;
  changedAtMs: number;
}

export interface ProClubStaffLifecycleReviewResponseV1 {
  schemaVersion: 1;
  clubId: string;
  inactiveEntries: ProClubStaffLifecycleEntryV1[];
  leftEntries: ProClubStaffLifecycleEntryV1[];
  events: ProClubStaffLifecycleEventV1[];
}

const MAX_STAFF_DOCUMENTS_V1 = 200;
const MAX_HISTORY_EVENTS_V1 = 500;

function invalidData(message: string): never {
  throw new ProClubStaffLifecycleReviewError(STAFF_LIFECYCLE_REVIEW_ERROR_CODES.INVALID_DATA, message);
}

function mapRosterValidationError(error: unknown): never {
  if (error instanceof ProClubStaffRosterError) {
    if (error.code === STAFF_ROSTER_ERROR_CODES.INVALID_REQUEST) {
      throw new ProClubStaffLifecycleReviewError(
        STAFF_LIFECYCLE_REVIEW_ERROR_CODES.INVALID_REQUEST,
        "A valid clubId is required.",
      );
    }
    return invalidData("Canonical lifecycle source data is invalid.");
  }
  throw error;
}

function assertActiveReviewer(club: unknown, membershipValue: unknown): void {
  if (!club || typeof club !== "object" || Array.isArray(club) || (club as Record<string, unknown>).status !== "ACTIVE") {
    throw new ProClubStaffLifecycleReviewError(STAFF_LIFECYCLE_REVIEW_ERROR_CODES.FORBIDDEN, "Reviewer authority required.");
  }
  let membership: ReturnType<typeof parseCanonicalMembership>;
  try { membership = parseCanonicalMembership(membershipValue); }
  catch (error) { mapRosterValidationError(error); }
  if (
    membership.status !== "ACTIVE" ||
    (membership.authorizationRole !== "OWNER" && membership.authorizationRole !== "ADMIN")
  ) {
    throw new ProClubStaffLifecycleReviewError(STAFF_LIFECYCLE_REVIEW_ERROR_CODES.FORBIDDEN, "Reviewer authority required.");
  }
}

function displayNameFromUser(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return normalizeRosterDisplayName(record.name) ?? normalizeRosterDisplayName(record.displayName);
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidData("Canonical history event is invalid.");
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || !actual.every((key) => keys.includes(key))) {
    return invalidData("Canonical history event is invalid.");
  }
  return record;
}

function parseHistoryEvent(clubId: string, document: ProClubStaffLifecycleReviewDocumentV1): ProClubStaffLifecycleEventV1 {
  const record = exactRecord(document.data, [
    "schemaVersion", "clubId", "userId", "action",
    "previousAuthorizationRole", "nextAuthorizationRole",
    "previousMembershipStatus", "nextMembershipStatus",
    "previousStaffRole", "nextStaffRole",
    "previousStaffStatus", "nextStaffStatus",
    "changedBy", "eventId", "changedAt",
  ]);
  const changedAt = record.changedAt as { toMillis?: () => number } | undefined;
  const changedAtMs = changedAt?.toMillis?.();
  if (
    record.schemaVersion !== 1 || record.clubId !== clubId || record.eventId !== document.id ||
    !isValidDocumentIdentifier(document.id) || !isValidDocumentIdentifier(record.userId) ||
    !isValidDocumentIdentifier(record.changedBy) ||
    !["CHANGE_ROLE", "DEACTIVATE", "REACTIVATE", "MARK_LEFT"].includes(record.action as string) ||
    !isProClubAuthorizationRole(record.previousAuthorizationRole) ||
    !isProClubAuthorizationRole(record.nextAuthorizationRole) ||
    record.previousAuthorizationRole !== record.nextAuthorizationRole ||
    !isProClubMembershipStatus(record.previousMembershipStatus) ||
    !isProClubMembershipStatus(record.nextMembershipStatus) ||
    !isProClubStaffRole(record.previousStaffRole) || !isProClubStaffRole(record.nextStaffRole) ||
    !isProClubStaffStatus(record.previousStaffStatus) || !isProClubStaffStatus(record.nextStaffStatus) ||
    !Number.isFinite(changedAtMs)
  ) return invalidData("Canonical history event is invalid.");

  return {
    schemaVersion: 1,
    eventId: document.id,
    clubId,
    userId: record.userId,
    action: record.action as ProClubStaffLifecycleEventV1["action"],
    previousAuthorizationRole: record.previousAuthorizationRole,
    nextAuthorizationRole: record.nextAuthorizationRole,
    previousMembershipStatus: record.previousMembershipStatus,
    nextMembershipStatus: record.nextMembershipStatus,
    previousStaffRole: record.previousStaffRole,
    nextStaffRole: record.nextStaffRole,
    previousStaffStatus: record.previousStaffStatus,
    nextStaffStatus: record.nextStaffStatus,
    changedAtMs: changedAtMs as number,
  };
}

function sortEntries(entries: ProClubStaffLifecycleEntryV1[]): ProClubStaffLifecycleEntryV1[] {
  return [...entries].sort((a, b) => {
    const nameDiff = (a.displayName ?? "").localeCompare(b.displayName ?? "");
    return nameDiff !== 0 ? nameDiff : a.userId.localeCompare(b.userId);
  });
}

export class ProClubStaffLifecycleReviewServiceV1 {
  constructor(private readonly source: ProClubStaffLifecycleReviewSourceV1) {}

  async loadReview(input: { requesterUid?: string; requestBody: unknown }): Promise<ProClubStaffLifecycleReviewResponseV1> {
    if (!isValidDocumentIdentifier(input.requesterUid)) {
      throw new ProClubStaffLifecycleReviewError(STAFF_LIFECYCLE_REVIEW_ERROR_CODES.UNAUTHORIZED, "Authentication required.");
    }
    let clubId: string;
    try { clubId = validateRosterRequest(input.requestBody).clubId; }
    catch (error) { mapRosterValidationError(error); }

    const [club, actorMembership] = await Promise.all([
      this.source.readClub(clubId),
      this.source.readMembership(clubId, input.requesterUid),
    ]);
    if (actorMembership === null) {
      throw new ProClubStaffLifecycleReviewError(STAFF_LIFECYCLE_REVIEW_ERROR_CODES.FORBIDDEN, "Reviewer authority required.");
    }
    assertActiveReviewer(club, actorMembership);

    const [staffDocuments, historyDocuments] = await Promise.all([
      this.source.listStaffAssignments(clubId),
      this.source.listHistory(clubId),
    ]);
    if (staffDocuments.length > MAX_STAFF_DOCUMENTS_V1 || historyDocuments.length > MAX_HISTORY_EVENTS_V1) {
      throw new ProClubStaffLifecycleReviewError(STAFF_LIFECYCLE_REVIEW_ERROR_CODES.TOO_MANY_RESULTS, "Lifecycle review exceeds the V1 result limit.");
    }

    const knownStaffIds = new Set<string>();
    const inactiveEntries: ProClubStaffLifecycleEntryV1[] = [];
    const leftEntries: ProClubStaffLifecycleEntryV1[] = [];

    for (const document of staffDocuments) {
      if (!isValidDocumentIdentifier(document.id) || knownStaffIds.has(document.id)) {
        return invalidData("Canonical staff document identity is invalid.");
      }
      knownStaffIds.add(document.id);
      let staff: ReturnType<typeof parseCanonicalStaffAssignment>;
      try { staff = parseCanonicalStaffAssignment(document.data); }
      catch (error) { mapRosterValidationError(error); }
      const membershipValue = await this.source.readMembership(clubId, document.id);
      if (membershipValue === null) return invalidData("Canonical staff membership is missing.");
      let membership: ReturnType<typeof parseCanonicalMembership>;
      try { membership = parseCanonicalMembership(membershipValue); }
      catch (error) { mapRosterValidationError(error); }

      if (staff.status === "ACTIVE" && membership.status === "ACTIVE") continue;
      if (!(
        (staff.status === "INACTIVE" && membership.status === "INACTIVE") ||
        (staff.status === "LEFT" && membership.status === "LEFT")
      )) return invalidData("Canonical lifecycle state is not aligned.");

      const user = await this.source.readUser(document.id);
      const entry = {
        schemaVersion: 1 as const,
        clubId,
        userId: document.id,
        displayName: displayNameFromUser(user),
        authorizationRole: membership.authorizationRole,
        membershipStatus: membership.status,
        staffRole: staff.staffRole,
        staffStatus: staff.status,
      };
      if (entry.membershipStatus === "INACTIVE" && entry.staffStatus === "INACTIVE") {
        inactiveEntries.push(entry as ProClubStaffLifecycleEntryV1);
      } else if (entry.membershipStatus === "LEFT" && entry.staffStatus === "LEFT") {
        leftEntries.push(entry as ProClubStaffLifecycleEntryV1);
      }
    }

    const events = historyDocuments.map((document) => parseHistoryEvent(clubId, document));
    for (const event of events) {
      if (!knownStaffIds.has(event.userId)) return invalidData("History event references an unknown staff document.");
    }
    events.sort((a, b) => b.changedAtMs - a.changedAtMs || b.eventId.localeCompare(a.eventId));

    return { schemaVersion: 1, clubId, inactiveEntries: sortEntries(inactiveEntries), leftEntries: sortEntries(leftEntries), events };
  }
}

export function createProClubStaffLifecycleReviewServiceV1(source: ProClubStaffLifecycleReviewSourceV1): ProClubStaffLifecycleReviewServiceV1 {
  return new ProClubStaffLifecycleReviewServiceV1(source);
}
