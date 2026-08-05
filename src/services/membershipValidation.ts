import type {
  MembershipActivationValidationInput,
  TenantRole,
} from "../types/Membership";

export const MAX_INVITE_CODE_LENGTH = 32;

export function normalizeAndValidateInviteCode(inviteCode: string): string {
  const normalized = inviteCode.trim().toUpperCase();
  if (!normalized.startsWith("FUT-")) {
    throw new Error("Invite code must start with FUT-.");
  }
  if (normalized.length > MAX_INVITE_CODE_LENGTH) {
    throw new Error(`Invite code must be ${MAX_INVITE_CODE_LENGTH} characters or fewer.`);
  }
  return normalized;
}

export function validateApprovedMembershipActivation({
  academyId,
  uid,
  membership,
  claim,
}: MembershipActivationValidationInput): TenantRole {
  if (membership.status !== "ACTIVE") {
    throw new Error("Membership is not ACTIVE.");
  }
  if (membership.userId !== uid || membership.academyId !== academyId) {
    throw new Error("Membership identity does not match the requested Academy and user.");
  }
  if (membership.role !== "ADMIN" && membership.role !== "COACH") {
    throw new Error("Membership has an invalid tenant role.");
  }
  if (claim.status !== "APPROVED") {
    throw new Error("Academy join claim is not APPROVED.");
  }
  if (claim.userId !== uid || claim.approvedAcademyId !== academyId) {
    throw new Error("Approved Claim does not match the requested Academy and user.");
  }
  if (claim.approvedRole !== membership.role) {
    throw new Error("Approved Claim role does not match Membership role.");
  }
  return membership.role;
}
