import type { Firestore } from "firebase-admin/firestore";
import type { ServerAuthTokenVerifier } from "../lib/serverAuthTokenVerifier.ts";
import {
  validateStoredClubPayload,
  validateStoredMembershipPayload,
} from "../proClubProvisioning/core.ts";
import {
  AUDIT_VERIFICATION_CLASSIFICATIONS,
  AUDIT_VERIFICATION_ERROR_CODES,
  ProClubProvisioningAuditVerificationError,
  validateProClubProvisioningAuditVerificationRequest,
  validateStoredProClubProvisioningAuditForVerification,
} from "./core.ts";

export interface VerifyProClubProvisioningAuditRequestInput {
  readonly authorizationHeader: unknown;
  readonly requestBody: unknown;
}

export interface VerifyProClubProvisioningAuditResult {
  readonly status: "VERIFIED";
  readonly provisioningId: string;
  readonly clubId: string;
  readonly ownerUid: string;
  readonly createdAt: string;
}

export interface ProClubProvisioningAuditVerificationService {
  verifyAudit(
    request: VerifyProClubProvisioningAuditRequestInput,
  ): Promise<VerifyProClubProvisioningAuditResult>;
}

export interface CreateProClubProvisioningAuditVerificationServiceOptions {
  firestore: Firestore;
  authTokenVerifier: ServerAuthTokenVerifier;
}

function unauthorized(message: string): ProClubProvisioningAuditVerificationError {
  return new ProClubProvisioningAuditVerificationError(
    AUDIT_VERIFICATION_CLASSIFICATIONS.UNAUTHORIZED,
    AUDIT_VERIFICATION_ERROR_CODES.UNAUTHORIZED,
    message,
  );
}

function integrityFailure(message: string): ProClubProvisioningAuditVerificationError {
  return new ProClubProvisioningAuditVerificationError(
    AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
    AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
    message,
  );
}

function notFound(): ProClubProvisioningAuditVerificationError {
  return new ProClubProvisioningAuditVerificationError(
    AUDIT_VERIFICATION_CLASSIFICATIONS.NOT_FOUND,
    AUDIT_VERIFICATION_ERROR_CODES.NOT_FOUND,
    "Provisioning audit not found",
  );
}

function internalError(message: string): ProClubProvisioningAuditVerificationError {
  return new ProClubProvisioningAuditVerificationError(
    AUDIT_VERIFICATION_CLASSIFICATIONS.INTERNAL_ERROR,
    AUDIT_VERIFICATION_ERROR_CODES.INTERNAL_ERROR,
    message,
  );
}

function isActiveSuperAdminUser(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const record = raw as Record<string, unknown>;
  const roleOk = record.role === "SUPERADMIN";
  const statusOk = record.status === "ACTIVE" || record.status === "Active";
  return roleOk && statusOk;
}

export function createProClubProvisioningAuditVerificationService(
  options: CreateProClubProvisioningAuditVerificationServiceOptions,
): ProClubProvisioningAuditVerificationService {
  return {
    async verifyAudit(request): Promise<VerifyProClubProvisioningAuditResult> {
      let verifyingSuperAdminUid: string;
      try {
        verifyingSuperAdminUid = await options.authTokenVerifier.verifyAuthorizationHeader(
          request.authorizationHeader,
        );
      } catch {
        throw unauthorized("Authenticated ACTIVE SUPERADMIN required");
      }

      const normalizedInput = validateProClubProvisioningAuditVerificationRequest(
        request.requestBody,
      );

      try {
        return await options.firestore.runTransaction(async (tx) => {
          const verifierRef = options.firestore
            .collection("users")
            .doc(verifyingSuperAdminUid);
          const verifierSnap = await tx.get(verifierRef);
          if (!verifierSnap.exists || !isActiveSuperAdminUser(verifierSnap.data())) {
            throw unauthorized("Authenticated ACTIVE SUPERADMIN required");
          }

          const auditRef = options.firestore
            .collection("proClubProvisioningAudits")
            .doc(normalizedInput.provisioningId);
          const auditSnap = await tx.get(auditRef);
          if (!auditSnap.exists) {
            throw notFound();
          }

          const audit = validateStoredProClubProvisioningAuditForVerification(
            auditSnap.data(),
            normalizedInput.provisioningId,
          );

          const clubRef = options.firestore.collection("proClubs").doc(audit.clubId);
          const clubSnap = await tx.get(clubRef);
          if (!clubSnap.exists || !validateStoredClubPayload(clubSnap.data())) {
            throw integrityFailure("Canonical Pro Club is missing or malformed");
          }

          const ownerRef = options.firestore
            .collection("proClubs")
            .doc(audit.clubId)
            .collection("members")
            .doc(audit.ownerUid);
          const ownerSnap = await tx.get(ownerRef);
          if (!ownerSnap.exists || !validateStoredMembershipPayload(ownerSnap.data())) {
            throw integrityFailure("Canonical OWNER membership is missing or malformed");
          }

          return {
            status: "VERIFIED",
            provisioningId: audit.provisioningId,
            clubId: audit.clubId,
            ownerUid: audit.ownerUid,
            createdAt: audit.createdAt,
          };
        });
      } catch (error) {
        if (error instanceof ProClubProvisioningAuditVerificationError) {
          throw error;
        }
        throw internalError("Audit verification transaction failed");
      }
    },
  };
}
