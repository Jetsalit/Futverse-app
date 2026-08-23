import {
  buildSuperAdminControlledMembershipActionDecision,
  type SuperAdminControlledMembershipAction,
} from "../../lib/superAdminControlledMembershipActionPolicy";

import type {
  MembershipSource,
  MembershipStatus,
  TenantRole,
} from "../../types/Membership";

import type {
  SuperAdminUserRelationshipInspectorItem,
} from "./superAdminUserRelationshipInspectorModel";

export type SuperAdminControlledMembershipActionTone =
  | "POSITIVE"
  | "CAUTION"
  | "DANGER";

export interface SuperAdminControlledMembershipActionPresentation {
  action: SuperAdminControlledMembershipAction;
  label: string;
  tone: SuperAdminControlledMembershipActionTone;
  targetStatus: MembershipStatus;

  targetUid: string;
  academyId: string;

  expectedStatus: MembershipStatus;
  expectedRole: TenantRole;
  expectedSource: MembershipSource;

  confirmationTitle: string;
  confirmationMessage: string;
}

export interface SuperAdminControlledMembershipActionPresentationModel {
  availability: "AVAILABLE" | "BLOCKED";

  userId: unknown;
  academyId: string;
  organizationName?: string;

  role: SuperAdminUserRelationshipInspectorItem["role"];
  status: SuperAdminUserRelationshipInspectorItem["status"];
  membershipSource?: string;

  actions: SuperAdminControlledMembershipActionPresentation[];

  blockedReason: string | null;
}

export interface BuildSuperAdminControlledMembershipActionPresentationInput {
  actorIsActiveSuperAdmin: boolean;

  userId: unknown;

  relationshipSource: unknown;
  integrity: unknown;

  item: SuperAdminUserRelationshipInspectorItem;
}

interface ActionPresentationMetadata {
  label: string;
  tone: SuperAdminControlledMembershipActionTone;
  confirmationTitle: string;
  confirmationMessage(
    organizationLabel: string,
  ): string;
}

const ACTION_ORDER:
  SuperAdminControlledMembershipAction[] = [
    "SUSPEND",
    "REACTIVATE",
    "MARK_LEFT",
    "REVOKE",
  ];

const ACTION_PRESENTATION:
  Record<
    SuperAdminControlledMembershipAction,
    ActionPresentationMetadata
  > = {
    SUSPEND: {
      label: "Suspend",
      tone: "CAUTION",
      confirmationTitle:
        "Suspend Academy Membership?",
      confirmationMessage:
        (organizationLabel) =>
          `Suspend this Membership at ${organizationLabel}? Active tenant access from this Membership will stop until it is explicitly reactivated.`,
    },

    REACTIVATE: {
      label: "Reactivate",
      tone: "POSITIVE",
      confirmationTitle:
        "Reactivate Academy Membership?",
      confirmationMessage:
        (organizationLabel) =>
          `Reactivate this suspended Membership at ${organizationLabel}? The canonical Membership will return to ACTIVE status.`,
    },

    MARK_LEFT: {
      label: "Mark Left",
      tone: "DANGER",
      confirmationTitle:
        "Mark Membership as Left?",
      confirmationMessage:
        (organizationLabel) =>
          `Mark this Membership at ${organizationLabel} as LEFT? LEFT is terminal in this controlled-action policy and cannot be reactivated here.`,
    },

    REVOKE: {
      label: "Revoke",
      tone: "DANGER",
      confirmationTitle:
        "Revoke Academy Membership?",
      confirmationMessage:
        (organizationLabel) =>
          `Revoke this Membership at ${organizationLabel}? REVOKED is terminal in this controlled-action policy and cannot be reactivated here.`,
    },
  };

function blockedModel(
  input:
    BuildSuperAdminControlledMembershipActionPresentationInput,
  reason: string,
): SuperAdminControlledMembershipActionPresentationModel {
  return {
    availability: "BLOCKED",

    userId: input.userId,
    academyId: input.item.organizationId,
    organizationName:
      input.item.organizationName,

    role: input.item.role,
    status: input.item.status,
    membershipSource:
      input.item.membershipSource,

    actions: [],
    blockedReason: reason,
  };
}

export function buildSuperAdminControlledMembershipActionPresentation(
  input:
    BuildSuperAdminControlledMembershipActionPresentationInput,
): SuperAdminControlledMembershipActionPresentationModel {
  if (
    input.item.organizationType !== "ACADEMY"
  ) {
    return blockedModel(
      input,
      "Controlled Membership actions are currently connected only to Academy Memberships.",
    );
  }

  const organizationLabel =
    input.item.organizationName ||
    input.item.organizationId;

  const actions:
    SuperAdminControlledMembershipActionPresentation[] = [];

  let firstBlockedReason:
    string | null = null;

  for (const action of ACTION_ORDER) {
    const decision =
      buildSuperAdminControlledMembershipActionDecision({
        actorIsActiveSuperAdmin:
          input.actorIsActiveSuperAdmin,

        requestedUserId:
          input.userId,

        relationshipUserId:
          input.userId,

        academyId:
          input.item.organizationId,

        relationshipAcademyId:
          input.item.organizationId,

        relationshipSource:
          input.relationshipSource,

        integrity:
          input.integrity,

        evidenceKind:
          input.item.evidenceKind,

        membershipRole:
          input.item.role,

        membershipStatus:
          input.item.status,

        membershipSource:
          input.item.membershipSource,

        action,
      });

    if (decision.allowed === false) {
      if (!firstBlockedReason) {
        firstBlockedReason =
          decision.reason;
      }

      continue;
    }

    const presentation =
      ACTION_PRESENTATION[
        decision.action
      ];

    actions.push({
      action:
        decision.action,

      label:
        presentation.label,

      tone:
        presentation.tone,

      targetStatus:
        decision.targetStatus,

      targetUid:
        input.userId as string,

      academyId:
        input.item.organizationId,

      expectedStatus:
        decision.currentStatus,

      expectedRole:
        decision.role,

      expectedSource:
        decision.source,

      confirmationTitle:
        presentation.confirmationTitle,

      confirmationMessage:
        presentation.confirmationMessage(
          organizationLabel,
        ),
    });
  }

  if (actions.length === 0) {
    return blockedModel(
      input,
      firstBlockedReason ||
        "No controlled Membership actions are available for this evidence.",
    );
  }

  return {
    availability: "AVAILABLE",

    userId:
      input.userId,

    academyId:
      input.item.organizationId,

    organizationName:
      input.item.organizationName,

    role:
      input.item.role,

    status:
      input.item.status,

    membershipSource:
      input.item.membershipSource,

    actions,

    blockedReason: null,
  };
}