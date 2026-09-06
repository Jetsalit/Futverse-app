import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  planProClubStaffManagementTransitionV1,
  ProClubStaffManagementTransitionError,
  type ProClubAuthorizationRole,
  type ProClubMembershipStatus,
  type ProClubStaffManagementActionV1,
  type ProClubStaffManagementPlanV1,
  type ProClubStaffRole,
  type ProClubStaffStatus,
} from "./transition.js";
import {
  ProClubStaffManagementServiceError,
  STAFF_MANAGEMENT_ERROR_CODES,
  type ProClubStaffManagementSourceV1,
} from "./service.js";

function asExactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || !actual.every((key) => keys.includes(key))) return null;
  return record;
}

function parseClub(value: unknown): { status: "ACTIVE" | "INACTIVE" } {
  const record = asExactRecord(value, ["schemaVersion", "type", "proClubId", "name", "shortName", "countryCode", "level", "status", "createdAt", "updatedAt"]);
  if (!record || record.status !== "ACTIVE") {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.CONFLICT,
      "Club state changed before the staff action was committed.",
    );
  }
  return { status: "ACTIVE" };
}

function parseMembership(value: unknown): {
  authorizationRole: ProClubAuthorizationRole;
  status: ProClubMembershipStatus;
} {
  const record = asExactRecord(value, ["authorizationRole", "status"]);
  if (!record) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical membership data is invalid.",
    );
  }
  if (
    !["OWNER", "ADMIN", "MEMBER"].includes(record.authorizationRole as string) ||
    !["ACTIVE", "INACTIVE", "LEFT", "REVOKED"].includes(record.status as string)
  ) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical membership data is invalid.",
    );
  }
  return {
    authorizationRole: record.authorizationRole as ProClubAuthorizationRole,
    status: record.status as ProClubMembershipStatus,
  };
}

function parseStaff(value: unknown): {
  staffRole: ProClubStaffRole;
  status: ProClubStaffStatus;
} {
  const record = asExactRecord(value, ["staffRole", "status"]);
  if (!record) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical staff data is invalid.",
    );
  }
  if (
    ![
      "TECHNICAL_DIRECTOR", "MANAGER", "HEAD_COACH", "ASSISTANT_COACH", "GK_COACH",
      "FITNESS_COACH", "ANALYST", "PHYSIO", "TEAM_MANAGER", "STAFF",
    ].includes(record.staffRole as string) ||
    !["ACTIVE", "INACTIVE", "LEFT"].includes(record.status as string)
  ) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Canonical staff data is invalid.",
    );
  }
  return {
    staffRole: record.staffRole as ProClubStaffRole,
    status: record.status as ProClubStaffStatus,
  };
}

function actionFromPlan(plan: ProClubStaffManagementPlanV1): ProClubStaffManagementActionV1 {
  switch (plan.history.action) {
    case "CHANGE_ROLE":
      return { type: "CHANGE_ROLE", staffRole: plan.history.nextStaffRole };
    case "DEACTIVATE":
      return { type: "DEACTIVATE" };
    case "REACTIVATE":
      return { type: "REACTIVATE" };
    case "MARK_LEFT":
      return { type: "MARK_LEFT" };
  }
}

function assertPreviousStateMatchesPlan(
  plan: ProClubStaffManagementPlanV1,
  currentMembership: { authorizationRole: ProClubAuthorizationRole; status: ProClubMembershipStatus },
  currentStaff: { staffRole: ProClubStaffRole; status: ProClubStaffStatus },
): void {
  if (
    currentMembership.authorizationRole !== plan.history.previousAuthorizationRole ||
    currentMembership.status !== plan.history.previousMembershipStatus ||
    currentStaff.staffRole !== plan.history.previousStaffRole ||
    currentStaff.status !== plan.history.previousStaffStatus
  ) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.CONFLICT,
      "Staff state changed before the action was committed.",
    );
  }
}

function assertPlanIdentity(
  input: {
    clubId: string;
    targetUid: string;
    requesterUid: string;
    plan: ProClubStaffManagementPlanV1;
  },
): void {
  if (
    input.plan.history.clubId !== input.clubId ||
    input.plan.history.userId !== input.targetUid ||
    input.plan.history.changedBy !== input.requesterUid ||
    input.plan.membership.authorizationRole !== input.plan.history.nextAuthorizationRole ||
    input.plan.membership.status !== input.plan.history.nextMembershipStatus ||
    input.plan.staff.staffRole !== input.plan.history.nextStaffRole ||
    input.plan.staff.status !== input.plan.history.nextStaffStatus ||
    input.plan.history.previousAuthorizationRole !== input.plan.history.nextAuthorizationRole
  ) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.INVALID_DATA,
      "Staff management plan identity is invalid.",
    );
  }
}

function mapTransitionError(error: ProClubStaffManagementTransitionError): never {
  if (
    error.code === "REVIEWER_REQUIRED" ||
    error.code === "OWNER_ACTION_REQUIRED" ||
    error.code === "OWNER_TARGET_PROTECTED" ||
    error.code === "SELF_MANAGEMENT_BLOCKED"
  ) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.FORBIDDEN,
      "Staff management authority changed before commit.",
    );
  }
  throw new ProClubStaffManagementServiceError(
    STAFF_MANAGEMENT_ERROR_CODES.CONFLICT,
    "Staff state changed before the action was committed.",
  );
}

function assertPlanEquivalent(
  expected: ProClubStaffManagementPlanV1,
  actual: ProClubStaffManagementPlanV1,
): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new ProClubStaffManagementServiceError(
      STAFF_MANAGEMENT_ERROR_CODES.CONFLICT,
      "Staff state changed before the action was committed.",
    );
  }
}

export function createFirestoreProClubStaffManagementSourceV1(
  firestore: Firestore,
): ProClubStaffManagementSourceV1 {
  return {
    async readClub(clubId) {
      const snapshot = await firestore.collection("proClubs").doc(clubId).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async readMembership(clubId, uid) {
      const snapshot = await firestore.collection("proClubs").doc(clubId).collection("members").doc(uid).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async readStaffAssignment(clubId, uid) {
      const snapshot = await firestore.collection("proClubs").doc(clubId).collection("staff").doc(uid).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async applyAtomicPlan(input) {
      assertPlanIdentity(input);

      const clubRef = firestore.collection("proClubs").doc(input.clubId);
      const actorMembershipRef = clubRef.collection("members").doc(input.requesterUid);
      const targetMembershipRef = clubRef.collection("members").doc(input.targetUid);
      const targetStaffRef = clubRef.collection("staff").doc(input.targetUid);
      const historyRef = clubRef.collection("staffManagementHistory").doc();

      await firestore.runTransaction(async (transaction) => {
        const [clubSnapshot, actorSnapshot, targetMembershipSnapshot, targetStaffSnapshot] = await Promise.all([
          transaction.get(clubRef),
          transaction.get(actorMembershipRef),
          transaction.get(targetMembershipRef),
          transaction.get(targetStaffRef),
        ]);

        if (!clubSnapshot.exists || !actorSnapshot.exists || !targetMembershipSnapshot.exists || !targetStaffSnapshot.exists) {
          throw new ProClubStaffManagementServiceError(
            STAFF_MANAGEMENT_ERROR_CODES.CONFLICT,
            "Canonical staff state changed before commit.",
          );
        }

        parseClub(clubSnapshot.data());
        const actorMembership = parseMembership(actorSnapshot.data());
        const targetMembership = parseMembership(targetMembershipSnapshot.data());
        const targetStaff = parseStaff(targetStaffSnapshot.data());
        assertPreviousStateMatchesPlan(input.plan, targetMembership, targetStaff);

        let recomputed: ProClubStaffManagementPlanV1;
        try {
          recomputed = planProClubStaffManagementTransitionV1(
            {
              clubId: input.clubId,
              actorUid: input.requesterUid,
              authorizationRole: actorMembership.authorizationRole,
              membershipStatus: actorMembership.status,
            },
            {
              clubId: input.clubId,
              userId: input.targetUid,
              authorizationRole: targetMembership.authorizationRole,
              membershipStatus: targetMembership.status,
              staffRole: targetStaff.staffRole,
              staffStatus: targetStaff.status,
            },
            actionFromPlan(input.plan),
          );
        } catch (error) {
          if (error instanceof ProClubStaffManagementTransitionError) mapTransitionError(error);
          throw error;
        }
        assertPlanEquivalent(input.plan, recomputed);

        transaction.update(targetMembershipRef, recomputed.membership);
        transaction.update(targetStaffRef, recomputed.staff);
        transaction.create(historyRef, {
          ...recomputed.history,
          eventId: historyRef.id,
          changedAt: FieldValue.serverTimestamp(),
        });
      });
    },
  };
}
