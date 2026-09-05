import {
  collection, doc, getDocFromServer, getDocsFromServer, query, serverTimestamp,
  setDoc, where, writeBatch, type Firestore,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../firebase";
import { isProClubStaffRole, isValidDocumentIdentifier } from "../proClubModel";
import {
  isPermissionDenied, normalizeProClubInviteCode, OnboardingError, parseProClubClaim,
  parseProClubInvite, proClubClaimId, visibleInviteStatus,
  claimantIdentityFromCanonicalUser, isClaimantIdentity,
  defaultInviteExpiration, generateProClubInviteCode,
  type IssueProClubInviteOptions, type ProClubInvite, type ProClubJoinClaim,
  type ResolvedStaffCandidate,
} from "../proClubOnboarding";
import { getProClubMembership, type ProClubReadOps } from "./proClubReadAdapter";
import { resolveProClubOrganizationAuthority, type ProClubOrganizationAuthority } from "./proClubOrganizationAdapter";

export interface InvitationInspection {
  invite: ProClubInvite;
  claim: ProClubJoinClaim | null;
  membershipExists: boolean;
}
export interface PendingStaffRequest {
  claimId: string;
  claim: ProClubJoinClaim;
  invite: ProClubInvite | null;
}
export function isProClubReviewer(authority: ProClubOrganizationAuthority): boolean {
  return authority.organizationType === "PRO_CLUB" && authority.hasMembershipAuthority &&
    authority.organizationStatus === "ACTIVE" && authority.membershipStatus === "ACTIVE" &&
    (authority.membershipAuthorizationRole === "OWNER" || authority.membershipAuthorizationRole === "ADMIN");
}

export type ResolveCandidateCallableCaller = (data: {
  clubId: string;
  email: string;
}) => Promise<{ data: unknown }>;

export type ResolveCandidateFn = (
  clubId: string,
  email: string,
  caller?: ResolveCandidateCallableCaller,
) => Promise<ResolvedStaffCandidate>;

export const defaultCallableCaller: ResolveCandidateCallableCaller = async (data) => {
  const callable = httpsCallable<typeof data, unknown>(
    functions,
    "resolveProClubStaffCandidateV1",
  );
  return await callable(data);
};

export async function defaultResolveCandidateFn(
  clubId: string,
  email: string,
  caller: ResolveCandidateCallableCaller = defaultCallableCaller,
): Promise<ResolvedStaffCandidate> {
  let result: { data: unknown };
  try {
    result = await caller({ clubId, email });
  } catch (error: any) {
    const code = error?.code;
    if (code === "unauthenticated" || code === "functions/unauthenticated") {
      throw new OnboardingError("AUTH_CHANGED");
    }
    if (code === "permission-denied" || code === "functions/permission-denied") {
      throw new OnboardingError("REVIEWER_REQUIRED");
    }
    if (code === "not-found" || code === "functions/not-found") {
      throw new OnboardingError("CANDIDATE_NOT_FOUND");
    }
    if (code === "resource-exhausted" || code === "functions/resource-exhausted") {
      throw new OnboardingError("RATE_LIMITED");
    }
    if (code === "invalid-argument" || code === "functions/invalid-argument") {
      throw new OnboardingError("INVALID_DATA");
    }
    if (code === "failed-precondition" || code === "functions/failed-precondition") {
      throw new OnboardingError("UNAVAILABLE");
    }
    throw new OnboardingError("NETWORK");
  }

  const candidate = result?.data as any;
  if (
    !candidate ||
    typeof candidate.targetUid !== "string" ||
    typeof candidate.email !== "string"
  ) {
    throw new OnboardingError("INVALID_DATA");
  }

  return {
    targetUid: candidate.targetUid,
    email: candidate.email,
    displayName: typeof candidate.displayName === "string" ? candidate.displayName : null,
  };
}

// The production instance uses Firebase Auth, never a presented/support user.
// Dependencies allow the same client SDK implementation to run against the emulator.
export function createProClubOnboardingRepository(
  firestore: Firestore,
  getActorUid: () => string | null,
  resolveCandidateFn: ResolveCandidateFn = defaultResolveCandidateFn,
) {
  const inFlightClaims = new Map<string, Promise<ProClubJoinClaim>>();
  function assertActor(expectedUid: string): void {
    if (!isValidDocumentIdentifier(expectedUid) || getActorUid() !== expectedUid) {
      throw new OnboardingError("AUTH_CHANGED");
    }
  }
  const readOps: ProClubReadOps = {
    async readDocument(path) {
      const snapshot = await getDocFromServer(doc(firestore, path[0], ...path.slice(1)));
      return { id: snapshot.id, exists: snapshot.exists(), data: snapshot.data() };
    },
  };
  async function readInvite(rawCode: string, uid: string): Promise<ProClubInvite> {
    assertActor(uid);
    const code = normalizeProClubInviteCode(rawCode);
    let snapshot;
    try { snapshot = await getDocFromServer(doc(firestore, "proClubInvites", code)); }
    catch (error) {
      if (isPermissionDenied(error)) throw new OnboardingError("UNAVAILABLE");
      throw error;
    }
    assertActor(uid);
    if (!snapshot.exists()) throw new OnboardingError("UNAVAILABLE");
    return parseProClubInvite(snapshot.data(), code);
  }
  async function readOwnClaim(invite: ProClubInvite, uid: string): Promise<ProClubJoinClaim | null> {
    assertActor(uid);
    if (invite.targetUid !== uid) return null;
    const claimId = proClubClaimId(uid, invite.inviteCode);
    try {
      const snapshot = await getDocFromServer(doc(firestore, "proClubs", invite.clubId, "onboardingClaims", claimId));
      assertActor(uid);
      return snapshot.exists() ? parseProClubClaim(snapshot.data(), invite.clubId, claimId) : null;
    } catch (error) {
      assertActor(uid);
      // Missing own claims are denied because get rules inspect resource.userId.
      // This is not evidence of absence/authority: create-only Rules decide the write.
      if (isPermissionDenied(error)) return null;
      throw error;
    }
  }
  async function membershipExists(clubId: string, uid: string): Promise<boolean> {
    const result = await getProClubMembership(clubId, uid, readOps);
    assertActor(uid);
    if (result.state === "FOUND") return true;
    if (result.state === "MISSING") return false;
    throw new OnboardingError(result.state === "INVALID_DATA" ? "INVALID_DATA" : "NETWORK");
  }
  async function inspectInvitation(code: string, uid: string): Promise<InvitationInspection> {
    const invite = await readInvite(code, uid);
    const [claim, exists] = await Promise.all([readOwnClaim(invite, uid), membershipExists(invite.clubId, uid)]);
    assertActor(uid);
    return { invite, claim, membershipExists: exists };
  }
  async function createRequest(code: string, uid: string): Promise<ProClubJoinClaim> {
    // Accept only a code: no caller-supplied club, role, status or reviewer identity.
    const { invite, claim, membershipExists: exists } = await inspectInvitation(code, uid);
    if (invite.targetUid !== uid) throw new OnboardingError("WRONG_RECIPIENT");
    if (claim) return claim;
    if (exists) throw new OnboardingError("MEMBERSHIP_EXISTS");
    const status = visibleInviteStatus(invite);
    if (status !== "ACTIVE") throw new OnboardingError(status);
    const claimId = proClubClaimId(uid, invite.inviteCode);
    assertActor(uid);
    // Read only the authenticated actor's canonical account. UI callers never supply identity fields.
    const userSnapshot = await getDocFromServer(doc(firestore, "users", uid));
    assertActor(uid);
    if (!userSnapshot.exists()) throw new OnboardingError("IDENTITY_UNAVAILABLE");
    const claimantIdentity = claimantIdentityFromCanonicalUser(userSnapshot.data());
    try {
      await setDoc(doc(firestore, "proClubs", invite.clubId, "onboardingClaims", claimId), {
        schemaVersion: 1, type: "PRO_CLUB_STAFF_JOIN", userId: uid, clubId: invite.clubId,
        claimantIdentity,
        inviteCode: invite.inviteCode, membershipAuthorizationRole: "MEMBER", staffRole: invite.staffRole,
        status: "PENDING", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    } catch (error) {
      // A simultaneous tab may have created this deterministic claim already.
      if (isPermissionDenied(error)) {
        const existing = await readOwnClaim(invite, uid);
        if (existing) return existing;
        throw new OnboardingError("UNAVAILABLE");
      }
      throw error;
    }
    const created = await readOwnClaim(invite, uid);
    if (!created) throw new OnboardingError("NETWORK");
    return created;
  }
  async function requestMembership(code: string, uid: string): Promise<ProClubJoinClaim> {
    assertActor(uid);
    const key = proClubClaimId(uid, normalizeProClubInviteCode(code));
    const existing = inFlightClaims.get(key);
    if (existing) return existing;
    const operation = createRequest(code, uid).finally(() => inFlightClaims.delete(key));
    inFlightClaims.set(key, operation);
    return operation;
  }
  async function loadWorkspace(clubId: string, uid: string): Promise<ProClubOrganizationAuthority> {
    assertActor(uid);
    const result = await resolveProClubOrganizationAuthority(clubId, uid, readOps);
    assertActor(uid);
    if (result.state !== "FOUND" || !result.value.hasMembershipAuthority ||
        result.value.userId !== uid || result.value.organizationId !== clubId) {
      throw new OnboardingError(result.state === "ERROR" ? "NETWORK" : "UNAVAILABLE");
    }
    return result.value;
  }
  async function requireReviewer(clubId: string, uid: string) {
    const authority = await loadWorkspace(clubId, uid);
    if (!isProClubReviewer(authority)) throw new OnboardingError("REVIEWER_REQUIRED");
  }
  async function loadPending(clubId: string, uid: string): Promise<PendingStaffRequest[]> {
    await requireReviewer(clubId, uid);
    const result = await getDocsFromServer(query(
      collection(firestore, "proClubs", clubId, "onboardingClaims"),
      where("clubId", "==", clubId), where("status", "==", "PENDING"),
    ));
    assertActor(uid);
    return Promise.all(result.docs.map(async (snapshot) => {
      const claim = parseProClubClaim(snapshot.data(), clubId, snapshot.id);
      if (claim.status !== "PENDING") throw new OnboardingError("INVALID_DATA");
      let invite: ProClubInvite | null = null;
      try { invite = await readInvite(claim.inviteCode, uid); }
      catch (error) {
        // Keep the request visible but disable actions when its invitation cannot be verified.
        if (!(error instanceof OnboardingError) || error.code === "AUTH_CHANGED") throw error;
      }
      if (invite && (invite.clubId !== clubId || invite.targetUid !== claim.userId || invite.staffRole !== claim.staffRole)) {
        throw new OnboardingError("INVALID_DATA");
      }
      return { claimId: snapshot.id, claim, invite };
    }));
  }
  async function reviewClaim(clubId: string, claimId: string, decision: "APPROVED" | "REJECTED", uid: string): Promise<void> {
    if (!isValidDocumentIdentifier(claimId) || !["APPROVED", "REJECTED"].includes(decision)) {
      throw new OnboardingError("INVALID_DATA");
    }
    // Re-read canonical authority on every action; UI state never authorizes a write.
    await requireReviewer(clubId, uid);
    const claimRef = doc(firestore, "proClubs", clubId, "onboardingClaims", claimId);
    const snapshot = await getDocFromServer(claimRef);
    assertActor(uid);
    if (!snapshot.exists()) throw new OnboardingError("STALE_REQUEST");
    const claim = parseProClubClaim(snapshot.data(), clubId, claimId);
    if (claim.status !== "PENDING") throw new OnboardingError("STALE_REQUEST");
    if (!isClaimantIdentity(claim.claimantIdentity)) throw new OnboardingError("IDENTITY_UNAVAILABLE");
    const invite = await readInvite(claim.inviteCode, uid);
    if (invite.clubId !== clubId || invite.targetUid !== claim.userId || invite.staffRole !== claim.staffRole) {
      throw new OnboardingError("INVALID_DATA");
    }
    if (invite.status !== "ACTIVE") throw new OnboardingError(invite.status);
    if (decision === "APPROVED" && visibleInviteStatus(invite) === "EXPIRED") throw new OnboardingError("EXPIRED");
    assertActor(uid);
    const at = serverTimestamp();
    const batch = writeBatch(firestore);
    const inviteRef = doc(firestore, "proClubInvites", invite.inviteCode);
    if (decision === "APPROVED") {
      batch.update(claimRef, { status: "APPROVED", approvedAt: at, approvedBy: uid, updatedAt: at });
      batch.set(doc(firestore, "proClubs", clubId, "onboardingApprovals", claim.userId), {
        schemaVersion: 1, userId: claim.userId, clubId, claimId, inviteCode: invite.inviteCode,
        membershipAuthorizationRole: "MEMBER", staffRole: invite.staffRole,
        status: "APPROVED", approvedAt: at, approvedBy: uid,
      });
      batch.set(doc(firestore, "proClubs", clubId, "members", claim.userId), {
        authorizationRole: "MEMBER", status: "ACTIVE",
      });
      batch.set(doc(firestore, "proClubs", clubId, "staff", claim.userId), {
        staffRole: invite.staffRole, status: "ACTIVE",
      });
      batch.update(inviteRef, {
        status: "CONSUMED", consumedAt: at, consumedBy: uid, claimId, updatedAt: at, updatedBy: uid,
      });
    } else {
      batch.update(claimRef, { status: "REJECTED", rejectedAt: at, rejectedBy: uid, updatedAt: at });
      batch.update(inviteRef, { status: "REVOKED", revokedAt: at, revokedBy: uid, updatedAt: at, updatedBy: uid });
    }
    // One commit. Rules enforce the fresh claim/proof/member/staff/invite relationship.
    try { await batch.commit(); }
    catch (error) {
      if (isPermissionDenied(error)) throw new OnboardingError("STALE_REQUEST");
      throw error;
    }
    assertActor(uid);
  }
  async function issueInvitation(options: IssueProClubInviteOptions, uid: string): Promise<ProClubInvite> {
    assertActor(uid);
    if (
      !isValidDocumentIdentifier(options.clubId) ||
      !isValidDocumentIdentifier(options.targetUid) ||
      !isProClubStaffRole(options.staffRole)
    ) {
      throw new OnboardingError("INVALID_DATA");
    }
    if (options.targetUid === uid) {
      throw new OnboardingError("INVALID_DATA");
    }
    // Re-read canonical reviewer authority on every action; UI state never authorizes a write.
    try {
      await requireReviewer(options.clubId, uid);
    } catch (error) {
      if (error instanceof OnboardingError && error.code === "UNAVAILABLE") {
        throw new OnboardingError("REVIEWER_REQUIRED");
      }
      throw error;
    }
    assertActor(uid);

    const inviteCode = generateProClubInviteCode();
    const expiresAt = options.expiresAt ?? defaultInviteExpiration();

    const nowMillis = Date.now();
    const expiresMillis = expiresAt.toMillis();
    if (expiresMillis <= nowMillis || expiresMillis > nowMillis + 7 * 24 * 60 * 60 * 1000) {
      throw new OnboardingError("INVALID_DATA");
    }

    const inviteRef = doc(firestore, "proClubInvites", inviteCode);
    const at = serverTimestamp();

    try {
      await setDoc(inviteRef, {
        schemaVersion: 1,
        inviteCode,
        clubId: options.clubId,
        targetUid: options.targetUid,
        membershipAuthorizationRole: "MEMBER",
        staffRole: options.staffRole,
        status: "ACTIVE",
        createdAt: at,
        createdBy: uid,
        updatedAt: at,
        updatedBy: uid,
        expiresAt,
      });
    } catch (error) {
      if (isPermissionDenied(error)) {
        throw new OnboardingError("TARGET_USER_NOT_FOUND");
      }
      throw error;
    }

    assertActor(uid);
    const snapshot = await getDocFromServer(inviteRef);
    assertActor(uid);
    if (!snapshot.exists()) {
      throw new OnboardingError("NETWORK");
    }

    return parseProClubInvite(snapshot.data(), inviteCode);
  }

  async function resolveCandidate(clubId: string, email: string, uid: string): Promise<ResolvedStaffCandidate> {
    assertActor(uid);
    if (!isValidDocumentIdentifier(clubId)) {
      throw new OnboardingError("INVALID_DATA");
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      throw new OnboardingError("INVALID_DATA");
    }
    // Re-read canonical reviewer authority
    try {
      await requireReviewer(clubId, uid);
    } catch (error) {
      if (error instanceof OnboardingError && error.code === "UNAVAILABLE") {
        throw new OnboardingError("REVIEWER_REQUIRED");
      }
      throw error;
    }
    assertActor(uid);
    const candidate = await resolveCandidateFn(clubId, cleanEmail);
    assertActor(uid);
    return candidate;
  }

  return { inspectInvitation, requestMembership, loadWorkspace, loadPending, reviewClaim, issueInvitation, resolveCandidate };
}
export const proClubOnboardingRepository = createProClubOnboardingRepository(db, () => auth.currentUser?.uid ?? null);
