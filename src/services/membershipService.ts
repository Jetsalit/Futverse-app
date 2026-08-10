import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { auth, db } from "../lib/firebase";
import type {
  ActivateApprovedMembershipResult,
  AcademyInvite,
  AcademyJoinClaim,
  ApproveAcademyJoinClaimInput,
  ApproveAcademyJoinClaimResult,
  Membership,
  MembershipReadResult,
  MembershipValidationResult,
  TenantRole,
  TenantRoleResolution,
} from "../types/Membership";
import {
  normalizeAndValidateInviteCode,
  requireExactDocumentId,
  validateActiveAcademyInvite,
  validateApprovedMembershipActivation,
  validateClaimAcademyBinding,
} from "./membershipValidation";
import {
  assertExactUidCoachMutationTarget,
  resolveExactUidCoachProfile,
  type CoachIdentityResolution,
} from "./coachIdentity";

export {
  buildAcademyJoinClaimId,
  MAX_INVITE_CODE_LENGTH,
  normalizeAndValidateInviteCode,
  validateActiveAcademyInvite,
  validateApprovedMembershipActivation,
} from "./membershipValidation";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isPermissionDenied(error: unknown) {
  return error instanceof FirebaseError && error.code === "permission-denied";
}

function normalizeClaimRole(claim: Pick<AcademyJoinClaim, "type" | "requestedRole">): TenantRole {
  if (claim.type === "COACH_JOIN") return "COACH";
  if (claim.type !== "ACADEMY_JOIN") {
    throw new Error("Academy join claim has an unsupported type.");
  }
  if (claim.requestedRole === "ADMIN" || claim.requestedRole === "COACH") {
    return claim.requestedRole;
  }
  throw new Error("Academy join claim must request ADMIN or COACH.");
}

export async function getMembership(
  academyId: string,
  uid: string,
): Promise<MembershipReadResult> {
  try {
    requireExactDocumentId(academyId, "academyId");
    requireExactDocumentId(uid, "uid");
    const snapshot = await getDoc(doc(db, "academies", academyId, "members", uid));
    if (!snapshot.exists()) return { state: "MISSING" };
    const membership = snapshot.data() as Membership;
    if (membership.userId !== uid || membership.academyId !== academyId) {
      return {
        state: "ERROR",
        error: new Error("Membership identity does not match the requested Academy and UID."),
      };
    }
    return { state: "FOUND", membership };
  } catch (error) {
    const normalizedError = toError(error);
    return isPermissionDenied(error)
      ? { state: "PERMISSION_DENIED", error: normalizedError }
      : { state: "ERROR", error: normalizedError };
  }
}

export async function validateActiveMembership(
  academyId: string,
  uid: string,
): Promise<MembershipValidationResult> {
  const result = await getMembership(academyId, uid);
  if (result.state !== "FOUND") return result;

  const { membership } = result;
  switch (membership.status) {
    case "ACTIVE":
      return { state: "ACTIVE", membership };
    case "PENDING":
      return { state: "PENDING", membership };
    case "SUSPENDED":
      return { state: "SUSPENDED", membership };
    case "LEFT":
      return { state: "LEFT", membership };
    case "REVOKED":
      return { state: "REVOKED", membership };
    default:
      return { state: "ERROR", error: new Error("Unknown Membership status.") };
  }
}

export async function resolveTenantRole(
  academyId: string,
  uid: string,
): Promise<TenantRoleResolution> {
  const result = await validateActiveMembership(academyId, uid);
  if (result.state !== "ACTIVE") return result;
  if (result.membership.role !== "ADMIN" && result.membership.role !== "COACH") {
    return { state: "ERROR", error: new Error("Membership has an invalid tenant role.") };
  }
  return {
    state: "ACTIVE",
    role: result.membership.role,
    membership: result.membership,
  };
}

async function resolveCoachProfileIdentity(
  academyId: string,
  claim: AcademyJoinClaim,
): Promise<CoachIdentityResolution> {
  requireExactDocumentId(claim.userId, "claim.userId");
  const coaches = collection(db, "academies", academyId, "coaches");
  const byUserId = await getDocs(query(
    coaches,
    where("userId", "==", claim.userId),
    limit(2),
  ));
  return resolveExactUidCoachProfile(
    claim.userId,
    byUserId.docs.map((coachSnapshot) => ({
      id: coachSnapshot.id,
      userId: coachSnapshot.data().userId,
    })),
  );
}

export async function approveAcademyJoinClaim({
  academyId,
  claim,
  approvedBy,
}: ApproveAcademyJoinClaimInput): Promise<ApproveAcademyJoinClaimResult> {
  requireExactDocumentId(academyId, "academyId");
  requireExactDocumentId(claim.id, "claim.id");
  requireExactDocumentId(claim.userId, "claim.userId");
  requireExactDocumentId(approvedBy, "approvedBy");

  const claimSnapshot = await getDoc(doc(db, "profile_claims", claim.id));
  if (!claimSnapshot.exists()) {
    throw new Error("The Academy join claim does not exist.");
  }
  const persistedClaim = {
    id: claimSnapshot.id,
    ...claimSnapshot.data(),
  } as AcademyJoinClaim;
  requireExactDocumentId(persistedClaim.userId, "persisted claim.userId");
  const requestedRole = normalizeClaimRole(persistedClaim);
  const persistedInviteCode = normalizeAndValidateInviteCode(persistedClaim.inviteCode);
  const inviteSnapshot = await getDoc(doc(db, "academy_invites", persistedInviteCode));
  if (!inviteSnapshot.exists()) {
    throw new Error("The canonical Academy invite does not exist.");
  }
  const persistedInvite = inviteSnapshot.data() as AcademyInvite;
  validateActiveAcademyInvite(persistedInvite, persistedInviteCode);
  validateClaimAcademyBinding(persistedClaim, academyId, persistedInvite);
  if (persistedClaim.userId !== claim.userId) {
    throw new Error("Claim identity changed before approval.");
  }
  const coachIdentity = requestedRole === "COACH"
    ? await resolveCoachProfileIdentity(academyId, persistedClaim)
    : null;
  const coachProfileId = coachIdentity?.profileId || null;

  return runTransaction(db, async (transaction) => {
    const academyRef = doc(db, "academies", academyId);
    const membershipRef = doc(db, "academies", academyId, "members", claim.userId);
    const claimRef = doc(db, "profile_claims", claim.id);
    const inviteRef = doc(db, "academy_invites", persistedInviteCode);
    const coachRef = coachProfileId
      ? doc(db, "academies", academyId, "coaches", coachProfileId)
      : null;

    const academySnapshot = await transaction.get(academyRef);
    const membershipSnapshot = await transaction.get(membershipRef);
    const claimSnapshot = await transaction.get(claimRef);
    const inviteSnapshot = await transaction.get(inviteRef);
    const coachSnapshot = coachRef ? await transaction.get(coachRef) : null;

    if (!academySnapshot.exists()) {
      throw new Error("The exact Academy document does not exist.");
    }
    if (!claimSnapshot.exists()) {
      throw new Error("The Academy join claim does not exist.");
    }
    if (!inviteSnapshot.exists()) {
      throw new Error("The canonical Academy invite does not exist.");
    }

    const storedClaim = { id: claimSnapshot.id, ...claimSnapshot.data() } as AcademyJoinClaim;
    requireExactDocumentId(storedClaim.userId, "stored claim.userId");
    const storedRole = normalizeClaimRole(storedClaim);
    const storedInviteCode = normalizeAndValidateInviteCode(storedClaim.inviteCode);
    const storedInvite = inviteSnapshot.data() as AcademyInvite;
    if (
      storedClaim.userId !== claim.userId ||
      storedRole !== requestedRole ||
      storedClaim.userEmail !== persistedClaim.userEmail ||
      storedInviteCode !== persistedInviteCode
    ) {
      throw new Error("Claim identity or requested role changed before approval.");
    }
    validateActiveAcademyInvite(storedInvite, storedInviteCode);
    validateClaimAcademyBinding(storedClaim, academyId, storedInvite);
    if (storedClaim.status === "REJECTED") {
      throw new Error("A rejected claim cannot be approved.");
    }
    if (
      storedClaim.status === "APPROVED" &&
      (storedClaim.approvedAcademyId !== academyId || storedClaim.approvedRole !== requestedRole)
    ) {
      throw new Error("Claim was already approved for a different Academy or role.");
    }
    if (storedClaim.status !== "PENDING" && storedClaim.status !== "APPROVED") {
      throw new Error("Claim is not eligible for approval.");
    }

    const existingMembership = membershipSnapshot.exists()
      ? membershipSnapshot.data() as Membership
      : null;
    if (
      existingMembership?.approvalClaimId
      && existingMembership.approvalClaimId !== claim.id
    ) {
      throw new Error("Membership is already bound to a different approval Claim.");
    }
    if (requestedRole === "COACH" && coachRef) {
      assertExactUidCoachMutationTarget(
        claim.userId,
        coachSnapshot?.exists()
          ? coachSnapshot.data() as Record<string, unknown>
          : null,
      );
    }
    const timestamp = serverTimestamp();
    const membershipWrite = {
      userId: claim.userId,
      academyId,
      role: requestedRole,
      status: "ACTIVE" as const,
      source: "CLAIM_APPROVAL" as const,
      approvalClaimId: claim.id,
      joinedAt: existingMembership?.joinedAt || timestamp,
      joinedBy: existingMembership?.joinedBy || approvedBy,
      updatedAt: timestamp,
    };

    transaction.set(membershipRef, membershipWrite);
    transaction.set(claimRef, {
      status: "APPROVED",
      approvedAt: storedClaim.status === "APPROVED"
        ? claimSnapshot.data().approvedAt || timestamp
        : timestamp,
      approvedBy: storedClaim.status === "APPROVED"
        ? claimSnapshot.data().approvedBy || approvedBy
        : approvedBy,
      approvedAcademyId: academyId,
      approvedRole: requestedRole,
      updatedAt: timestamp,
    }, { merge: true });

    if (requestedRole === "COACH" && coachRef) {
      const nameParts = (storedClaim.userName || "Coach").trim().split(/\s+/);
      transaction.set(
        coachRef,
        coachSnapshot?.exists()
          ? { userId: claim.userId }
          : {
              userId: claim.userId,
              firstName: nameParts[0] || "Coach",
              lastName: nameParts.slice(1).join(" "),
              email: storedClaim.userEmail || "",
              phone: "",
              license: "C",
              teams: [],
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(storedClaim.userEmail || claim.userId)}`,
            },
        { merge: true },
      );
    }

    return {
      membership: membershipWrite as Membership,
      role: requestedRole,
      coachProfileId,
      membershipApproved: true,
      userActivationRequired: true,
    };
  });
}

export async function activateApprovedMembership(
  academyId: string,
  uid: string,
): Promise<ActivateApprovedMembershipResult> {
  requireExactDocumentId(academyId, "academyId");
  requireExactDocumentId(uid, "uid");

  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("Membership activation is allowed only for the authenticated user.");
  }

  return runTransaction(db, async (transaction) => {
    const academyRef = doc(db, "academies", academyId);
    const membershipRef = doc(db, "academies", academyId, "members", uid);
    const userRef = doc(db, "users", uid);

    const academySnapshot = await transaction.get(academyRef);
    const membershipSnapshot = await transaction.get(membershipRef);
    const userSnapshot = await transaction.get(userRef);

    if (!academySnapshot.exists()) throw new Error("The exact Academy document does not exist.");
    if (!membershipSnapshot.exists()) throw new Error("Approved Membership was not found.");
    if (!userSnapshot.exists()) throw new Error("Authenticated User document was not found.");

    const membership = membershipSnapshot.data() as Membership;
    requireExactDocumentId(
      membership.approvalClaimId || "",
      "Membership approvalClaimId",
    );
    const claimRef = doc(db, "profile_claims", membership.approvalClaimId!);
    const claimSnapshot = await transaction.get(claimRef);
    if (!claimSnapshot.exists()) throw new Error("Approved Academy join claim was not found.");
    const approvedClaim = {
      id: claimSnapshot.id,
      ...claimSnapshot.data(),
    } as AcademyJoinClaim;
    const normalizedInviteCode = normalizeAndValidateInviteCode(approvedClaim.inviteCode);
    const inviteSnapshot = await transaction.get(
      doc(db, "academy_invites", normalizedInviteCode),
    );
    if (!inviteSnapshot.exists()) throw new Error("The canonical Academy invite was not found.");
    const invite = inviteSnapshot.data() as AcademyInvite;
    const role = validateApprovedMembershipActivation({
      academyId,
      uid,
      membership,
      claim: approvedClaim,
      invite,
    });

    transaction.set(userRef, {
      activeAcademyId: academyId,
      academyId,
      tenantRole: role,
      role,
      status: "Active",
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return { activated: true, academyId, role };
  });
}
