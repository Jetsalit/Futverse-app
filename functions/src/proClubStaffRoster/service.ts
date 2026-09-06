import {
  ProClubStaffRosterError,
  STAFF_ROSTER_ERROR_CODES,
  isValidDocumentIdentifier,
  normalizeRosterDisplayName,
  parseCanonicalMembership,
  parseCanonicalStaffAssignment,
  sortRosterEntries,
  validateRosterRequest,
  type ProClubStaffRosterEntryV1,
  type ProClubStaffRosterResponseV1,
} from "./core.ts";

export interface ProClubStaffRosterDocument {
  id: string;
  data: unknown;
}

export interface ProClubStaffRosterDataSource {
  readClub(clubId: string): Promise<unknown | null>;
  readMembership(clubId: string, uid: string): Promise<unknown | null>;
  listStaffAssignments(clubId: string): Promise<readonly ProClubStaffRosterDocument[]>;
  readUser(uid: string): Promise<unknown | null>;
}

export interface LoadProClubStaffRosterRequest {
  requesterUid?: string;
  requestBody: unknown;
}

const MAX_ROSTER_ENTRIES_V1 = 200;

function assertActiveReviewer(
  club: unknown,
  requesterMembership: unknown,
): void {
  if (!club || typeof club !== "object" || Array.isArray(club)) {
    throw new ProClubStaffRosterError(STAFF_ROSTER_ERROR_CODES.FORBIDDEN, "Forbidden");
  }
  const clubRecord = club as Record<string, unknown>;
  if (clubRecord.status !== "ACTIVE") {
    throw new ProClubStaffRosterError(STAFF_ROSTER_ERROR_CODES.FORBIDDEN, "Forbidden");
  }

  const membership = parseCanonicalMembership(requesterMembership);
  if (
    membership.status !== "ACTIVE" ||
    (membership.authorizationRole !== "OWNER" && membership.authorizationRole !== "ADMIN")
  ) {
    throw new ProClubStaffRosterError(STAFF_ROSTER_ERROR_CODES.FORBIDDEN, "Forbidden");
  }
}

function displayNameFromCanonicalUser(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return normalizeRosterDisplayName(record.name) ?? normalizeRosterDisplayName(record.displayName);
}

export class ProClubStaffRosterService {
  constructor(private readonly dataSource: ProClubStaffRosterDataSource) {}

  async loadRoster(
    request: LoadProClubStaffRosterRequest,
  ): Promise<ProClubStaffRosterResponseV1> {
    if (!isValidDocumentIdentifier(request.requesterUid)) {
      throw new ProClubStaffRosterError(
        STAFF_ROSTER_ERROR_CODES.UNAUTHORIZED,
        "Authentication required.",
      );
    }

    const { clubId } = validateRosterRequest(request.requestBody);

    // Re-read canonical club + requester membership on every call.
    const [club, requesterMembership] = await Promise.all([
      this.dataSource.readClub(clubId),
      this.dataSource.readMembership(clubId, request.requesterUid),
    ]);

    if (requesterMembership === null) {
      throw new ProClubStaffRosterError(STAFF_ROSTER_ERROR_CODES.FORBIDDEN, "Forbidden");
    }
    assertActiveReviewer(club, requesterMembership);

    // Admin SDK/server data source may enumerate canonical staff documents even though
    // client Firestore Rules deliberately keep allow list: false.
    const assignments = await this.dataSource.listStaffAssignments(clubId);
    if (assignments.length > MAX_ROSTER_ENTRIES_V1) {
      throw new ProClubStaffRosterError(
        STAFF_ROSTER_ERROR_CODES.TOO_MANY_RESULTS,
        "Roster exceeds the V1 result limit.",
      );
    }

    const entries: ProClubStaffRosterEntryV1[] = [];
    for (const assignmentDocument of assignments) {
      if (!isValidDocumentIdentifier(assignmentDocument.id)) {
        throw new ProClubStaffRosterError(
          STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
          "Canonical staff document identity is invalid.",
        );
      }

      const assignment = parseCanonicalStaffAssignment(assignmentDocument.data);
      const membershipValue = await this.dataSource.readMembership(clubId, assignmentDocument.id);
      if (membershipValue === null) {
        throw new ProClubStaffRosterError(
          STAFF_ROSTER_ERROR_CODES.INVALID_DATA,
          "Canonical staff membership is missing.",
        );
      }
      const membership = parseCanonicalMembership(membershipValue);

      // Active reviewer roster is active-only; historical canonical records remain untouched.
      if (assignment.status !== "ACTIVE" || membership.status !== "ACTIVE") continue;

      const user = await this.dataSource.readUser(assignmentDocument.id);
      entries.push({
        schemaVersion: 1,
        clubId,
        userId: assignmentDocument.id,
        displayName: displayNameFromCanonicalUser(user),
        authorizationRole: membership.authorizationRole,
        membershipStatus: membership.status,
        staffRole: assignment.staffRole,
        staffStatus: assignment.status,
      });
    }

    return {
      schemaVersion: 1,
      clubId,
      entries: sortRosterEntries(entries),
    };
  }
}

export function createProClubStaffRosterService(
  dataSource: ProClubStaffRosterDataSource,
): ProClubStaffRosterService {
  return new ProClubStaffRosterService(dataSource);
}
