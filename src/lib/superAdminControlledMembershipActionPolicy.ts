import type {
  MembershipSource,
  MembershipStatus,
  TenantRole,
} from "../types/Membership";

import type {
  SuperAdminIntegrityState,
  SuperAdminRelationshipEvidenceKind,
  SuperAdminRelationshipSource,
} from "./superAdminRelationshipReadModel";

export type SuperAdminControlledMembershipAction =
  | "SUSPEND"
  | "REACTIVATE"
  | "MARK_LEFT"
  | "REVOKE";

export type SuperAdminControlledMembershipWriteScope =
  "MEMBERSHIP_STATUS_ONLY";

export interface SuperAdminControlledMembershipActionInput {
  actorIsActiveSuperAdmin: boolean;
  requestedUserId: unknown;
  relationshipUserId: unknown;
  academyId: unknown;
  relationshipAcademyId: unknown;
  relationshipSource: unknown;
  integrity: unknown;
  evidenceKind: unknown;
  membershipRole: unknown;
  membershipStatus: unknown;
  membershipSource: unknown;
  action: unknown;
}

export type SuperAdminControlledMembershipActionDecision =
  | {
      allowed: true;
      action: SuperAdminControlledMembershipAction;
      currentStatus: MembershipStatus;
      targetStatus: MembershipStatus;
      role: TenantRole;
      source: MembershipSource;
      writeScope: SuperAdminControlledMembershipWriteScope;
      accountMutationAllowed: false;
    }
  | {
      allowed: false;
      action: SuperAdminControlledMembershipAction | null;
      reason: string;
    };

const ACTIONS =
  new Set<SuperAdminControlledMembershipAction>([
    "SUSPEND",
    "REACTIVATE",
    "MARK_LEFT",
    "REVOKE",
  ]);

const STATUSES =
  new Set<MembershipStatus>([
    "PENDING",
    "ACTIVE",
    "SUSPENDED",
    "LEFT",
    "REVOKED",
  ]);

const ROLES =
  new Set<TenantRole>([
    "ADMIN",
    "COACH",
  ]);

const MEMBERSHIP_SOURCES =
  new Set<MembershipSource>([
    "CLAIM_APPROVAL",
    "SUPERADMIN_ASSIGNMENT",
    "LEGACY_MIGRATION",
    "INVITE",
  ]);

const TRANSITIONS: Record<
  MembershipStatus,
  Partial<
    Record<
      SuperAdminControlledMembershipAction,
      MembershipStatus
    >
  >
> = {
  PENDING: {
    REVOKE: "REVOKED",
  },
  ACTIVE: {
    SUSPEND: "SUSPENDED",
    MARK_LEFT: "LEFT",
    REVOKE: "REVOKED",
  },
  SUSPENDED: {
    REACTIVATE: "ACTIVE",
    MARK_LEFT: "LEFT",
    REVOKE: "REVOKED",
  },
  LEFT: {},
  REVOKED: {},
};

function exactDocumentId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes("/")
  );
}

function normalizedAction(
  value: unknown,
): SuperAdminControlledMembershipAction | null {
  return (
    typeof value === "string" &&
    ACTIONS.has(
      value as SuperAdminControlledMembershipAction,
    )
  )
    ? value as SuperAdminControlledMembershipAction
    : null;
}

function block(
  action: SuperAdminControlledMembershipAction | null,
  reason: string,
): SuperAdminControlledMembershipActionDecision {
  return {
    allowed: false,
    action,
    reason,
  };
}

export function buildSuperAdminControlledMembershipActionDecision(
  input: SuperAdminControlledMembershipActionInput,
): SuperAdminControlledMembershipActionDecision {
  const action =
    normalizedAction(input.action);

  if (!input.actorIsActiveSuperAdmin) {
    return block(
      action,
      "Only an active SuperAdmin may use controlled membership actions.",
    );
  }

  if (
    !exactDocumentId(input.requestedUserId) ||
    !exactDocumentId(input.relationshipUserId) ||
    !exactDocumentId(input.academyId) ||
    !exactDocumentId(input.relationshipAcademyId)
  ) {
    return block(
      action,
      "Membership action identity is invalid.",
    );
  }

  if (
    input.requestedUserId !==
      input.relationshipUserId
  ) {
    return block(
      action,
      "Membership action user identity does not match the inspected relationship.",
    );
  }

  if (
    input.academyId !==
      input.relationshipAcademyId
  ) {
    return block(
      action,
      "Membership action Academy identity does not match the inspected relationship.",
    );
  }

  if (
    input.relationshipSource !==
      ("CANONICAL" satisfies SuperAdminRelationshipSource)
  ) {
    return block(
      action,
      "Only canonical membership evidence may be mutated.",
    );
  }

  if (
    input.integrity !==
      ("VERIFIED" satisfies SuperAdminIntegrityState)
  ) {
    return block(
      action,
      "Membership actions require verified relationship integrity.",
    );
  }

  if (
    input.evidenceKind !==
      ("STAFF_MEMBERSHIP" satisfies SuperAdminRelationshipEvidenceKind)
  ) {
    return block(
      action,
      "Only canonical staff Membership evidence is eligible for this action.",
    );
  }

  if (
    typeof input.membershipRole !== "string" ||
    !ROLES.has(
      input.membershipRole as TenantRole,
    )
  ) {
    return block(
      action,
      "Membership role is invalid or unsupported.",
    );
  }

  if (
    typeof input.membershipSource !== "string" ||
    !MEMBERSHIP_SOURCES.has(
      input.membershipSource as MembershipSource,
    )
  ) {
    return block(
      action,
      "Membership source is invalid or unsupported.",
    );
  }

  if (
    typeof input.membershipStatus !== "string" ||
    !STATUSES.has(
      input.membershipStatus as MembershipStatus,
    )
  ) {
    return block(
      action,
      "Membership status is invalid or unsupported.",
    );
  }

  if (!action) {
    return block(
      null,
      "Membership action is invalid or unsupported.",
    );
  }

  const currentStatus =
    input.membershipStatus as MembershipStatus;

  const targetStatus =
    TRANSITIONS[currentStatus][action];

  if (!targetStatus) {
    return block(
      action,
      `Action ${action} is not allowed from Membership status ${currentStatus}.`,
    );
  }

  return {
    allowed: true,
    action,
    currentStatus,
    targetStatus,
    role: input.membershipRole as TenantRole,
    source: input.membershipSource as MembershipSource,
    writeScope: "MEMBERSHIP_STATUS_ONLY",
    accountMutationAllowed: false,
  };
}
