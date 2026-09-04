import type { Firestore } from "firebase-admin/firestore";
import type { ServerAuthTokenVerifier } from "../lib/serverAuthTokenVerifier.ts";
import {
  ERROR_CODES,
  ProClubProvisioningError,
  validateAndNormalizeProvisioningRequest,
  validateStoredAuditOnReplay,
  validateStoredClubPayload,
  validateStoredMembershipPayload,
} from "./core.ts";

export interface ProClubProvisioningServiceDependencies {
  firestore: Firestore;
  authTokenVerifier: ServerAuthTokenVerifier;
  trustedClock?: () => Date;
}

export interface ProvisionProClubRequestInput {
  authorizationHeader?: unknown;
  requestBody: unknown;
}

export interface ProvisionProClubResult {
  status: "COMPLETED";
  provisioningId: string;
  clubId: string;
  ownerUid: string;
  requestingSuperAdminUid: string;
  isReplay: boolean;
  createdAt: string;
}

export class ProClubProvisioningService {
  constructor(
    private readonly dependencies: ProClubProvisioningServiceDependencies,
  ) {}

  async provisionProClub(
    request: ProvisionProClubRequestInput,
  ): Promise<ProvisionProClubResult> {
    const { firestore, authTokenVerifier } = this.dependencies;
    const now = this.dependencies.trustedClock
      ? this.dependencies.trustedClock()
      : new Date();
    const nowIso = now.toISOString();

    // 1. Verify token & extract requesting principal UID
    const requestingSuperAdminUid =
      await authTokenVerifier.verifyAuthorizationHeader(
        request.authorizationHeader,
      );

    // 2. Runtime validate and normalize untrusted request body
    const {
      normalized,
      clubPayload,
      membershipPayload,
      auditPayload,
      requestFingerprint,
    } = validateAndNormalizeProvisioningRequest(
      request.requestBody,
      requestingSuperAdminUid,
      nowIso,
    );

    // 3. Execute atomic Firestore transaction
    return await firestore.runTransaction(async (transaction) => {
      // READ 1: Transactional Requester Authorization Read
      const requesterRef = firestore
        .collection("users")
        .doc(requestingSuperAdminUid);
      const requesterSnap = await transaction.get(requesterRef);

      if (!requesterSnap.exists) {
        throw new ProClubProvisioningError(
          ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
          "Requesting user does not exist",
        );
      }

      const requesterData = requesterSnap.data();
      const requesterStatus = requesterData?.status;
      const requesterRole = requesterData?.role;

      if (requesterStatus !== "Active" && requesterStatus !== "ACTIVE") {
        throw new ProClubProvisioningError(
          ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
          "Requesting principal account is not active",
        );
      }

      if (requesterRole !== "SUPERADMIN") {
        throw new ProClubProvisioningError(
          ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
          "Requesting principal is not a SUPERADMIN",
        );
      }

      // READ 2: Transactional Initial Owner Eligibility Read
      const ownerRef = firestore
        .collection("users")
        .doc(normalized.initialOwnerUid);
      const ownerSnap = await transaction.get(ownerRef);

      if (!ownerSnap.exists) {
        throw new ProClubProvisioningError(
          ERROR_CODES.INVALID_OWNER,
          "Initial owner user does not exist",
        );
      }

      const ownerData = ownerSnap.data();
      const ownerStatus = ownerData?.status;

      if (ownerStatus !== "Active" && ownerStatus !== "ACTIVE") {
        throw new ProClubProvisioningError(
          ERROR_CODES.INVALID_OWNER,
          "Initial owner account is not active",
        );
      }

      // READ 3: Read Provisioning Audit Document
      const auditRef = firestore
        .collection("proClubProvisioningAudits")
        .doc(normalized.provisioningId);
      const auditSnap = await transaction.get(auditRef);

      const clubRef = firestore.collection("proClubs").doc(normalized.clubId);
      const memberRef = clubRef
        .collection("members")
        .doc(normalized.initialOwnerUid);

      if (auditSnap.exists) {
        // Replay Branch: Validate complete audit shape, fingerprint, and identity bindings
        validateStoredAuditOnReplay(
          auditSnap.data(),
          normalized.provisioningId,
          requestingSuperAdminUid,
          requestFingerprint,
        );

        // Verify canonical resources exist and match sovereign state
        const clubSnap = await transaction.get(clubRef);
        const memberSnap = await transaction.get(memberRef);

        if (!clubSnap.exists || !validateStoredClubPayload(clubSnap.data())) {
          throw new ProClubProvisioningError(
            ERROR_CODES.PROVISIONING_INTEGRITY,
            "Replay integrity violation: Pro Club does not exist or does not match exact Pro Club shape",
          );
        }

        const memberData = memberSnap.data();
        if (
          !memberSnap.exists ||
          !validateStoredMembershipPayload(memberData)
        ) {
          throw new ProClubProvisioningError(
            ERROR_CODES.PROVISIONING_INTEGRITY,
            "Replay integrity violation: Initial owner membership does not exist or does not match exact ACTIVE OWNER shape",
          );
        }

        // Return existing COMPLETED result idempotently with ZERO writes
        return {
          status: "COMPLETED",
          provisioningId: normalized.provisioningId,
          clubId: normalized.clubId,
          ownerUid: normalized.initialOwnerUid,
          requestingSuperAdminUid,
          isReplay: true,
          createdAt: (auditSnap.data()?.createdAt as string) ?? nowIso,
        };
      }

      // New Provisioning Branch: Verify preconditions for target club and owner
      const clubSnap = await transaction.get(clubRef);
      if (clubSnap.exists) {
        throw new ProClubProvisioningError(
          ERROR_CODES.CLUB_EXISTS,
          `Pro Club with ID '${normalized.clubId}' already exists`,
        );
      }

      const memberSnap = await transaction.get(memberRef);
      if (memberSnap.exists) {
        throw new ProClubProvisioningError(
          ERROR_CODES.PROVISIONING_INTEGRITY,
          "Orphan or pre-existing OWNER membership exists without matching audit evidence",
        );
      }

      // Commit exact 3-way atomic write (Club + Owner + Audit) in the SAME transaction
      transaction.set(clubRef, clubPayload);
      transaction.set(memberRef, membershipPayload);
      transaction.set(auditRef, auditPayload);

      return {
        status: "COMPLETED",
        provisioningId: normalized.provisioningId,
        clubId: normalized.clubId,
        ownerUid: normalized.initialOwnerUid,
        requestingSuperAdminUid,
        isReplay: false,
        createdAt: auditPayload.createdAt,
      };
    });
  }
}

export function createProClubProvisioningService(
  dependencies: ProClubProvisioningServiceDependencies,
): ProClubProvisioningService {
  return new ProClubProvisioningService(dependencies);
}
