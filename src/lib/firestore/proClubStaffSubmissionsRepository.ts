import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";

import { auth, db } from "../firebase";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  canTransitionProClubTechnicalWorkStatus,
  type ProClubTechnicalAuthorityRole,
} from "../proClubTechnicalGovernance";
import {
  canAuthorProClubStaffSubmission,
  expectedProClubStaffSubmissionWorkType,
  parseProClubStaffSubmissionRecord,
  validateProClubStaffSubmissionContent,
  type ProClubStaffSubmissionContentInput,
  type ProClubStaffSubmissionRecord,
} from "../proClubStaffSubmissions";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";

export interface ProClubStaffSubmissionDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubStaffSubmissionListFilter {
  readonly field: "authorUid" | "status" | "targetPlanId";
  readonly value: string;
}

export interface ProClubStaffSubmissionListSnapshot {
  readonly documents: readonly ProClubStaffSubmissionDocumentSnapshot[];
}

export interface ProClubStaffSubmissionsRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(
    path: readonly string[],
  ): Promise<ProClubStaffSubmissionDocumentSnapshot>;
  listDocuments(
    path: readonly string[],
    filters?: readonly ProClubStaffSubmissionListFilter[],
  ): Promise<ProClubStaffSubmissionListSnapshot>;
  createDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

export interface ProClubTechnicalGovernanceCurrent {
  readonly schemaVersion: 1;
  readonly status: "ACTIVE";
  readonly authorityUid: string;
  readonly authorityRole: ProClubTechnicalAuthorityRole;
}

function requireExactDocumentId(
  value: unknown,
  label: string,
): asserts value is string {
  if (!isValidDocumentIdentifier(value)) {
    throw new Error(`${label} must be an exact Firestore document identifier.`);
  }
}

function requireAuthenticatedUid(
  ops: ProClubStaffSubmissionsRepositoryOps,
): string {
  const uid = ops.getAuthenticatedUid();
  requireExactDocumentId(uid, "Authenticated actor UID");
  return uid;
}

async function resolveRequiredAuthority(
  clubId: string,
  uid: string,
  ops: ProClubStaffSubmissionsRepositoryOps,
): Promise<ProClubOrganizationAuthority> {
  const result = await ops.resolveAuthority(clubId, uid);
  if (result.state !== "FOUND") {
    throw new Error(`Pro Club authority could not be resolved: ${result.state}.`);
  }
  if (
    result.value.organizationId !== clubId ||
    result.value.userId !== uid ||
    result.value.organizationStatus !== "ACTIVE" ||
    result.value.membershipStatus !== "ACTIVE" ||
    result.value.hasMembershipAuthority !== true
  ) {
    throw new Error("Active Pro Club membership authority is required.");
  }
  return result.value;
}

function assertEligibleAuthor(
  authority: ProClubOrganizationAuthority,
): asserts authority is ProClubOrganizationAuthority & {
  staffRole: NonNullable<ProClubOrganizationAuthority["staffRole"]>;
} {
  if (!canAuthorProClubStaffSubmission(authority.staffRole)) {
    throw new Error("Active eligible Pro Club staff author role is required.");
  }
}

function parseTechnicalGovernanceCurrent(
  raw: unknown,
): ProClubTechnicalGovernanceCurrent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Technical Governance current document is invalid.");
  }
  const data = raw as Record<string, unknown>;
  if (
    data.schemaVersion !== 1 ||
    data.status !== "ACTIVE" ||
    !isValidDocumentIdentifier(data.authorityUid) ||
    (data.authorityRole !== "TECHNICAL_DIRECTOR" &&
      data.authorityRole !== "HEAD_COACH")
  ) {
    throw new Error("Technical Governance current document is invalid.");
  }
  return {
    schemaVersion: 1,
    status: "ACTIVE",
    authorityUid: data.authorityUid,
    authorityRole: data.authorityRole,
  };
}

async function resolveRequiredTechnicalAuthority(
  clubId: string,
  actor: ProClubOrganizationAuthority,
  ops: ProClubStaffSubmissionsRepositoryOps,
): Promise<ProClubTechnicalGovernanceCurrent> {
  const snapshot = await ops.readDocument([
    "proClubs",
    clubId,
    "technicalGovernance",
    "current",
  ]);
  if (!snapshot.exists || snapshot.id !== "current") {
    throw new Error("Technical Governance current authority is unavailable.");
  }

  const current = parseTechnicalGovernanceCurrent(snapshot.data);
  if (
    current.authorityUid !== actor.userId ||
    current.authorityRole !== actor.staffRole
  ) {
    throw new Error("Exact active technical authority is required.");
  }
  return current;
}

function submissionPath(clubId: string, submissionId: string) {
  return ["proClubs", clubId, "staffSubmissions", submissionId] as const;
}

function createFirestoreOps(): ProClubStaffSubmissionsRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Staff Submission document path.");
      }
      const [first, ...rest] = path;
      const snapshot = await getDocFromServer(doc(db, first, ...rest));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
    async listDocuments(path, filters = []) {
      if (path.length < 1 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Staff Submission collection path.");
      }
      const [first, ...rest] = path;
      const constraints: QueryConstraint[] = filters.map((filter) =>
        where(filter.field, "==", filter.value)
      );
      const ref = collection(db, first, ...rest);
      const snapshot = await getDocsFromServer(
        constraints.length > 0 ? query(ref, ...constraints) : ref,
      );
      return {
        documents: snapshot.docs.map((item) => ({
          id: item.id,
          exists: true,
          data: item.data(),
        })),
      };
    },
    async createDocument(path, data) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Staff Submission create path.");
      }
      const [first, ...rest] = path;
      await setDoc(doc(db, first, ...rest), data);
    },
    async updateDocument(path, data) {
      if (path.length < 2 || !path.every(isValidDocumentIdentifier)) {
        throw new Error("Invalid Pro Club Staff Submission update path.");
      }
      const [first, ...rest] = path;
      await updateDoc(doc(db, first, ...rest), data);
    },
    timestamp() {
      return serverTimestamp();
    },
  };
}

const FIRESTORE_OPS = createFirestoreOps();

export function createFirestoreProClubStaffSubmissionsRepositoryOps():
  ProClubStaffSubmissionsRepositoryOps {
  return createFirestoreOps();
}

function parseList(
  snapshot: ProClubStaffSubmissionListSnapshot,
): ProClubStaffSubmissionRecord[] {
  return snapshot.documents.map((item) => {
    if (!item.exists) {
      throw new Error("Staff Submission list returned a missing document.");
    }
    return parseProClubStaffSubmissionRecord(item.id, item.data);
  });
}

export async function listMyProClubStaffSubmissions(
  clubId: string,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord[]> {
  requireExactDocumentId(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertEligibleAuthor(authority);

  return parseList(
    await ops.listDocuments(
      ["proClubs", clubId, "staffSubmissions"],
      [{ field: "authorUid", value: uid }],
    ),
  );
}

export async function listProClubStaffSubmissionsForReview(
  clubId: string,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord[]> {
  requireExactDocumentId(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  await resolveRequiredTechnicalAuthority(clubId, authority, ops);

  return parseList(
    await ops.listDocuments(["proClubs", clubId, "staffSubmissions"]),
  );
}

export async function listProClubStaffSubmissionsLinkedToPlan(
  clubId: string,
  planId: string,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord[]> {
  requireExactDocumentId(clubId, "clubId");
  requireExactDocumentId(planId, "planId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  await resolveRequiredTechnicalAuthority(clubId, authority, ops);

  return parseList(
    await ops.listDocuments(
      ["proClubs", clubId, "staffSubmissions"],
      [{ field: "targetPlanId", value: planId }],
    ),
  );
}

export async function createProClubStaffSubmissionDraft(
  clubId: string,
  submissionId: string,
  input: ProClubStaffSubmissionContentInput,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord> {
  requireExactDocumentId(clubId, "clubId");
  requireExactDocumentId(submissionId, "submissionId");
  const validation = validateProClubStaffSubmissionContent(input);
  if (validation.ok === false) {
    throw new Error(
      `Invalid Pro Club Staff Submission content: ${validation.errors.join(" ")}`,
    );
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertEligibleAuthor(authority);

  const expectedWorkType =
    expectedProClubStaffSubmissionWorkType(authority.staffRole);
  if (validation.value.workType !== expectedWorkType) {
    throw new Error("Staff Submission workType does not match active staff role.");
  }

  const path = submissionPath(clubId, submissionId);
  const existing = await ops.readDocument(path);
  if (existing.exists) {
    throw new Error("Pro Club Staff Submission already exists.");
  }

  const timestamp = ops.timestamp();
  await ops.createDocument(path, {
    schemaVersion: validation.value.schemaVersion,
    authorUid: uid,
    authorRole: authority.staffRole,
    workType: validation.value.workType,
    title: validation.value.title,
    summary: validation.value.summary,
    module: validation.value.module,
    targetPlanId: validation.value.targetPlanId,
    targetSessionDate: validation.value.targetSessionDate,
    status: "DRAFT",
    reviewerUid: null,
    reviewerRole: null,
    reviewNote: null,
    createdAt: timestamp,
    createdBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
    submittedAt: null,
    submittedBy: null,
    reviewStartedAt: null,
    reviewStartedBy: null,
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists || readBack.id !== submissionId) {
    throw new Error(
      "Staff Submission create outcome is ambiguous: canonical read-back unavailable.",
    );
  }
  const record = parseProClubStaffSubmissionRecord(submissionId, readBack.data);
  if (
    record.authorUid !== uid ||
    record.authorRole !== authority.staffRole ||
    record.status !== "DRAFT"
  ) {
    throw new Error("Staff Submission create read-back did not match canonical data.");
  }
  return record;
}

export async function updateProClubStaffSubmissionDraftContent(
  clubId: string,
  submissionId: string,
  input: ProClubStaffSubmissionContentInput,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord> {
  requireExactDocumentId(clubId, "clubId");
  requireExactDocumentId(submissionId, "submissionId");
  const validation = validateProClubStaffSubmissionContent(input);
  if (validation.ok === false) {
    throw new Error(
      `Invalid Pro Club Staff Submission content: ${validation.errors.join(" ")}`,
    );
  }

  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertEligibleAuthor(authority);

  const path = submissionPath(clubId, submissionId);
  const existing = await ops.readDocument(path);
  if (!existing.exists || existing.id !== submissionId) {
    throw new Error("Pro Club Staff Submission does not exist.");
  }
  const current = parseProClubStaffSubmissionRecord(submissionId, existing.data);
  if (
    current.authorUid !== uid ||
    current.authorRole !== authority.staffRole ||
    (current.status !== "DRAFT" && current.status !== "NEEDS_REVISION")
  ) {
    throw new Error("Only the author may edit DRAFT or NEEDS_REVISION work.");
  }

  const expectedWorkType =
    expectedProClubStaffSubmissionWorkType(authority.staffRole);
  if (validation.value.workType !== expectedWorkType) {
    throw new Error("Staff Submission workType does not match active staff role.");
  }

  await ops.updateDocument(path, {
    workType: validation.value.workType,
    title: validation.value.title,
    summary: validation.value.summary,
    targetPlanId: validation.value.targetPlanId,
    targetSessionDate: validation.value.targetSessionDate,
    updatedAt: ops.timestamp(),
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists) {
    throw new Error("Staff Submission update outcome is ambiguous.");
  }
  return parseProClubStaffSubmissionRecord(submissionId, readBack.data);
}

export async function submitProClubStaffSubmission(
  clubId: string,
  submissionId: string,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord> {
  requireExactDocumentId(clubId, "clubId");
  requireExactDocumentId(submissionId, "submissionId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveRequiredAuthority(clubId, uid, ops);
  assertEligibleAuthor(authority);

  const path = submissionPath(clubId, submissionId);
  const existing = await ops.readDocument(path);
  if (!existing.exists) {
    throw new Error("Pro Club Staff Submission does not exist.");
  }
  const current = parseProClubStaffSubmissionRecord(submissionId, existing.data);
  if (
    current.authorUid !== uid ||
    current.authorRole !== authority.staffRole ||
    !canTransitionProClubTechnicalWorkStatus(current.status, "SUBMITTED")
  ) {
    throw new Error("Staff Submission cannot be submitted from its current state.");
  }

  const timestamp = ops.timestamp();
  await ops.updateDocument(path, {
    status: "SUBMITTED",
    submittedAt: timestamp,
    submittedBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists) {
    throw new Error("Staff Submission submit outcome is ambiguous.");
  }
  return parseProClubStaffSubmissionRecord(submissionId, readBack.data);
}

export async function beginProClubStaffSubmissionReview(
  clubId: string,
  submissionId: string,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord> {
  requireExactDocumentId(clubId, "clubId");
  requireExactDocumentId(submissionId, "submissionId");
  const uid = requireAuthenticatedUid(ops);
  const actor = await resolveRequiredAuthority(clubId, uid, ops);
  const technical = await resolveRequiredTechnicalAuthority(clubId, actor, ops);

  const path = submissionPath(clubId, submissionId);
  const existing = await ops.readDocument(path);
  if (!existing.exists) {
    throw new Error("Pro Club Staff Submission does not exist.");
  }
  const current = parseProClubStaffSubmissionRecord(submissionId, existing.data);
  if (
    current.authorUid === uid ||
    !canTransitionProClubTechnicalWorkStatus(current.status, "IN_REVIEW")
  ) {
    throw new Error("Staff Submission cannot begin review from its current state.");
  }

  const timestamp = ops.timestamp();
  await ops.updateDocument(path, {
    status: "IN_REVIEW",
    reviewerUid: uid,
    reviewerRole: technical.authorityRole,
    reviewStartedAt: timestamp,
    reviewStartedBy: uid,
    updatedAt: timestamp,
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists) {
    throw new Error("Staff Submission review start outcome is ambiguous.");
  }
  return parseProClubStaffSubmissionRecord(submissionId, readBack.data);
}

async function completeReviewTransition(
  clubId: string,
  submissionId: string,
  toStatus: "NEEDS_REVISION" | "APPROVED",
  reviewNote: string,
  ops: ProClubStaffSubmissionsRepositoryOps,
): Promise<ProClubStaffSubmissionRecord> {
  requireExactDocumentId(clubId, "clubId");
  requireExactDocumentId(submissionId, "submissionId");
  if (
    typeof reviewNote !== "string" ||
    reviewNote.trim() !== reviewNote ||
    reviewNote.length < 1 ||
    reviewNote.length > 2000
  ) {
    throw new Error("Review note must be trimmed text between 1 and 2000 characters.");
  }

  const uid = requireAuthenticatedUid(ops);
  const actor = await resolveRequiredAuthority(clubId, uid, ops);
  const technical = await resolveRequiredTechnicalAuthority(clubId, actor, ops);

  const path = submissionPath(clubId, submissionId);
  const existing = await ops.readDocument(path);
  if (!existing.exists) {
    throw new Error("Pro Club Staff Submission does not exist.");
  }
  const current = parseProClubStaffSubmissionRecord(submissionId, existing.data);
  if (
    current.authorUid === uid ||
    current.reviewerUid !== uid ||
    current.reviewerRole !== technical.authorityRole ||
    !canTransitionProClubTechnicalWorkStatus(current.status, toStatus)
  ) {
    throw new Error("Staff Submission review transition is not permitted.");
  }

  const timestamp = ops.timestamp();
  const transitionFields =
    toStatus === "APPROVED"
      ? { approvedAt: timestamp, approvedBy: uid }
      : {
          revisionRequestedAt: timestamp,
          revisionRequestedBy: uid,
        };

  await ops.updateDocument(path, {
    status: toStatus,
    reviewNote,
    ...transitionFields,
    updatedAt: timestamp,
    updatedBy: uid,
  });

  const readBack = await ops.readDocument(path);
  if (!readBack.exists) {
    throw new Error("Staff Submission review outcome is ambiguous.");
  }
  return parseProClubStaffSubmissionRecord(submissionId, readBack.data);
}

export function requestProClubStaffSubmissionRevision(
  clubId: string,
  submissionId: string,
  reviewNote: string,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord> {
  return completeReviewTransition(
    clubId,
    submissionId,
    "NEEDS_REVISION",
    reviewNote,
    ops,
  );
}

export function approveProClubStaffSubmission(
  clubId: string,
  submissionId: string,
  reviewNote: string,
  ops: ProClubStaffSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubStaffSubmissionRecord> {
  return completeReviewTransition(
    clubId,
    submissionId,
    "APPROVED",
    reviewNote,
    ops,
  );
}
