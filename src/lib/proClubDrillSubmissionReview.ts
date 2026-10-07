import { isValidDocumentIdentifier } from "./proClubModel";
import type { ProClubTechnicalAuthorityRole } from "./proClubTechnicalGovernance";

export const PRO_CLUB_DRILL_SUBMISSION_REVIEW_NOTE_MAX_LENGTH = 2_000;

export type ProClubDrillSubmissionReviewStatus =
  | "IN_REVIEW"
  | "NEEDS_REVISION"
  | "APPROVED";

export type ProClubDrillSubmissionEffectiveStatus =
  | "SUBMITTED"
  | ProClubDrillSubmissionReviewStatus;

export interface ProClubDrillSubmissionReviewRecord {
  readonly schemaVersion: 1;
  readonly submissionId: string;
  readonly status: ProClubDrillSubmissionReviewStatus;
  readonly reviewerUid: string;
  readonly reviewerRole: ProClubTechnicalAuthorityRole;
  readonly reviewNote: string | null;
  readonly reviewStartedAt: unknown;
  readonly reviewStartedBy: string;
  readonly revisionRequestedAt: unknown | null;
  readonly revisionRequestedBy: string | null;
  readonly approvedAt: unknown | null;
  readonly approvedBy: string | null;
  readonly updatedAt: unknown;
  readonly updatedBy: string;
}

const REVIEW_FIELDS = new Set([
  "schemaVersion",
  "submissionId",
  "status",
  "reviewerUid",
  "reviewerRole",
  "reviewNote",
  "reviewStartedAt",
  "reviewStartedBy",
  "revisionRequestedAt",
  "revisionRequestedBy",
  "approvedAt",
  "approvedBy",
  "updatedAt",
  "updatedBy",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTechnicalAuthorityRole(
  value: unknown,
): value is ProClubTechnicalAuthorityRole {
  return value === "HEAD_COACH" || value === "TECHNICAL_DIRECTOR";
}

export function validateProClubDrillSubmissionReviewNote(note: unknown): string {
  if (
    typeof note !== "string" ||
    note.trim() !== note ||
    note.length < 1 ||
    note.length > PRO_CLUB_DRILL_SUBMISSION_REVIEW_NOTE_MAX_LENGTH
  ) {
    throw new TypeError("Review note must be trimmed text between 1 and 2000 characters.");
  }
  return note;
}

export function parseProClubDrillSubmissionReview(
  submissionId: string,
  raw: unknown,
): ProClubDrillSubmissionReviewRecord {
  if (!isValidDocumentIdentifier(submissionId) || !isRecord(raw)) {
    throw new TypeError("Pro Club drill submission review is invalid.");
  }
  if (
    Object.keys(raw).some((field) => !REVIEW_FIELDS.has(field)) ||
    Object.keys(raw).length !== REVIEW_FIELDS.size ||
    raw.schemaVersion !== 1 ||
    raw.submissionId !== submissionId ||
    (raw.status !== "IN_REVIEW" &&
      raw.status !== "NEEDS_REVISION" &&
      raw.status !== "APPROVED") ||
    !isValidDocumentIdentifier(raw.reviewerUid) ||
    !isTechnicalAuthorityRole(raw.reviewerRole) ||
    (raw.reviewNote !== null &&
      (typeof raw.reviewNote !== "string" ||
        raw.reviewNote.trim() !== raw.reviewNote ||
        raw.reviewNote.length < 1 ||
        raw.reviewNote.length > PRO_CLUB_DRILL_SUBMISSION_REVIEW_NOTE_MAX_LENGTH)) ||
    raw.reviewStartedAt === null ||
    raw.reviewStartedAt === undefined ||
    raw.reviewStartedBy !== raw.reviewerUid ||
    raw.updatedAt === null ||
    raw.updatedAt === undefined ||
    raw.updatedBy !== raw.reviewerUid
  ) {
    throw new TypeError("Pro Club drill submission review fields are invalid.");
  }

  if (raw.status === "IN_REVIEW") {
    if (
      raw.reviewNote !== null ||
      raw.revisionRequestedAt !== null ||
      raw.revisionRequestedBy !== null ||
      raw.approvedAt !== null ||
      raw.approvedBy !== null
    ) {
      throw new TypeError("IN_REVIEW lifecycle fields are invalid.");
    }
  } else if (raw.status === "NEEDS_REVISION") {
    if (
      raw.reviewNote === null ||
      raw.revisionRequestedAt === null ||
      raw.revisionRequestedAt === undefined ||
      raw.revisionRequestedBy !== raw.reviewerUid ||
      raw.approvedAt !== null ||
      raw.approvedBy !== null
    ) {
      throw new TypeError("NEEDS_REVISION lifecycle fields are invalid.");
    }
  } else if (
    raw.reviewNote === null ||
    raw.approvedAt === null ||
    raw.approvedAt === undefined ||
    raw.approvedBy !== raw.reviewerUid ||
    raw.revisionRequestedAt !== null ||
    raw.revisionRequestedBy !== null
  ) {
    throw new TypeError("APPROVED lifecycle fields are invalid.");
  }

  return raw as unknown as ProClubDrillSubmissionReviewRecord;
}

export function effectiveProClubDrillSubmissionStatus(
  review: ProClubDrillSubmissionReviewRecord | null,
): ProClubDrillSubmissionEffectiveStatus {
  return review?.status ?? "SUBMITTED";
}
