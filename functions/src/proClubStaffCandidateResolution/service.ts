import type { Firestore } from "firebase-admin/firestore";
import {
  ProClubStaffCandidateResolutionError,
  RESOLUTION_ERROR_CODES,
  validateAndNormalizeCandidateRequest,
  isValidDocumentIdentifier,
  type ResolvedStaffCandidate,
} from "./core.ts";
import type { ProClubStaffResolutionRateLimiter } from "./rateLimiter.ts";

export interface MinimalUserRecord {
  uid: string;
  email?: string;
  displayName?: string;
  disabled?: boolean;
}

export interface MinimalAdminAuthForResolution {
  getUserByEmail(email: string): Promise<MinimalUserRecord>;
}

export interface ProClubStaffCandidateResolutionServiceDependencies {
  firestore: Firestore;
  auth: MinimalAdminAuthForResolution;
  rateLimiter: ProClubStaffResolutionRateLimiter;
}

export interface ResolveCandidateRequestInput {
  requesterUid?: string;
  requestBody: unknown;
  now?: Date;
}

export class ProClubStaffCandidateResolutionService {
  constructor(
    private readonly dependencies: ProClubStaffCandidateResolutionServiceDependencies,
  ) {}

  async resolveCandidate(
    request: ResolveCandidateRequestInput,
  ): Promise<ResolvedStaffCandidate> {
    const { firestore, auth, rateLimiter } = this.dependencies;

    // 1. Verify caller identity and extract authenticated requester UID
    let requesterUid: string;
    if (
      typeof request.requesterUid === "string" &&
      isValidDocumentIdentifier(request.requesterUid)
    ) {
      requesterUid = request.requesterUid;
    } else {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.UNAUTHORIZED,
        "Unauthorized",
      );
    }

    // 2. Validate and normalize exact input body
    const { clubId, email } = validateAndNormalizeCandidateRequest(
      request.requestBody,
    );

    // 3. Re-read canonical Pro Club authority in Firestore
    // Requester must be an ACTIVE OWNER or ADMIN of an ACTIVE club
    const clubRef = firestore.collection("proClubs").doc(clubId);
    const clubSnap = await clubRef.get();

    if (!clubSnap.exists) {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.FORBIDDEN,
        "Forbidden",
      );
    }

    const clubData = clubSnap.data();
    if (clubData?.status !== "ACTIVE") {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.FORBIDDEN,
        "Forbidden",
      );
    }

    const memberRef = clubRef.collection("members").doc(requesterUid);
    const memberSnap = await memberRef.get();

    if (!memberSnap.exists) {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.FORBIDDEN,
        "Forbidden",
      );
    }

    const memberData = memberSnap.data();
    if (memberData?.status !== "ACTIVE") {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.FORBIDDEN,
        "Forbidden",
      );
    }

    const role = memberData?.authorizationRole;
    if (role !== "OWNER" && role !== "ADMIN") {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.FORBIDDEN,
        "Forbidden",
      );
    }

    // 4. Consume rate-limit quota in durable Firestore transaction BEFORE Auth lookup
    const rateLimitResult = await rateLimiter.consumeQuota(
      requesterUid,
      request.now,
    );
    if (!rateLimitResult.allowed) {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.RATE_LIMIT_EXCEEDED,
        "Too many account verification attempts. Please try again later.",
      );
    }

    // 5. Exact Firebase Auth account lookup by email (no listUsers, no users collection scan)
    let userRecord: MinimalUserRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch {
      // Safe generic response for non-existent account; avoids leaking user existence details
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND,
        "Unable to use this account for a Pro Club invitation.",
      );
    }

    if (!userRecord || userRecord.disabled === true) {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND,
        "Unable to use this account for a Pro Club invitation.",
      );
    }

    // Self-lookup / self-invitation is forbidden
    if (userRecord.uid === requesterUid) {
      throw new ProClubStaffCandidateResolutionError(
        RESOLUTION_ERROR_CODES.CANDIDATE_NOT_FOUND,
        "Unable to use this account for a Pro Club invitation.",
      );
    }

    // 5. Return minimal candidate fields only
    return {
      targetUid: userRecord.uid,
      email: userRecord.email ?? email,
      displayName: userRecord.displayName ?? null,
    };
  }
}

export function createProClubStaffCandidateResolutionService(
  dependencies: ProClubStaffCandidateResolutionServiceDependencies,
): ProClubStaffCandidateResolutionService {
  return new ProClubStaffCandidateResolutionService(dependencies);
}
