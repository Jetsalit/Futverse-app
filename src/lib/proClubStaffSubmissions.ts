import type { ProClubStaffRole } from "../types/ProClub";
import { isProClubStaffRole, isValidDocumentIdentifier } from "./proClubModel";
import {
  isProClubTechnicalWorkStatus,
  type ProClubTechnicalAuthorityRole,
  type ProClubTechnicalWorkStatus,
} from "./proClubTechnicalGovernance";

export const PRO_CLUB_STAFF_SUBMISSION_SCHEMA_VERSION = 1 as const;
export const PRO_CLUB_STAFF_SUBMISSION_MODULE = "TRAINING" as const;

export const PRO_CLUB_STAFF_SUBMISSION_AUTHOR_ROLES = [
  "ASSISTANT_COACH",
  "GK_COACH",
  "FITNESS_COACH",
  "ANALYST",
  "PHYSIO",
] as const;

export type ProClubStaffSubmissionAuthorRole =
  (typeof PRO_CLUB_STAFF_SUBMISSION_AUTHOR_ROLES)[number];

export const PRO_CLUB_STAFF_SUBMISSION_WORK_TYPES = [
  "TRAINING_SUPPORT",
  "GK_TRAINING",
  "FITNESS",
  "ANALYSIS",
  "PHYSIO",
] as const;

export type ProClubStaffSubmissionWorkType =
  (typeof PRO_CLUB_STAFF_SUBMISSION_WORK_TYPES)[number];

export interface ProClubStaffSubmissionContentInput {
  workType: ProClubStaffSubmissionWorkType;
  title: string;
  summary: string;
  targetPlanId: string | null;
  targetSessionDate: string | null;
}

export interface ValidProClubStaffSubmissionContent
  extends ProClubStaffSubmissionContentInput {
  schemaVersion: 1;
  module: "TRAINING";
}

export interface ProClubStaffSubmissionRecord {
  submissionId: string;
  schemaVersion: 1;
  authorUid: string;
  authorRole: ProClubStaffSubmissionAuthorRole;
  workType: ProClubStaffSubmissionWorkType;
  title: string;
  summary: string;
  module: "TRAINING";
  targetPlanId: string | null;
  targetSessionDate: string | null;
  status: ProClubTechnicalWorkStatus;
  reviewerUid: string | null;
  reviewerRole: ProClubTechnicalAuthorityRole | null;
  reviewNote: string | null;
  createdAt: unknown;
  createdBy: string;
  updatedAt: unknown;
  updatedBy: string;
  submittedAt: unknown | null;
  submittedBy: string | null;
  reviewStartedAt: unknown | null;
  reviewStartedBy: string | null;
  revisionRequestedAt: unknown | null;
  revisionRequestedBy: string | null;
  approvedAt: unknown | null;
  approvedBy: string | null;
}

export type ProClubStaffSubmissionContentValidationResult =
  | { ok: true; value: ValidProClubStaffSubmissionContent }
  | { ok: false; errors: string[] };

const CONTENT_KEYS = [
  "workType",
  "title",
  "summary",
  "targetPlanId",
  "targetSessionDate",
] as const;

const STORED_KEYS = [
  "schemaVersion",
  "authorUid",
  "authorRole",
  "workType",
  "title",
  "summary",
  "module",
  "targetPlanId",
  "targetSessionDate",
  "status",
  "reviewerUid",
  "reviewerRole",
  "reviewNote",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "submittedAt",
  "submittedBy",
  "reviewStartedAt",
  "reviewStartedBy",
  "revisionRequestedAt",
  "revisionRequestedBy",
  "approvedAt",
  "approvedBy",
] as const;

const ROLE_WORK_TYPE: Readonly<
  Record<ProClubStaffSubmissionAuthorRole, ProClubStaffSubmissionWorkType>
> = {
  ASSISTANT_COACH: "TRAINING_SUPPORT",
  GK_COACH: "GK_TRAINING",
  FITNESS_COACH: "FITNESS",
  ANALYST: "ANALYSIS",
  PHYSIO: "PHYSIO",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length &&
    actual.join(",") === canonical.join(",");
}

function isStrictDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function boundedTrimmedText(
  value: unknown,
  maxLength: number,
  required: boolean,
): value is string {
  if (typeof value !== "string") return false;
  if (value.trim() !== value) return false;
  if (value.length > maxLength) return false;
  return required ? value.length > 0 : true;
}

function isNullableIdentifier(value: unknown): value is string | null {
  return value === null || isValidDocumentIdentifier(value);
}

function isNullableStrictDate(value: unknown): value is string | null {
  return value === null || isStrictDate(value);
}

function isNullableIdentifierAudit(value: unknown): value is string | null {
  return value === null || isValidDocumentIdentifier(value);
}

function isNullableReviewRole(
  value: unknown,
): value is ProClubTechnicalAuthorityRole | null {
  return value === null ||
    value === "TECHNICAL_DIRECTOR" ||
    value === "HEAD_COACH";
}

function isNullableReviewNote(value: unknown): value is string | null {
  return value === null ||
    boundedTrimmedText(value, 2000, true);
}

export function isProClubStaffSubmissionAuthorRole(
  value: unknown,
): value is ProClubStaffSubmissionAuthorRole {
  return (
    value === "ASSISTANT_COACH" ||
    value === "GK_COACH" ||
    value === "FITNESS_COACH" ||
    value === "ANALYST" ||
    value === "PHYSIO"
  );
}

export function isProClubStaffSubmissionWorkType(
  value: unknown,
): value is ProClubStaffSubmissionWorkType {
  return (
    value === "TRAINING_SUPPORT" ||
    value === "GK_TRAINING" ||
    value === "FITNESS" ||
    value === "ANALYSIS" ||
    value === "PHYSIO"
  );
}

export function expectedProClubStaffSubmissionWorkType(
  role: unknown,
): ProClubStaffSubmissionWorkType | null {
  return isProClubStaffSubmissionAuthorRole(role)
    ? ROLE_WORK_TYPE[role]
    : null;
}

export function isCompatibleProClubStaffSubmissionWorkType(
  role: unknown,
  workType: unknown,
): boolean {
  const expected = expectedProClubStaffSubmissionWorkType(role);
  return expected !== null && expected === workType;
}

export function canAuthorProClubStaffSubmission(
  role: ProClubStaffRole | null,
): role is ProClubStaffSubmissionAuthorRole {
  return role !== null &&
    isProClubStaffRole(role) &&
    isProClubStaffSubmissionAuthorRole(role);
}

export function validateProClubStaffSubmissionContent(
  input: unknown,
): ProClubStaffSubmissionContentValidationResult {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["Staff Submission content must be an object."] };
  }

  const errors: string[] = [];

  if (!hasExactKeys(input, CONTENT_KEYS)) {
    errors.push("Staff Submission content contains unknown or missing fields.");
  }
  if (!isProClubStaffSubmissionWorkType(input.workType)) {
    errors.push("Invalid Staff Submission workType.");
  }
  if (!boundedTrimmedText(input.title, 160, true)) {
    errors.push("title must be trimmed text between 1 and 160 characters.");
  }
  if (!boundedTrimmedText(input.summary, 5000, true)) {
    errors.push("summary must be trimmed text between 1 and 5000 characters.");
  }
  if (!isNullableIdentifier(input.targetPlanId)) {
    errors.push("targetPlanId must be null or an exact document identifier.");
  }
  if (!isNullableStrictDate(input.targetSessionDate)) {
    errors.push("targetSessionDate must be null or a strict YYYY-MM-DD date.");
  }
  if (input.targetSessionDate !== null && input.targetPlanId === null) {
    errors.push("targetSessionDate requires targetPlanId.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: PRO_CLUB_STAFF_SUBMISSION_SCHEMA_VERSION,
      module: PRO_CLUB_STAFF_SUBMISSION_MODULE,
      workType: input.workType as ProClubStaffSubmissionWorkType,
      title: input.title as string,
      summary: input.summary as string,
      targetPlanId: input.targetPlanId as string | null,
      targetSessionDate: input.targetSessionDate as string | null,
    },
  };
}

function lifecycleAuditIsConsistent(record: Record<string, unknown>): boolean {
  const status = record.status as ProClubTechnicalWorkStatus;

  const hasSubmit =
    record.submittedAt !== null &&
    isValidDocumentIdentifier(record.submittedBy);
  const hasReviewStart =
    record.reviewStartedAt !== null &&
    isValidDocumentIdentifier(record.reviewStartedBy);
  const hasRevision =
    record.revisionRequestedAt !== null &&
    isValidDocumentIdentifier(record.revisionRequestedBy);
  const hasApproval =
    record.approvedAt !== null &&
    isValidDocumentIdentifier(record.approvedBy);

  if (status === "DRAFT") {
    return !hasSubmit && !hasReviewStart && !hasRevision && !hasApproval;
  }
  if (status === "SUBMITTED") {
    return (
      hasSubmit &&
      !hasApproval &&
      ((!hasReviewStart && !hasRevision) || (hasReviewStart && hasRevision))
    );
  }
  if (status === "IN_REVIEW") {
    return hasSubmit && hasReviewStart && !hasApproval;
  }
  if (status === "NEEDS_REVISION") {
    return hasSubmit && hasReviewStart && hasRevision && !hasApproval;
  }
  if (status === "APPROVED") {
    return hasSubmit && hasReviewStart && hasApproval;
  }

  return false;
}

export function parseProClubStaffSubmissionRecord(
  submissionId: unknown,
  raw: unknown,
): ProClubStaffSubmissionRecord {
  if (!isValidDocumentIdentifier(submissionId)) {
    throw new Error("submissionId must be an exact document identifier.");
  }
  if (!isPlainObject(raw) || !hasExactKeys(raw, STORED_KEYS)) {
    throw new Error("Invalid Pro Club Staff Submission document shape.");
  }
  if (
    raw.schemaVersion !== PRO_CLUB_STAFF_SUBMISSION_SCHEMA_VERSION ||
    raw.module !== PRO_CLUB_STAFF_SUBMISSION_MODULE ||
    !isValidDocumentIdentifier(raw.authorUid) ||
    !isProClubStaffSubmissionAuthorRole(raw.authorRole) ||
    !isCompatibleProClubStaffSubmissionWorkType(raw.authorRole, raw.workType) ||
    !boundedTrimmedText(raw.title, 160, true) ||
    !boundedTrimmedText(raw.summary, 5000, true) ||
    !isNullableIdentifier(raw.targetPlanId) ||
    !isNullableStrictDate(raw.targetSessionDate) ||
    (raw.targetSessionDate !== null && raw.targetPlanId === null) ||
    !isProClubTechnicalWorkStatus(raw.status) ||
    raw.status === "PUBLISHED" ||
    !isNullableIdentifierAudit(raw.reviewerUid) ||
    !isNullableReviewRole(raw.reviewerRole) ||
    !isNullableReviewNote(raw.reviewNote) ||
    (raw.reviewerUid === null) !== (raw.reviewerRole === null) ||
    raw.createdAt == null ||
    raw.updatedAt == null ||
    !isValidDocumentIdentifier(raw.createdBy) ||
    !isValidDocumentIdentifier(raw.updatedBy) ||
    raw.createdBy !== raw.authorUid ||
    !isNullableIdentifierAudit(raw.submittedBy) ||
    !isNullableIdentifierAudit(raw.reviewStartedBy) ||
    !isNullableIdentifierAudit(raw.revisionRequestedBy) ||
    !isNullableIdentifierAudit(raw.approvedBy) ||
    !lifecycleAuditIsConsistent(raw)
  ) {
    throw new Error("Invalid Pro Club Staff Submission invariants.");
  }

  if (
    (raw.status === "IN_REVIEW" ||
      raw.status === "NEEDS_REVISION" ||
      raw.status === "APPROVED") &&
    (raw.reviewerUid === null || raw.reviewerRole === null)
  ) {
    throw new Error("Reviewed Staff Submission requires reviewer provenance.");
  }

  return {
    submissionId,
    schemaVersion: 1,
    authorUid: raw.authorUid,
    authorRole: raw.authorRole,
    workType: raw.workType,
    title: raw.title,
    summary: raw.summary,
    module: "TRAINING",
    targetPlanId: raw.targetPlanId,
    targetSessionDate: raw.targetSessionDate,
    status: raw.status,
    reviewerUid: raw.reviewerUid,
    reviewerRole: raw.reviewerRole,
    reviewNote: raw.reviewNote,
    createdAt: raw.createdAt,
    createdBy: raw.createdBy,
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
    submittedAt: raw.submittedAt,
    submittedBy: raw.submittedBy,
    reviewStartedAt: raw.reviewStartedAt,
    reviewStartedBy: raw.reviewStartedBy,
    revisionRequestedAt: raw.revisionRequestedAt,
    revisionRequestedBy: raw.revisionRequestedBy,
    approvedAt: raw.approvedAt,
    approvedBy: raw.approvedBy,
  };
}
