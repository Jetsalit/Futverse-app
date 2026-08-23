import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { isActivePrivilegedActor } from "../privilegedAuthorization";
import {
  buildSuperAdminControlledMembershipActionDecision,
  type SuperAdminControlledMembershipAction,
} from "../superAdminControlledMembershipActionPolicy";
import { requireExactDocumentId } from "../../services/membershipValidation";
import type {
  Membership,
  MembershipSource,
  MembershipStatus,
  TenantRole,
} from "../../types/Membership";

export interface SuperAdminControlledMembershipMutationInput {
  actorUid: string;
  targetUid: string;
  academyId: string;
  action: SuperAdminControlledMembershipAction;
  expectedStatus: MembershipStatus;
  expectedRole: TenantRole;
  expectedSource: MembershipSource;
}

export interface SuperAdminControlledMembershipMutationResult {
  actorUid: string;
  targetUid: string;
  academyId: string;
  action: SuperAdminControlledMembershipAction;
  previousStatus: MembershipStatus;
  newStatus: MembershipStatus;
  role: TenantRole;
  source: MembershipSource;
}

export interface AuthoritativeControlledMembershipSnapshot {
  exists: boolean;
  data?: Record<string, unknown>;
}

export interface AtomicControlledMembershipTransaction {
  getUser(
    uid: string,
  ): Promise<AuthoritativeControlledMembershipSnapshot>;

  getMembership(
    academyId: string,
    uid: string,
  ): Promise<AuthoritativeControlledMembershipSnapshot>;

  updateMembership(
    academyId: string,
    uid: string,
    patch: DocumentData,
  ): void;

  createAuditLog(
    log: DocumentData,
  ): void;
}

export interface ControlledMembershipMutationDependencies {
  getAuthenticatedUid(): string | null;

  runControlledMembershipTransaction<T>(
    operation: (
      transaction: AtomicControlledMembershipTransaction,
    ) => Promise<T>,
  ): Promise<T>;

  timestamp(): unknown;
}

const MEMBERSHIP_REQUIRED_KEYS = [
  "userId",
  "academyId",
  "role",
  "status",
  "source",
  "joinedAt",
  "joinedBy",
  "updatedAt",
] as const;

const MEMBERSHIP_ALLOWED_KEYS = new Set([
  ...MEMBERSHIP_REQUIRED_KEYS,
  "approvalClaimId",
]);

const MEMBERSHIP_STATUSES = new Set<MembershipStatus>([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "LEFT",
  "REVOKED",
]);

const MEMBERSHIP_ROLES = new Set<TenantRole>([
  "ADMIN",
  "COACH",
]);

const MEMBERSHIP_SOURCES = new Set<MembershipSource>([
  "CLAIM_APPROVAL",
  "SUPERADMIN_ASSIGNMENT",
  "LEGACY_MIGRATION",
  "INVITE",
]);

function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    value,
    key,
  );
}

function assertExactMembershipSchema(
  data: Record<string, unknown>,
): void {
  const keys = Object.keys(data);

  if (
    !MEMBERSHIP_REQUIRED_KEYS.every((key) =>
      hasOwn(data, key),
    )
  ) {
    throw new Error(
      "Authoritative Membership is missing required canonical fields.",
    );
  }

  if (
    keys.some(
      (key) => !MEMBERSHIP_ALLOWED_KEYS.has(key),
    )
  ) {
    throw new Error(
      "Authoritative Membership contains unexpected fields.",
    );
  }
}

function authoritativeMembership(
  data: Record<string, unknown>,
  academyId: string,
  targetUid: string,
): Membership {
  assertExactMembershipSchema(data);

  if (typeof data.userId !== "string") {
    throw new Error(
      "Authoritative Membership userId is invalid.",
    );
  }

  if (typeof data.academyId !== "string") {
    throw new Error(
      "Authoritative Membership academyId is invalid.",
    );
  }

  requireExactDocumentId(
    data.userId,
    "Membership userId",
  );

  requireExactDocumentId(
    data.academyId,
    "Membership academyId",
  );

  if (data.userId !== targetUid) {
    throw new Error(
      "Authoritative Membership userId does not match the requested target.",
    );
  }

  if (data.academyId !== academyId) {
    throw new Error(
      "Authoritative Membership academyId does not match the requested Academy.",
    );
  }

  if (
    typeof data.role !== "string" ||
    !MEMBERSHIP_ROLES.has(
      data.role as TenantRole,
    )
  ) {
    throw new Error(
      "Authoritative Membership role is invalid or unsupported.",
    );
  }

  if (
    typeof data.status !== "string" ||
    !MEMBERSHIP_STATUSES.has(
      data.status as MembershipStatus,
    )
  ) {
    throw new Error(
      "Authoritative Membership status is invalid or unsupported.",
    );
  }

  if (
    typeof data.source !== "string" ||
    !MEMBERSHIP_SOURCES.has(
      data.source as MembershipSource,
    )
  ) {
    throw new Error(
      "Authoritative Membership source is invalid or unsupported.",
    );
  }

  if (typeof data.joinedBy !== "string") {
    throw new Error(
      "Authoritative Membership joinedBy is invalid.",
    );
  }

  requireExactDocumentId(
    data.joinedBy,
    "Membership joinedBy",
  );

  if (data.source === "CLAIM_APPROVAL") {
    if (
      typeof data.approvalClaimId !== "string"
    ) {
      throw new Error(
        "CLAIM_APPROVAL Membership requires approvalClaimId.",
      );
    }

    requireExactDocumentId(
      data.approvalClaimId,
      "Membership approvalClaimId",
    );
  } else if (hasOwn(data, "approvalClaimId")) {
    throw new Error(
      "Non-CLAIM_APPROVAL Membership must not contain approvalClaimId.",
    );
  }

  return data as unknown as Membership;
}

function assertActiveSuperAdminActor(
  actorUid: string,
  snapshot: AuthoritativeControlledMembershipSnapshot,
): void {
  if (!snapshot.exists || !snapshot.data) {
    throw new Error(
      "The authoritative SuperAdmin User document does not exist.",
    );
  }

  const actor = snapshot.data;

  if (
    hasOwn(actor, "uid") &&
    actor.uid !== actorUid
  ) {
    throw new Error(
      "The authoritative SuperAdmin User UID is non-canonical.",
    );
  }

  if (
    !isActivePrivilegedActor(
      {
        id: actorUid,
        role: actor.role,
        status: actor.status,
      },
      ["SUPERADMIN"],
    )
  ) {
    throw new Error(
      "Controlled Membership actions require an active SUPERADMIN actor.",
    );
  }
}

function assertExpectedMembershipState(
  input: SuperAdminControlledMembershipMutationInput,
  membership: Membership,
): void {
  if (membership.status !== input.expectedStatus) {
    throw new Error(
      "Authoritative Membership status changed during review.",
    );
  }

  if (membership.role !== input.expectedRole) {
    throw new Error(
      "Authoritative Membership role changed during review.",
    );
  }

  if (membership.source !== input.expectedSource) {
    throw new Error(
      "Authoritative Membership source changed during review.",
    );
  }
}

function createFirestoreDependencies(
  firestore: Firestore,
): ControlledMembershipMutationDependencies {
  return {
    getAuthenticatedUid() {
      return auth.currentUser?.uid ?? null;
    },

    async runControlledMembershipTransaction(
      operation,
    ) {
      const auditRef = doc(
        collection(firestore, "logs"),
      );

      return runTransaction(
        firestore,
        async (transaction) =>
          operation({
            async getUser(uid) {
              const snapshot =
                await transaction.get(
                  doc(
                    firestore,
                    "users",
                    uid,
                  ),
                );

              return {
                exists: snapshot.exists(),
                data: snapshot.exists()
                  ? snapshot.data() as Record<
                      string,
                      unknown
                    >
                  : undefined,
              };
            },

            async getMembership(
              academyId,
              uid,
            ) {
              const snapshot =
                await transaction.get(
                  doc(
                    firestore,
                    "academies",
                    academyId,
                    "members",
                    uid,
                  ),
                );

              return {
                exists: snapshot.exists(),
                data: snapshot.exists()
                  ? snapshot.data() as Record<
                      string,
                      unknown
                    >
                  : undefined,
              };
            },

            updateMembership(
              academyId,
              uid,
              patch,
            ) {
              transaction.update(
                doc(
                  firestore,
                  "academies",
                  academyId,
                  "members",
                  uid,
                ),
                patch,
              );
            },

            createAuditLog(log) {
              transaction.set(
                auditRef,
                log,
              );
            },
          }),
      );
    },

    timestamp: () => serverTimestamp(),
  };
}

export function createFirestoreControlledMembershipMutationDependencies(
  firestore: Firestore,
): ControlledMembershipMutationDependencies {
  return createFirestoreDependencies(
    firestore,
  );
}

const FIRESTORE_DEPENDENCIES =
  createFirestoreDependencies(db);

export async function mutateMembershipStatusAtomically(
  input: SuperAdminControlledMembershipMutationInput,
  dependencies:
    ControlledMembershipMutationDependencies =
      FIRESTORE_DEPENDENCIES,
): Promise<SuperAdminControlledMembershipMutationResult> {
  requireExactDocumentId(
    input.actorUid,
    "actorUid",
  );

  requireExactDocumentId(
    input.targetUid,
    "targetUid",
  );

  requireExactDocumentId(
    input.academyId,
    "academyId",
  );

  const authenticatedUid =
    dependencies.getAuthenticatedUid();

  if (
    authenticatedUid === null ||
    authenticatedUid !== input.actorUid
  ) {
    throw new Error(
      "Authenticated Firebase actor does not match the requested SuperAdmin actor.",
    );
  }

  return dependencies
    .runControlledMembershipTransaction(
      async (transaction) => {
        const actorSnapshot =
          await transaction.getUser(
            input.actorUid,
          );

        assertActiveSuperAdminActor(
          input.actorUid,
          actorSnapshot,
        );

        const membershipSnapshot =
          await transaction.getMembership(
            input.academyId,
            input.targetUid,
          );

        if (
          !membershipSnapshot.exists ||
          !membershipSnapshot.data
        ) {
          throw new Error(
            "The authoritative Membership no longer exists.",
          );
        }

        const membership =
          authoritativeMembership(
            membershipSnapshot.data,
            input.academyId,
            input.targetUid,
          );

        assertExpectedMembershipState(
          input,
          membership,
        );

        const decision =
          buildSuperAdminControlledMembershipActionDecision({
            actorIsActiveSuperAdmin: true,
            requestedUserId:
              input.targetUid,
            relationshipUserId:
              membership.userId,
            academyId:
              input.academyId,
            relationshipAcademyId:
              membership.academyId,
            relationshipSource:
              "CANONICAL",
            integrity:
              "VERIFIED",
            evidenceKind:
              "STAFF_MEMBERSHIP",
            membershipRole:
              membership.role,
            membershipStatus:
              membership.status,
            membershipSource:
              membership.source,
            action:
              input.action,
          });

        if (decision.allowed === false) {
          throw new Error(
            decision.reason,
          );
        }

        const timestamp =
          dependencies.timestamp();

        transaction.updateMembership(
          input.academyId,
          input.targetUid,
          {
            status:
              decision.targetStatus,
            updatedAt:
              timestamp,
          },
        );

        transaction.createAuditLog({
          action:
            "SUPERADMIN_MEMBERSHIP_STATUS_CHANGED",
          actorUid:
            input.actorUid,
          targetUid:
            input.targetUid,
          targetUser:
            input.targetUid,
          academyId:
            input.academyId,
          controlledAction:
            decision.action,
          previousStatus:
            membership.status,
          newStatus:
            decision.targetStatus,
          membershipRole:
            membership.role,
          membershipSource:
            membership.source,
          timestamp,
        });

        return {
          actorUid:
            input.actorUid,
          targetUid:
            input.targetUid,
          academyId:
            input.academyId,
          action:
            decision.action,
          previousStatus:
            membership.status,
          newStatus:
            decision.targetStatus,
          role:
            membership.role,
          source:
            membership.source,
        };
      },
    );
}
