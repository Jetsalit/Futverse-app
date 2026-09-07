import {
  AUDIT_EXACT_ALLOWED_FIELDS,
  NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS,
  computeProvisioningRequestFingerprint,
  isValidCanonicalIsoUtcTimestamp,
  isValidDocumentIdentifier,
  type NormalizedProClubProvisioningRequestV1,
  type StoredProClubProvisioningAuditDocument,
} from "../proClubProvisioning/core.ts";

export const AUDIT_VERIFICATION_CLASSIFICATIONS = {
  VERIFIED: "VERIFIED",
  NOT_FOUND: "NOT_FOUND",
  INTEGRITY_FAILURE: "INTEGRITY_FAILURE",
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_REQUEST: "INVALID_REQUEST",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type AuditVerificationClassification =
  (typeof AUDIT_VERIFICATION_CLASSIFICATIONS)[keyof typeof AUDIT_VERIFICATION_CLASSIFICATIONS];

export const AUDIT_VERIFICATION_ERROR_CODES = {
  INVALID_REQUEST: "ERROR_INVALID_AUDIT_VERIFICATION_REQUEST",
  UNAUTHORIZED: "ERROR_UNAUTHORIZED_AUDIT_VERIFICATION",
  NOT_FOUND: "ERROR_AUDIT_NOT_FOUND",
  INTEGRITY_FAILURE: "ERROR_AUDIT_INTEGRITY_FAILURE",
  INTERNAL_ERROR: "ERROR_AUDIT_VERIFICATION_INTERNAL",
} as const;

export type AuditVerificationErrorCode =
  (typeof AUDIT_VERIFICATION_ERROR_CODES)[keyof typeof AUDIT_VERIFICATION_ERROR_CODES];

export class ProClubProvisioningAuditVerificationError extends Error {
  constructor(
    public readonly classification: Exclude<AuditVerificationClassification, "VERIFIED">,
    public readonly code: AuditVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProClubProvisioningAuditVerificationError";
  }
}

export interface ProClubProvisioningAuditVerificationRequestV1 {
  readonly provisioningId: string;
}

function throwInvalidRequest(message: string): never {
  throw new ProClubProvisioningAuditVerificationError(
    AUDIT_VERIFICATION_CLASSIFICATIONS.INVALID_REQUEST,
    AUDIT_VERIFICATION_ERROR_CODES.INVALID_REQUEST,
    message,
  );
}

function throwIntegrityFailure(message: string): never {
  throw new ProClubProvisioningAuditVerificationError(
    AUDIT_VERIFICATION_CLASSIFICATIONS.INTEGRITY_FAILURE,
    AUDIT_VERIFICATION_ERROR_CODES.INTEGRITY_FAILURE,
    message,
  );
}

function hasExactOwnKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  const keys = Object.keys(record);
  if (keys.length !== allowed.size) return false;
  return keys.every((key) => allowed.has(key));
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isCanonicalOptionalStoredString(value: unknown): value is string | null {
  return value === null || isTrimmedNonEmptyString(value);
}

export function validateProClubProvisioningAuditVerificationRequest(
  rawInput: unknown,
): ProClubProvisioningAuditVerificationRequestV1 {
  if (!isPlainJsonObject(rawInput)) {
    throwInvalidRequest("Verification request must be a non-null plain JSON object");
  }

  const keys = Object.keys(rawInput);
  if (keys.length !== 1 || keys[0] !== "provisioningId") {
    throwInvalidRequest("Verification request must contain exactly provisioningId");
  }

  if (!isValidDocumentIdentifier(rawInput.provisioningId)) {
    throwInvalidRequest("provisioningId must be a canonical document identifier");
  }

  return { provisioningId: rawInput.provisioningId };
}

export function validateStoredProClubProvisioningAuditForVerification(
  rawAudit: unknown,
  requestedProvisioningId: string,
): StoredProClubProvisioningAuditDocument {
  if (!isValidDocumentIdentifier(requestedProvisioningId)) {
    throwIntegrityFailure("Requested provisioning identifier is not canonical");
  }
  if (!isPlainJsonObject(rawAudit)) {
    throwIntegrityFailure("Stored provisioning audit must be a plain object");
  }
  if (!hasExactOwnKeys(rawAudit, AUDIT_EXACT_ALLOWED_FIELDS)) {
    throwIntegrityFailure("Stored provisioning audit has non-canonical fields");
  }

  if (rawAudit.schemaVersion !== 1 || rawAudit.status !== "COMPLETED") {
    throwIntegrityFailure("Stored provisioning audit version or status is invalid");
  }
  if (
    !isValidDocumentIdentifier(rawAudit.provisioningId) ||
    rawAudit.provisioningId !== requestedProvisioningId ||
    !isValidDocumentIdentifier(rawAudit.clubId) ||
    !isValidDocumentIdentifier(rawAudit.ownerUid) ||
    !isValidDocumentIdentifier(rawAudit.requestingSuperAdminUid)
  ) {
    throwIntegrityFailure("Stored provisioning audit identifiers are invalid");
  }
  if (!isValidCanonicalIsoUtcTimestamp(rawAudit.createdAt)) {
    throwIntegrityFailure("Stored provisioning audit timestamp is invalid");
  }
  if (
    typeof rawAudit.requestFingerprint !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(rawAudit.requestFingerprint)
  ) {
    throwIntegrityFailure("Stored provisioning audit fingerprint format is invalid");
  }

  if (!isPlainJsonObject(rawAudit.normalizedRequest)) {
    throwIntegrityFailure("Stored normalized request must be a plain object");
  }
  if (!hasExactOwnKeys(rawAudit.normalizedRequest, NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS)) {
    throwIntegrityFailure("Stored normalized request has non-canonical fields");
  }

  const normalized = rawAudit.normalizedRequest;
  if (
    !isValidDocumentIdentifier(normalized.provisioningId) ||
    normalized.provisioningId !== rawAudit.provisioningId ||
    !isValidDocumentIdentifier(normalized.clubId) ||
    normalized.clubId !== rawAudit.clubId ||
    !isValidDocumentIdentifier(normalized.initialOwnerUid) ||
    normalized.initialOwnerUid !== rawAudit.ownerUid ||
    !isValidDocumentIdentifier(normalized.requestingSuperAdminUid) ||
    normalized.requestingSuperAdminUid !== rawAudit.requestingSuperAdminUid
  ) {
    throwIntegrityFailure("Stored normalized request bindings are invalid");
  }
  if (
    normalized.level !== "T1" &&
    normalized.level !== "T2" &&
    normalized.level !== "T3"
  ) {
    throwIntegrityFailure("Stored normalized request level is invalid");
  }
  if (!isTrimmedNonEmptyString(normalized.name)) {
    throwIntegrityFailure("Stored normalized request name is invalid");
  }
  for (const value of [normalized.shortName, normalized.country, normalized.logoUrl]) {
    if (!isCanonicalOptionalStoredString(value)) {
      throwIntegrityFailure("Stored normalized optional string is invalid");
    }
  }

  const typedNormalized = normalized as unknown as NormalizedProClubProvisioningRequestV1;
  const recomputedFingerprint = computeProvisioningRequestFingerprint(typedNormalized);
  if (recomputedFingerprint !== rawAudit.requestFingerprint) {
    throwIntegrityFailure("Stored provisioning audit fingerprint does not match normalized evidence");
  }

  return rawAudit as unknown as StoredProClubProvisioningAuditDocument;
}
