import {
  collection, doc, getDocFromServer, getDocsFromServer, query, serverTimestamp,
  setDoc, where, writeBatch, type Firestore,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { isValidDocumentIdentifier } from "../proClubModel";
import {
  isPermissionDenied, normalizeProClubInviteCode, OnboardingError, parseProClubClaim,
  parseProClubInvite, proClubClaimId, visibleInviteStatus,
  claimantIdentityFromCanonicalUser, isClaimantIdentity,
  type ProClubInvite, type ProClubJoinClaim,
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

// The production instance uses Firebase Auth, never a presented/support user.
// Dependencies allow the same client SDK implementation to run against the emulator.
export function createProClubOnboardingRepository(firestore: Firestore, getActorUid: () => string | null) {
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
  return { inspectInvitation, requestMembership, loadWorkspace, loadPending, reviewClaim };
}
export const proClubOnboardingRepository = createProClubOnboardingRepository(db, () => auth.currentUser?.uid ?? null);
