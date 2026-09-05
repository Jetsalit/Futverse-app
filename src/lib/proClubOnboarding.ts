import { Timestamp } from "firebase/firestore";
import { isProClubStaffRole, isValidDocumentIdentifier } from "./proClubModel";
import type { ProClubStaffRole } from "../types/ProClub";
export type { ProClubStaffRole };

export type InviteStatus = "ACTIVE" | "REVOKED" | "CONSUMED";
export type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface ClaimantIdentity {
  displayName?: string;
  email?: string;
}
function identityText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function isClaimantIdentity(value: unknown): value is ClaimantIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = Object.entries(value);
  return fields.length > 0 && fields.every(([key, text]) =>
    (key === "displayName" || key === "email") && identityText(text));
}
export function claimantIdentityFromCanonicalUser(user: Record<string, unknown>): ClaimantIdentity {
  const identity = {
    ...(identityText(user.name) ? { displayName: user.name } : {}),
    ...(identityText(user.email) ? { email: user.email } : {}),
  };
  if (!isClaimantIdentity(identity)) throw new OnboardingError("IDENTITY_UNAVAILABLE");
  return identity;
}
export interface ProClubInvite {
  schemaVersion: 1;
  inviteCode: string;
  clubId: string;
  targetUid: string;
  membershipAuthorizationRole: "MEMBER";
  staffRole: ProClubStaffRole;
  status: InviteStatus;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  expiresAt: Timestamp;
  revokedAt?: Timestamp;
  revokedBy?: string;
  consumedAt?: Timestamp;
  consumedBy?: string;
  claimId?: string;
}
export interface ProClubJoinClaim {
  schemaVersion: 1;
  type: "PRO_CLUB_STAFF_JOIN";
  userId: string;
  // Absent on legacy claims; those remain readable but cannot be decided.
  claimantIdentity?: ClaimantIdentity;
  clubId: string;
  inviteCode: string;
  membershipAuthorizationRole: "MEMBER";
  staffRole: ProClubStaffRole;
  status: ClaimStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  rejectedAt?: Timestamp;
  rejectedBy?: string;
}

export interface IssueProClubInviteOptions {
  clubId: string;
  targetUid: string;
  staffRole: ProClubStaffRole;
  expiresAt?: Timestamp;
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_EXPIRATION_SAFETY_OFFSET_MS = 60_000; // 1-minute buffer to guarantee expiresAt <= request.time + 7d

export function defaultInviteExpiration(now = Date.now()): Timestamp {
  return Timestamp.fromMillis(now + SEVEN_DAYS_MS - INVITE_EXPIRATION_SAFETY_OFFSET_MS);
}

const INVITE_CODE_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generateProClubInviteCode(): string {
  const bytes = new Uint8Array(32);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    throw new Error("Secure crypto RNG is required to generate Pro Club invite codes");
  }
  let payload = "";
  for (let i = 0; i < bytes.length; i++) {
    payload += INVITE_CODE_CHARS[bytes[i] % INVITE_CODE_CHARS.length];
  }
  return `FUT-PC-${payload}`;
}

export interface ResolvedStaffCandidate {
  targetUid: string;
  email: string;
  displayName: string | null;
}

export type OnboardingErrorCode = "INVALID_INVITE" | "UNAVAILABLE" | "AUTH_CHANGED" |
  "WRONG_RECIPIENT" | "EXPIRED" | "REVOKED" | "CONSUMED" | "MEMBERSHIP_EXISTS" |
  "REVIEWER_REQUIRED" | "STALE_REQUEST" | "INVALID_DATA" | "IDENTITY_UNAVAILABLE" |
  "TARGET_USER_NOT_FOUND" | "CANDIDATE_NOT_FOUND" | "RATE_LIMITED" | "NETWORK";
export class OnboardingError extends Error {
  constructor(readonly code: OnboardingErrorCode) { super(code); }
}
export function onboardingErrorMessage(error: unknown): string {
  const messages: Record<OnboardingErrorCode, string> = {
    INVALID_INVITE: "Check your invitation code and try again.",
    UNAVAILABLE: "This invitation or request is unavailable. Check the code or contact your club.",
    AUTH_CHANGED: "Your sign-in has changed. Please sign in again before continuing.",
    WRONG_RECIPIENT: "This invitation belongs to another account. Sign in with the invited account.",
    EXPIRED: "This invitation has expired. Ask your club for a new invitation.",
    REVOKED: "This invitation was revoked. Contact your club for a new invitation.",
    CONSUMED: "This invitation has already been used. Check your request or open your club workspace.",
    MEMBERSHIP_EXISTS: "This user already has a club membership.",
    REVIEWER_REQUIRED: "Only an active club owner or administrator can issue or review staff invitations.",
    STALE_REQUEST: "This request has changed. Refresh the requests before trying again.",
    INVALID_DATA: "This invitation or request could not be verified. Please contact your club.",
    IDENTITY_UNAVAILABLE: "Identity unavailable. We could not verify the claimant’s account identity. Contact your club before continuing.",
    TARGET_USER_NOT_FOUND: "No user account was found for this reference. Make sure the staff member has registered with FutVerse.",
    CANDIDATE_NOT_FOUND: "Unable to find an eligible FutVerse account for this email address. Make sure the staff member has registered with this exact email.",
    RATE_LIMITED: "Too many account verification attempts. Please try again later.",
    NETWORK: "We could not confirm the result. Check your connection and refresh before trying again.",
  };
  return error instanceof OnboardingError ? messages[error.code] : messages.NETWORK;
}
export function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return code === "permission-denied" || code === "firestore/permission-denied";
}
export function normalizeProClubInviteCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^FUT-PC-[A-Z0-9]{24,48}$/.test(code)) throw new OnboardingError("INVALID_INVITE");
  return code;
}
export function proClubClaimId(uid: string, code: string): string {
  if (!isValidDocumentIdentifier(uid) || normalizeProClubInviteCode(code) !== code) {
    throw new OnboardingError("INVALID_DATA");
  }
  return `${uid}_PRO_CLUB_${code}`;
}
function timestamp(value: unknown): value is Timestamp {
  return !!value && typeof (value as Timestamp).toMillis === "function" &&
    Number.isFinite((value as Timestamp).toMillis());
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
export function parseProClubInvite(value: unknown, code: string): ProClubInvite {
  const data = value as Record<string, unknown> | undefined;
  const base = ["schemaVersion", "inviteCode", "clubId", "targetUid", "membershipAuthorizationRole",
    "staffRole", "status", "createdAt", "createdBy", "updatedAt", "updatedBy", "expiresAt"];
  const lifecycle = data?.status === "REVOKED" ? ["revokedAt", "revokedBy"] :
    data?.status === "CONSUMED" ? ["consumedAt", "consumedBy", "claimId"] : [];
  if (!data || !exactKeys(data, [...base, ...lifecycle]) || data.schemaVersion !== 1 ||
      data.inviteCode !== code || normalizeProClubInviteCode(code) !== code ||
      !["ACTIVE", "REVOKED", "CONSUMED"].includes(data.status as string) ||
      !isValidDocumentIdentifier(data.clubId) || !isValidDocumentIdentifier(data.targetUid) ||
      data.membershipAuthorizationRole !== "MEMBER" || !isProClubStaffRole(data.staffRole) ||
      !["createdAt", "updatedAt", "expiresAt", ...lifecycle.filter((key) => key.endsWith("At"))].every((key) => timestamp(data[key])) ||
      !["createdBy", "updatedBy", ...lifecycle.filter((key) => key.endsWith("By"))].every((key) => isValidDocumentIdentifier(data[key])) ||
      (data.status === "CONSUMED" && data.claimId !== proClubClaimId(data.targetUid as string, code))) {
    throw new OnboardingError("INVALID_DATA");
  }
  return data as unknown as ProClubInvite;
}
export function parseProClubClaim(value: unknown, clubId: string, claimId: string): ProClubJoinClaim {
  const data = value as Record<string, unknown> | undefined;
  const base = ["schemaVersion", "type", "userId", "clubId", "inviteCode", "membershipAuthorizationRole",
    "staffRole", "status", "createdAt", "updatedAt"];
  const lifecycle = data?.status === "APPROVED" ? ["approvedAt", "approvedBy"] :
    data?.status === "REJECTED" ? ["rejectedAt", "rejectedBy"] : [];
  const identityFields = data && Object.hasOwn(data, "claimantIdentity") ? ["claimantIdentity"] : [];
  if (!data || !exactKeys(data, [...base, ...lifecycle, ...identityFields]) || data.schemaVersion !== 1 ||
      data.type !== "PRO_CLUB_STAFF_JOIN" || data.clubId !== clubId || !isValidDocumentIdentifier(clubId) ||
      !isValidDocumentIdentifier(data.userId) || typeof data.inviteCode !== "string" ||
      proClubClaimId(data.userId as string, data.inviteCode) !== claimId ||
      data.membershipAuthorizationRole !== "MEMBER" || !isProClubStaffRole(data.staffRole) ||
      !["PENDING", "APPROVED", "REJECTED"].includes(data.status as string) ||
      !["createdAt", "updatedAt", ...lifecycle.filter((key) => key.endsWith("At"))].every((key) => timestamp(data[key])) ||
      !lifecycle.filter((key) => key.endsWith("By")).every((key) => isValidDocumentIdentifier(data[key]))) {
    throw new OnboardingError("INVALID_DATA");
  }
  // Keep legacy/malformed identities visible as unavailable, never manufacture a fallback.
  return { ...data, claimantIdentity: isClaimantIdentity(data.claimantIdentity) ? data.claimantIdentity : undefined } as unknown as ProClubJoinClaim;
}
export function visibleInviteStatus(invite: ProClubInvite, now = Date.now()): InviteStatus | "EXPIRED" {
  return invite.status === "ACTIVE" && invite.expiresAt.toMillis() <= now ? "EXPIRED" : invite.status;
}
export const staffRoleLabels: Record<ProClubStaffRole, string> = {
  HEAD_COACH: "Head coach", ASSISTANT_COACH: "Assistant coach", FITNESS_COACH: "Fitness coach",
  ANALYST: "Analyst", PHYSIO: "Physio", TEAM_MANAGER: "Team manager", STAFF: "Staff",
};
