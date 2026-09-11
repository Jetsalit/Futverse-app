import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { isProClubStaffRole, isValidDocumentIdentifier } from "../proClubModel";
import {
  defaultInviteExpiration,
  generateProClubInviteCode,
  isClaimantIdentity,
  isPermissionDenied,
  OnboardingError,
  parseProClubClaim,
  parseProClubInvite,
  visibleInviteStatus,
  type IssueProClubInviteOptions,
  type ProClubInvite,
  type ProClubJoinClaim,
} from "../proClubOnboarding";

export interface SuperAdminPendingStaffRequest {
  claimId: string;
  claim: ProClubJoinClaim;
  invite: ProClubInvite | null;
}

export interface SuperAdminIssuedStaffInvitation {
  schemaVersion: 1;
  inviteCode: string;
  clubId: string;
  targetUid: string;
  membershipAuthorizationRole: "MEMBER";
  staffRole: ProClubInvite["staffRole"];
  status: "ACTIVE";
  expiresAt: ProClubInvite["expiresAt"];
}

function activeAccountStatus(value: unknown): boolean {
  return value === "ACTIVE" || value === "Active";
}

export function createProClubSuperAdminOnboardingControlRepository(
  firestore: Firestore,
  getActorUid: () => string | null,
) {
  function assertActor(expectedUid: string): void {
    if (!isValidDocumentIdentifier(expectedUid) || getActorUid() !== expectedUid) {
      throw new OnboardingError("AUTH_CHANGED");
    }
  }

  async function requireActiveSuperAdmin(uid: string): Promise<void> {
    assertActor(uid);
    const snapshot = await getDocFromServer(doc(firestore, "users", uid));
    assertActor(uid);
    if (!snapshot.exists()) throw new OnboardingError("REVIEWER_REQUIRED");
    const data = snapshot.data();
    if (
      data?.role !== "SUPERADMIN" ||
      !activeAccountStatus(data?.status) ||
      (typeof data?.uid === "string" && data.uid !== uid)
    ) {
      throw new OnboardingError("REVIEWER_REQUIRED");
    }
  }

  async function readInvite(rawCode: string, uid: string): Promise<ProClubInvite> {
    assertActor(uid);
    let snapshot;
    try {
      snapshot = await getDocFromServer(doc(firestore, "proClubInvites", rawCode));
    } catch (error) {
      if (isPermissionDenied(error)) throw new OnboardingError("UNAVAILABLE");
      throw error;
    }
    assertActor(uid);
    if (!snapshot.exists()) throw new OnboardingError("UNAVAILABLE");
    return parseProClubInvite(snapshot.data(), rawCode);
  }

  async function requireEligibleTarget(targetUid: string, actorUid: string): Promise<void> {
    assertActor(actorUid);
    if (!isValidDocumentIdentifier(targetUid) || targetUid === actorUid) {
      throw new OnboardingError("INVALID_DATA");
    }
    const snapshot = await getDocFromServer(doc(firestore, "users", targetUid));
    assertActor(actorUid);
    if (!snapshot.exists()) throw new OnboardingError("TARGET_USER_NOT_FOUND");
    const data = snapshot.data();
    if (!activeAccountStatus(data?.status) || data?.role === "SUPERADMIN") {
      throw new OnboardingError("TARGET_USER_NOT_FOUND");
    }
  }

  async function issueInvitation(
    options: IssueProClubInviteOptions,
    uid: string,
  ): Promise<SuperAdminIssuedStaffInvitation> {
    if (
      !isValidDocumentIdentifier(options.clubId) ||
      !isValidDocumentIdentifier(options.targetUid) ||
      !isProClubStaffRole(options.staffRole)
    ) {
      throw new OnboardingError("INVALID_DATA");
    }

    await requireActiveSuperAdmin(uid);
    await requireEligibleTarget(options.targetUid, uid);
    assertActor(uid);

    const inviteCode = generateProClubInviteCode();
    const expiresAt = options.expiresAt ?? defaultInviteExpiration();
    const nowMillis = Date.now();
    const expiresMillis = expiresAt.toMillis();
    if (expiresMillis <= nowMillis || expiresMillis > nowMillis + 7 * 24 * 60 * 60 * 1000) {
      throw new OnboardingError("INVALID_DATA");
    }

    const at = serverTimestamp();
    const inviteRef = doc(firestore, "proClubInvites", inviteCode);
    const auditRef = doc(
      firestore,
      "proClubOnboardingControlAudits",
      `INVITE-${inviteCode}`,
    );
    const batch = writeBatch(firestore);
    batch.set(inviteRef, {
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
    batch.set(auditRef, {
      schemaVersion: 1,
      actionId: `INVITE-${inviteCode}`,
      actionType: "INVITE_ISSUED",
      actorUid: uid,
      clubId: options.clubId,
      targetUid: options.targetUid,
      inviteCode,
      claimId: null,
      staffRole: options.staffRole,
      createdAt: at,
    });

    try {
      await batch.commit();
    } catch (error) {
      if (isPermissionDenied(error)) throw new OnboardingError("INVALID_DATA");
      throw error;
    }

    // The successful batch acknowledgement is the issuance success boundary.
    // Do not make a follow-up network read determine whether the caller receives
    // the already-committed invite code; the canonical document remains readable
    // later through the normal read/review path.
    return {
      schemaVersion: 1,
      inviteCode,
      clubId: options.clubId,
      targetUid: options.targetUid,
      membershipAuthorizationRole: "MEMBER",
      staffRole: options.staffRole,
      status: "ACTIVE",
      expiresAt,
    };
  }

  async function loadPending(
    clubId: string,
    uid: string,
  ): Promise<SuperAdminPendingStaffRequest[]> {
    if (!isValidDocumentIdentifier(clubId)) throw new OnboardingError("INVALID_DATA");
    await requireActiveSuperAdmin(uid);
    const result = await getDocsFromServer(
      query(
        collection(firestore, "proClubs", clubId, "onboardingClaims"),
        where("clubId", "==", clubId),
        where("status", "==", "PENDING"),
      ),
    );
    assertActor(uid);

    return Promise.all(
      result.docs.map(async (snapshot) => {
        const claim = parseProClubClaim(snapshot.data(), clubId, snapshot.id);
        if (claim.status !== "PENDING") throw new OnboardingError("INVALID_DATA");
        let invite: ProClubInvite | null = null;
        try {
          invite = await readInvite(claim.inviteCode, uid);
        } catch (error) {
          if (!(error instanceof OnboardingError) || error.code === "AUTH_CHANGED") throw error;
        }
        if (
          invite &&
          (invite.clubId !== clubId ||
            invite.targetUid !== claim.userId ||
            invite.staffRole !== claim.staffRole)
        ) {
          throw new OnboardingError("INVALID_DATA");
        }
        return { claimId: snapshot.id, claim, invite };
      }),
    );
  }

  async function reviewClaim(
    clubId: string,
    claimId: string,
    decision: "APPROVED" | "REJECTED",
    uid: string,
  ): Promise<void> {
    if (
      !isValidDocumentIdentifier(clubId) ||
      !isValidDocumentIdentifier(claimId) ||
      !["APPROVED", "REJECTED"].includes(decision)
    ) {
      throw new OnboardingError("INVALID_DATA");
    }

    await requireActiveSuperAdmin(uid);
    const claimRef = doc(firestore, "proClubs", clubId, "onboardingClaims", claimId);
    const snapshot = await getDocFromServer(claimRef);
    assertActor(uid);
    if (!snapshot.exists()) throw new OnboardingError("STALE_REQUEST");
    const claim = parseProClubClaim(snapshot.data(), clubId, claimId);
    if (claim.status !== "PENDING") throw new OnboardingError("STALE_REQUEST");
    if (!isClaimantIdentity(claim.claimantIdentity)) {
      throw new OnboardingError("IDENTITY_UNAVAILABLE");
    }

    const invite = await readInvite(claim.inviteCode, uid);
    if (
      invite.clubId !== clubId ||
      invite.targetUid !== claim.userId ||
      invite.staffRole !== claim.staffRole
    ) {
      throw new OnboardingError("INVALID_DATA");
    }
    if (invite.status !== "ACTIVE") throw new OnboardingError(invite.status);
    if (decision === "APPROVED" && visibleInviteStatus(invite) === "EXPIRED") {
      throw new OnboardingError("EXPIRED");
    }

    assertActor(uid);
    const at = serverTimestamp();
    const batch = writeBatch(firestore);
    const inviteRef = doc(firestore, "proClubInvites", invite.inviteCode);
    const actionType = decision === "APPROVED" ? "CLAIM_APPROVED" : "CLAIM_REJECTED";
    const actionId = `${decision === "APPROVED" ? "APPROVE" : "REJECT"}-${claimId}`;

    if (decision === "APPROVED") {
      batch.update(claimRef, {
        status: "APPROVED",
        approvedAt: at,
        approvedBy: uid,
        updatedAt: at,
      });
      batch.set(doc(firestore, "proClubs", clubId, "onboardingApprovals", claim.userId), {
        schemaVersion: 1,
        userId: claim.userId,
        clubId,
        claimId,
        inviteCode: invite.inviteCode,
        membershipAuthorizationRole: "MEMBER",
        staffRole: invite.staffRole,
        status: "APPROVED",
        approvedAt: at,
        approvedBy: uid,
      });
      batch.set(doc(firestore, "proClubs", clubId, "members", claim.userId), {
        authorizationRole: "MEMBER",
        status: "ACTIVE",
      });
      batch.set(doc(firestore, "proClubs", clubId, "staff", claim.userId), {
        staffRole: invite.staffRole,
        status: "ACTIVE",
      });
      batch.update(inviteRef, {
        status: "CONSUMED",
        consumedAt: at,
        consumedBy: uid,
        claimId,
        updatedAt: at,
        updatedBy: uid,
      });
    } else {
      batch.update(claimRef, {
        status: "REJECTED",
        rejectedAt: at,
        rejectedBy: uid,
        updatedAt: at,
      });
      batch.update(inviteRef, {
        status: "REVOKED",
        revokedAt: at,
        revokedBy: uid,
        updatedAt: at,
        updatedBy: uid,
      });
    }

    batch.set(doc(firestore, "proClubOnboardingControlAudits", actionId), {
      schemaVersion: 1,
      actionId,
      actionType,
      actorUid: uid,
      clubId,
      targetUid: claim.userId,
      inviteCode: invite.inviteCode,
      claimId,
      staffRole: invite.staffRole,
      createdAt: at,
    });

    try {
      await batch.commit();
    } catch (error) {
      if (isPermissionDenied(error)) throw new OnboardingError("STALE_REQUEST");
      throw error;
    }
    assertActor(uid);
  }

  return { issueInvitation, loadPending, reviewClaim };
}

export const proClubSuperAdminOnboardingControlRepository =
  createProClubSuperAdminOnboardingControlRepository(
    db,
    () => auth.currentUser?.uid ?? null,
  );
