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
import { db } from "../lib/firebase";
import type {
  AcademyJoinClaim,
  ApproveAcademyJoinClaimInput,
  ApproveAcademyJoinClaimResult,
  Membership,
  MembershipReadResult,
  MembershipValidationResult,
  TenantRole,
  TenantRoleResolution,
} from "../types/Membership";

function requireDocumentId(value: string, field: string) {
  if (!value || value.trim() !== value || value.includes("/")) {
    throw new Error(`${field} must be an exact Firestore document ID.`);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isPermissionDenied(error: unknown) {
  return error instanceof FirebaseError && error.code === "permission-denied";
}

function normalizeClaimRole(claim: Pick<AcademyJoinClaim, "type" | "requestedRole">): TenantRole {
  if (claim.type === "COACH_JOIN") return "COACH";
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
    requireDocumentId(academyId, "academyId");
    requireDocumentId(uid, "uid");
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

async function findCoachProfileId(
  academyId: string,
  claim: AcademyJoinClaim,
): Promise<string> {
  const coaches = collection(db, "academies", academyId, "coaches");
  const byUserId = await getDocs(query(coaches, where("userId", "==", claim.userId), limit(1)));
  if (!byUserId.empty) return byUserId.docs[0].id;

  if (claim.userEmail) {
    const byEmail = await getDocs(query(coaches, where("email", "==", claim.userEmail), limit(1)));
    if (!byEmail.empty) return byEmail.docs[0].id;
  }

  return claim.userId;
}

export async function approveAcademyJoinClaim({
  academyId,
  claim,
  approvedBy,
}: ApproveAcademyJoinClaimInput): Promise<ApproveAcademyJoinClaimResult> {
  requireDocumentId(academyId, "academyId");
  requireDocumentId(claim.id, "claim.id");
  requireDocumentId(claim.userId, "claim.userId");
  requireDocumentId(approvedBy, "approvedBy");

  const claimSnapshot = await getDoc(doc(db, "profile_claims", claim.id));
  if (!claimSnapshot.exists()) {
    throw new Error("The Academy join claim does not exist.");
  }
  const persistedClaim = {
    id: claimSnapshot.id,
    ...claimSnapshot.data(),
  } as AcademyJoinClaim;
  const requestedRole = normalizeClaimRole(persistedClaim);
  if (persistedClaim.userId !== claim.userId) {
    throw new Error("Claim identity changed before approval.");
  }
  const coachProfileId = requestedRole === "COACH"
    ? await findCoachProfileId(academyId, persistedClaim)
    : null;

  return runTransaction(db, async (transaction) => {
    const academyRef = doc(db, "academies", academyId);
    const membershipRef = doc(db, "academies", academyId, "members", claim.userId);
    const userRef = doc(db, "users", claim.userId);
    const claimRef = doc(db, "profile_claims", claim.id);
    const coachRef = coachProfileId
      ? doc(db, "academies", academyId, "coaches", coachProfileId)
      : null;

    const academySnapshot = await transaction.get(academyRef);
    const membershipSnapshot = await transaction.get(membershipRef);
    const userSnapshot = await transaction.get(userRef);
    const claimSnapshot = await transaction.get(claimRef);
    const coachSnapshot = coachRef ? await transaction.get(coachRef) : null;

    if (!academySnapshot.exists()) {
      throw new Error("The exact Academy document does not exist.");
    }
    if (!userSnapshot.exists()) {
      throw new Error("The claim user document does not exist.");
    }
    if (!claimSnapshot.exists()) {
      throw new Error("The Academy join claim does not exist.");
    }

    const storedClaim = { id: claimSnapshot.id, ...claimSnapshot.data() } as AcademyJoinClaim;
    const storedRole = normalizeClaimRole(storedClaim);
    if (
      storedClaim.userId !== claim.userId ||
      storedRole !== requestedRole ||
      storedClaim.userEmail !== persistedClaim.userEmail
    ) {
      throw new Error("Claim identity or requested role changed before approval.");
    }
    if (storedClaim.status === "REJECTED") {
      throw new Error("A rejected claim cannot be approved.");
    }
    if (
      storedClaim.status === "APPROVED" &&
      (storedClaim.approvedAcademyId !== academyId || storedClaim.approvedRole !== requestedRole)
    ) {
      throw new Error("Claim was already approved for a different Academy or role.");
    }

    const existingMembership = membershipSnapshot.exists()
      ? membershipSnapshot.data() as Membership
      : null;
    const timestamp = serverTimestamp();
    const membershipWrite = {
      userId: claim.userId,
      academyId,
      role: requestedRole,
      status: "ACTIVE" as const,
      source: existingMembership?.source || "CLAIM_APPROVAL" as const,
      joinedAt: existingMembership?.joinedAt || timestamp,
      joinedBy: existingMembership?.joinedBy || approvedBy,
      updatedAt: timestamp,
    };

    transaction.set(membershipRef, membershipWrite);
    transaction.set(userRef, {
      activeAcademyId: academyId,
      academyId,
      tenantRole: requestedRole,
      role: requestedRole,
      status: "Active",
      updatedAt: timestamp,
    }, { merge: true });
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
    };
  });
}
