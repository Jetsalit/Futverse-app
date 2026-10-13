import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentData } from "firebase/firestore";

import {
  approveProClubDrillSubmission,
  beginProClubDrillSubmissionReview,
  createProClubDrillSubmission,
  listMyProClubDrillSubmissions,
  listProClubDrillSubmissionsForReview,
  requestProClubDrillSubmissionRevision,
  type ProClubDrillSubmissionsRepositoryOps,
} from "../src/lib/firestore/proClubDrillSubmissionsRepository";
import type { ProClubOrganizationAuthority } from "../src/lib/firestore/proClubOrganizationAdapter";
import { APPLICATION_MAX_CALCULATED_BYTES } from "../src/lib/firestore/firestoreDocumentSize";

const CLUB_ID = "club-a";
const AUTHOR_UID = "gk-coach-1";
const REVIEWER_UID = "head-coach-1";
const SUBMISSION_ID = "submission-1";

function authority(
  uid: string,
  staffRole: ProClubOrganizationAuthority["staffRole"],
  organizationId = CLUB_ID,
): ProClubOrganizationAuthority {
  return {
    organizationId,
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

function sourceDrill(overrides: DocumentData = {}): DocumentData {
  return {
    title: "Near-post handling",
    category: "Goalkeeping",
    duration: "20 minutes",
    ageGroup: "U18",
    phase: "Warm-up",
    trainingMethod: "Progressive repetition",
    coachingPoints: "Set early; hands through the ball.",
    description: "A keeper-specific drill.",
    date: "2026-10-06",
    created_by: AUTHOR_UID,
    organizationType: "PRO_CLUB",
    organizationId: CLUB_ID,
    canvas_data: {
      elements: [{ id: "keeper-1", type: "player", x: 20, y: 30 }],
      lines: [{ id: "line-1", points: [1, 2, 3, 4] }],
      fieldType: "half",
      teamColors: { home: "blue", away: "red" },
      pitchTheme: "grass",
    },
    previewImage: "data:image/png;base64,PHOTO_A",
    ...overrides,
  };
}

function governanceDocument(uid = REVIEWER_UID, role = "HEAD_COACH") {
  return {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: uid,
    authorityRole: role,
  };
}

function submissionEvidence(
  submittedBy: string,
  role: "HEAD_COACH" | "GK_COACH",
  title = "Keeper transition",
): DocumentData {
  return {
    schemaVersion: 1,
    organizationType: "PRO_CLUB",
    organizationId: CLUB_ID,
    sourceDrillId: `drill-${submittedBy}`,
    sourceCreatorUid: submittedBy,
    sourceCreatorRoleAtSubmission: role,
    submittedBy,
    submittedAt: new Date("2026-10-06T00:00:00.000Z"),
    snapshot: {
      details: { title, category: "Goalkeeping" },
      visualType: "UPLOADED_IMAGE",
      previewImage: "data:image/png;base64,PHOTO_A",
    },
  };
}

function reviewEvidence(
  submissionId: string,
  status: "IN_REVIEW" | "NEEDS_REVISION" | "APPROVED",
  reviewerUid = "technical-director-1",
  reviewerRole: "HEAD_COACH" | "TECHNICAL_DIRECTOR" = "TECHNICAL_DIRECTOR",
): DocumentData {
  const timestamp = new Date("2026-10-06T00:01:00.000Z");
  return {
    schemaVersion: 1,
    submissionId,
    status,
    reviewerUid,
    reviewerRole,
    reviewNote: status === "IN_REVIEW" ? null : status === "NEEDS_REVISION" ? "Add the recovery phase." : "Approved for training.",
    reviewStartedAt: timestamp,
    reviewStartedBy: reviewerUid,
    revisionRequestedAt: status === "NEEDS_REVISION" ? timestamp : null,
    revisionRequestedBy: status === "NEEDS_REVISION" ? reviewerUid : null,
    approvedAt: status === "APPROVED" ? timestamp : null,
    approvedBy: status === "APPROVED" ? reviewerUid : null,
    updatedAt: timestamp,
    updatedBy: reviewerUid,
  };
}

function makeOps(options?: {
  uid?: string;
  authority?: ProClubOrganizationAuthority;
  source?: DocumentData;
  sourceId?: string;
  governance?: DocumentData;
  initial?: Record<string, DocumentData>;
  failReads?: readonly string[];
}) {
  const sourceId = options?.sourceId ?? "drill-a";
  const documents = new Map<string, DocumentData>([
    [`drills/${sourceId}`, options?.source ?? sourceDrill()],
    [
      `proClubs/${CLUB_ID}/technicalGovernance/current`,
      options?.governance ?? governanceDocument(),
    ],
    ...Object.entries(options?.initial ?? {}),
  ]);
  const writes: Array<{
    kind: "create" | "update";
    path: string;
    data: DocumentData;
  }> = [];
  const listFilters: unknown[] = [];
  let tick = 0;
  const uid = options?.uid ?? AUTHOR_UID;
  const actorAuthority = options?.authority ?? authority(uid, "GK_COACH");

  const ops: ProClubDrillSubmissionsRepositoryOps = {
    getAuthenticatedUid() {
      return uid;
    },
    async resolveAuthority() {
      return { state: "FOUND", value: actorAuthority };
    },
    async readDocument(path) {
      const pathKey = key(path);
      if (options?.failReads?.includes(pathKey)) {
        throw new Error(`Read denied: ${pathKey}`);
      }
      const data = documents.get(pathKey);
      return {
        id: path[path.length - 1],
        exists: data !== undefined,
        data,
      };
    },
    async listDocuments(path, filters = []) {
      listFilters.push(filters);
      const prefix = `${key(path)}/`;
      const documentsList = [...documents.entries()]
        .filter(([pathKey]) => pathKey.startsWith(prefix))
        .filter(([, data]) =>
          filters.every((filter) => data[filter.field] === filter.value)
        )
        .map(([pathKey, data]) => ({
          id: pathKey.slice(prefix.length),
          exists: true,
          data,
        }));
      return { documents: documentsList };
    },
    async createDocument(path, data) {
      const pathKey = key(path);
      writes.push({ kind: "create", path: pathKey, data });
      if (documents.has(pathKey)) throw new Error("Already exists");
      documents.set(pathKey, data);
    },
    async updateDocument(path, data) {
      const pathKey = key(path);
      writes.push({ kind: "update", path: pathKey, data });
      const current = documents.get(pathKey);
      if (!current) throw new Error("Missing update target");
      documents.set(pathKey, { ...current, ...data });
    },
    timestamp() {
      return { tick: ++tick };
    },
  };

  return { ops, documents, writes, listFilters, sourceId };
}

test("createsOneSnapshotForAuthorizedHeadCoach", async () => {
  const setup = makeOps({
    uid: "head-author",
    authority: authority("head-author", "HEAD_COACH"),
    source: sourceDrill({ created_by: "head-author" }),
  });

  const record = await createProClubDrillSubmission(
    CLUB_ID,
    SUBMISSION_ID,
    setup.sourceId,
    setup.ops,
  );

  assert.equal(record.sourceDrillId, setup.sourceId);
  assert.equal(record.sourceCreatorRoleAtSubmission, "HEAD_COACH");
  assert.equal(setup.writes.length, 1);
  assert.equal(setup.writes[0].kind, "create");
  assert.equal(setup.writes[0].path, `proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`);
  assert.equal(setup.documents.has(`proClubs/${CLUB_ID}/drillSubmissionReviews/${SUBMISSION_ID}`), false);
});

test("createsOneSnapshotForAuthorizedGkCoach", async () => {
  const setup = makeOps();
  const record = await createProClubDrillSubmission(CLUB_ID, SUBMISSION_ID, setup.sourceId, setup.ops);

  assert.equal(record.organizationType, "PRO_CLUB");
  assert.equal(record.organizationId, CLUB_ID);
  assert.equal(record.submittedBy, AUTHOR_UID);
  assert.deepEqual(record.snapshot.canvasData, sourceDrill().canvas_data);
  assert.equal(record.snapshot.previewImage, "data:image/png;base64,PHOTO_A");
  assert.equal(record.snapshot.visualType, "BOTH");
  assert.deepEqual(record.snapshot.details, {
    title: "Near-post handling",
    category: "Goalkeeping",
    duration: "20 minutes",
    ageGroup: "U18",
    phase: "Warm-up",
    trainingMethod: "Progressive repetition",
    coachingPoints: "Set early; hands through the ball.",
    description: "A keeper-specific drill.",
    date: "2026-10-06",
  });
  assert.equal(setup.writes.length, 1);
});

test("rejectsOtherRoles", async () => {
  const setup = makeOps({ authority: authority(AUTHOR_UID, "ANALYST") });
  await assert.rejects(
    createProClubDrillSubmission(CLUB_ID, SUBMISSION_ID, setup.sourceId, setup.ops),
    /author|role|authority/i,
  );
  assert.equal(setup.writes.length, 0);
});

test("rejectsDifferentOwner", async () => {
  const setup = makeOps({ source: sourceDrill({ created_by: "someone-else" }) });
  await assert.rejects(
    createProClubDrillSubmission(CLUB_ID, SUBMISSION_ID, setup.sourceId, setup.ops),
    /owner|creator|source/i,
  );
  assert.equal(setup.writes.length, 0);
});

test("rejectsDifferentClubAndForgedProvenance", async () => {
  for (const source of [
    sourceDrill({ organizationId: "club-b" }),
    sourceDrill({ organizationType: "ACADEMY" }),
  ]) {
    const setup = makeOps({ source });
    await assert.rejects(
      createProClubDrillSubmission(CLUB_ID, SUBMISSION_ID, setup.sourceId, setup.ops),
      /club|organization|provenance|source/i,
    );
    assert.equal(setup.writes.length, 0);
  }
});

test("usesTheExactSourceDrillId", async () => {
  const setup = makeOps({ sourceId: "keeper-drill-exact" });
  const record = await createProClubDrillSubmission(
    CLUB_ID,
    SUBMISSION_ID,
    "keeper-drill-exact",
    setup.ops,
  );

  assert.equal(record.sourceDrillId, "keeper-drill-exact");
  assert.ok(setup.writes.some((write) => write.path === "drills/keeper-drill-exact") === false);
  assert.equal(setup.writes[0].data.sourceDrillId, "keeper-drill-exact");
});

test("doesNotCreateWhenPreflightRejects", async () => {
  const setup = makeOps({
    source: sourceDrill({ previewImage: `data:image/png;base64,${"x".repeat(APPLICATION_MAX_CALCULATED_BYTES)}` }),
  });

  await assert.rejects(
    createProClubDrillSubmission(CLUB_ID, SUBMISSION_ID, setup.sourceId, setup.ops),
    /too large to send/i,
  );
  assert.equal(setup.writes.length, 0);
});

test("mapsSuccessfulMissingReviewToSubmitted", async () => {
  const setup = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    source: sourceDrill(),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`]: {
        schemaVersion: 1,
        organizationType: "PRO_CLUB",
        organizationId: CLUB_ID,
        sourceDrillId: "drill-a",
        sourceCreatorUid: AUTHOR_UID,
        sourceCreatorRoleAtSubmission: "GK_COACH",
        submittedBy: AUTHOR_UID,
        submittedAt: { tick: 1 },
        snapshot: { details: { title: "GK", category: "Training" }, visualType: "UPLOADED_IMAGE", previewImage: "image" },
      },
    },
  });

  const records = await listProClubDrillSubmissionsForReview(CLUB_ID, setup.ops);

  assert.equal(records.length, 1);
  assert.equal(records[0].effectiveStatus, "SUBMITTED");
  assert.equal(records[0].review, null);
});

test("doesNotMapReviewReadErrorToSubmitted", async () => {
  const reviewPath = `proClubs/${CLUB_ID}/drillSubmissionReviews/${SUBMISSION_ID}`;
  const setup = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    source: sourceDrill(),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`]: {
        schemaVersion: 1,
        organizationType: "PRO_CLUB",
        organizationId: CLUB_ID,
        sourceDrillId: "drill-a",
        sourceCreatorUid: AUTHOR_UID,
        sourceCreatorRoleAtSubmission: "GK_COACH",
        submittedBy: AUTHOR_UID,
        submittedAt: { tick: 1 },
        snapshot: { details: { title: "GK", category: "Training" }, visualType: "UPLOADED_IMAGE", previewImage: "image" },
      },
    },
    failReads: [reviewPath],
  });

  await assert.rejects(listProClubDrillSubmissionsForReview(CLUB_ID, setup.ops), /read denied/i);
});

test("requiresExactCurrentTechnicalAuthority", async () => {
  const setup = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    governance: governanceDocument("other-head", "HEAD_COACH"),
  });

  await assert.rejects(
    beginProClubDrillSubmissionReview(CLUB_ID, SUBMISSION_ID, setup.ops),
    /exact active technical authority|authority/i,
  );
  assert.equal(setup.writes.length, 0);
});

test("deniesCrossClubAndSelfReview", async () => {
  const crossClub = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH", "club-b"),
  });
  await assert.rejects(
    beginProClubDrillSubmissionReview(CLUB_ID, SUBMISSION_ID, crossClub.ops),
    /authority|club/i,
  );
  assert.equal(crossClub.writes.length, 0);

  const selfReview = makeOps({
    uid: AUTHOR_UID,
    authority: authority(AUTHOR_UID, "HEAD_COACH"),
    source: sourceDrill(),
    governance: governanceDocument(AUTHOR_UID, "HEAD_COACH"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`]: {
        schemaVersion: 1,
        organizationType: "PRO_CLUB",
        organizationId: CLUB_ID,
        sourceDrillId: "drill-a",
        sourceCreatorUid: AUTHOR_UID,
        sourceCreatorRoleAtSubmission: "HEAD_COACH",
        submittedBy: AUTHOR_UID,
        submittedAt: { tick: 1 },
        snapshot: { details: { title: "GK", category: "Training" }, visualType: "UPLOADED_IMAGE", previewImage: "image" },
      },
    },
  });
  await assert.rejects(
    beginProClubDrillSubmissionReview(CLUB_ID, SUBMISSION_ID, selfReview.ops),
    /self|own|cannot begin/i,
  );
  assert.equal(selfReview.writes.length, 0);
});

test("createsInReviewThenAllowsOnlyTwoTerminalActions", async () => {
  for (const action of ["approve", "revise"] as const) {
    const id = `submission-${action}`;
    const setup = makeOps({
      uid: REVIEWER_UID,
      authority: authority(REVIEWER_UID, "HEAD_COACH"),
      initial: {
        [`proClubs/${CLUB_ID}/drillSubmissions/${id}`]: {
          schemaVersion: 1,
          organizationType: "PRO_CLUB",
          organizationId: CLUB_ID,
          sourceDrillId: "drill-a",
          sourceCreatorUid: AUTHOR_UID,
          sourceCreatorRoleAtSubmission: "GK_COACH",
          submittedBy: AUTHOR_UID,
          submittedAt: { tick: 1 },
          snapshot: { details: { title: "GK", category: "Training" }, visualType: "UPLOADED_IMAGE", previewImage: "image" },
        },
      },
    });
    const evidenceBefore = setup.documents.get(`proClubs/${CLUB_ID}/drillSubmissions/${id}`);

    const started = await beginProClubDrillSubmissionReview(CLUB_ID, id, setup.ops);
    assert.equal(started.status, "IN_REVIEW");
    assert.equal(setup.documents.get(`proClubs/${CLUB_ID}/drillSubmissions/${id}`), evidenceBefore);
    const terminal = action === "approve"
      ? await approveProClubDrillSubmission(CLUB_ID, id, "Reviewed", setup.ops)
      : await requestProClubDrillSubmissionRevision(CLUB_ID, id, "Revise the setup", setup.ops);
    assert.equal(terminal.status, action === "approve" ? "APPROVED" : "NEEDS_REVISION");
    assert.equal(setup.writes.filter((write) => write.path.includes("drillSubmissions/")).length, 0);
    assert.equal(setup.writes[0].path, `proClubs/${CLUB_ID}/drillSubmissionReviews/${id}`);
  }
});

test("boundsReviewNoteAt2000Characters", async () => {
  const setup = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`]: {
        schemaVersion: 1,
        organizationType: "PRO_CLUB",
        organizationId: CLUB_ID,
        sourceDrillId: "drill-a",
        sourceCreatorUid: AUTHOR_UID,
        sourceCreatorRoleAtSubmission: "GK_COACH",
        submittedBy: AUTHOR_UID,
        submittedAt: { tick: 1 },
        snapshot: { details: { title: "GK", category: "Training" }, visualType: "UPLOADED_IMAGE", previewImage: "image" },
      },
    },
  });
  await beginProClubDrillSubmissionReview(CLUB_ID, SUBMISSION_ID, setup.ops);
  const maxNote = "\u0800".repeat(2000);
  const approved = await approveProClubDrillSubmission(CLUB_ID, SUBMISSION_ID, maxNote, setup.ops);
  assert.equal(approved.reviewNote, maxNote);

  const over = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${SUBMISSION_ID}`]: {
        schemaVersion: 1,
        organizationType: "PRO_CLUB",
        organizationId: CLUB_ID,
        sourceDrillId: "drill-a",
        sourceCreatorUid: AUTHOR_UID,
        sourceCreatorRoleAtSubmission: "GK_COACH",
        submittedBy: AUTHOR_UID,
        submittedAt: { tick: 1 },
        snapshot: { details: { title: "GK", category: "Training" }, visualType: "UPLOADED_IMAGE", previewImage: "image" },
      },
    },
  });
  await beginProClubDrillSubmissionReview(CLUB_ID, SUBMISSION_ID, over.ops);
  await assert.rejects(
    approveProClubDrillSubmission(CLUB_ID, SUBMISSION_ID, `${maxNote}x`, over.ops),
    /2000|review note/i,
  );
});

test("resubmissionCreatesS2WithoutChangingS1OrR1", async () => {
  const setup = makeOps();
  const s1 = await createProClubDrillSubmission(CLUB_ID, "S1", setup.sourceId, setup.ops);
  const s1Path = `proClubs/${CLUB_ID}/drillSubmissions/S1`;
  const s1Stored = structuredClone(setup.documents.get(s1Path));
  const reviewer = makeOps({
    uid: REVIEWER_UID,
    authority: authority(REVIEWER_UID, "HEAD_COACH"),
    initial: Object.fromEntries(setup.documents.entries()),
  });
  await beginProClubDrillSubmissionReview(CLUB_ID, "S1", reviewer.ops);
  const r1Path = `proClubs/${CLUB_ID}/drillSubmissionReviews/S1`;
  await requestProClubDrillSubmissionRevision(CLUB_ID, "S1", "Add a recovery phase", reviewer.ops);
  const r1Before = structuredClone(reviewer.documents.get(r1Path));

  setup.documents.set(`drills/${setup.sourceId}`, sourceDrill({
    previewImage: "data:image/png;base64,PHOTO_B",
    coachingPoints: "Set early; add recovery phase.",
  }));
  const s2 = await createProClubDrillSubmission(CLUB_ID, "S2", setup.sourceId, setup.ops);

  assert.equal(s1.snapshot.previewImage, "data:image/png;base64,PHOTO_A");
  assert.equal(s2.snapshot.previewImage, "data:image/png;base64,PHOTO_B");
  assert.deepEqual(reviewer.documents.get(s1Path), s1Stored);
  assert.deepEqual(setup.documents.get(s1Path), s1Stored);
  assert.deepEqual(reviewer.documents.get(r1Path), r1Before);
  assert.ok(setup.documents.has(`proClubs/${CLUB_ID}/drillSubmissions/S2`));
});

test("authorInboxUsesOnlyAuthenticatedAuthorsSubmissionFilter", async () => {
  const setup = makeOps();
  await listMyProClubDrillSubmissions(CLUB_ID, setup.ops);
  assert.deepEqual(setup.listFilters[0], [{ field: "submittedBy", value: AUTHOR_UID }]);
});

test("headCoachAuthorSeesOwnSubmissionWhenTechnicalDirectorIsAuthority", async () => {
  const headUid = "head-author-1";
  const submissionId = "head-own-submission";
  const setup = makeOps({
    uid: headUid,
    authority: authority(headUid, "HEAD_COACH"),
    governance: governanceDocument("technical-director-1", "TECHNICAL_DIRECTOR"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${submissionId}`]: submissionEvidence(headUid, "HEAD_COACH", "Head Coach own evidence"),
    },
  });

  const records = await listMyProClubDrillSubmissions(CLUB_ID, setup.ops);

  assert.deepEqual(records.map((record) => record.id), [submissionId]);
  assert.equal(records[0].snapshot.details.title, "Head Coach own evidence");
  assert.equal(records[0].effectiveStatus, "SUBMITTED");
  assert.deepEqual(setup.listFilters[0], [{ field: "submittedBy", value: headUid }]);
});

test("headCoachAuthorSeesOwnNeedsRevisionHistory", async () => {
  const headUid = "head-author-1";
  const submissionId = "head-needs-revision";
  const setup = makeOps({
    uid: headUid,
    authority: authority(headUid, "HEAD_COACH"),
    governance: governanceDocument("technical-director-1", "TECHNICAL_DIRECTOR"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${submissionId}`]: submissionEvidence(headUid, "HEAD_COACH"),
      [`proClubs/${CLUB_ID}/drillSubmissionReviews/${submissionId}`]: reviewEvidence(submissionId, "NEEDS_REVISION"),
    },
  });

  const [record] = await listMyProClubDrillSubmissions(CLUB_ID, setup.ops);

  assert.equal(record.effectiveStatus, "NEEDS_REVISION");
  assert.equal(record.review?.reviewNote, "Add the recovery phase.");
  assert.equal(record.review?.reviewerUid, "technical-director-1");
});

test("headCoachAuthorSeesOwnApprovedHistory", async () => {
  const headUid = "head-author-1";
  const submissionId = "head-approved";
  const setup = makeOps({
    uid: headUid,
    authority: authority(headUid, "HEAD_COACH"),
    governance: governanceDocument("technical-director-1", "TECHNICAL_DIRECTOR"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${submissionId}`]: submissionEvidence(headUid, "HEAD_COACH"),
      [`proClubs/${CLUB_ID}/drillSubmissionReviews/${submissionId}`]: reviewEvidence(submissionId, "APPROVED"),
    },
  });

  const [record] = await listMyProClubDrillSubmissions(CLUB_ID, setup.ops);

  assert.equal(record.effectiveStatus, "APPROVED");
  assert.equal(record.review?.reviewNote, "Approved for training.");
  assert.equal(record.review?.reviewerRole, "TECHNICAL_DIRECTOR");
});

test("authorCannotReadOtherAuthorsSubmissionWithoutReviewerAuthority", async () => {
  const headUid = "head-author-1";
  const setup = makeOps({
    uid: headUid,
    authority: authority(headUid, "HEAD_COACH"),
    governance: governanceDocument("technical-director-1", "TECHNICAL_DIRECTOR"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/own`]: submissionEvidence(headUid, "HEAD_COACH", "Own work"),
      [`proClubs/${CLUB_ID}/drillSubmissions/other`]: submissionEvidence("other-author", "GK_COACH", "Other staff work"),
    },
  });

  const records = await listMyProClubDrillSubmissions(CLUB_ID, setup.ops);

  assert.deepEqual(records.map((record) => record.snapshot.details.title), ["Own work"]);
  assert.deepEqual(setup.listFilters[0], [{ field: "submittedBy", value: headUid }]);
});

test("authorCannotReviewOwnSubmission", async () => {
  const headUid = "head-author-1";
  const submissionId = "head-self-review";
  const setup = makeOps({
    uid: headUid,
    authority: authority(headUid, "HEAD_COACH"),
    governance: governanceDocument(headUid, "HEAD_COACH"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${submissionId}`]: submissionEvidence(headUid, "HEAD_COACH"),
    },
  });

  await assert.rejects(
    beginProClubDrillSubmissionReview(CLUB_ID, submissionId, setup.ops),
    /self|own|cannot begin/i,
  );
  assert.equal(setup.writes.length, 0);
});

test("technicalDirectorStillReviewsSubmission", async () => {
  const directorUid = "technical-director-1";
  const submissionId = "gk-work-for-director";
  const setup = makeOps({
    uid: directorUid,
    authority: authority(directorUid, "TECHNICAL_DIRECTOR"),
    governance: governanceDocument(directorUid, "TECHNICAL_DIRECTOR"),
    initial: {
      [`proClubs/${CLUB_ID}/drillSubmissions/${submissionId}`]: submissionEvidence(AUTHOR_UID, "GK_COACH"),
    },
  });

  const review = await beginProClubDrillSubmissionReview(CLUB_ID, submissionId, setup.ops);

  assert.equal(review.status, "IN_REVIEW");
  assert.equal(review.reviewerUid, directorUid);
  assert.equal(review.reviewerRole, "TECHNICAL_DIRECTOR");
});
