import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasActiveProClubMembershipAuthority,
  isProClubAuthorizationRole,
  isProClubLevel,
  isProClubMembershipStatus,
  isProClubStaffRole,
  isProClubStatus,
  isValidDocumentIdentifier,
  validateProClub,
  validateProClubMembership,
  validateProClubStaffAssignment,
} from "../src/lib/proClubModel.js";
import type {
  ProClub,
  ProClubAuthorizationRole,
  ProClubMembership,
  ProClubStaffAssignment,
} from "../src/types/ProClub.js";

const read = (path: string) =>
  readFileSync(path, "utf8").replace(/\r\n?/g, "\n");

const contract = read("docs/PRO_CLUB_PROVISIONING_V1_CONTRACT_FREEZE.md");
const normalizedContract = contract.replace(/\s+/g, " ");
const firestoreRules = read("firestore.rules");
const proClubTypes = read("src/types/ProClub.ts");
const proClubModel = read("src/lib/proClubModel.ts");
const loginSource = read("src/components/Login.tsx");
const registrationSource = read("src/lib/firestore/registration.ts");
const accountRolePolicy = read("src/lib/accountRolePolicy.ts");

interface ProClubProvisioningRequestInput {
  provisioningId: string;
  clubId: string;
  initialOwnerUid: string;
  name: string;
  shortName?: string | null;
  level: "T1" | "T2" | "T3";
  country?: string | null;
  logoUrl?: string | null;
  requestingSuperAdminUid: string;
}

export interface NormalizedProClubProvisioningRequestV1 {
  readonly clubId: string;
  readonly country: string | null;
  readonly initialOwnerUid: string;
  readonly level: "T1" | "T2" | "T3";
  readonly logoUrl: string | null;
  readonly name: string;
  readonly provisioningId: string;
  readonly requestingSuperAdminUid: string;
  readonly shortName: string | null;
}

export interface CanonicalAuditV1 {
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

function normalizeProvisioningRequest(input: ProClubProvisioningRequestInput): NormalizedProClubProvisioningRequestV1 {
  const trimOrNull = (v?: string | null) => {
    if (!v) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    clubId: input.clubId.trim(),
    country: trimOrNull(input.country),
    initialOwnerUid: input.initialOwnerUid.trim(),
    level: input.level,
    logoUrl: trimOrNull(input.logoUrl),
    name: input.name.trim(),
    provisioningId: input.provisioningId.trim(),
    requestingSuperAdminUid: input.requestingSuperAdminUid.trim(),
    shortName: trimOrNull(input.shortName),
  };
}

function computeProvisioningRequestFingerprint(input: ProClubProvisioningRequestInput): string {
  const normalized = normalizeProvisioningRequest(input);
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

function validateProvisioningRequestRuntime(
  rawInput: unknown,
  tokenUid: string,
  timestampRepresentation = "2026-09-04T00:00:00.000Z",
):
  | {
      valid: true;
      normalizedRequest: NormalizedProClubProvisioningRequestV1;
      clubPayload: Record<string, unknown>;
      requestFingerprint: string;
    }
  | {
      valid: false;
      error: "ERROR_INVALID_PROVISIONING_REQUEST";
      writesCount: 0;
    } {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  // Requesting superadmin UID must come strictly from verified token, not client payload
  if (!isValidDocumentIdentifier(tokenUid)) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  const record = rawInput as Record<string, unknown>;

  if (typeof record.provisioningId !== "string" || !isValidDocumentIdentifier(record.provisioningId)) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }
  if (typeof record.clubId !== "string" || !isValidDocumentIdentifier(record.clubId)) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }
  if (typeof record.initialOwnerUid !== "string" || !isValidDocumentIdentifier(record.initialOwnerUid)) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  if (record.level !== "T1" && record.level !== "T2" && record.level !== "T3") {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  const shortNameRes = validateOptionalStringField(record.shortName);
  if (!shortNameRes.valid) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  const countryRes = validateOptionalStringField(record.country);
  if (!countryRes.valid) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  const logoUrlRes = validateOptionalStringField(record.logoUrl);
  if (!logoUrlRes.valid) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  const normalizedRequest: NormalizedProClubProvisioningRequestV1 = {
    clubId: record.clubId.trim(),
    country: countryRes.value,
    initialOwnerUid: record.initialOwnerUid.trim(),
    level: record.level,
    logoUrl: logoUrlRes.value,
    name: record.name.trim(),
    provisioningId: record.provisioningId.trim(),
    requestingSuperAdminUid: tokenUid.trim(),
    shortName: shortNameRes.value,
  };

  const clubPayload: Record<string, unknown> = {
    name: normalizedRequest.name,
    level: normalizedRequest.level,
    status: "ACTIVE",
    createdAt: timestampRepresentation,
    updatedAt: timestampRepresentation,
  };
  if (normalizedRequest.shortName !== null) {
    clubPayload.shortName = normalizedRequest.shortName;
  }
  if (normalizedRequest.country !== null) {
    clubPayload.country = normalizedRequest.country;
  }
  if (normalizedRequest.logoUrl !== null) {
    clubPayload.logoUrl = normalizedRequest.logoUrl;
  }

  // Model contract validation before any transaction write
  const modelContext = {
    clubId: normalizedRequest.clubId,
    documentId: normalizedRequest.clubId,
  };
  if (!validateProClub(clubPayload, modelContext)) {
    return { valid: false, error: "ERROR_INVALID_PROVISIONING_REQUEST", writesCount: 0 };
  }

  const canonicalJson = JSON.stringify({
    clubId: normalizedRequest.clubId,
    country: normalizedRequest.country,
    initialOwnerUid: normalizedRequest.initialOwnerUid,
    level: normalizedRequest.level,
    logoUrl: normalizedRequest.logoUrl,
    name: normalizedRequest.name,
    provisioningId: normalizedRequest.provisioningId,
    requestingSuperAdminUid: normalizedRequest.requestingSuperAdminUid,
    shortName: normalizedRequest.shortName,
  });
  const hash = createHash("sha256").update(canonicalJson).digest("hex");
  const requestFingerprint = `sha256:${hash}`;

  return {
    valid: true,
    normalizedRequest,
    clubPayload,
    requestFingerprint,
  };
}

const AUDIT_EXACT_ALLOWED_FIELDS = new Set([
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

const NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS = new Set([
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

function isValidServerTimestamp(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

function validateProvisioningAuditOnReplay(
  auditDoc: unknown,
  documentId: string,
  authenticatedRequesterUid: string,
):
  | {
      valid: true;
      status: "COMPLETED";
      proceedToResourceIntegrityChecks: true;
    }
  | {
      valid: false;
      error: "ERROR_PROVISIONING_INTEGRITY";
    } {
  if (!auditDoc || typeof auditDoc !== "object" || Array.isArray(auditDoc)) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  const audit = auditDoc as Record<string, unknown>;

  // Strict whitelist of exact allowed fields only (no extra fields, no missing fields)
  const auditKeys = Object.keys(audit);
  if (auditKeys.length !== AUDIT_EXACT_ALLOWED_FIELDS.size) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  for (const key of auditKeys) {
    if (!AUDIT_EXACT_ALLOWED_FIELDS.has(key)) {
      return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
    }
  }

  // schemaVersion === 1
  if (audit.schemaVersion !== 1) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // audit document id === provisioningId && audit.provisioningId === provisioningId
  if (
    typeof audit.provisioningId !== "string" ||
    audit.provisioningId !== documentId ||
    !isValidDocumentIdentifier(audit.provisioningId)
  ) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // audit.status === "COMPLETED"
  if (audit.status !== "COMPLETED") {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // audit.createdAt must be valid server-authoritative timestamp representation
  if (!isValidServerTimestamp(audit.createdAt)) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // audit.clubId exact valid canonical identifier
  if (typeof audit.clubId !== "string" || !isValidDocumentIdentifier(audit.clubId)) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // audit.ownerUid exact valid canonical identifier
  if (typeof audit.ownerUid !== "string" || !isValidDocumentIdentifier(audit.ownerUid)) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // audit.requestingSuperAdminUid exactly equals authenticated requester uid
  if (
    typeof audit.requestingSuperAdminUid !== "string" ||
    audit.requestingSuperAdminUid !== authenticatedRequesterUid ||
    !isValidDocumentIdentifier(audit.requestingSuperAdminUid)
  ) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // requestFingerprint: exact string, format /^sha256:[a-f0-9]{64}$/
  if (
    typeof audit.requestFingerprint !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(audit.requestFingerprint)
  ) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // normalizedRequest validation
  if (
    !audit.normalizedRequest ||
    typeof audit.normalizedRequest !== "object" ||
    Array.isArray(audit.normalizedRequest)
  ) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  const norm = audit.normalizedRequest as Record<string, unknown>;
  const normKeys = Object.keys(norm);
  if (normKeys.length !== NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS.size) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  for (const key of normKeys) {
    if (!NORMALIZED_REQUEST_EXACT_ALLOWED_FIELDS.has(key)) {
      return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
    }
  }

  // Exact binding
  if (norm.provisioningId !== audit.provisioningId) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  if (norm.clubId !== audit.clubId) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  if (norm.initialOwnerUid !== audit.ownerUid) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  if (norm.requestingSuperAdminUid !== audit.requestingSuperAdminUid) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // Values already normalized
  if (typeof norm.name !== "string" || norm.name.trim() !== norm.name || norm.name.length === 0) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  if (norm.level !== "T1" && norm.level !== "T2" && norm.level !== "T3") {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  if (
    norm.shortName !== null &&
    (typeof norm.shortName !== "string" || norm.shortName.trim() !== norm.shortName || norm.shortName.length === 0)
  ) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  if (
    norm.country !== null &&
    (typeof norm.country !== "string" || norm.country.trim() !== norm.country || norm.country.length === 0)
  ) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }
  if (
    norm.logoUrl !== null &&
    (typeof norm.logoUrl !== "string" || norm.logoUrl.trim() !== norm.logoUrl || norm.logoUrl.length === 0)
  ) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  // Recomputed fingerprint over normalizedRequest must match stored requestFingerprint
  const canonicalNormJson = JSON.stringify({
    clubId: norm.clubId,
    country: norm.country,
    initialOwnerUid: norm.initialOwnerUid,
    level: norm.level,
    logoUrl: norm.logoUrl,
    name: norm.name,
    provisioningId: norm.provisioningId,
    requestingSuperAdminUid: norm.requestingSuperAdminUid,
    shortName: norm.shortName,
  });
  const recomputedHash = `sha256:${createHash("sha256").update(canonicalNormJson).digest("hex")}`;
  if (recomputedHash !== audit.requestFingerprint) {
    return { valid: false, error: "ERROR_PROVISIONING_INTEGRITY" };
  }

  return {
    valid: true,
    status: "COMPLETED",
    proceedToResourceIntegrityChecks: true,
  };
}

test("Pro Club Provisioning V1 Contract Freeze", async (t) => {
  await t.test("freezes exact baseline, branch scope, and two-file boundary", () => {
    assert.ok(contract.includes("03866126fb98e034a6898b4ff6de99a8210e9f29"));
    assert.ok(contract.includes("0ba128d26b96ea24611a8ad065d1ec6babddf971"));
    assert.ok(contract.includes("d3ef685e1a051359f0628da0664a249174df3e84"));
    assert.ok(contract.includes("feat/pro-club-provisioning-v1-contract"));
    assert.ok(contract.includes("https://github.com/Jetsalit/Futverse-app.git"));
    assert.ok(contract.includes("docs/PRO_CLUB_PROVISIONING_V1_CONTRACT_FREEZE.md"));
    assert.ok(contract.includes("tests/proClubProvisioningV1Contract.test.ts"));
    assert.ok(contract.includes("introduce or modify exactly **two** files"));
    assert.ok(contract.includes("No production source file (`src/...`), Firestore Rules (`firestore.rules`)"));
  });

  await t.test("freezes contract decision B (trusted backend) over option A (client SuperAdmin)", () => {
    assert.ok(contract.includes("OPTION B (Trusted Backend / Service Provisioning Boundary) IS SELECTED"));
    assert.ok(contract.includes("Authenticated Privileged SuperAdmin + Strict Firestore Rules + Atomic Client Write"));
    assert.ok(contract.includes("Trusted Backend / Service Provisioning Boundary"));

    for (const criterion of [
      "Security",
      "Privilege Escalation Risk",
      "Atomicity",
      "Auditability",
      "Blast Radius",
      "Credential Exposure",
      "Production Deployment Complexity",
      "Architecture Consistency",
    ]) {
      assert.ok(contract.includes(criterion), `missing evaluation criterion: ${criterion}`);
    }
  });

  await t.test("Finding 1: Option A atomicity wording recognizes client atomicity and explains Option B rationale", () => {
    assert.ok(contract.includes("Firestore client batches (`writeBatch`) and client transactions (`runTransaction`) are atomic"));
    assert.ok(contract.includes("all operations commit or none do"));
    assert.ok(contract.includes("browser or network interruptions do NOT cause partial committed state in Firestore"));
    assert.doesNotMatch(contract, /Browser interruptions can cause failed transactions without robust server rollback/);

    // Option B selection rationale based on:
    // 1. trusted authorization boundary
    // 2. reduced client Rules attack surface
    // 3. centralized audit/control-plane enforcement
    // 4. lower blast radius
    assert.ok(contract.includes("Trusted Authorization Boundary"));
    assert.ok(contract.includes("Reduced Client Rules Attack Surface"));
    assert.ok(contract.includes("Centralized Audit and Control-Plane Enforcement"));
    assert.ok(contract.includes("Lower Blast Radius"));
  });

  await t.test("Finding 2: Option A credential and risk wording avoids inaccurate claims and describes session risk", () => {
    assert.ok(contract.includes("Does not require Admin SDK in the browser, but relies on client Firebase Auth sessions"));
    assert.ok(contract.includes("compromised or incorrectly-authorized privileged client session"));
    assert.ok(contract.includes("widened sensitive Rules"));
    assert.doesNotMatch(contract, /Requires elevated permissions or admin tokens accessible to client applications/);
    assert.doesNotMatch(contract, /sets `users\/\{uid\}\.role = 'SUPERADMIN'/);
  });

  await t.test("distinguishes requesting authority from execution authority", () => {
    assert.ok(contract.includes("REQUESTING AUTHORITY != EXECUTION AUTHORITY"));
    assert.ok(contract.includes("Trusted Backend / Service + Admin SDK is EXECUTION BOUNDARY ONLY"));
    assert.ok(contract.includes("Service identity alone is **never** sufficient for business authorization"));
  });

  await t.test("service identity alone cannot authorize provisioning", () => {
    assert.ok(contract.includes("Service identity alone is **never** sufficient for business authorization"));
    assert.ok(
      contract.includes("Service caller without authenticated requesting principal") ||
      contract.includes("service caller without authenticated requesting principal"),
    );
  });

  await t.test("authenticated non-SUPERADMIN cannot provision", () => {
    assert.ok(contract.includes("`role` must strictly equal `\"SUPERADMIN\"`"));
    assert.ok(contract.includes("`ADMIN`, `COACH`, `PLAYER`, `SCOUT`, `PARENT`, or `USER`"));
  });

  await t.test("DATA_ADMIN cannot provision", () => {
    assert.ok(contract.includes("`DATA_ADMIN`"));
    assert.ok(contract.includes("`DATA_ADMIN`, `ADMIN`, `COACH`, `PLAYER`, `SCOUT`, `PARENT`, or `USER`"));
  });

  await t.test("inactive SUPERADMIN cannot provision", () => {
    assert.ok(contract.includes("Explicitly ACTIVE account state: `status` must equal `\"Active\"` or `\"ACTIVE\"`"));
    assert.ok(contract.includes("fail closed if identity, status, or role does not match"));
  });

  await t.test("support-presented SUPERADMIN cannot provision", () => {
    assert.ok(contract.includes("Support presentation (\"Work As Staff\" / impersonation)"));
    assert.ok(contract.includes("`support presentation != authenticated provisioning actor`"));
    assert.ok(contract.includes("SuperAdmin support presentation (\"Work As Staff\") is a read-only presentation mechanism"));
  });

  await t.test("exact authenticated ACTIVE SUPERADMIN is required inside transaction", () => {
    assert.ok(
      contract.includes("Verified Firebase authenticated UID") ||
      contract.includes("verified Firebase authenticated UID"),
    );
    assert.ok(contract.includes("re-reads canonical `users/{requestingSuperAdminUid}` directly from Firestore server-side"));
    assert.ok(contract.includes("`status` must equal `\"Active\"` or `\"ACTIVE\"`"));
    assert.ok(contract.includes("`role` must strictly equal `\"SUPERADMIN\"`"));
  });

  await t.test("Finding 3: eliminates TOCTOU ambiguity via transactional reads inside SAME transaction", () => {
    assert.ok(contract.includes("TOCTOU Elimination"));
    assert.ok(contract.includes("Pre-transaction user read alone is NOT sufficient authorization"));
    assert.ok(contract.includes("transaction.get(users/{requestingSuperAdminUid})"));
    assert.ok(contract.includes("transaction.get(users/{initialOwnerUid})"));
    assert.ok(contract.includes("Read 1: Transactional Requester Authorization Read"));
    assert.ok(contract.includes("Read 2: Transactional Initial Owner Eligibility Read"));
    assert.ok(contract.includes("Read 3: Read Provisioning Audit Document"));
    assert.ok(contract.includes("Canonical requester must still be ACTIVE (`status in [\"Active\", \"ACTIVE\"]`) AND `role === \"SUPERADMIN\"`"));
  });

  await t.test("SUPERADMIN control-plane privilege is not tenant membership authority", () => {
    assert.ok(contract.includes("SUPERADMIN here is PLATFORM CONTROL-PLANE AUTHORITY, NOT PRO CLUB TENANT AUTHORITY"));
    assert.ok(contract.includes("users.role must never substitute for: proClubs/{clubId}/members/{uid}"));
    assert.ok(contract.includes("tenant ownership authority derives **exclusively** from canonical `proClubs/{clubId}/members/{ownerUid}`"));
  });

  await t.test("1. public user cannot create Pro Club", () => {
    const proClubRuleStart = firestoreRules.indexOf("match /proClubs/{clubId}");
    assert.ok(proClubRuleStart >= 0, "match /proClubs/{clubId} must exist");
    const ruleSub = firestoreRules.slice(proClubRuleStart, proClubRuleStart + 350);
    assert.match(ruleSub, /allow\s+list,\s*create,\s*update,\s*delete:\s*if\s+false;/);

    assert.ok(contract.includes("match /proClubs/{clubId}`: `allow list, create, update, delete: if false;`"));
    assert.ok(contract.includes("Zero client write surface"));
  });

  await t.test("2. registration intent cannot create Pro Club", () => {
    assert.match(
      accountRolePolicy,
      /\{ value: "COACH", label: "Coach", authority: "MEMBERSHIP" \}/,
    );
    assert.match(loginSource, /REGISTRATION_INTENT_OPTIONS\.map/);
    assert.doesNotMatch(registrationSource, /proClubs/);
    assert.doesNotMatch(loginSource, /collection\(.*["']proClubs["']\)/);

    assert.ok(contract.includes("`PUBLIC REGISTRATION != PRO CLUB CREATION`"));
    assert.ok(contract.includes("Registering as a user or selecting any requested role"));
  });

  await t.test("3. Academy membership cannot provision Pro Club", () => {
    assert.ok(contract.includes("`Academy authority != Pro Club provisioning authority`"));
    assert.ok(contract.includes("Holding any role or membership in an Academy (`academies/{academyId}`) grants zero authority"));

    const clubCtx = { clubId: "club-1", documentId: "club-1" };
    const memberCtx = {
      clubId: "club-1",
      documentClubId: "club-1",
      userId: "user-1",
      documentId: "user-1",
    };
    const validClub = { name: "Fut FC", level: "T1", status: "ACTIVE" } as const;
    const validOwner = { authorizationRole: "OWNER", status: "ACTIVE" } as const;

    assert.equal(
      hasActiveProClubMembershipAuthority(validClub, clubCtx, validOwner, memberCtx),
      true,
    );
    const academyMemberCtx = {
      ...memberCtx,
      clubId: "academies/academy-1",
      documentClubId: "academy-1",
    };
    assert.equal(
      hasActiveProClubMembershipAuthority(validClub, clubCtx, validOwner, academyMemberCtx),
      false,
    );
  });

  await t.test("4. staffRole cannot provision Pro Club", () => {
    assert.ok(contract.includes("`staffRole != authorizationRole`"));
    assert.ok(contract.includes("Functional staff assignment grants no tenant authority"));

    for (const staffRole of [
      "HEAD_COACH",
      "ASSISTANT_COACH",
      "FITNESS_COACH",
      "ANALYST",
      "PHYSIO",
      "TEAM_MANAGER",
      "STAFF",
    ]) {
      assert.equal(isProClubStaffRole(staffRole), true);
      assert.equal(isProClubAuthorizationRole(staffRole), false);
    }
  });

  await t.test("5. support presentation cannot provision Pro Club", () => {
    assert.ok(contract.includes("`support presentation != authenticated provisioning actor`"));
    assert.ok(contract.includes("`currentUser presentation != authenticated actor`"));
    assert.ok(contract.includes("SuperAdmin support presentation (\"Work As Staff\") is a read-only presentation mechanism"));
  });

  await t.test("6. malformed clubId fails", () => {
    assert.ok(contract.includes("Valid and Canonical `clubId`"));
    assert.ok(contract.includes("isValidDocumentIdentifier"));

    assert.equal(isValidDocumentIdentifier("club-lampang-123"), true);
    assert.equal(isValidDocumentIdentifier(""), false);
    assert.equal(isValidDocumentIdentifier("   "), false);
    assert.equal(isValidDocumentIdentifier(" club-123 "), false);
    assert.equal(isValidDocumentIdentifier("club/123"), false);
    assert.equal(isValidDocumentIdentifier(null), false);
    assert.equal(isValidDocumentIdentifier(undefined), false);
    assert.equal(isValidDocumentIdentifier(123), false);
  });

  await t.test("7. existing club cannot be overwritten", () => {
    assert.ok(contract.includes("Forbid Overwriting Existing Clubs (`CREATE_ONLY`)"));
    assert.ok(contract.includes("If `proClubs/{clubId}` already exists, provisioning must fail closed immediately (`ERROR_CLUB_EXISTS`)"));
  });

  await t.test("8. initial membership must be OWNER", () => {
    assert.ok(contract.includes("Initial Owner Membership Exact Contract"));
    assert.ok(contract.includes("`authorizationRole: \"OWNER\"`"));
    assert.ok(contract.includes("Forbid Initial Bootstrap of ADMIN or MEMBER"));

    assert.equal(isProClubAuthorizationRole("OWNER"), true);
    assert.equal(isProClubAuthorizationRole("ADMIN"), true);
    assert.equal(isProClubAuthorizationRole("MEMBER"), true);

    const initialMembershipPayload = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    };
    assert.equal(initialMembershipPayload.authorizationRole, "OWNER");
    assert.notEqual(initialMembershipPayload.authorizationRole, "ADMIN");
    assert.notEqual(initialMembershipPayload.authorizationRole, "MEMBER");
  });

  await t.test("9. initial membership must be ACTIVE", () => {
    assert.ok(contract.includes("`status: \"ACTIVE\"`"));
    assert.equal(isProClubMembershipStatus("ACTIVE"), true);
    assert.equal(isProClubMembershipStatus("INACTIVE"), true);
    assert.equal(isProClubMembershipStatus("LEFT"), true);
    assert.equal(isProClubMembershipStatus("REVOKED"), true);

    const initialMembershipPayload = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    };
    assert.equal(initialMembershipPayload.status, "ACTIVE");
  });

  await t.test("10. owner must match exact canonical user", () => {
    assert.ok(contract.includes("Initial Owner Must Be Exact Canonical Existing User"));
    assert.ok(contract.includes("users/{initialOwnerUid}"));
    assert.ok(contract.includes("Bootstrapping a synthetic, missing, or mismatched UID is strictly forbidden"));

    assert.equal(isValidDocumentIdentifier("user-canonical-owner-456"), true);
    assert.equal(isValidDocumentIdentifier(""), false);
  });

  await t.test("11. club + OWNER cannot be split into unsafe partial state", () => {
    assert.ok(contract.includes("Strict 3-Way Atomicity: No Partial State Permitted"));
    assert.ok(contract.includes("Forbidden**: Club exists, but owner membership does not exist"));
    assert.ok(contract.includes("Forbidden**: Owner membership exists, but club does not exist"));
    assert.ok(contract.includes("Forbidden**: Club and owner membership exist, but audit evidence does not exist"));
    assert.ok(contract.includes("If any of the three writes fails, the entire transaction rolls back"));
  });

  await t.test("12. OWNER provisioning does not create staff assignment", () => {
    assert.ok(contract.includes("OWNER Bootstrap Does Not Create Football Staff Assignment"));
    assert.ok(contract.includes("`OWNER != HEAD_COACH`"));
    assert.ok(contract.includes("proClubs/{clubId}/staff/{ownerUid}`. Football staff assignments require separate operational workflows"));
  });

  await t.test("13. provisioning does not create invitation", () => {
    assert.ok(contract.includes("Provisioning Does Not Create Invitations"));
    assert.ok(contract.includes("proClubInvites/{inviteCode}`. Onboarding invitations are issued separately"));
  });

  await t.test("14. provisioning does not fabricate runtime authorization", () => {
    assert.ok(contract.includes("Provisioning Does Not Fabricate Runtime Authorization"));
    assert.ok(contract.includes("does not inject `AUTHORIZED` states into `OrganizationRuntimeContext`"));
  });

  await t.test("15. provisioning does not use users.role as tenant authority", () => {
    assert.ok(contract.includes("`users.role != tenant authority`"));
    assert.ok(contract.includes("global account role (such as `users.role == 'SUPERADMIN'`"));
    assert.ok(contract.includes("cannot be used by client applications to write or manage clubs directly"));
  });

  await t.test("16. audit evidence does not alter exact membership schema", () => {
    assert.ok(contract.includes("Audit Evidence Outside Exact Membership Payload"));
    assert.ok(contract.includes("proClubProvisioningAudits/{provisioningId}"));
    assert.ok(contract.includes("validateProClubMembership"));

    const memberCtx = {
      clubId: "club-1",
      documentClubId: "club-1",
      userId: "user-1",
      documentId: "user-1",
    };

    const exactMembership = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
    };
    assert.equal(validateProClubMembership(exactMembership, memberCtx), true);

    const membershipWithAudit = {
      authorizationRole: "OWNER",
      status: "ACTIVE",
      provisionedAt: "2026-09-04T00:00:00.000Z",
      provisionedBy: "admin",
      auditTraceId: "trace-123",
    };
    assert.equal(validateProClubMembership(membershipWithAudit, memberCtx), false);
  });

  await t.test("audit required in same atomic provisioning transaction", () => {
    assert.ok(contract.includes("Atomic 3-Way Multi-Document Write"));
    assert.ok(contract.includes("`transaction.set(proClubs/{clubId}, clubPayload)`"));
    assert.ok(contract.includes("`transaction.set(proClubs/{clubId}/members/{initialOwnerUid}, membershipPayload)`"));
    assert.ok(contract.includes("`transaction.set(proClubProvisioningAudits/{provisioningId}, auditPayload)`"));
  });

  await t.test("audit requesting actor = exact authenticated ACTIVE SUPERADMIN", () => {
    assert.ok(contract.includes("`requestingSuperAdminUid`: exact authenticated active SuperAdmin principal"));
    assert.ok(contract.includes("\"requestingSuperAdminUid\": \"user-superadmin-789\""));
  });

  await t.test("audit clubId/ownerUid exactly bind created resources", () => {
    assert.ok(contract.includes("`clubId`: exact canonical club ID"));
    assert.ok(contract.includes("`ownerUid`: exact canonical owner UID"));
    assert.ok(contract.includes("`provisioningId`: matches the document ID and unique request token"));
  });

  await t.test("Finding 5: audit is durable immutable-by-contract evidence and closed to client access", () => {
    assert.ok(contract.includes("canonical durable immutable-by-contract provisioning evidence"));
    assert.doesNotMatch(contract, /tamper-proof/i);
    assert.ok(contract.includes("Admin SDK bypasses Firestore Rules"));
    assert.ok(contract.includes("Client Remains Closed"));
    assert.ok(contract.includes("Trusted Service Boundary"));
    assert.ok(contract.includes("IAM / Service Authorization"));
    assert.ok(contract.includes("Application Contract"));
  });

  await t.test("missing audit means provisioning transaction is invalid", () => {
    assert.ok(contract.includes("Forbidden**: Club and owner membership exist, but audit evidence does not exist"));
    assert.ok(contract.includes("If any of the three writes fails, the entire transaction rolls back"));
  });

  await t.test("server logs alone are not canonical provisioning audit evidence", () => {
    assert.ok(contract.includes("Canonical Durable Immutable-by-Contract Provisioning Evidence"));
    assert.ok(contract.includes("Provisioning audit evidence must be persisted as canonical durable immutable-by-contract provisioning evidence in `proClubProvisioningAudits/{provisioningId}`"));
    assert.doesNotMatch(contract, /or server logs/);
    assert.doesNotMatch(contract, /\(e\.g\.\s*proClubProvisioningAudits/);
  });

  await t.test("17. replay/takeover behavior fails closed", () => {
    assert.ok(contract.includes("Replay Safety, Conflict, and Takeover Prevention") || contract.includes("Replay Safety, Fingerprint Integrity, and Takeover Prevention"));
    assert.ok(contract.includes("Binding Replay Detection"));
    assert.ok(contract.includes("Same Request Retry"));
    assert.ok(contract.includes("Provisioning ID Conflict"));
    assert.ok(contract.includes("Existing Club Takeover Prevention"));
    assert.ok(contract.includes("Existing Owner Replacement Prevention"));
    assert.ok(contract.includes("Cross-Club Tenant Isolation"));
  });

  await t.test("same request retry does not create second tenant or owner", () => {
    assert.ok(
      contract.includes("A repeated request with identical `provisioningId`, `clubId`, `ownerUid`, and `requestingSuperAdminUid`") &&
      contract.includes("returning idempotently without duplicate writes"),
    );
  });

  await t.test("same provisioningId with different identity fails closed", () => {
    assert.ok(contract.includes("Reusing an existing `provisioningId` with altered `clubId`, `ownerUid`, or `requestingSuperAdminUid` fails closed immediately (`ERROR_PROVISIONING_ID_CONFLICT`)"));
  });

  await t.test("exact completed retry returns idempotently before club-exists conflict", () => {
    assert.ok(contract.includes("Exact Decision Ordering"));
    assert.ok(contract.includes("Audit check and replay verification occur before club-exists conflict detection, ensuring exact completed retries return idempotently before triggering conflicts"));
    assert.ok(contract.includes("RETURN existing COMPLETED result idempotently"));
    assert.ok(contract.includes("NO WRITE is performed"));
  });

  await t.test("existing audit + missing club fails integrity", () => {
    assert.ok(contract.includes("If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
    assert.ok(contract.includes("Read `proClubs/{clubId}` and `proClubs/{clubId}/members/{initialOwnerUid}`"));
    assert.ok(contract.includes("Both documents must exist"));
  });

  await t.test("existing audit + missing OWNER fails integrity", () => {
    assert.ok(contract.includes("If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
    assert.ok(contract.includes("Both documents must exist"));
  });

  await t.test("existing audit + wrong OWNER payload fails integrity", () => {
    assert.ok(contract.includes("Membership payload must exactly match `{ authorizationRole: \"OWNER\", status: \"ACTIVE\" }`"));
    assert.ok(contract.includes("If club is missing, OWNER is missing, or payload mismatches -> FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
  });

  await t.test("orphan OWNER membership without audit fails integrity", () => {
    assert.ok(contract.includes("If `proClubs/{clubId}/members/{initialOwnerUid}` exists without a valid matching provisioning audit:"));
    assert.ok(contract.includes("FAIL CLOSED (`ERROR_PROVISIONING_INTEGRITY`)"));
    assert.ok(contract.includes("Orphan or pre-existing OWNER membership without valid audit evidence is an integrity violation"));
  });

  await t.test("audit alone can never prove successful provisioning", () => {
    assert.ok(contract.includes("**Audit alone can never prove successful provisioning.**"));
    assert.ok(contract.includes("Only when audit, Club, and OWNER all match completely:"));
  });

  await t.test("Finding 4: post-provisioning club profile edits do not break idempotent retries", () => {
    assert.ok(contract.includes("Post-Provisioning Club Edits") || contract.includes("Post-Provisioning Edits Preservation"));
    assert.ok(contract.includes("Current club profile fields (`name`, `shortName`, `level`, `country`, `logoUrl`) are NOT required to remain identical forever, because legitimate post-provisioning club edits may occur"));
    assert.ok(contract.includes("assert club active status and sovereign OWNER membership rather than demanding mutable profile fields remain frozen forever"));
  });

  await t.test("Finding 4: normalized request fingerprint binds all 9 initial fields deterministically", () => {
    const requiredFields = [
      "provisioningId",
      "clubId",
      "initialOwnerUid",
      "name",
      "shortName",
      "level",
      "country",
      "logoUrl",
      "requestingSuperAdminUid",
    ];
    for (const field of requiredFields) {
      assert.ok(
        contract.includes(field),
        `fingerprint schema missing field: ${field}`,
      );
    }
    assert.ok(contract.includes("NormalizedProClubProvisioningRequestV1"));
    assert.ok(contract.includes("Explicit Request Normalization Rules"));
    assert.ok(contract.includes("String Trimming"));
    assert.ok(contract.includes("Optional Nullability"));
    assert.ok(contract.includes("Strict Level"));
    assert.ok(contract.includes("Canonical Key Ordering"));
    assert.ok(contract.includes("Deterministic Fingerprint Calculation"));

    // Verify deterministic fingerprint computation helper function
    const input1 = {
      provisioningId: "  prov-lampang-20260904-001  ",
      clubId: "  club-lampang  ",
      initialOwnerUid: "  user-owner-123  ",
      name: "  Lampang FC  ",
      shortName: "  LFC  ",
      level: "T1" as const,
      country: "  TH  ",
      logoUrl: "  https://example.com/logo.png  ",
      requestingSuperAdminUid: "  user-superadmin-789  ",
    };
    const input2 = {
      provisioningId: "prov-lampang-20260904-001",
      clubId: "club-lampang",
      initialOwnerUid: "user-owner-123",
      name: "Lampang FC",
      shortName: "LFC",
      level: "T1" as const,
      country: "TH",
      logoUrl: "https://example.com/logo.png",
      requestingSuperAdminUid: "user-superadmin-789",
    };
    const fp1 = computeProvisioningRequestFingerprint(input1);
    const fp2 = computeProvisioningRequestFingerprint(input2);
    assert.equal(fp1, fp2);
    assert.equal(fp1, "sha256:9e51527c280bde9ff8199cf21939b510bd0289e2a6769019a87b11646bd66332");
    assert.ok(contract.includes("sha256:9e51527c280bde9ff8199cf21939b510bd0289e2a6769019a87b11646bd66332"));

    // Altered field must produce a different fingerprint
    const inputAltered = { ...input2, name: "Lampang United" };
    const fpAltered = computeProvisioningRequestFingerprint(inputAltered);
    assert.notEqual(fp1, fpAltered);

    // Empty optional fields normalize to null deterministically
    const inputEmptyOpts = {
      ...input2,
      shortName: "   ",
      country: "",
      logoUrl: undefined,
    };
    const fpEmpty = computeProvisioningRequestFingerprint(inputEmptyOpts);
    const normalizedEmpty = normalizeProvisioningRequest(inputEmptyOpts);
    assert.equal(normalizedEmpty.shortName, null);
    assert.equal(normalizedEmpty.country, null);
    assert.equal(normalizedEmpty.logoUrl, null);
    assert.match(fpEmpty, /^sha256:[a-f0-9]{64}$/);
  });

  await t.test("18. contract alone does not authorize production implementation", () => {
    assert.ok(contract.includes("Contract Freeze Scope Boundary"));
    assert.ok(contract.includes("This contract slice is documentation and contract tests only"));
    assert.ok(contract.includes("It does NOT authorize production implementation, client write paths, or deployment"));
  });

  await t.test("Finding 1: complete runtime request validation freezes all untrusted fields", () => {
    const validTokenUid = "user-superadmin-789";
    const validBaseInput = {
      provisioningId: "prov-lampang-001",
      clubId: "club-lampang",
      initialOwnerUid: "user-owner-123",
      name: "Lampang FC",
      level: "T1" as const,
      shortName: "LFC",
      country: "TH",
      logoUrl: "https://example.com/logo.png",
    };

    // Valid request succeeds and passes model validation
    const validRes = validateProvisioningRequestRuntime(validBaseInput, validTokenUid);
    assert.equal(validRes.valid, true);
    if (validRes.valid) {
      assert.equal(validRes.clubPayload.name, "Lampang FC");
      assert.equal(validRes.clubPayload.level, "T1");
      assert.equal(validRes.clubPayload.status, "ACTIVE");
      assert.equal(validRes.clubPayload.shortName, "LFC");
      assert.equal(validRes.clubPayload.country, "TH");
      assert.equal(validRes.clubPayload.logoUrl, "https://example.com/logo.png");
      assert.equal(
        validateProClub(validRes.clubPayload, {
          clubId: validRes.normalizedRequest.clubId,
          documentId: validRes.normalizedRequest.clubId,
        }),
        true,
      );
    }

    // Number shortName rejected
    const numShortNameRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, shortName: 12345 },
      validTokenUid,
    );
    assert.equal(numShortNameRes.valid, false);
    if (!numShortNameRes.valid) {
      assert.equal(numShortNameRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(numShortNameRes.writesCount, 0);
    }

    // Object country rejected
    const objCountryRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, country: { code: "TH" } },
      validTokenUid,
    );
    assert.equal(objCountryRes.valid, false);
    if (!objCountryRes.valid) {
      assert.equal(objCountryRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(objCountryRes.writesCount, 0);
    }

    // Array logoUrl rejected
    const arrLogoRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, logoUrl: ["https://example.com/logo.png"] },
      validTokenUid,
    );
    assert.equal(arrLogoRes.valid, false);
    if (!arrLogoRes.valid) {
      assert.equal(arrLogoRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(arrLogoRes.writesCount, 0);
    }

    // Boolean optional field rejected
    const boolShortNameRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, shortName: true },
      validTokenUid,
    );
    assert.equal(boolShortNameRes.valid, false);
    if (!boolShortNameRes.valid) {
      assert.equal(boolShortNameRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(boolShortNameRes.writesCount, 0);
    }

    const boolCountryRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, country: false },
      validTokenUid,
    );
    assert.equal(boolCountryRes.valid, false);
    if (!boolCountryRes.valid) {
      assert.equal(boolCountryRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(boolCountryRes.writesCount, 0);
    }

    const boolLogoRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, logoUrl: true },
      validTokenUid,
    );
    assert.equal(boolLogoRes.valid, false);
    if (!boolLogoRes.valid) {
      assert.equal(boolLogoRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(boolLogoRes.writesCount, 0);
    }

    // Empty normalized name rejected
    const emptyNameRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, name: "   " },
      validTokenUid,
    );
    assert.equal(emptyNameRes.valid, false);
    if (!emptyNameRes.valid) {
      assert.equal(emptyNameRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(emptyNameRes.writesCount, 0);
    }

    // Invalid level rejected
    for (const invalidLevel of ["T0", "T4", "PREMIER", "T1_PLUS", "", null, 1]) {
      const invalidLevelRes = validateProvisioningRequestRuntime(
        { ...validBaseInput, level: invalidLevel },
        validTokenUid,
      );
      assert.equal(invalidLevelRes.valid, false);
      if (!invalidLevelRes.valid) {
        assert.equal(invalidLevelRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
        assert.equal(invalidLevelRes.writesCount, 0);
      }
    }

    // Exact normalized club payload passes model validation with null optional fields
    const nullOptionalRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, shortName: "   ", country: null, logoUrl: undefined },
      validTokenUid,
    );
    assert.equal(nullOptionalRes.valid, true);
    if (nullOptionalRes.valid) {
      assert.equal(nullOptionalRes.normalizedRequest.shortName, null);
      assert.equal(nullOptionalRes.normalizedRequest.country, null);
      assert.equal(nullOptionalRes.normalizedRequest.logoUrl, null);
      assert.equal("shortName" in nullOptionalRes.clubPayload, false);
      assert.equal("country" in nullOptionalRes.clubPayload, false);
      assert.equal("logoUrl" in nullOptionalRes.clubPayload, false);
      assert.equal(
        validateProClub(nullOptionalRes.clubPayload, {
          clubId: nullOptionalRes.normalizedRequest.clubId,
          documentId: nullOptionalRes.normalizedRequest.clubId,
        }),
        true,
      );
    }

    // Invalid payload performs no authorized provisioning path by contract (ZERO WRITES)
    const invalidDocIdRes = validateProvisioningRequestRuntime(
      { ...validBaseInput, clubId: "invalid/slash/id" },
      validTokenUid,
    );
    assert.equal(invalidDocIdRes.valid, false);
    if (!invalidDocIdRes.valid) {
      assert.equal(invalidDocIdRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(invalidDocIdRes.writesCount, 0);
    }

    // Requester UID must strictly come from verified token, not client payload
    const invalidTokenRes = validateProvisioningRequestRuntime(
      validBaseInput,
      "invalid/slash/uid",
    );
    assert.equal(invalidTokenRes.valid, false);
    if (!invalidTokenRes.valid) {
      assert.equal(invalidTokenRes.error, "ERROR_INVALID_PROVISIONING_REQUEST");
      assert.equal(invalidTokenRes.writesCount, 0);
    }

    // Contract text verification
    assert.ok(contract.includes("Complete Runtime Request Validation"));
    assert.ok(contract.includes("ERROR_INVALID_PROVISIONING_REQUEST"));
    assert.ok(contract.includes("ZERO WRITES"));
  });

  await t.test("Finding 2: complete audit validation on replay enforces canonical shape and integrity", () => {
    const provId = "prov-lampang-20260904-001";
    const clubId = "club-lampang";
    const ownerUid = "user-owner-123";
    const superAdminUid = "user-superadmin-789";

    const canonicalNormRequest = {
      clubId,
      country: "TH",
      initialOwnerUid: ownerUid,
      level: "T1" as const,
      logoUrl: "https://example.com/logo.png",
      name: "Lampang FC",
      provisioningId: provId,
      requestingSuperAdminUid: superAdminUid,
      shortName: "LFC",
    };
    const canonicalFp = `sha256:${createHash("sha256").update(JSON.stringify(canonicalNormRequest)).digest("hex")}`;

    const validAudit = {
      schemaVersion: 1,
      provisioningId: provId,
      clubId,
      ownerUid,
      requestingSuperAdminUid: superAdminUid,
      requestFingerprint: canonicalFp,
      normalizedRequest: { ...canonicalNormRequest },
      createdAt: "2026-09-04T00:00:00.000Z",
      status: "COMPLETED",
    };

    // Valid exact audit may proceed to canonical resource integrity checks
    const validRes = validateProvisioningAuditOnReplay(validAudit, provId, superAdminUid);
    assert.equal(validRes.valid, true);
    if (validRes.valid) {
      assert.equal(validRes.status, "COMPLETED");
      assert.equal(validRes.proceedToResourceIntegrityChecks, true);
    }

    // Wrong schemaVersion fails
    const wrongSchemaRes = validateProvisioningAuditOnReplay(
      { ...validAudit, schemaVersion: 2 },
      provId,
      superAdminUid,
    );
    assert.equal(wrongSchemaRes.valid, false);
    if (!wrongSchemaRes.valid) {
      assert.equal(wrongSchemaRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Status PENDING fails (must never return COMPLETED)
    const pendingStatusRes = validateProvisioningAuditOnReplay(
      { ...validAudit, status: "PENDING" },
      provId,
      superAdminUid,
    );
    assert.equal(pendingStatusRes.valid, false);
    if (!pendingStatusRes.valid) {
      assert.equal(pendingStatusRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Missing createdAt fails
    const auditWithoutCreatedAt = { ...validAudit };
    delete (auditWithoutCreatedAt as Record<string, unknown>).createdAt;
    const missingCreatedAtRes = validateProvisioningAuditOnReplay(
      auditWithoutCreatedAt,
      provId,
      superAdminUid,
    );
    assert.equal(missingCreatedAtRes.valid, false);
    if (!missingCreatedAtRes.valid) {
      assert.equal(missingCreatedAtRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Invalid timestamp fails
    const invalidTimestampRes = validateProvisioningAuditOnReplay(
      { ...validAudit, createdAt: "not-a-valid-timestamp" },
      provId,
      superAdminUid,
    );
    assert.equal(invalidTimestampRes.valid, false);
    if (!invalidTimestampRes.valid) {
      assert.equal(invalidTimestampRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Extra audit field fails
    const extraAuditFieldRes = validateProvisioningAuditOnReplay(
      { ...validAudit, extraField: "unexpected" },
      provId,
      superAdminUid,
    );
    assert.equal(extraAuditFieldRes.valid, false);
    if (!extraAuditFieldRes.valid) {
      assert.equal(extraAuditFieldRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Malformed fingerprint fails
    for (const badFp of [
      "not-a-sha256",
      "sha256:xyz",
      "sha256:9e51527c280bde9ff8199cf21939b510bd0289e2a6769019a87b11646bd6633", // 63 chars
      "sha256:9e51527c280bde9ff8199cf21939b510bd0289e2a6769019a87b11646bd663321", // 65 chars
      12345,
    ]) {
      const malformedFpRes = validateProvisioningAuditOnReplay(
        { ...validAudit, requestFingerprint: badFp },
        provId,
        superAdminUid,
      );
      assert.equal(malformedFpRes.valid, false);
      if (!malformedFpRes.valid) {
        assert.equal(malformedFpRes.error, "ERROR_PROVISIONING_INTEGRITY");
      }
    }

    // normalizedRequest extra field fails
    const normExtraFieldRes = validateProvisioningAuditOnReplay(
      {
        ...validAudit,
        normalizedRequest: { ...canonicalNormRequest, unexpectedKey: "forbidden" },
      },
      provId,
      superAdminUid,
    );
    assert.equal(normExtraFieldRes.valid, false);
    if (!normExtraFieldRes.valid) {
      assert.equal(normExtraFieldRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // normalizedRequest/fingerprint mismatch fails
    const fpMismatchRes = validateProvisioningAuditOnReplay(
      {
        ...validAudit,
        normalizedRequest: { ...canonicalNormRequest, name: "Tampered FC" },
      },
      provId,
      superAdminUid,
    );
    assert.equal(fpMismatchRes.valid, false);
    if (!fpMismatchRes.valid) {
      assert.equal(fpMismatchRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Requester mismatch fails
    const requesterMismatchRes = validateProvisioningAuditOnReplay(
      validAudit,
      provId,
      "user-other-admin-999",
    );
    assert.equal(requesterMismatchRes.valid, false);
    if (!requesterMismatchRes.valid) {
      assert.equal(requesterMismatchRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Owner mismatch fails
    const ownerMismatchRes = validateProvisioningAuditOnReplay(
      { ...validAudit, ownerUid: "user-different-owner-456" },
      provId,
      superAdminUid,
    );
    assert.equal(ownerMismatchRes.valid, false);
    if (!ownerMismatchRes.valid) {
      assert.equal(ownerMismatchRes.error, "ERROR_PROVISIONING_INTEGRITY");
    }

    // Contract text verification
    assert.ok(contract.includes("Complete Canonical Audit Shape Validation"));
    assert.ok(contract.includes("audit.schemaVersion === 1"));
    assert.ok(contract.includes("audit.status === \"COMPLETED\""));
    assert.ok(contract.includes("ERROR_PROVISIONING_INTEGRITY"));
  });
});
