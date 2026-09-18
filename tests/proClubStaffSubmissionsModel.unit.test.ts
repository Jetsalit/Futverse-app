import assert from "node:assert/strict";
import test from "node:test";

import {
  canAuthorProClubStaffSubmission,
  expectedProClubStaffSubmissionWorkType,
  isCompatibleProClubStaffSubmissionWorkType,
  parseProClubStaffSubmissionRecord,
  validateProClubStaffSubmissionContent,
} from "../src/lib/proClubStaffSubmissions";

const baseDocument = {
  schemaVersion: 1,
  authorUid: "fitness-1",
  authorRole: "FITNESS_COACH",
  workType: "FITNESS",
  title: "Conditioning load",
  summary: "MD-3 conditioning support.",
  module: "TRAINING",
  targetPlanId: "plan-1",
  targetSessionDate: "2026-09-21",
  status: "DRAFT",
  reviewerUid: null,
  reviewerRole: null,
  reviewNote: null,
  createdAt: { timestamp: 1 },
  createdBy: "fitness-1",
  updatedAt: { timestamp: 1 },
  updatedBy: "fitness-1",
  submittedAt: null,
  submittedBy: null,
  reviewStartedAt: null,
  reviewStartedBy: null,
  revisionRequestedAt: null,
  revisionRequestedBy: null,
  approvedAt: null,
  approvedBy: null,
} as const;

test("freezes V1 author role to work-type compatibility", () => {
  assert.equal(expectedProClubStaffSubmissionWorkType("ASSISTANT_COACH"), "TRAINING_SUPPORT");
  assert.equal(expectedProClubStaffSubmissionWorkType("GK_COACH"), "GK_TRAINING");
  assert.equal(expectedProClubStaffSubmissionWorkType("FITNESS_COACH"), "FITNESS");
  assert.equal(expectedProClubStaffSubmissionWorkType("ANALYST"), "ANALYSIS");
  assert.equal(expectedProClubStaffSubmissionWorkType("PHYSIO"), "PHYSIO");
  assert.equal(expectedProClubStaffSubmissionWorkType("HEAD_COACH"), null);

  assert.equal(isCompatibleProClubStaffSubmissionWorkType("FITNESS_COACH", "FITNESS"), true);
  assert.equal(isCompatibleProClubStaffSubmissionWorkType("FITNESS_COACH", "ANALYSIS"), false);
});

test("only the reviewed V1 staff roles get the generic submission authoring path", () => {
  for (const role of [
    "ASSISTANT_COACH",
    "GK_COACH",
    "FITNESS_COACH",
    "ANALYST",
    "PHYSIO",
  ] as const) {
    assert.equal(canAuthorProClubStaffSubmission(role), true);
  }
  for (const role of [
    "HEAD_COACH",
    "TECHNICAL_DIRECTOR",
    "MANAGER",
    "TEAM_MANAGER",
    "STAFF",
    null,
  ] as const) {
    assert.equal(canAuthorProClubStaffSubmission(role), false);
  }
});

test("valid content normalizes only frozen storage constants", () => {
  assert.deepEqual(
    validateProClubStaffSubmissionContent({
      workType: "ANALYSIS",
      title: "Opponent build-up",
      summary: "Review first-phase build-up and pressing triggers.",
      targetPlanId: "plan-1",
      targetSessionDate: "2026-09-21",
    }),
    {
      ok: true,
      value: {
        schemaVersion: 1,
        module: "TRAINING",
        workType: "ANALYSIS",
        title: "Opponent build-up",
        summary: "Review first-phase build-up and pressing triggers.",
        targetPlanId: "plan-1",
        targetSessionDate: "2026-09-21",
      },
    },
  );
});

test("content rejects malformed references, dates, whitespace, and unknown fields", () => {
  for (const value of [
    {
      workType: "FITNESS",
      title: " Load",
      summary: "Valid summary",
      targetPlanId: null,
      targetSessionDate: null,
    },
    {
      workType: "FITNESS",
      title: "Load",
      summary: "Valid summary",
      targetPlanId: "bad/path",
      targetSessionDate: null,
    },
    {
      workType: "FITNESS",
      title: "Load",
      summary: "Valid summary",
      targetPlanId: null,
      targetSessionDate: "2026-09-21",
    },
    {
      workType: "FITNESS",
      title: "Load",
      summary: "Valid summary",
      targetPlanId: "plan-1",
      targetSessionDate: "2026-02-29",
    },
    {
      workType: "FITNESS",
      title: "Load",
      summary: "Valid summary",
      targetPlanId: null,
      targetSessionDate: null,
      clubId: "must-not-be-stored-here",
    },
  ]) {
    assert.equal(validateProClubStaffSubmissionContent(value).ok, false);
  }
});

test("parses canonical DRAFT without storing the document id in payload", () => {
  const parsed = parseProClubStaffSubmissionRecord("submission-1", baseDocument);
  assert.equal(parsed.submissionId, "submission-1");
  assert.equal(parsed.authorUid, "fitness-1");
  assert.equal(parsed.status, "DRAFT");
  assert.equal("submissionId" in baseDocument, false);
});

test("rejects role/work-type impersonation and PUBLISHED on generic staff submissions", () => {
  assert.throws(
    () =>
      parseProClubStaffSubmissionRecord("submission-1", {
        ...baseDocument,
        workType: "ANALYSIS",
      }),
    /invariants/i,
  );

  assert.throws(
    () =>
      parseProClubStaffSubmissionRecord("submission-1", {
        ...baseDocument,
        status: "PUBLISHED",
      }),
    /invariants/i,
  );
});

test("requires canonical lifecycle provenance as work moves through review", () => {
  const submitted = parseProClubStaffSubmissionRecord("submission-1", {
    ...baseDocument,
    status: "SUBMITTED",
    submittedAt: { timestamp: 2 },
    submittedBy: "fitness-1",
    updatedAt: { timestamp: 2 },
  });
  assert.equal(submitted.status, "SUBMITTED");

  const inReview = parseProClubStaffSubmissionRecord("submission-1", {
    ...baseDocument,
    status: "IN_REVIEW",
    submittedAt: { timestamp: 2 },
    submittedBy: "fitness-1",
    reviewerUid: "head-coach-1",
    reviewerRole: "HEAD_COACH",
    reviewStartedAt: { timestamp: 3 },
    reviewStartedBy: "head-coach-1",
    updatedAt: { timestamp: 3 },
    updatedBy: "head-coach-1",
  });
  assert.equal(inReview.status, "IN_REVIEW");

  const approved = parseProClubStaffSubmissionRecord("submission-1", {
    ...baseDocument,
    status: "APPROVED",
    submittedAt: { timestamp: 2 },
    submittedBy: "fitness-1",
    reviewerUid: "head-coach-1",
    reviewerRole: "HEAD_COACH",
    reviewStartedAt: { timestamp: 3 },
    reviewStartedBy: "head-coach-1",
    approvedAt: { timestamp: 4 },
    approvedBy: "head-coach-1",
    reviewNote: "Approved for the session.",
    updatedAt: { timestamp: 4 },
    updatedBy: "head-coach-1",
  });
  assert.equal(approved.status, "APPROVED");
});

test("fails closed when reviewed work has no exact reviewer provenance", () => {
  assert.throws(
    () =>
      parseProClubStaffSubmissionRecord("submission-1", {
        ...baseDocument,
        status: "IN_REVIEW",
        submittedAt: { timestamp: 2 },
        submittedBy: "fitness-1",
        reviewStartedAt: { timestamp: 3 },
        reviewStartedBy: "head-coach-1",
      }),
    /reviewer provenance|invariants/i,
  );
});
