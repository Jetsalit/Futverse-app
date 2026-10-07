import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveProClubDrillSubmissionStatus,
  parseProClubDrillSubmissionReview,
  validateProClubDrillSubmissionReviewNote,
  type ProClubDrillSubmissionReviewRecord,
} from "../src/lib/proClubDrillSubmissionReview";

test("mapsOnlySuccessfulMissingReviewToSubmitted", () => {
  const review: ProClubDrillSubmissionReviewRecord = {
    schemaVersion: 1,
    submissionId: "submission-1",
    status: "IN_REVIEW",
    reviewerUid: "reviewer-1",
    reviewerRole: "HEAD_COACH",
    reviewNote: null,
    reviewStartedAt: { seconds: 1 },
    reviewStartedBy: "reviewer-1",
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
    updatedAt: { seconds: 1 },
    updatedBy: "reviewer-1",
  };
  assert.equal(effectiveProClubDrillSubmissionStatus(null), "SUBMITTED");
  assert.equal(effectiveProClubDrillSubmissionStatus(review), "IN_REVIEW");
});

test("parsesOnlyBoundedLifecycleReviewFields", () => {
  const parsed = parseProClubDrillSubmissionReview("submission-1", {
    schemaVersion: 1,
    submissionId: "submission-1",
    status: "IN_REVIEW",
    reviewerUid: "reviewer-1",
    reviewerRole: "HEAD_COACH",
    reviewNote: null,
    reviewStartedAt: { seconds: 1 },
    reviewStartedBy: "reviewer-1",
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
    updatedAt: { seconds: 1 },
    updatedBy: "reviewer-1",
  });
  assert.equal(parsed.status, "IN_REVIEW");
  assert.equal(parsed.reviewerUid, "reviewer-1");
});

test("rejectsReviewWithUnexpectedOrMismatchedFields", () => {
  assert.throws(() => parseProClubDrillSubmissionReview("a", {
    schemaVersion: 1,
    submissionId: "b",
    status: "APPROVED",
    reviewerUid: "reviewer-1",
    reviewerRole: "HEAD_COACH",
    reviewNote: "Done",
    reviewStartedAt: { seconds: 1 },
    reviewStartedBy: "reviewer-1",
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: { seconds: 2 },
    approvedBy: "reviewer-1",
    updatedAt: { seconds: 2 },
    updatedBy: "reviewer-1",
    snapshot: {},
  }), /invalid|field|schema/i);
});

test("validatesTrimmedNotesWithinTwoThousandCharacters", () => {
  assert.equal(validateProClubDrillSubmissionReviewNote("\u0800".repeat(2000)).length, 2000);
  assert.throws(() => validateProClubDrillSubmissionReviewNote("\u0800".repeat(2001)), /2000/);
  assert.throws(() => validateProClubDrillSubmissionReviewNote(" padded "), /trimmed/);
  assert.throws(() => validateProClubDrillSubmissionReviewNote(""), /1 and 2000/);
});
