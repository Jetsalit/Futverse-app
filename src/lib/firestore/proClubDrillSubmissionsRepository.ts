import {
  Timestamp,
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
import { buildDrillSubmittedSnapshot, type DrillSubmittedSnapshot } from "../drillSubmittedSnapshot";
import {
  assertFirestoreDocumentFitsApplicationCeiling,
  type FirestoreValue,
} from "./firestoreDocumentSize";
import {
  resolveProClubOrganizationAuthority,
  type ProClubOrganizationAuthority,
  type ProClubOrganizationAuthorityResult,
} from "./proClubOrganizationAdapter";
import { resolveProClubDrillProvenance } from "../proClubDrillProvenance";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  effectiveProClubDrillSubmissionStatus,
  parseProClubDrillSubmissionReview,
  validateProClubDrillSubmissionReviewNote,
  type ProClubDrillSubmissionEffectiveStatus,
  type ProClubDrillSubmissionReviewRecord,
  type ProClubDrillSubmissionReviewStatus,
} from "../proClubDrillSubmissionReview";
import {
  canTransitionProClubTechnicalWorkStatus,
  type ProClubTechnicalAuthorityRole,
} from "../proClubTechnicalGovernance";

export interface ProClubDrillSubmissionDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly data?: unknown;
}

export interface ProClubDrillSubmissionListFilter {
  readonly field: "submittedBy";
  readonly value: string;
}

export interface ProClubDrillSubmissionListSnapshot {
  readonly documents: readonly ProClubDrillSubmissionDocumentSnapshot[];
}

export interface ProClubDrillSubmissionsRepositoryOps {
  getAuthenticatedUid(): string | null;
  resolveAuthority(
    clubId: string,
    uid: string,
  ): Promise<ProClubOrganizationAuthorityResult>;
  readDocument(
    path: readonly string[],
  ): Promise<ProClubDrillSubmissionDocumentSnapshot>;
  listDocuments(
    path: readonly string[],
    filters?: readonly ProClubDrillSubmissionListFilter[],
  ): Promise<ProClubDrillSubmissionListSnapshot>;
  createDocument(path: readonly string[], data: DocumentData): Promise<void>;
  updateDocument(path: readonly string[], data: DocumentData): Promise<void>;
  timestamp(): unknown;
}

export interface ProClubDrillSubmissionRecord {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly organizationType: "PRO_CLUB";
  readonly organizationId: string;
  readonly sourceDrillId: string;
  readonly sourceCreatorUid: string;
  readonly sourceCreatorRoleAtSubmission: "HEAD_COACH" | "GK_COACH";
  readonly submittedBy: string;
  readonly submittedAt: unknown;
  readonly snapshot: DrillSubmittedSnapshot;
}

export interface ProClubDrillSubmissionInboxRecord
  extends ProClubDrillSubmissionRecord {
  readonly effectiveStatus: ProClubDrillSubmissionEffectiveStatus;
  readonly review: ProClubDrillSubmissionReviewRecord | null;
}

export interface ProClubTechnicalGovernanceCurrent {
  readonly schemaVersion: 1;
  readonly status: "ACTIVE";
  readonly authorityUid: string;
  readonly authorityRole: ProClubTechnicalAuthorityRole;
}

interface ParsedSnapshot extends DrillSubmittedSnapshot {}

const SUBMISSION_FIELDS = new Set([
  "schemaVersion",
  "organizationType",
  "organizationId",
  "sourceDrillId",
  "sourceCreatorUid",
  "sourceCreatorRoleAtSubmission",
  "submittedBy",
  "submittedAt",
  "snapshot",
]);
const SNAPSHOT_FIELDS = new Set(["details", "visualType", "canvasData", "previewImage"]);
const DETAIL_FIELDS = new Set([
  "title",
  "category",
  "duration",
  "ageGroup",
  "phase",
  "trainingMethod",
  "coachingPoints",
  "description",
  "date",
]);
const FIRESTORE_MAX_IDENTIFIER_BYTES = 1_500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function requireDocumentIdentifier(value: unknown, label: string): asserts value is string {
  if (
    !isValidDocumentIdentifier(value) ||
    value === "." ||
    value === ".." ||
    /^__.*__$/.test(value) ||
    utf8ByteLength(value) > FIRESTORE_MAX_IDENTIFIER_BYTES
  ) {
    throw new TypeError(`${label} must be a valid Firestore document identifier.`);
  }
}

function validatePath(
  path: readonly string[],
  kind: "document" | "collection",
): void {
  const expectedParity = kind === "document" ? 0 : 1;
  if (!Array.isArray(path) || path.length === 0 || path.length % 2 !== expectedParity) {
    throw new TypeError(`Invalid Firestore ${kind} path.`);
  }
  path.forEach((segment, index) =>
    requireDocumentIdentifier(segment, `Firestore path segment ${index + 1}`)
  );
}

function requireExactClubAuthority(
  result: ProClubOrganizationAuthorityResult,
  clubId: string,
  uid: string,
): ProClubOrganizationAuthority {
  if (result.state !== "FOUND") {
    throw new Error(`Pro Club authority could not be resolved: ${result.state}.`);
  }
  if (
    result.value.organizationType !== "PRO_CLUB" ||
    result.value.organizationId !== clubId ||
    result.value.userId !== uid ||
    result.value.organizationStatus !== "ACTIVE" ||
    result.value.membershipStatus !== "ACTIVE" ||
    result.value.hasMembershipAuthority !== true
  ) {
    throw new Error("Active same-club Pro Club membership authority is required.");
  }
  return result.value;
}

function requireAuthenticatedUid(ops: ProClubDrillSubmissionsRepositoryOps): string {
  const uid = ops.getAuthenticatedUid();
  requireDocumentIdentifier(uid, "Authenticated actor UID");
  return uid;
}

function requireAuthor(
  authority: ProClubOrganizationAuthority,
): asserts authority is ProClubOrganizationAuthority & {
  staffRole: "HEAD_COACH" | "GK_COACH";
} {
  if (!resolveProClubDrillProvenance(authority)) {
    throw new Error("Active Head Coach or GK Coach drill-authoring authority is required.");
  }
}

function parseSnapshot(raw: unknown): ParsedSnapshot {
  if (
    !isRecord(raw) ||
    Object.keys(raw).some((field) => !SNAPSHOT_FIELDS.has(field)) ||
    !isRecord(raw.details) ||
    Object.keys(raw.details).some((field) => !DETAIL_FIELDS.has(field)) ||
    typeof raw.details.title !== "string" ||
    typeof raw.details.category !== "string"
  ) {
    throw new TypeError("Pro Club drill submission snapshot is invalid.");
  }
  for (const [field, value] of Object.entries(raw.details)) {
    if (typeof value !== "string") {
      throw new TypeError(`Pro Club drill submitted detail ${field} is invalid.`);
    }
  }
  const hasCanvas = Object.prototype.hasOwnProperty.call(raw, "canvasData");
  const hasImage = Object.prototype.hasOwnProperty.call(raw, "previewImage");
  if (hasCanvas && !isRecord(raw.canvasData)) {
    throw new TypeError("Submitted canvasData must be a map.");
  }
  if (hasImage && typeof raw.previewImage !== "string") {
    throw new TypeError("Submitted previewImage must be a string.");
  }
  const expectedVisualType = hasCanvas && hasImage
    ? "BOTH"
    : hasCanvas
      ? "TACTIC_BOARD"
      : hasImage
        ? "UPLOADED_IMAGE"
        : null;
  if (
    expectedVisualType === null ||
    raw.visualType !== expectedVisualType
  ) {
    throw new TypeError("Pro Club drill submission visual type does not match its snapshot.");
  }
  return raw as unknown as ParsedSnapshot;
}

export function parseProClubDrillSubmissionRecord(
  id: string,
  raw: unknown,
  clubId: string,
): ProClubDrillSubmissionRecord {
  requireDocumentIdentifier(id, "submissionId");
  requireDocumentIdentifier(clubId, "clubId");
  if (
    !isRecord(raw) ||
    Object.keys(raw).length !== SUBMISSION_FIELDS.size ||
    Object.keys(raw).some((field) => !SUBMISSION_FIELDS.has(field)) ||
    raw.schemaVersion !== 1 ||
    raw.organizationType !== "PRO_CLUB" ||
    raw.organizationId !== clubId ||
    !isValidDocumentIdentifier(raw.sourceDrillId) ||
    !isValidDocumentIdentifier(raw.sourceCreatorUid) ||
    (raw.sourceCreatorRoleAtSubmission !== "HEAD_COACH" &&
      raw.sourceCreatorRoleAtSubmission !== "GK_COACH") ||
    raw.submittedBy !== raw.sourceCreatorUid ||
    raw.submittedAt === undefined ||
    raw.submittedAt === null
  ) {
    throw new TypeError("Pro Club drill submission evidence is invalid.");
  }
  return {
    id,
    schemaVersion: 1,
    organizationType: "PRO_CLUB",
    organizationId: clubId,
    sourceDrillId: raw.sourceDrillId as string,
    sourceCreatorUid: raw.sourceCreatorUid as string,
    sourceCreatorRoleAtSubmission: raw.sourceCreatorRoleAtSubmission,
    submittedBy: raw.submittedBy as string,
    submittedAt: raw.submittedAt,
    snapshot: parseSnapshot(raw.snapshot),
  };
}

function submissionPath(clubId: string, submissionId: string): readonly string[] {
  return ["proClubs", clubId, "drillSubmissions", submissionId];
}

function reviewPath(clubId: string, submissionId: string): readonly string[] {
  return ["proClubs", clubId, "drillSubmissionReviews", submissionId];
}

function defaultFirestoreOps(): ProClubDrillSubmissionsRepositoryOps {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },
    resolveAuthority(clubId, uid) {
      return resolveProClubOrganizationAuthority(clubId, uid);
    },
    async readDocument(path) {
      validatePath(path, "document");
      const [first, ...rest] = path;
      const snapshot = await getDocFromServer(doc(db, first, ...rest));
      return {
        id: snapshot.id,
        exists: snapshot.exists(),
        data: snapshot.exists() ? snapshot.data() : undefined,
      };
    },
    async listDocuments(path, filters = []) {
      validatePath(path, "collection");
      const [first, ...rest] = path;
      const constraints: QueryConstraint[] = filters.map((filter) =>
        where(filter.field, "==", filter.value)
      );
      const reference = collection(db, first, ...rest);
      const snapshot = await getDocsFromServer(
        constraints.length > 0 ? query(reference, ...constraints) : reference,
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
      validatePath(path, "document");
      const [first, ...rest] = path;
      await setDoc(doc(db, first, ...rest), data);
    },
    async updateDocument(path, data) {
      validatePath(path, "document");
      const [first, ...rest] = path;
      await updateDoc(doc(db, first, ...rest), data);
    },
    timestamp() {
      return serverTimestamp();
    },
  };
}

const FIRESTORE_OPS = defaultFirestoreOps();

export function createFirestoreProClubDrillSubmissionsRepositoryOps():
  ProClubDrillSubmissionsRepositoryOps {
  return defaultFirestoreOps();
}

async function resolveAuthorAuthority(
  clubId: string,
  uid: string,
  ops: ProClubDrillSubmissionsRepositoryOps,
): Promise<ProClubOrganizationAuthority & { staffRole: "HEAD_COACH" | "GK_COACH" }> {
  const authority = requireExactClubAuthority(
    await ops.resolveAuthority(clubId, uid),
    clubId,
    uid,
  );
  requireAuthor(authority);
  return authority;
}

async function resolveTechnicalAuthority(
  clubId: string,
  actor: ProClubOrganizationAuthority,
  ops: ProClubDrillSubmissionsRepositoryOps,
): Promise<ProClubTechnicalGovernanceCurrent> {
  const currentSnapshot = await ops.readDocument([
    "proClubs",
    clubId,
    "technicalGovernance",
    "current",
  ]);
  if (!currentSnapshot.exists || currentSnapshot.id !== "current" || !isRecord(currentSnapshot.data)) {
    throw new Error("Technical Governance current authority is unavailable.");
  }
  const raw = currentSnapshot.data;
  if (
    raw.schemaVersion !== 1 ||
    raw.status !== "ACTIVE" ||
    !isValidDocumentIdentifier(raw.authorityUid) ||
    (raw.authorityRole !== "HEAD_COACH" &&
      raw.authorityRole !== "TECHNICAL_DIRECTOR")
  ) {
    throw new Error("Technical Governance current authority is invalid.");
  }
  if (
    raw.authorityUid !== actor.userId ||
    raw.authorityRole !== actor.staffRole
  ) {
    throw new Error("Exact active Technical Governance authority is required.");
  }
  return raw as unknown as ProClubTechnicalGovernanceCurrent;
}

async function resolveReviewer(
  clubId: string,
  uid: string,
  ops: ProClubDrillSubmissionsRepositoryOps,
) {
  const actor = requireExactClubAuthority(
    await ops.resolveAuthority(clubId, uid),
    clubId,
    uid,
  );
  const current = await resolveTechnicalAuthority(clubId, actor, ops);
  return { actor, current };
}

async function readRequiredSubmission(
  clubId: string,
  submissionId: string,
  ops: ProClubDrillSubmissionsRepositoryOps,
): Promise<ProClubDrillSubmissionRecord> {
  const snapshot = await ops.readDocument(submissionPath(clubId, submissionId));
  if (!snapshot.exists || snapshot.id !== submissionId) {
    throw new Error("Pro Club drill submission does not exist.");
  }
  return parseProClubDrillSubmissionRecord(submissionId, snapshot.data, clubId);
}

async function readReviewOrNull(
  clubId: string,
  submissionId: string,
  ops: ProClubDrillSubmissionsRepositoryOps,
): Promise<ProClubDrillSubmissionReviewRecord | null> {
  const snapshot = await ops.readDocument(reviewPath(clubId, submissionId));
  if (snapshot.id !== submissionId) {
    throw new Error("Pro Club drill submission review returned the wrong document.");
  }
  if (!snapshot.exists) return null;
  return parseProClubDrillSubmissionReview(submissionId, snapshot.data);
}

export async function createProClubDrillSubmission(
  clubId: string,
  submissionId: string,
  sourceDrillId: string,
  ops: ProClubDrillSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubDrillSubmissionRecord> {
  requireDocumentIdentifier(clubId, "clubId");
  requireDocumentIdentifier(submissionId, "submissionId");
  requireDocumentIdentifier(sourceDrillId, "sourceDrillId");
  const uid = requireAuthenticatedUid(ops);
  const authority = await resolveAuthorAuthority(clubId, uid, ops);
  const source = await ops.readDocument(["drills", sourceDrillId]);
  if (!source.exists || source.id !== sourceDrillId || !isRecord(source.data)) {
    throw new Error("The selected source drill is unavailable.");
  }
  if (
    source.data.created_by !== uid ||
    source.data.organizationType !== "PRO_CLUB" ||
    source.data.organizationId !== clubId
  ) {
    throw new Error("The selected source drill must belong to this author and Pro Club.");
  }

  const snapshot = buildDrillSubmittedSnapshot(source.data);
  const evidencePath = submissionPath(clubId, submissionId);
  const timestampForSizing = Timestamp.fromMillis(0);
  const evidenceForSizing: Record<string, FirestoreValue> = {
    schemaVersion: 1,
    organizationType: "PRO_CLUB",
    organizationId: clubId,
    sourceDrillId,
    sourceCreatorUid: uid,
    sourceCreatorRoleAtSubmission: authority.staffRole,
    submittedBy: uid,
    // A server timestamp transform resolves to the same 8-byte Firestore
    // timestamp value. Use a concrete SDK timestamp solely for preflight.
    submittedAt: timestampForSizing,
    snapshot: snapshot as unknown as FirestoreValue,
  };
  assertFirestoreDocumentFitsApplicationCeiling(
    evidencePath,
    evidenceForSizing,
  );

  const evidence: DocumentData = {
    ...evidenceForSizing,
    submittedAt: ops.timestamp(),
  };
  await ops.createDocument(evidencePath, evidence);
  return parseProClubDrillSubmissionRecord(submissionId, evidence, clubId);
}

async function listSubmissions(
  clubId: string,
  filters: readonly ProClubDrillSubmissionListFilter[],
  ops: ProClubDrillSubmissionsRepositoryOps,
): Promise<ProClubDrillSubmissionRecord[]> {
  const result = await ops.listDocuments(["proClubs", clubId, "drillSubmissions"], filters);
  return result.documents.map((item) => {
    if (!item.exists) {
      throw new Error("Drill Submission list returned a missing document.");
    }
    return parseProClubDrillSubmissionRecord(item.id, item.data, clubId);
  });
}

async function joinReviewState(
  clubId: string,
  submission: ProClubDrillSubmissionRecord,
  ops: ProClubDrillSubmissionsRepositoryOps,
): Promise<ProClubDrillSubmissionInboxRecord> {
  const review = await readReviewOrNull(clubId, submission.id, ops);
  return {
    ...submission,
    effectiveStatus: effectiveProClubDrillSubmissionStatus(review),
    review,
  };
}

export async function listMyProClubDrillSubmissions(
  clubId: string,
  ops: ProClubDrillSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubDrillSubmissionInboxRecord[]> {
  requireDocumentIdentifier(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  await resolveAuthorAuthority(clubId, uid, ops);
  const submissions = await listSubmissions(
    clubId,
    [{ field: "submittedBy", value: uid }],
    ops,
  );
  return Promise.all(submissions.map((submission) => joinReviewState(clubId, submission, ops)));
}

export async function listProClubDrillSubmissionsForReview(
  clubId: string,
  ops: ProClubDrillSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubDrillSubmissionInboxRecord[]> {
  requireDocumentIdentifier(clubId, "clubId");
  const uid = requireAuthenticatedUid(ops);
  const { actor } = await resolveReviewer(clubId, uid, ops);
  const submissions = await listSubmissions(clubId, [], ops);
  return Promise.all(submissions.map(async (submission) => {
    if (submission.submittedBy === actor.userId) {
      // Keep the row visible if current governance permits it, but never make
      // a self-review decision available to the caller.
      return joinReviewState(clubId, submission, ops);
    }
    return joinReviewState(clubId, submission, ops);
  }));
}

export async function beginProClubDrillSubmissionReview(
  clubId: string,
  submissionId: string,
  ops: ProClubDrillSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubDrillSubmissionReviewRecord> {
  requireDocumentIdentifier(clubId, "clubId");
  requireDocumentIdentifier(submissionId, "submissionId");
  const uid = requireAuthenticatedUid(ops);
  const { actor, current } = await resolveReviewer(clubId, uid, ops);
  const submission = await readRequiredSubmission(clubId, submissionId, ops);
  if (
    submission.submittedBy === uid ||
    submission.organizationId !== clubId ||
    !canTransitionProClubTechnicalWorkStatus("SUBMITTED", "IN_REVIEW")
  ) {
    throw new Error("Drill Submission cannot begin review for this actor.");
  }
  const existingReview = await readReviewOrNull(clubId, submissionId, ops);
  if (existingReview !== null) {
    throw new Error("Drill Submission review has already started or concluded.");
  }

  const timestamp = ops.timestamp();
  const reviewData: DocumentData = {
    schemaVersion: 1,
    submissionId,
    status: "IN_REVIEW",
    reviewerUid: uid,
    reviewerRole: current.authorityRole,
    reviewNote: null,
    reviewStartedAt: timestamp,
    reviewStartedBy: uid,
    revisionRequestedAt: null,
    revisionRequestedBy: null,
    approvedAt: null,
    approvedBy: null,
    updatedAt: timestamp,
    updatedBy: uid,
  };
  await ops.createDocument(reviewPath(clubId, submissionId), reviewData);
  return parseProClubDrillSubmissionReview(submissionId, reviewData);
}

async function completeReviewTransition(
  clubId: string,
  submissionId: string,
  targetStatus: Extract<ProClubDrillSubmissionReviewStatus, "NEEDS_REVISION" | "APPROVED">,
  reviewNote: string,
  ops: ProClubDrillSubmissionsRepositoryOps,
): Promise<ProClubDrillSubmissionReviewRecord> {
  requireDocumentIdentifier(clubId, "clubId");
  requireDocumentIdentifier(submissionId, "submissionId");
  const note = validateProClubDrillSubmissionReviewNote(reviewNote);
  const uid = requireAuthenticatedUid(ops);
  const { current } = await resolveReviewer(clubId, uid, ops);
  const submission = await readRequiredSubmission(clubId, submissionId, ops);
  const currentReview = await readReviewOrNull(clubId, submissionId, ops);
  if (
    currentReview === null ||
    submission.submittedBy === uid ||
    currentReview.reviewerUid !== uid ||
    currentReview.reviewerRole !== current.authorityRole ||
    !canTransitionProClubTechnicalWorkStatus("IN_REVIEW", targetStatus)
  ) {
    throw new Error("Drill Submission review transition is not permitted.");
  }
  if (currentReview.status !== "IN_REVIEW") {
    throw new Error("Only an in-progress Drill Submission review can be completed.");
  }

  const timestamp = ops.timestamp();
  const transitionFields = targetStatus === "APPROVED"
    ? {
        status: "APPROVED" as const,
        reviewNote: note,
        approvedAt: timestamp,
        approvedBy: uid,
        updatedAt: timestamp,
        updatedBy: uid,
      }
    : {
        status: "NEEDS_REVISION" as const,
        reviewNote: note,
        revisionRequestedAt: timestamp,
        revisionRequestedBy: uid,
        updatedAt: timestamp,
        updatedBy: uid,
      };
  await ops.updateDocument(reviewPath(clubId, submissionId), transitionFields);
  return parseProClubDrillSubmissionReview(submissionId, {
    ...currentReview,
    ...transitionFields,
  });
}

export function requestProClubDrillSubmissionRevision(
  clubId: string,
  submissionId: string,
  reviewNote: string,
  ops: ProClubDrillSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubDrillSubmissionReviewRecord> {
  return completeReviewTransition(clubId, submissionId, "NEEDS_REVISION", reviewNote, ops);
}

export function approveProClubDrillSubmission(
  clubId: string,
  submissionId: string,
  reviewNote: string,
  ops: ProClubDrillSubmissionsRepositoryOps = FIRESTORE_OPS,
): Promise<ProClubDrillSubmissionReviewRecord> {
  return completeReviewTransition(clubId, submissionId, "APPROVED", reviewNote, ops);
}
