import {
  collection,
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type FieldValue,
  type Firestore,
} from "firebase/firestore";
import { db } from "../firebase";
import { withoutCanonicalDocumentId } from "./canonicalDocument";
import {
  genericApprovalBlockReason,
  isExplicitlyPendingAccountStatus,
  isSafeAccountRole,
  requestedIntentAuditMetadata,
  type SafeAccountRole,
} from "../accountRolePolicy";

export const MAX_ATOMIC_BULK_APPROVAL_USERS = 250;
export const BULK_APPROVED_ROLE: SafeAccountRole = "USER";
export const APPROVED_ACCOUNT_STATUS = "Active" as const;
export const REJECTED_ACCOUNT_STATUS = "REJECTED" as const;

export const MANAGED_ACCOUNT_STATUSES = [
  "ACTIVE",
  "PENDING",
  "REJECTED",
  "INACTIVE",
] as const;

export type ManagedAccountStatus = (typeof MANAGED_ACCOUNT_STATUSES)[number];

export interface AdministrativeUserTarget {
  targetUid: string;
  targetEmail?: string;
  previousRole: unknown;
  previousStatus: unknown;
  requestedRole: unknown;
}

export interface IndividualApprovalInput extends AdministrativeUserTarget {
  actorUid: string;
  approvedRole: unknown;
}

export interface RejectUserInput extends AdministrativeUserTarget {
  actorUid: string;
  rejectionReason: string;
}

export interface UpdateRoleInput extends AdministrativeUserTarget {
  actorUid: string;
  approvedRole: unknown;
}

export interface UpdateStatusInput extends AdministrativeUserTarget {
  actorUid: string;
  approvedStatus: unknown;
}

export interface BulkApprovalInput {
  actorUid: string;
  targets: readonly AdministrativeUserTarget[];
}

export interface AtomicAdminBatch {
  updateUser(targetUid: string, patch: DocumentData): void;
  createAuditLog(log: DocumentData): void;
  commit(): Promise<void>;
}

export interface AtomicAdminMutationDependencies {
  createBatch(): AtomicAdminBatch;
  runAccountDecisionTransaction<T>(
    operation: (transaction: AtomicAccountDecisionTransaction) => Promise<T>,
  ): Promise<T>;
  timestamp(): unknown;
}

export interface AuthoritativeUserSnapshot {
  exists: boolean;
  data?: DocumentData;
}

export interface AtomicAccountDecisionTransaction {
  getUser(targetUid: string): Promise<AuthoritativeUserSnapshot>;
  updateUser(targetUid: string, patch: DocumentData): void;
  createAuditLog(log: DocumentData): void;
}

export interface AtomicUserMutation {
  targetUid: string;
  userPatch: DocumentData;
  auditLog: DocumentData;
}

function createFirestoreDependencies(
  firestore: Firestore,
): AtomicAdminMutationDependencies {
  const createBatch = (): AtomicAdminBatch => {
    const batch = writeBatch(firestore);
    return {
      updateUser(targetUid, patch) {
        batch.update(doc(firestore, "users", targetUid), {
          ...withoutCanonicalDocumentId(patch),
          uid: targetUid,
          id: deleteField(),
        });
      },
      createAuditLog(log) {
        const logRef = doc(collection(firestore, "logs"));
        batch.set(logRef, withoutCanonicalDocumentId(log));
      },
      commit: () => batch.commit(),
    };
  };

  return {
    createBatch,
    async runAccountDecisionTransaction(operation) {
      const logRef = doc(collection(firestore, "logs"));
      return runTransaction(firestore, async (transaction) => operation({
        async getUser(targetUid) {
          const snapshot = await transaction.get(
            doc(firestore, "users", targetUid),
          );
          return {
            exists: snapshot.exists(),
            data: snapshot.exists() ? snapshot.data() : undefined,
          };
        },
        updateUser(targetUid, patch) {
          transaction.update(doc(firestore, "users", targetUid), {
            ...withoutCanonicalDocumentId(patch),
            uid: targetUid,
            id: deleteField(),
          });
        },
        createAuditLog(log) {
          transaction.set(logRef, withoutCanonicalDocumentId(log));
        },
      }));
    },
    timestamp: (): FieldValue => serverTimestamp(),
  };
}

export function createFirestoreAdminMutationDependencies(
  firestore: Firestore,
): AtomicAdminMutationDependencies {
  return createFirestoreDependencies(firestore);
}

const FIRESTORE_DEPENDENCIES = createFirestoreDependencies(db);

function assertExactUid(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
    || value.includes("/")
  ) {
    throw new Error(`${field} must be an exact Firestore document ID.`);
  }
}

function assertDifferentActorAndTarget(actorUid: unknown, targetUid: unknown): void {
  assertExactUid(actorUid, "actorUid");
  assertExactUid(targetUid, "targetUid");
  if (actorUid === targetUid) {
    throw new Error("A SuperAdmin cannot change their own authoritative role or status here.");
  }
}

function authoritativeMetadata(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (value === undefined) return "MISSING";
  if (value === null) return "NULL";
  if (Array.isArray(value)) return "MALFORMED_ARRAY";
  if (typeof value === "object") return "MALFORMED_OBJECT";
  return `MALFORMED_${typeof value}_${String(value)}`;
}

function withTargetEmail(
  log: DocumentData,
  targetEmail: string | undefined,
): DocumentData {
  return typeof targetEmail === "string" && targetEmail.length > 0
    ? { ...log, targetEmail }
    : log;
}

function baseAuditLog(
  input: AdministrativeUserTarget & { actorUid: string },
  action: string,
  timestamp: unknown,
): DocumentData {
  return withTargetEmail({
    action,
    actorUid: input.actorUid,
    targetUid: input.targetUid,
    targetUser: input.targetUid,
    previousRole: authoritativeMetadata(input.previousRole),
    previousStatus: authoritativeMetadata(input.previousStatus),
    requestedIntent: requestedIntentAuditMetadata(input.requestedRole),
    timestamp,
  }, input.targetEmail);
}

function authoritativeDecisionTarget(
  input: AdministrativeUserTarget & { actorUid: string },
  snapshot: AuthoritativeUserSnapshot,
): AdministrativeUserTarget {
  assertDifferentActorAndTarget(input.actorUid, input.targetUid);
  if (!snapshot.exists || !snapshot.data) {
    throw new Error("The authoritative User document no longer exists.");
  }

  const authoritative = snapshot.data;
  if (authoritative.uid !== input.targetUid) {
    throw new Error("The authoritative User UID is missing or non-canonical.");
  }
  if (authoritative.role !== "USER") {
    throw new Error("Generic account decisions require authoritative role USER.");
  }
  if (!isExplicitlyPendingAccountStatus(authoritative.status)) {
    throw new Error("The authoritative User is no longer pending account review.");
  }
  if (authoritative.requestedRole !== input.requestedRole) {
    throw new Error("The authoritative requested intent changed during review.");
  }
  if (
    authoritative.role !== input.previousRole
    || authoritative.status !== input.previousStatus
  ) {
    throw new Error("The authoritative User state changed during review.");
  }

  const blockReason = genericApprovalBlockReason(authoritative.requestedRole);
  if (blockReason) {
    throw new Error(blockReason);
  }

  return {
    targetUid: input.targetUid,
    targetEmail: typeof authoritative.email === "string"
      ? authoritative.email
      : undefined,
    previousRole: authoritative.role,
    previousStatus: authoritative.status,
    requestedRole: authoritative.requestedRole,
  };
}

export async function commitAtomicUserMutations(
  mutations: readonly AtomicUserMutation[],
  dependencies: AtomicAdminMutationDependencies = FIRESTORE_DEPENDENCIES,
): Promise<void> {
  if (mutations.length === 0) {
    throw new Error("At least one User mutation is required.");
  }

  const batch = dependencies.createBatch();
  for (const mutation of mutations) {
    assertExactUid(mutation.targetUid, "targetUid");
    batch.updateUser(mutation.targetUid, mutation.userPatch);
    batch.createAuditLog(mutation.auditLog);
  }
  await batch.commit();
}

export async function approveUserAtomically(
  input: IndividualApprovalInput,
  dependencies: AtomicAdminMutationDependencies = FIRESTORE_DEPENDENCIES,
): Promise<void> {
  assertDifferentActorAndTarget(input.actorUid, input.targetUid);
  const blockReason = genericApprovalBlockReason(input.requestedRole);
  if (blockReason) throw new Error(blockReason);
  if (!isSafeAccountRole(input.approvedRole)) {
    throw new Error("approvedRole must be an explicitly selected safe account role.");
  }

  await dependencies.runAccountDecisionTransaction(async (transaction) => {
    const authoritative = authoritativeDecisionTarget(
      input,
      await transaction.getUser(input.targetUid),
    );
    const timestamp = dependencies.timestamp();
    transaction.updateUser(input.targetUid, {
      role: input.approvedRole,
      status: APPROVED_ACCOUNT_STATUS,
      approvedBy: input.actorUid,
      approvedAt: timestamp,
      updatedAt: timestamp,
    });
    transaction.createAuditLog({
      ...baseAuditLog(
        { ...authoritative, actorUid: input.actorUid },
        "USER_APPROVED",
        timestamp,
      ),
      approvedBy: input.actorUid,
      approvedRole: input.approvedRole,
      approvedStatus: APPROVED_ACCOUNT_STATUS,
      newRole: input.approvedRole,
      newStatus: APPROVED_ACCOUNT_STATUS,
    });
  });
}

export async function rejectUserAtomically(
  input: RejectUserInput,
  dependencies: AtomicAdminMutationDependencies = FIRESTORE_DEPENDENCIES,
): Promise<void> {
  assertDifferentActorAndTarget(input.actorUid, input.targetUid);
  const blockReason = genericApprovalBlockReason(input.requestedRole);
  if (blockReason) throw new Error(blockReason);

  await dependencies.runAccountDecisionTransaction(async (transaction) => {
    const authoritative = authoritativeDecisionTarget(
      input,
      await transaction.getUser(input.targetUid),
    );
    const timestamp = dependencies.timestamp();
    transaction.updateUser(input.targetUid, {
      status: REJECTED_ACCOUNT_STATUS,
      rejectionReason: input.rejectionReason,
      updatedAt: timestamp,
    });
    transaction.createAuditLog({
      ...baseAuditLog(
        { ...authoritative, actorUid: input.actorUid },
        "USER_REJECTED",
        timestamp,
      ),
      rejectedBy: input.actorUid,
      approvedRole: authoritativeMetadata(authoritative.previousRole),
      approvedStatus: REJECTED_ACCOUNT_STATUS,
      newStatus: REJECTED_ACCOUNT_STATUS,
    });
  });
}

export async function updateUserRoleAtomically(
  input: UpdateRoleInput,
  dependencies: AtomicAdminMutationDependencies = FIRESTORE_DEPENDENCIES,
): Promise<void> {
  assertDifferentActorAndTarget(input.actorUid, input.targetUid);
  if (!isSafeAccountRole(input.approvedRole)) {
    throw new Error("Generic role updates may assign only a safe account role.");
  }
  const timestamp = dependencies.timestamp();
  await commitAtomicUserMutations([{
    targetUid: input.targetUid,
    userPatch: { role: input.approvedRole, updatedAt: timestamp },
    auditLog: {
      ...baseAuditLog(input, "ROLE_UPDATED", timestamp),
      updatedBy: input.actorUid,
      approvedRole: input.approvedRole,
      approvedStatus: authoritativeMetadata(input.previousStatus),
      newRole: input.approvedRole,
    },
  }], dependencies);
}

export async function updateUserStatusAtomically(
  input: UpdateStatusInput,
  dependencies: AtomicAdminMutationDependencies = FIRESTORE_DEPENDENCIES,
): Promise<void> {
  assertDifferentActorAndTarget(input.actorUid, input.targetUid);
  if (
    typeof input.approvedStatus !== "string"
    || !MANAGED_ACCOUNT_STATUSES.some((status) => status === input.approvedStatus)
  ) {
    throw new Error("approvedStatus must be an explicitly selected managed account status.");
  }
  const approvedStatus = input.approvedStatus as ManagedAccountStatus;
  const timestamp = dependencies.timestamp();
  await commitAtomicUserMutations([{
    targetUid: input.targetUid,
    userPatch: { status: approvedStatus, updatedAt: timestamp },
    auditLog: {
      ...baseAuditLog(input, "STATUS_UPDATED", timestamp),
      updatedBy: input.actorUid,
      approvedRole: authoritativeMetadata(input.previousRole),
      approvedStatus,
      newStatus: approvedStatus,
    },
  }], dependencies);
}

export async function bulkApproveUsersAtomically(
  input: BulkApprovalInput,
  dependencies: AtomicAdminMutationDependencies = FIRESTORE_DEPENDENCIES,
): Promise<void> {
  assertExactUid(input.actorUid, "actorUid");
  if (input.targets.length === 0) {
    throw new Error("Select at least one pending User for bulk approval.");
  }
  if (input.targets.length > MAX_ATOMIC_BULK_APPROVAL_USERS) {
    throw new Error(
      `Bulk approval is limited to ${MAX_ATOMIC_BULK_APPROVAL_USERS} Users so all User and audit writes fit in one atomic Firestore batch.`,
    );
  }

  const seenTargets = new Set<string>();
  for (const target of input.targets) {
    assertDifferentActorAndTarget(input.actorUid, target.targetUid);
    if (seenTargets.has(target.targetUid)) {
      throw new Error(`Duplicate bulk approval target: ${target.targetUid}`);
    }
    seenTargets.add(target.targetUid);
    const blockReason = genericApprovalBlockReason(target.requestedRole);
    if (blockReason) {
      throw new Error(`Bulk approval blocked for ${target.targetUid}: ${blockReason}`);
    }
  }

  const timestamp = dependencies.timestamp();
  const mutations = input.targets.map((target): AtomicUserMutation => ({
    targetUid: target.targetUid,
    userPatch: {
      role: BULK_APPROVED_ROLE,
      status: APPROVED_ACCOUNT_STATUS,
      approvedBy: input.actorUid,
      approvedAt: timestamp,
      updatedAt: timestamp,
    },
    auditLog: {
      ...baseAuditLog({ ...target, actorUid: input.actorUid }, "USER_BULK_APPROVED", timestamp),
      approvedBy: input.actorUid,
      approvedRole: BULK_APPROVED_ROLE,
      approvedStatus: APPROVED_ACCOUNT_STATUS,
      newRole: BULK_APPROVED_ROLE,
      newStatus: APPROVED_ACCOUNT_STATUS,
    },
  }));

  await commitAtomicUserMutations(mutations, dependencies);
}
