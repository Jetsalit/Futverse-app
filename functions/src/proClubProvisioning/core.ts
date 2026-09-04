import { createHash } from "node:crypto";

export const ERROR_CODES = {
  INVALID_PROVISIONING_REQUEST: "ERROR_INVALID_PROVISIONING_REQUEST",
  UNAUTHORIZED_REQUESTING_PRINCIPAL: "ERROR_UNAUTHORIZED_REQUESTING_PRINCIPAL",
  INVALID_OWNER: "ERROR_INVALID_OWNER",
  CLUB_EXISTS: "ERROR_CLUB_EXISTS",
  PROVISIONING_ID_CONFLICT: "ERROR_PROVISIONING_ID_CONFLICT",
  PROVISIONING_INTEGRITY: "ERROR_PROVISIONING_INTEGRITY",
} as const;

export type ProClubProvisioningErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class ProClubProvisioningError extends Error {
  constructor(
    public readonly code: ProClubProvisioningErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProClubProvisioningError";
  }
}

export type ProClubLevel = "T1" | "T2" | "T3";

export interface UntrustedProClubProvisioningRequest {
  readonly provisioningId?: unknown;
  readonly clubId?: unknown;
  readonly name?: unknown;
  readonly shortName?: unknown;
  readonly level?: unknown;
  readonly country?: unknown;
  readonly logoUrl?: unknown;
  readonly initialOwnerUid?: unknown;
}

export interface NormalizedProClubProvisioningRequestV1 {
  readonly clubId: string;
  readonly country: string | null;
  readonly initialOwnerUid: string;
  readonly level: ProClubLevel;
  readonly logoUrl: string | null;
  readonly name: string;
  readonly provisioningId: string;
  readonly requestingSuperAdminUid: string;
  readonly shortName: string | null;
}

export interface StoredProClubDocument {
  name: string;
  shortName?: string;
  level: ProClubLevel;
  status: "ACTIVE";
  country?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredProClubOwnerMembershipDocument {
  authorizationRole: "OWNER";
  status: "ACTIVE";
}

export interface StoredProClubProvisioningAuditDocument {
  schemaVersion: 1;
  provisioningId: string;
  clubId: string;
  ownerUid: string;
  requestingSuperAdminUid: string;
  requestFingerprint: string;
  normalizedRequest: NormalizedProClubProvisioningRequestV1;
  createdAt: string;
  status: "COMPLETED";
}

export const UNTRUSTED_REQUEST_ALLOWED_FIELDS = new Set([
  "provisioningId",
  "clubId",
  "name",
  "shortName",
  "level",
  "country",
  "logoUrl",
  "initialOwnerUid",
]);

export const AUDIT_EXACT_ALLOWED_FIELDS = new Set([
  "schemaVersion",
  "provisioningId",
  "clubId",
  "ownerUid",
  "requestingSuperAdminUid",
  "requestFingerprint",
  "normalizedRequest",
  "createdAt",
  "status",
]);

export const NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS = new Set([
  "clubId",
  "country",
  "initialOwnerUid",
  "level",
  "logoUrl",
  "name",
  "provisioningId",
  "requestingSuperAdminUid",
  "shortName",
]);

export const STORED_PRO_CLUB_EXACT_ALLOWED_FIELDS = new Set([
  "name",
  "shortName",
  "level",
  "status",
  "country",
  "logoUrl",
  "createdAt",
  "updatedAt",
]);

export const STORED_MEMBERSHIP_EXACT_ALLOWED_FIELDS = new Set([
  "authorizationRole",
  "status",
]);

export function isValidDocumentIdentifier(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value) return false;
  if (value.trim() !== value) return false;
  if (value.includes("/")) return false;
  return true;
}

export function isValidCanonicalIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return new Date(parsed).toISOString() === value;
}

function validateOptionalStringField(
  val: unknown,
): { valid: false } | { valid: true; value: string | null } {
  if (val === undefined || val === null) {
    return { valid: true, value: null };
  }
  if (typeof val !== "string") {
    return { valid: false };
  }
  const trimmed = val.trim();
  return { valid: true, value: trimmed.length > 0 ? trimmed : null };
}

export function computeProvisioningRequestFingerprint(
  normalized: NormalizedProClubProvisioningRequestV1,
): string {
  const canonicalJson = JSON.stringify({
    clubId: normalized.clubId,
    country: normalized.country,
    initialOwnerUid: normalized.initialOwnerUid,
    level: normalized.level,
    logoUrl: normalized.logoUrl,
    name: normalized.name,
    provisioningId: normalized.provisioningId,
    requestingSuperAdminUid: normalized.requestingSuperAdminUid,
    shortName: normalized.shortName,
  });
  const hash = createHash("sha256").update(canonicalJson).digest("hex");
  return `sha256:${hash}`;
}

export function validateAndNormalizeProvisioningRequest(
  rawInput: unknown,
  verifiedRequestingSuperAdminUid: string,
  nowIso: string,
): {
  normalized: NormalizedProClubProvisioningRequestV1;
  clubPayload: StoredProClubDocument;
  membershipPayload: StoredProClubOwnerMembershipDocument;
  auditPayload: StoredProClubProvisioningAuditDocument;
  requestFingerprint: string;
} {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Request payload must be a non-null object",
    );
  }

  const record = rawInput as Record<string, unknown>;
  const rawKeys = Object.keys(record);

  for (const key of rawKeys) {
    if (!UNTRUSTED_REQUEST_ALLOWED_FIELDS.has(key)) {
      throw new ProClubProvisioningError(
        ERROR_CODES.INVALID_PROVISIONING_REQUEST,
        `Unauthorized or unexpected field in provisioning request: '${key}'`,
      );
    }
  }

  // Requester UID must come strictly from verified token, never from caller request payload
  if (
    "requestingSuperAdminUid" in rawInput &&
    (rawInput as Record<string, unknown>).requestingSuperAdminUid !== undefined
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Caller-supplied requestingSuperAdminUid is strictly forbidden in request body",
    );
  }

  if (!isValidDocumentIdentifier(verifiedRequestingSuperAdminUid)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.UNAUTHORIZED_REQUESTING_PRINCIPAL,
      "Invalid requesting principal identifier",
    );
  }

  if (!isValidCanonicalIsoUtcTimestamp(nowIso)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Server timestamp must be a valid canonical ISO-8601 UTC string ending in Z",
    );
  }

  if (
    typeof record.provisioningId !== "string" ||
    !isValidDocumentIdentifier(record.provisioningId)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "provisioningId must be a valid document identifier",
    );
  }

  if (
    typeof record.clubId !== "string" ||
    !isValidDocumentIdentifier(record.clubId)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "clubId must be a valid document identifier",
    );
  }

  if (
    typeof record.initialOwnerUid !== "string" ||
    !isValidDocumentIdentifier(record.initialOwnerUid)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "initialOwnerUid must be a valid document identifier",
    );
  }

  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "name must be a non-empty string",
    );
  }

  if (
    record.level !== "T1" &&
    record.level !== "T2" &&
    record.level !== "T3"
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "level must be strictly 'T1' | 'T2' | 'T3'",
    );
  }

  const shortNameRes = validateOptionalStringField(record.shortName);
  if (!shortNameRes.valid) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "shortName must be string, null, or undefined",
    );
  }

  const countryRes = validateOptionalStringField(record.country);
  if (!countryRes.valid) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "country must be string, null, or undefined",
    );
  }

  const logoUrlRes = validateOptionalStringField(record.logoUrl);
  if (!logoUrlRes.valid) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "logoUrl must be string, null, or undefined",
    );
  }

  const normalized: NormalizedProClubProvisioningRequestV1 = {
    clubId: record.clubId.trim(),
    country: countryRes.value,
    initialOwnerUid: record.initialOwnerUid.trim(),
    level: record.level,
    logoUrl: logoUrlRes.value,
    name: record.name.trim(),
    provisioningId: record.provisioningId.trim(),
    requestingSuperAdminUid: verifiedRequestingSuperAdminUid.trim(),
    shortName: shortNameRes.value,
  };

  const clubPayload: StoredProClubDocument = {
    name: normalized.name,
    level: normalized.level,
    status: "ACTIVE",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  if (normalized.shortName !== null) {
    clubPayload.shortName = normalized.shortName;
  }
  if (normalized.country !== null) {
    clubPayload.country = normalized.country;
  }
  if (normalized.logoUrl !== null) {
    clubPayload.logoUrl = normalized.logoUrl;
  }

  const membershipPayload: StoredProClubOwnerMembershipDocument = {
    authorizationRole: "OWNER",
    status: "ACTIVE",
  };

  const requestFingerprint = computeProvisioningRequestFingerprint(normalized);

  const auditPayload: StoredProClubProvisioningAuditDocument = {
    schemaVersion: 1,
    provisioningId: normalized.provisioningId,
    clubId: normalized.clubId,
    ownerUid: normalized.initialOwnerUid,
    requestingSuperAdminUid: normalized.requestingSuperAdminUid,
    requestFingerprint,
    normalizedRequest: { ...normalized },
    createdAt: nowIso,
    status: "COMPLETED",
  };

  if (!validateStoredProClubPayload(clubPayload)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Constructed Pro Club document failed server model validation",
    );
  }

  if (!validateStoredMembershipPayload(membershipPayload)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.INVALID_PROVISIONING_REQUEST,
      "Constructed membership document failed server model validation",
    );
  }

  return {
    normalized,
    clubPayload,
    membershipPayload,
    auditPayload,
    requestFingerprint,
  };
}

export function validateStoredProClubPayload(
  payload: unknown,
): payload is StoredProClubDocument {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const keys = Object.keys(candidate);
  for (const key of keys) {
    if (!STORED_PRO_CLUB_EXACT_ALLOWED_FIELDS.has(key)) {
      return false;
    }
  }

  if (typeof candidate.name !== "string" || candidate.name.length === 0 || candidate.name.trim() !== candidate.name) {
    return false;
  }
  if (candidate.level !== "T1" && candidate.level !== "T2" && candidate.level !== "T3") {
    return false;
  }
  if (candidate.status !== "ACTIVE") {
    return false;
  }
  if (!isValidCanonicalIsoUtcTimestamp(candidate.createdAt)) {
    return false;
  }
  if (!isValidCanonicalIsoUtcTimestamp(candidate.updatedAt)) {
    return false;
  }
  if (
    candidate.shortName !== undefined &&
    (typeof candidate.shortName !== "string" || candidate.shortName.length === 0 || candidate.shortName.trim() !== candidate.shortName)
  ) {
    return false;
  }
  if (
    candidate.country !== undefined &&
    (typeof candidate.country !== "string" || candidate.country.length === 0 || candidate.country.trim() !== candidate.country)
  ) {
    return false;
  }
  if (
    candidate.logoUrl !== undefined &&
    (typeof candidate.logoUrl !== "string" || candidate.logoUrl.length === 0 || candidate.logoUrl.trim() !== candidate.logoUrl)
  ) {
    return false;
  }
  return true;
}

export const validateStoredClubPayload = validateStoredProClubPayload;

export function validateStoredMembershipPayload(
  payload: unknown,
): payload is StoredProClubOwnerMembershipDocument {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const candidate = payload as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== STORED_MEMBERSHIP_EXACT_ALLOWED_FIELDS.size) {
    return false;
  }
  for (const key of keys) {
    if (!STORED_MEMBERSHIP_EXACT_ALLOWED_FIELDS.has(key)) {
      return false;
    }
  }
  return candidate.authorizationRole === "OWNER" && candidate.status === "ACTIVE";
}

export function validateStoredAuditOnReplay(
  auditDoc: unknown,
  expectedProvisioningId: string,
  authenticatedRequesterUid: string,
  expectedRequestFingerprint: string,
): StoredProClubProvisioningAuditDocument {
  if (!auditDoc || typeof auditDoc !== "object" || Array.isArray(auditDoc)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit document is not a valid object",
    );
  }

  const audit = auditDoc as Record<string, unknown>;

  const keys = Object.keys(audit);
  if (keys.length !== AUDIT_EXACT_ALLOWED_FIELDS.size) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      `Stored audit contains invalid field count (expected ${AUDIT_EXACT_ALLOWED_FIELDS.size}, got ${keys.length})`,
    );
  }
  for (const key of keys) {
    if (!AUDIT_EXACT_ALLOWED_FIELDS.has(key)) {
      throw new ProClubProvisioningError(
        ERROR_CODES.PROVISIONING_INTEGRITY,
        `Stored audit contains unauthorized field: ${key}`,
      );
    }
  }

  if (audit.schemaVersion !== 1) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit schemaVersion must strictly equal 1",
    );
  }

  if (
    typeof audit.provisioningId !== "string" ||
    audit.provisioningId !== expectedProvisioningId ||
    !isValidDocumentIdentifier(audit.provisioningId)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit provisioningId mismatch or invalid identifier",
    );
  }

  if (audit.status !== "COMPLETED") {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit status must strictly equal 'COMPLETED'",
    );
  }

  if (!isValidCanonicalIsoUtcTimestamp(audit.createdAt)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit createdAt must be a valid canonical ISO-8601 UTC timestamp",
    );
  }

  if (typeof audit.clubId !== "string" || !isValidDocumentIdentifier(audit.clubId)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit clubId is not a valid document identifier",
    );
  }

  if (typeof audit.ownerUid !== "string" || !isValidDocumentIdentifier(audit.ownerUid)) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit ownerUid is not a valid document identifier",
    );
  }

  if (
    typeof audit.requestingSuperAdminUid !== "string" ||
    !isValidDocumentIdentifier(audit.requestingSuperAdminUid)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit requestingSuperAdminUid is not a valid document identifier",
    );
  }

  if (
    typeof audit.requestFingerprint !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(audit.requestFingerprint)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit requestFingerprint is malformed",
    );
  }

  if (
    !audit.normalizedRequest ||
    typeof audit.normalizedRequest !== "object" ||
    Array.isArray(audit.normalizedRequest)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest is missing or not an object",
    );
  }

  const norm = audit.normalizedRequest as Record<string, unknown>;
  const normKeys = Object.keys(norm);
  if (normKeys.length !== NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS.size) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest field count mismatch",
    );
  }
  for (const key of normKeys) {
    if (!NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS.has(key)) {
      throw new ProClubProvisioningError(
        ERROR_CODES.PROVISIONING_INTEGRITY,
        `Stored audit normalizedRequest contains extra field: ${key}`,
      );
    }
  }

  if (norm.provisioningId !== audit.provisioningId) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest provisioningId binding mismatch",
    );
  }
  if (norm.clubId !== audit.clubId) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest clubId binding mismatch",
    );
  }
  if (norm.initialOwnerUid !== audit.ownerUid) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest ownerUid binding mismatch",
    );
  }
  if (norm.requestingSuperAdminUid !== audit.requestingSuperAdminUid) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest requestingSuperAdminUid binding mismatch",
    );
  }

  if (typeof norm.name !== "string" || norm.name.trim() !== norm.name || norm.name.length === 0) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest name must be trimmed non-empty string",
    );
  }
  if (norm.level !== "T1" && norm.level !== "T2" && norm.level !== "T3") {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest level must be 'T1' | 'T2' | 'T3'",
    );
  }
  if (
    norm.shortName !== null &&
    (typeof norm.shortName !== "string" || norm.shortName.trim() !== norm.shortName || norm.shortName.length === 0)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest shortName must be null or trimmed non-empty string",
    );
  }
  if (
    norm.country !== null &&
    (typeof norm.country !== "string" || norm.country.trim() !== norm.country || norm.country.length === 0)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest country must be null or trimmed non-empty string",
    );
  }
  if (
    norm.logoUrl !== null &&
    (typeof norm.logoUrl !== "string" || norm.logoUrl.trim() !== norm.logoUrl || norm.logoUrl.length === 0)
  ) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit normalizedRequest logoUrl must be null or trimmed non-empty string",
    );
  }

  // Recompute fingerprint over normalizedRequest snapshot
  const recomputedFingerprint = computeProvisioningRequestFingerprint(
    norm as unknown as NormalizedProClubProvisioningRequestV1,
  );
  if (recomputedFingerprint !== audit.requestFingerprint) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit requestFingerprint does not match recomputed normalizedRequest fingerprint",
    );
  }

  // 2. Compare stored audit requestFingerprint vs incoming expectedRequestFingerprint
  if (audit.requestFingerprint !== expectedRequestFingerprint) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_ID_CONFLICT,
      "provisioningId has already been used with different request parameters",
    );
  }

  // 3. Defensive check: after fingerprint equality, verify exact requestingSuperAdminUid match
  if (audit.requestingSuperAdminUid !== authenticatedRequesterUid) {
    throw new ProClubProvisioningError(
      ERROR_CODES.PROVISIONING_INTEGRITY,
      "Stored audit requestingSuperAdminUid mismatch with authenticated caller after fingerprint equality",
    );
  }

  return audit as unknown as StoredProClubProvisioningAuditDocument;
}
