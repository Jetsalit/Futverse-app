import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentData } from "firebase/firestore";

import {
  approveProClubStaffSubmission,
  beginProClubStaffSubmissionReview,
  createProClubStaffSubmissionDraft,
  listMyProClubStaffSubmissions,
  listProClubStaffSubmissionsForReview,
  requestProClubStaffSubmissionRevision,
  submitProClubStaffSubmission,
  type ProClubStaffSubmissionsRepositoryOps,
} from "../src/lib/firestore/proClubStaffSubmissionsRepository";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";

const CLUB_ID = "club-a";
const AUTHOR_UID = "fitness-1";
const REVIEWER_UID = "head-coach-1";
const SUBMISSION_ID = "submission-1";

function authority(
  uid: string,
  staffRole: ProClubOrganizationAuthority["staffRole"],
): ProClubOrganizationAuthority {
  return {
    organizationId: CLUB_ID,
    organizationType: "PRO_CLUB",
    organizationName: "Club A",
    organizationLevel: "T3",
    organizationStatus: "ACTIVE",
    userId: uid,
    membershipAuthorizationRole: "MEMBER",
    membershipStatus: "ACTIVE",
    hasMembershipAuthority: true,
    staffRole,
  };
}

function key(path: readonly string[]) {
  return path.join("/");
}

function governanceDocument() {
  return {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: REVIEWER_UID,
    authorityRole: "HEAD_COACH",
  };
}

function draftDocument(overrides: DocumentData = {}): DocumentData {
  return {
    schemaVersion: 1,
    authorUid: AUTHOR_UID,
    authorRole: "FITNESS_COACH",
    workType: "FITNESS",
    title: "Conditioning",
    summary: "MD-3 conditioning support.",
    module: "TRAINING",
    targetPlanId: "plan-1",
    targetSessionDate: "2026-09-21",
    status: "DRAFT",
    reviewerUid: null,
    reviewerRole: null,
    reviewNote: null,
    createdAt: { tick: 1 },
    createdBy: AUTHOR_UID,
    updatedAt: { tick: 1 },
    updatedBy: AUTHOR_UID,
    submittedAt: null,
    submittedBy: null,
    reviewStartedAt: null,
    reviewStartedBy: null,
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
    ...overrides,
  };
}

function makeOps(options?: {
  uid?: string;
  authority?: ProClubOrganizationAuthority;
  initial?: Record<string, DocumentData>;
  denyMissingRead?: boolean;
}) {
  const documents = new Map<string, DocumentData>(
    Object.entries(options?.initial ?? {}),
  );
  const writes: Array<{
    kind: "create" | "update";
    path: string;
    data: DocumentData;
  }> = [];
  const listFilters: unknown[] = [];
  const events: string[] = [];
  let tick = 10;

  const uid = options?.uid ?? AUTHOR_UID;
  const actorAuthority =
    options?.authority ?? authority(uid, "FITNESS_COACH");

  const ops: ProClubStaffSubmissionsRepositoryOps = {
    getAuthenticatedUid() {
      return uid;
    },
    async resolveAuthority() {
      return { state: "FOUND", value: actorAuthority };
    },
    async readDocument(path) {
      const pathKey = key(path);
      const data = documents.get(pathKey);
      events.push(`read:${pathKey}`);
      if (data === undefined && options?.denyMissingRead) {
        throw new Error("Missing-document read denied.");
      }
      return {
        id: path[path.length - 1] ?? "",
        exists: data !== undefined,
        data,
      };
    },
    async listDocuments(path, filters = []) {
      listFilters.push(filters);
      const prefix = key(path) + "/";
      let entries = [...documents.entries()].filter(
        ([pathKey]) =>
          pathKey.startsWith(prefix) &&
          !pathKey.slice(prefix.length).includes("/"),
      );
      for (const filter of filters) {
        entries = entries.filter(([, data]) => data[filter.field] === filter.value);
      }
      return {
        documents: entries.map(([pathKey, data]) => ({
          id: pathKey.slice(prefix.length),
          exists: true,
          data,
        })),
      };
    },
    async createDocument(path, data) {
      const pathKey = key(path);
      events.push(`create:${pathKey}`);
      writes.push({ kind: "create", path: pathKey, data });
      documents.set(pathKey, { ...data });
    },
    async updateDocument(path, data) {
      const pathKey = key(path);
      const current = documents.get(pathKey);
      assert.ok(current);
      writes.push({ kind: "update", path: pathKey, data });
      documents.set(pathKey, { ...current, ...data });
    },
    timestamp() {
      tick += 1;
      return { tick };
    },
  };

  return { ops, documents, writes, listFilters, events };
}

test("eligible staff creates only own role-compatible DRAFT", async () => {
  const { ops, writes } = makeOps();
  const created = await createProClubStaffSubmissionDraft(
    CLUB_ID,
    SUBMISSION_ID,
    {
      workType: "FITNESS",
      title: "Conditioning",
      summary: "MD-3 conditioning support.",
      targetPlanId: "plan-1",
      targetSessionDate: "2026-09-21",
    },
    ops,
  );

  assert.equal(created.status, "DRAFT");
  assert.equal(created.authorUid, AUTHOR_UID);
  assert.equal(created.authorRole, "FITNESS_COACH");
  assert.equal(writes.length, 1);
  assert.equal(
    writes[0]?.path,
    `proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`,
  );
});

test("draft create does not pre-read a missing submission document", async () => {
  const { ops, events } = makeOps({ denyMissingRead: true });

  const created = await createProClubStaffSubmissionDraft(
    CLUB_ID,
    SUBMISSION_ID,
    {
      workType: "FITNESS",
      title: "Conditioning",
      summary: "MD-3 conditioning support.",
      targetPlanId: null,
      targetSessionDate: null,
    },
    ops,
  );

  const path =
    `proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`;

  assert.equal(created.status, "DRAFT");
  assert.deepEqual(events, [
    `create:${path}`,
    `read:${path}`,
  ]);
});

test("role cannot impersonate another department work type", async () => {
  const { ops, writes } = makeOps();
  await assert.rejects(
    () =>
      createProClubStaffSubmissionDraft(
        CLUB_ID,
        SUBMISSION_ID,
        {
          workType: "ANALYSIS",
          title: "Opponent",
          summary: "Opponent analysis.",
          targetPlanId: null,
          targetSessionDate: null,
        },
        ops,
      ),
    /workType does not match/i,
  );
  assert.equal(writes.length, 0);
});

test("My Work is constrained to authenticated authorUid", async () => {
  const { ops, listFilters } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`]:
        draftDocument(),
      [`proClubs/${CLUB_ID}/staffSubmissions/other`]:
        draftDocument({ authorUid: "fitness-2", createdBy: "fitness-2" }),
    },
  });

  const result = await listMyProClubStaffSubmissions(CLUB_ID, ops);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.authorUid, AUTHOR_UID);
  assert.deepEqual(listFilters[0], [{ field: "authorUid", value: AUTHOR_UID }]);
});

test("author submits DRAFT but cannot review it", async () => {
  const { ops, documents } = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`]:
        draftDocument(),
    },
  });

  const submitted = await submitProClubStaffSubmission(
    CLUB_ID,
    SUBMISSION_ID,
    ops,
  );
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(submitted.submittedBy, AUTHOR_UID);

  documents.set(
    `proClubs/${CLUB_ID}/technicalGovernance/current`,
    governanceDocument(),
  );
  await assert.rejects(
    () => beginProClubStaffSubmissionReview(CLUB_ID, SUBMISSION_ID, ops),
    /technical authority/i,
  );
});

test("exact canonical technical authority can list and begin review", async () => {
  const submitted = draftDocument({
    status: "SUBMITTED",
    submittedAt: { tick: 2 },
    submittedBy: AUTHOR_UID,
    updatedAt: { tick: 2 },
  });
  const { ops } = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    initial: {
      [`proClubs/${CLUB_ID}/technicalGovernance/current`]:
        governanceDocument(),
      [`proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`]:
        submitted,
    },
  });

  const inbox = await listProClubStaffSubmissionsForReview(CLUB_ID, ops);
  assert.equal(inbox.length, 1);

  const reviewing = await beginProClubStaffSubmissionReview(
    CLUB_ID,
    SUBMISSION_ID,
    ops,
  );
  assert.equal(reviewing.status, "IN_REVIEW");
  assert.equal(reviewing.reviewerUid, REVIEWER_UID);
  assert.equal(reviewing.reviewerRole, "HEAD_COACH");
});

test("OWNER membership alone cannot become technical reviewer", async () => {
  const { ops } = makeOps({
    uid: "owner-1",
    authority: {
      ...authority("owner-1", null),
      membershipAuthorizationRole: "OWNER",
    },
    initial: {
      [`proClubs/${CLUB_ID}/technicalGovernance/current`]:
        governanceDocument(),
    },
  });

  await assert.rejects(
    () => listProClubStaffSubmissionsForReview(CLUB_ID, ops),
    /technical authority/i,
  );
});

test("review flow supports revision then resubmission without creating a second system", async () => {
  const inReview = draftDocument({
    status: "IN_REVIEW",
    submittedAt: { tick: 2 },
    submittedBy: AUTHOR_UID,
    reviewerUid: REVIEWER_UID,
    reviewerRole: "HEAD_COACH",
    reviewStartedAt: { tick: 3 },
    reviewStartedBy: REVIEWER_UID,
    updatedAt: { tick: 3 },
    updatedBy: REVIEWER_UID,
  });

  const reviewer = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    initial: {
      [`proClubs/${CLUB_ID}/technicalGovernance/current`]:
        governanceDocument(),
      [`proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`]:
        inReview,
    },
  });

  const needsRevision = await requestProClubStaffSubmissionRevision(
    CLUB_ID,
    SUBMISSION_ID,
    "Reduce the volume and clarify recovery.",
    reviewer.ops,
  );
  assert.equal(needsRevision.status, "NEEDS_REVISION");

  const current = reviewer.documents.get(
    `proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`,
  );
  assert.ok(current);

  const author = makeOps({
    initial: {
      [`proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`]:
        current,
    },
  });
  const resubmitted = await submitProClubStaffSubmission(
    CLUB_ID,
    SUBMISSION_ID,
    author.ops,
  );
  assert.equal(resubmitted.status, "SUBMITTED");
  assert.ok(resubmitted.revisionRequestedAt);
});

test("only the same technical reviewer can approve IN_REVIEW work", async () => {
  const inReview = draftDocument({
    status: "IN_REVIEW",
    submittedAt: { tick: 2 },
    submittedBy: AUTHOR_UID,
    reviewerUid: REVIEWER_UID,
    reviewerRole: "HEAD_COACH",
    reviewStartedAt: { tick: 3 },
    reviewStartedBy: REVIEWER_UID,
    updatedAt: { tick: 3 },
    updatedBy: REVIEWER_UID,
  });

  const { ops } = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    initial: {
      [`proClubs/${CLUB_ID}/technicalGovernance/current`]:
        governanceDocument(),
      [`proClubs/${CLUB_ID}/staffSubmissions/${SUBMISSION_ID}`]:
        inReview,
    },
  });

  const approved = await approveProClubStaffSubmission(
    CLUB_ID,
    SUBMISSION_ID,
    "Approved for MD-3.",
    ops,
  );
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedBy, REVIEWER_UID);
});
