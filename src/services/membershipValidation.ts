import type {
  AcademyInvite,
  AcademyJoinClaim,
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
  if (!/^FUT-[A-Z0-9-]+$/.test(normalized)) {
    throw new Error("Invite code may contain only uppercase letters, numbers, and hyphens.");
  }
  return normalized;
}

export function requireExactDocumentId(value: string, field: string): void {
  if (!value || value.trim() !== value || value.includes("/")) {
    throw new Error(`${field} must be an exact Firestore document ID.`);
  }
}

export function buildAcademyJoinClaimId(
  uid: string,
  role: TenantRole,
  inviteCode: string,
): string {
  requireExactDocumentId(uid, "uid");
  const normalizedInviteCode = normalizeAndValidateInviteCode(inviteCode);
  const claimId = `${uid}_${role}_${normalizedInviteCode}`;
  if (claimId.length > 512) {
    throw new Error("Academy join Claim ID exceeds the supported length.");
  }
  return claimId;
}

export function validateActiveAcademyInvite(
  invite: AcademyInvite,
  normalizedInviteCode: string,
): string {
  const expectedCode = normalizeAndValidateInviteCode(normalizedInviteCode);
  if (invite.inviteCode !== expectedCode) {
    throw new Error("Invite registry code does not match its canonical document ID.");
  }
  if (invite.status !== "ACTIVE") {
    throw new Error("Academy invite is not ACTIVE.");
  }
  requireExactDocumentId(invite.academyId, "invite academyId");
  return invite.academyId;
}

export function validateClaimAcademyBinding(
  claim: AcademyJoinClaim,
  academyId: string,
  invite: AcademyInvite,
): void {
  const normalizedInviteCode = normalizeAndValidateInviteCode(claim.inviteCode);
  const registryAcademyId = validateActiveAcademyInvite(invite, normalizedInviteCode);
  if (registryAcademyId !== academyId) {
    throw new Error("Invite registry does not belong to the requested Academy.");
  }
  if (claim.requestedAcademyId && claim.requestedAcademyId !== academyId) {
    throw new Error("Claim requestedAcademyId does not match the requested Academy.");
  }
  // New ACADEMY_JOIN Claims always carry requestedAcademyId. Historical Claims
  // may omit it and are accepted only because the canonical registry above
  // proves that their invite code belongs to this exact Academy.
}

export function validateApprovedMembershipActivation({
  academyId,
  uid,
  membership,
  claim,
  invite,
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
  if (membership.source !== "CLAIM_APPROVAL") {
    throw new Error("Membership was not created from Claim approval.");
  }
  requireExactDocumentId(membership.approvalClaimId || "", "Membership approvalClaimId");
  if (claim.id !== membership.approvalClaimId) {
    throw new Error("Membership approvalClaimId does not match the approved Claim.");
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
  validateClaimAcademyBinding(claim, academyId, invite);
  return membership.role;
}
