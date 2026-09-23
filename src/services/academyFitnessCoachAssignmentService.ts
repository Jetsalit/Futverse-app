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
  const membershipRef = doc(db, "academies", scope.academyId, "members", targetUid);
  const specialtyRef = doc(db, "academies", scope.academyId, "staffSpecialties", targetUid);
  await runTransaction(db, async (transaction) => {
    // Read all authority and lifecycle documents before the first write.
    const actorRef = doc(db, "academies", scope.academyId, "members", actorUid);
    const actorSnapshot = scope.actualActor?.role === "SUPERADMIN"
      ? null : await transaction.get(actorRef);
    const targetSnapshot = await transaction.get(membershipRef);
    const specialtySnapshot = await transaction.get(specialtyRef);
    if (actorSnapshot && !isExactActiveStaffMembershipForRole(
      actorSnapshot.data(), actorUid, scope.academyId, actorSnapshot.id, "ADMIN",
    )) {
      throw new Error("Academy Admin membership changed before assignment.");
    }
    const mutation = validateFitnessCoachTransition(
      nextStatus,
      targetSnapshot.exists() ? targetSnapshot.data() : null,
      targetSnapshot.id,
      scope.academyId,
      specialtySnapshot.exists() ? specialtySnapshot.data() : null,
    );
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
  });
}
