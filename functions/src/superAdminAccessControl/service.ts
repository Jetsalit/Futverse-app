import {
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  canonicalAcademyMembership,
  canonicalStateJson,
  isActiveStatus,
  isCanonicalActiveSuperAdmin,
  isEligibleTarget,
  isExactDocumentId,
  isValidAcademySpecialty,
  resolveAcademyAccessState,
  resolveProClubAccessState,
  SuperAdminAccessControlError,
  validFitnessCoachTransition,
  type AcademyExpectedState,
  type ManageAccessRequest,
  type ProClubExpectedState,
  type SuperAdminAccessControlInput,
  type SuperAdminAccessControlRequest,
  type SuperAdminAccessControlResult,
} from "./core.ts";

export interface SuperAdminAccessControlService {
  execute(input: SuperAdminAccessControlInput): Promise<SuperAdminAccessControlResult>;
}

export interface SuperAdminAccessControlServiceOptions {
  firestore: Firestore;
}

type Snapshot = { exists: boolean; data: DocumentData | undefined };

function fail(code: ConstructorParameters<typeof SuperAdminAccessControlError>[0], message: string): never {
  throw new SuperAdminAccessControlError(code, message);
}

function snapshotOf(snapshot: DocumentSnapshot): Snapshot {
  return { exists: snapshot.exists, data: snapshot.exists ? snapshot.data() : undefined };
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function requireExactId(value: unknown, field: string): asserts value is string {
  if (!isExactDocumentId(value)) fail("INVALID_ARGUMENT", `${field} must be an exact Firestore document ID.`);
}

function assertActor(actorUid: string, snapshot: Snapshot): void {
  if (!snapshot.exists || !snapshot.data) fail("PERMISSION_DENIED", "The authoritative SuperAdmin account no longer exists.");
  if (!isCanonicalActiveSuperAdmin(snapshot.data, actorUid)) {
    fail("PERMISSION_DENIED", "An active authoritative SUPERADMIN account is required.");
  }
}

function assertTarget(targetUid: string, actorUid: string, snapshot: Snapshot): void {
  if (!snapshot.exists || !snapshot.data) fail("NOT_FOUND", "The selected target account no longer exists.");
  if (!isEligibleTarget(snapshot.data, targetUid, actorUid)) {
    fail("FAILED_PRECONDITION", "The target account must be ACTIVE and must not be a SUPERADMIN or the acting account.");
  }
}

function assertOrganization(type: "ACADEMY" | "PRO_CLUB", snapshot: Snapshot): void {
  if (!snapshot.exists || !snapshot.data) fail("NOT_FOUND", "The selected organization no longer exists.");
  const status = snapshot.data.status;
  const active = type === "PRO_CLUB" ? status === "ACTIVE" : status === undefined || isActiveStatus(status);
  if (!active) fail("FAILED_PRECONDITION", `Direct ${type === "PRO_CLUB" ? "Pro Club" : "Academy"} access requires an ACTIVE organization.`);
}

function assertAuditState(
  organizationType: "ACADEMY" | "PRO_CLUB",
  organizationId: string,
  targetUid: string,
  snapshot: Snapshot,
): void {
  if (!snapshot.exists) return;
  const state = snapshot.data;
  const keys = ["schemaVersion", "organizationType", "organizationId", "targetUid", "lastActionId", "updatedAt", "updatedBy"];
  if (!state || !exactKeys(state, keys) || state.schemaVersion !== 1 ||
    state.organizationType !== organizationType || state.organizationId !== organizationId ||
    state.targetUid !== targetUid || !isExactDocumentId(state.lastActionId) || !isExactDocumentId(state.updatedBy)) {
    fail("FAILED_PRECONDITION", "The access audit pointer is malformed and requires manual review.");
  }
}

function assertPreview(
  input: ManageAccessRequest,
  actionType: string | null,
  previousState: unknown,
): void {
  if (input.expectedActionType !== actionType || canonicalStateJson(input.expectedState) !== canonicalStateJson(previousState)) {
    fail("FAILED_PRECONDITION", "Access changed after preview. Reload the current access state before confirming.");
  }
  if (actionType === null) {
    if (input.confirmedActionType !== null) fail("FAILED_PRECONDITION", "The current access state no longer requires a confirmed action.");
    return;
  }
  if (input.confirmedActionType !== actionType) {
    fail("FAILED_PRECONDITION", "Explicit confirmation for the current access action is required.");
  }
}

function currentProClubState(membership: Snapshot, staff: Snapshot, pointer: Snapshot): ProClubExpectedState {
  if ((membership.exists && !membership.data) || (staff.exists && !staff.data) || (pointer.exists && !pointer.data)) {
    fail("FAILED_PRECONDITION", "The current Pro Club access record is malformed.");
  }
  const pointerData = pointer.data;
  if (pointerData && (!exactKeys(pointerData, ["schemaVersion", "clubId"]) || pointerData.schemaVersion !== 1)) {
    fail("FAILED_PRECONDITION", "The Pro Club discovery pointer is malformed and requires manual review.");
  }
  return {
    membership: membership.data ? {
      authorizationRole: String(membership.data.authorizationRole),
      status: String(membership.data.status),
    } : null,
    staff: staff.data ? { staffRole: String(staff.data.staffRole), status: String(staff.data.status) } : null,
    pointerExists: pointer.exists,
  };
}

function assertPointerConsistency(state: ProClubExpectedState, pointer: Snapshot, clubId: string): void {
  if (pointer.data && pointer.data.clubId !== clubId) {
    fail("FAILED_PRECONDITION", "The Pro Club discovery pointer identifies another organization.");
  }
  if ((state.membership !== null || state.staff !== null) !== pointer.exists) {
    fail("FAILED_PRECONDITION", "The Pro Club membership, staff assignment, and discovery pointer are incomplete; manual review is required.");
  }
}

function currentAcademyState(
  membership: Snapshot,
  specialty: Snapshot,
  academyId: string,
  targetUid: string,
): AcademyExpectedState {
  if ((membership.exists && !membership.data) || (specialty.exists && !specialty.data)) {
    fail("FAILED_PRECONDITION", "The current Academy access record is malformed.");
  }
  const member = membership.data;
  if (member && (member.userId !== targetUid || member.academyId !== academyId)) {
    fail("FAILED_PRECONDITION", "The Academy membership identity does not match its canonical document path.");
  }
  return {
    membership: member ? {
      role: String(member.role),
      status: String(member.status),
      source: String(member.source),
      joinedBy: String(member.joinedBy),
      ...(Object.hasOwn(member, "approvalClaimId") ? { approvalClaimId: String(member.approvalClaimId) } : {}),
    } : null,
    specialty: specialty.data ? {
      specialty: String(specialty.data.specialty), status: String(specialty.data.status),
    } : null,
  };
}

function throwManualReview(reason: string | undefined, fallback: string): never {
  fail("FAILED_PRECONDITION", reason ?? fallback);
}

function writeStateAndAudit(
  transaction: Transaction,
  firestore: Firestore,
  actorUid: string,
  organizationType: "ACADEMY" | "PRO_CLUB",
  organizationId: string,
  targetUid: string,
  actionType: string,
  previousState: unknown,
  newState: unknown,
): string {
  const actionRef = firestore.collection("superAdminAccessControlAudits").doc();
  const at = FieldValue.serverTimestamp();
  transaction.set(firestore.doc(`superAdminAccessControlState/${organizationType}/organizations/${organizationId}/targets/${targetUid}`), {
    schemaVersion: 1,
    organizationType,
    organizationId,
    targetUid,
    lastActionId: actionRef.id,
    updatedAt: at,
    updatedBy: actorUid,
  });
  transaction.create(actionRef, {
    schemaVersion: 1,
    actionId: actionRef.id,
    actionType,
    actorUid,
    targetUid,
    organizationType,
    organizationId,
    previousState,
    newState,
    createdAt: at,
  });
  return actionRef.id;
}

async function executeManageAccess(
  input: SuperAdminAccessControlInput & { request: ManageAccessRequest },
  firestore: Firestore,
): Promise<SuperAdminAccessControlResult> {
  const { actorUid, request } = input;
  const { organizationType, organizationId, targetUid } = request;
  requireExactId(actorUid, "actorUid");
  requireExactId(organizationId, "organizationId");
  requireExactId(targetUid, "targetUid");
  if (actorUid === targetUid) fail("FAILED_PRECONDITION", "A SuperAdmin cannot assign organization access to themselves here.");

  return firestore.runTransaction(async (transaction) => {
    const userRef = (uid: string) => firestore.doc(`users/${uid}`);
    const organizationRef = firestore.doc(`${organizationType === "ACADEMY" ? "academies" : "proClubs"}/${organizationId}`);
    const auditStateRef = firestore.doc(`superAdminAccessControlState/${organizationType}/organizations/${organizationId}/targets/${targetUid}`);
    const [actorSnap, targetSnap, organizationSnap, auditStateSnap] = await Promise.all([
      transaction.get(userRef(actorUid)),
      transaction.get(userRef(targetUid)),
      transaction.get(organizationRef),
      transaction.get(auditStateRef),
    ]);
    const actor = snapshotOf(actorSnap);
    const target = snapshotOf(targetSnap);
    const organization = snapshotOf(organizationSnap);
    const auditState = snapshotOf(auditStateSnap);
    assertActor(actorUid, actor);
    assertTarget(targetUid, actorUid, target);
    assertOrganization(organizationType, organization);
    assertAuditState(organizationType, organizationId, targetUid, auditState);

    if (organizationType === "PRO_CLUB") {
      const membershipRef = firestore.doc(`proClubs/${organizationId}/members/${targetUid}`);
      const staffRef = firestore.doc(`proClubs/${organizationId}/staff/${targetUid}`);
      const pointerRef = firestore.doc(`users/${targetUid}/proClubMemberships/${organizationId}`);
      const [membershipSnap, staffSnap, pointerSnap] = await Promise.all([
        transaction.get(membershipRef), transaction.get(staffRef), transaction.get(pointerRef),
      ]);
      const membership = snapshotOf(membershipSnap);
      const staff = snapshotOf(staffSnap);
      const pointer = snapshotOf(pointerSnap);
      const previousState = currentProClubState(membership, staff, pointer);
      assertPointerConsistency(previousState, pointer, organizationId);
      const decision = resolveProClubAccessState(membership.data ?? null, staff.data ?? null, request.desiredStaffRole);
      if (decision.state === "MANUAL_REVIEW") throwManualReview(decision.reason, "Pro Club access requires manual review.");
      assertPreview(request, decision.actionType, previousState);
      if (decision.actionType === null) {
        return { actionId: null, actionType: null, decisionState: decision.state, previousState, newState: previousState };
      }

      const memberPath = `proClubs/${organizationId}/members/${targetUid}`;
      const staffPath = `proClubs/${organizationId}/staff/${targetUid}`;
      if (decision.state === "ASSIGN") {
        transaction.create(firestore.doc(memberPath), { authorizationRole: "MEMBER", status: "ACTIVE" });
        transaction.create(firestore.doc(staffPath), { staffRole: request.desiredStaffRole, status: "ACTIVE" });
        transaction.create(firestore.doc(`users/${targetUid}/proClubMemberships/${organizationId}`), { schemaVersion: 1, clubId: organizationId });
      } else if (decision.state === "ASSIGN_STAFF_ROLE") {
        transaction.create(firestore.doc(staffPath), { staffRole: request.desiredStaffRole, status: "ACTIVE" });
      } else if (decision.state === "CHANGE_ROLE") {
        transaction.update(firestore.doc(staffPath), { staffRole: request.desiredStaffRole });
      } else if (decision.state === "REACTIVATE") {
        if (previousState.membership?.status === "INACTIVE") transaction.update(firestore.doc(memberPath), { status: "ACTIVE" });
        if (previousState.staff === null) transaction.create(firestore.doc(staffPath), { staffRole: request.desiredStaffRole, status: "ACTIVE" });
        else transaction.update(firestore.doc(staffPath), { staffRole: request.desiredStaffRole, status: "ACTIVE" });
      }
      const newState = {
        membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
        staff: { staffRole: request.desiredStaffRole, status: "ACTIVE" },
        pointerExists: true,
      };
      const actionId = writeStateAndAudit(transaction, firestore, actorUid, "PRO_CLUB", organizationId, targetUid,
        decision.actionType, { membership: previousState.membership, staff: previousState.staff },
        { membership: newState.membership, staff: newState.staff });
      return { actionId, actionType: decision.actionType, decisionState: decision.state, previousState, newState };
    }

    const membershipRef = firestore.doc(`academies/${organizationId}/members/${targetUid}`);
    const specialtyRef = firestore.doc(`academies/${organizationId}/staffSpecialties/${targetUid}`);
    const [membershipSnap, specialtySnap] = await Promise.all([transaction.get(membershipRef), transaction.get(specialtyRef)]);
    const membership = snapshotOf(membershipSnap);
    const specialty = snapshotOf(specialtySnap);
    const previousState = currentAcademyState(membership, specialty, organizationId, targetUid);
    const decision = resolveAcademyAccessState(membership.data ?? null, specialty.data ?? null,
      request.desiredAcademyRole, request.desiredFitnessCoach);
    if (decision.state === "MANUAL_REVIEW") throwManualReview(decision.reason, "Academy access requires manual review.");
    assertPreview(request, decision.actionType, previousState);
    if (decision.actionType === null) {
      return { actionId: null, actionType: null, decisionState: decision.state, previousState, newState: previousState };
    }

    const at = FieldValue.serverTimestamp();
    if (!membership.exists) {
      transaction.create(membershipRef, {
        userId: targetUid, academyId: organizationId, role: request.desiredAcademyRole,
        status: "ACTIVE", source: "SUPERADMIN_ASSIGNMENT", joinedAt: at, joinedBy: actorUid, updatedAt: at,
      });
    } else if (membership.data!.status === "SUSPENDED" || membership.data!.role !== request.desiredAcademyRole) {
      const patch: DocumentData = { updatedAt: at };
      if (membership.data!.status === "SUSPENDED") patch.status = "ACTIVE";
      if (membership.data!.role !== request.desiredAcademyRole) patch.role = request.desiredAcademyRole;
      transaction.update(membershipRef, patch);
    }
    if (request.desiredFitnessCoach && previousState.specialty?.status !== "ACTIVE") {
      const projectedMembership = { userId: targetUid, academyId: organizationId, role: request.desiredAcademyRole, status: "ACTIVE" };
      let transition: "CREATE" | "UPDATE";
      try {
        transition = validFitnessCoachTransition("ACTIVE", projectedMembership, targetUid, organizationId, specialty.data ?? null);
      } catch (error) {
        throwManualReview(error instanceof Error ? error.message : undefined, "Fitness Coach specialty transition is invalid.");
      }
      if (transition === "UPDATE") transaction.update(specialtyRef, { status: "ACTIVE", updatedAt: at, updatedBy: actorUid });
      else transaction.create(specialtyRef, {
        schemaVersion: 1, specialty: "FITNESS_COACH", status: "ACTIVE",
        createdAt: at, createdBy: actorUid, updatedAt: at, updatedBy: actorUid,
      });
    }

    const newState: AcademyExpectedState = {
      membership: {
        role: request.desiredAcademyRole,
        status: "ACTIVE",
        source: previousState.membership?.source ?? "SUPERADMIN_ASSIGNMENT",
        joinedBy: previousState.membership?.joinedBy ?? actorUid,
        ...(previousState.membership?.approvalClaimId ? { approvalClaimId: previousState.membership.approvalClaimId } : {}),
      },
      specialty: request.desiredFitnessCoach ? { specialty: "FITNESS_COACH", status: "ACTIVE" } : previousState.specialty,
    };
    const actionId = writeStateAndAudit(transaction, firestore, actorUid, "ACADEMY", organizationId, targetUid,
      decision.actionType, previousState, newState);
    return { actionId, actionType: decision.actionType, decisionState: decision.state, previousState, newState };
  });
}

async function executeSpecialtyStatus(
  input: SuperAdminAccessControlInput & { request: Extract<SuperAdminAccessControlRequest, { operation: "SET_ACADEMY_SPECIALTY_STATUS" }> },
  firestore: Firestore,
): Promise<SuperAdminAccessControlResult> {
  const { actorUid, request } = input;
  const { organizationId: academyId, targetUid, nextStatus } = request;
  requireExactId(actorUid, "actorUid");
  requireExactId(academyId, "organizationId");
  requireExactId(targetUid, "targetUid");
  if (actorUid === targetUid) fail("FAILED_PRECONDITION", "A SuperAdmin cannot assign organization access to themselves here.");

  return firestore.runTransaction(async (transaction) => {
    const actorRef = firestore.doc(`users/${actorUid}`);
    const targetRef = firestore.doc(`users/${targetUid}`);
    const academyRef = firestore.doc(`academies/${academyId}`);
    const membershipRef = firestore.doc(`academies/${academyId}/members/${targetUid}`);
    const specialtyRef = firestore.doc(`academies/${academyId}/staffSpecialties/${targetUid}`);
    const stateRef = firestore.doc(`superAdminAccessControlState/ACADEMY/organizations/${academyId}/targets/${targetUid}`);
    const [actorSnap, targetSnap, academySnap, membershipSnap, specialtySnap, stateSnap] = await Promise.all([
      transaction.get(actorRef), transaction.get(targetRef), transaction.get(academyRef),
      transaction.get(membershipRef), transaction.get(specialtyRef), transaction.get(stateRef),
    ]);
    const actor = snapshotOf(actorSnap);
    const target = snapshotOf(targetSnap);
    const academy = snapshotOf(academySnap);
    const membership = snapshotOf(membershipSnap);
    const specialty = snapshotOf(specialtySnap);
    const state = snapshotOf(stateSnap);
    assertActor(actorUid, actor);
    assertOrganization("ACADEMY", academy);
    assertAuditState("ACADEMY", academyId, targetUid, state);
    const canonicalMembership = membership.data ? canonicalAcademyMembership(membership.data) : null;
    if (!membership.exists || !membership.data || !canonicalMembership ||
      canonicalMembership.userId !== targetUid || canonicalMembership.academyId !== academyId) {
      fail("FAILED_PRECONDITION", "A canonical Academy Membership is required for Fitness Coach changes.");
    }
    if (nextStatus === "ACTIVE") assertTarget(targetUid, actorUid, target);
    if (specialty.exists && (!specialty.data || !isValidAcademySpecialty(specialty.data))) {
      fail("FAILED_PRECONDITION", "The current specialty record is invalid.");
    }
    const current = specialty.data ?? null;
    let transition: "CREATE" | "UPDATE";
    try {
      transition = validFitnessCoachTransition(nextStatus, membership.data, targetUid, academyId, current);
    } catch (error) {
      throwManualReview(error instanceof Error ? error.message : undefined, "Fitness Coach specialty transition is invalid.");
    }
    if (specialty.exists && current?.status === nextStatus) {
      return {
        actionId: null,
        actionType: null,
        decisionState: "ALREADY_ACTIVE",
        previousState: { membership: membership.data, specialty: current },
        newState: { membership: membership.data, specialty: current },
      };
    }
    const at = FieldValue.serverTimestamp();
    if (transition === "CREATE") {
      transaction.create(specialtyRef, {
        schemaVersion: 1, specialty: "FITNESS_COACH", status: "ACTIVE",
        createdAt: at, createdBy: actorUid, updatedAt: at, updatedBy: actorUid,
      });
    } else {
      transaction.update(specialtyRef, { status: nextStatus, updatedAt: at, updatedBy: actorUid });
    }
    const member = membership.data;
    const membershipProjection = {
      role: String(member.role),
      status: String(member.status),
      source: String(member.source),
      joinedBy: String(member.joinedBy),
      ...(Object.hasOwn(member, "approvalClaimId") ? { approvalClaimId: String(member.approvalClaimId) } : {}),
    };
    const previousSpecialty = current
      ? { specialty: String(current.specialty), status: String(current.status) }
      : null;
    const nextSpecialty = { specialty: "FITNESS_COACH", status: nextStatus };
    const actionType = nextStatus === "INACTIVE"
      ? "ACADEMY_SPECIALTY_DEACTIVATED"
      : current ? "ACADEMY_SPECIALTY_REACTIVATED" : "ACADEMY_SPECIALTY_ASSIGNED";
    const actionId = writeStateAndAudit(transaction, firestore, actorUid, "ACADEMY", academyId, targetUid,
      actionType, { membership: membershipProjection, specialty: previousSpecialty },
      { membership: membershipProjection, specialty: nextSpecialty });
    return {
      actionId, actionType, decisionState: nextStatus === "INACTIVE" ? "DEACTIVATE" : transition,
      previousState: { membership: membershipProjection, specialty: previousSpecialty },
      newState: { membership: membershipProjection, specialty: nextSpecialty },
    };
  });
}

export function createSuperAdminAccessControlService(
  options: SuperAdminAccessControlServiceOptions,
): SuperAdminAccessControlService {
  return {
    execute(input) {
      if (input.request.operation === "MANAGE_ACCESS") return executeManageAccess(input as SuperAdminAccessControlInput & { request: ManageAccessRequest }, options.firestore);
      return executeSpecialtyStatus(input as SuperAdminAccessControlInput & { request: Extract<SuperAdminAccessControlRequest, { operation: "SET_ACADEMY_SPECIALTY_STATUS" }> }, options.firestore);
    },
  };
}
