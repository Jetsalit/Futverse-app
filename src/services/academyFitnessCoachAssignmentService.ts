import { auth, db } from "../lib/firebase";
import {
  collection,
  doc,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import type { Membership } from "../types/Membership";
import type { User } from "../contexts/AuthContext";
import {
  canManageFitnessCoachAssignments,
  resolveFitnessCoachAssignmentRows,
  validateFitnessCoachTransition,
} from "../lib/academyFitnessCoachAssignment";
import { isExactActiveStaffMembershipForRole } from "../lib/superAdminSupportModel";

type AssignmentScope = {
  academyId: string;
  actualActor: User | null;
  actorMembership: Membership | null;
};

function requireAuthorizedScope(scope: AssignmentScope): string {
  const actorUid = scope.actualActor?.uid;
  if (!actorUid || auth.currentUser?.uid !== actorUid || !canManageFitnessCoachAssignments(
    scope.actualActor, scope.actorMembership, scope.academyId,
  )) {
    throw new Error("An active Academy Admin or SuperAdmin session is required.");
  }
  return actorUid;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function assertAuditState(
  value: unknown,
  academyId: string,
  targetUid: string,
): void {
  if (value === null || value === undefined) return;
  if (
    typeof value !== "object" ||
    !exactKeys(value as Record<string, unknown>, [
      "schemaVersion", "organizationType", "organizationId", "targetUid",
      "lastActionId", "updatedAt", "updatedBy",
    ])
  ) {
    throw new Error("The Academy access audit pointer is malformed.");
  }
  const state = value as Record<string, unknown>;
  if (
    state.schemaVersion !== 1 ||
    state.organizationType !== "ACADEMY" ||
    state.organizationId !== academyId ||
    state.targetUid !== targetUid ||
    typeof state.lastActionId !== "string" || !state.lastActionId.trim() || state.lastActionId.includes("/") ||
    typeof state.updatedBy !== "string" || !state.updatedBy.trim() || state.updatedBy.includes("/")
  ) {
    throw new Error("The Academy access audit pointer does not match the relationship.");
  }
}

export async function loadFitnessCoachAssignments(scope: AssignmentScope) {
  requireAuthorizedScope(scope);
  const [members, specialties] = await Promise.all([
    getDocsFromServer(collection(db, "academies", scope.academyId, "members")),
    getDocsFromServer(collection(db, "academies", scope.academyId, "staffSpecialties")),
  ]);
  if (members.metadata.fromCache || members.metadata.hasPendingWrites
    || specialties.metadata.fromCache || specialties.metadata.hasPendingWrites) {
    throw new Error("Server-authoritative Academy assignments are unavailable.");
  }
  return resolveFitnessCoachAssignmentRows(
    scope.academyId,
    members.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })),
    specialties.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() })),
  );
}

export async function changeFitnessCoachAssignment(
  scope: AssignmentScope,
  targetUid: string,
  nextStatus: "ACTIVE" | "INACTIVE",
): Promise<void> {
  const actorUid = requireAuthorizedScope(scope);
  const isSuperAdminActor = scope.actualActor?.role === "SUPERADMIN";
  const membershipRef = doc(db, "academies", scope.academyId, "members", targetUid);
  const specialtyRef = doc(db, "academies", scope.academyId, "staffSpecialties", targetUid);
  const auditStateRef = doc(
    db,
    "superAdminAccessControlState",
    "ACADEMY",
    "organizations",
    scope.academyId,
    "targets",
    targetUid,
  );
  const accessAuditRef = isSuperAdminActor
    ? doc(collection(db, "superAdminAccessControlAudits"))
    : null;
  await runTransaction(db, async (transaction) => {
    // Read all authority and lifecycle documents before the first write.
    const actorRef = doc(db, "academies", scope.academyId, "members", actorUid);
    const actorSnapshot = isSuperAdminActor
      ? null : await transaction.get(actorRef);
    const authoritativeActorSnapshot = isSuperAdminActor
      ? await transaction.get(doc(db, "users", actorUid))
      : null;
    const targetSnapshot = await transaction.get(membershipRef);
    const specialtySnapshot = await transaction.get(specialtyRef);
    const auditStateSnapshot = isSuperAdminActor
      ? await transaction.get(auditStateRef)
      : null;
    if (actorSnapshot && !isExactActiveStaffMembershipForRole(
      actorSnapshot.data(), actorUid, scope.academyId, actorSnapshot.id, "ADMIN",
    )) {
      throw new Error("Academy Admin membership changed before assignment.");
    }
    if (authoritativeActorSnapshot) {
      const authoritativeActor = authoritativeActorSnapshot.data();
      if (
        !authoritativeActorSnapshot.exists() ||
        (authoritativeActor.uid !== undefined && authoritativeActor.uid !== actorUid) ||
        authoritativeActor.role !== "SUPERADMIN" ||
        !["ACTIVE", "Active"].includes(String(authoritativeActor.status))
      ) {
        throw new Error("An active authoritative SuperAdmin account is required.");
      }
    }
    if (auditStateSnapshot) {
      assertAuditState(
        auditStateSnapshot.exists() ? auditStateSnapshot.data() : null,
        scope.academyId,
        targetUid,
      );
    }
    if (isSuperAdminActor && !targetSnapshot.exists()) {
      throw new Error("A canonical Academy Membership is required for Fitness Coach changes.");
    }
    const mutation = validateFitnessCoachTransition(
      nextStatus,
      targetSnapshot.exists() ? targetSnapshot.data() : null,
      targetSnapshot.id,
      scope.academyId,
      specialtySnapshot.exists() ? specialtySnapshot.data() : null,
    );
    const currentSpecialty = specialtySnapshot.exists() ? specialtySnapshot.data() : null;
    if (
      specialtySnapshot.exists() &&
      currentSpecialty?.status === nextStatus
    ) {
      return;
    }
    const now = serverTimestamp();
    if (mutation === "CREATE") {
      transaction.set(specialtyRef, {
        schemaVersion: 1,
        specialty: "FITNESS_COACH",
        status: "ACTIVE",
        createdAt: now,
        createdBy: actorUid,
        updatedAt: now,
        updatedBy: actorUid,
      });
    } else {
      transaction.update(specialtyRef, { status: nextStatus, updatedAt: now, updatedBy: actorUid });
    }

    if (isSuperAdminActor && accessAuditRef) {
      const membership = targetSnapshot.data()!;
      const membershipProjection = {
        role: String(membership.role),
        status: String(membership.status),
        source: String(membership.source),
        joinedBy: String(membership.joinedBy),
        ...(Object.hasOwn(membership, "approvalClaimId")
          ? { approvalClaimId: String(membership.approvalClaimId) }
          : {}),
      };
      const previousSpecialty = currentSpecialty
        ? { specialty: String(currentSpecialty.specialty), status: String(currentSpecialty.status) }
        : null;
      const nextSpecialty = { specialty: "FITNESS_COACH", status: nextStatus };
      const actionType = nextStatus === "INACTIVE"
        ? "ACADEMY_SPECIALTY_DEACTIVATED"
        : currentSpecialty ? "ACADEMY_SPECIALTY_REACTIVATED" : "ACADEMY_SPECIALTY_ASSIGNED";
      transaction.set(auditStateRef, {
        schemaVersion: 1,
        organizationType: "ACADEMY",
        organizationId: scope.academyId,
        targetUid,
        lastActionId: accessAuditRef.id,
        updatedAt: now,
        updatedBy: actorUid,
      });
      transaction.set(accessAuditRef, {
        schemaVersion: 1,
        actionId: accessAuditRef.id,
        actionType,
        actorUid,
        targetUid,
        organizationType: "ACADEMY",
        organizationId: scope.academyId,
        previousState: { membership: membershipProjection, specialty: previousSpecialty },
        newState: { membership: membershipProjection, specialty: nextSpecialty },
        createdAt: now,
      });
    }
  });
}
