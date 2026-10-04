import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { isExactDocumentId } from "../superAdminSupportModel";
import { isExplicitlyActiveAccountStatus } from "../accountRolePolicy";
import { isActivePrivilegedActor } from "../privilegedAuthorization";
import { validateFitnessCoachTransition } from "../academyFitnessCoachAssignment";
import {
  resolveAcademyAccessState,
  resolveProClubAccessState,
  type AcademyAccessAction,
  type ProClubAccessAction,
} from "../superAdminAccessControl";
import type { TenantRole } from "../../types/Membership";
import type { ProClubStaffRole } from "../../types/ProClub";

export type SuperAdminAccessOrganizationType = "ACADEMY" | "PRO_CLUB";

export interface AccessControlDocumentSnapshot {
  exists: boolean;
  data?: Record<string, unknown>;
}

export interface AccessControlAuditStateSnapshot extends AccessControlDocumentSnapshot {}

export interface ProClubExpectedState {
  membership: { authorizationRole: string; status: string } | null;
  staff: { staffRole: string; status: string } | null;
  pointerExists: boolean;
}

export interface AcademyExpectedState {
  membership: {
    role: string;
    status: string;
    source: string;
    joinedBy: string;
    approvalClaimId?: string;
  } | null;
  specialty: { specialty: string; status: string } | null;
}

interface BaseAccessControlMutationInput {
  actorUid: string;
  targetUid: string;
  organizationId: string;
  organizationType: SuperAdminAccessOrganizationType;
  presentationModeActive: boolean;
}

export type AccessControlMutationInput =
  | (BaseAccessControlMutationInput & {
      organizationType: "PRO_CLUB";
      desiredStaffRole: ProClubStaffRole;
      expectedActionType: ProClubAccessAction | null;
      confirmedActionType?: ProClubAccessAction | null;
      expectedState: ProClubExpectedState;
    })
  | (BaseAccessControlMutationInput & {
      organizationType: "ACADEMY";
      desiredAcademyRole: TenantRole;
      desiredFitnessCoach: boolean;
      expectedActionType: AcademyAccessAction | null;
      confirmedActionType?: AcademyAccessAction | null;
      expectedState: AcademyExpectedState;
    });

export interface AccessControlTransaction {
  getUser(uid: string): Promise<AccessControlDocumentSnapshot>;
  getOrganization(
    organizationType: SuperAdminAccessOrganizationType,
    organizationId: string,
  ): Promise<AccessControlDocumentSnapshot>;
  getAcademyMembership(academyId: string, uid: string): Promise<AccessControlDocumentSnapshot>;
  getAcademySpecialty(academyId: string, uid: string): Promise<AccessControlDocumentSnapshot>;
  getProClubMembership(clubId: string, uid: string): Promise<AccessControlDocumentSnapshot>;
  getProClubStaff(clubId: string, uid: string): Promise<AccessControlDocumentSnapshot>;
  getProClubPointer(uid: string, clubId: string): Promise<AccessControlDocumentSnapshot>;
  getAccessControlAuditState(
    organizationType: SuperAdminAccessOrganizationType,
    organizationId: string,
    uid: string,
  ): Promise<AccessControlAuditStateSnapshot>;
  createAcademyMembership(academyId: string, uid: string, data: DocumentData): void;
  updateAcademyMembership(academyId: string, uid: string, patch: DocumentData): void;
  createAcademySpecialty(academyId: string, uid: string, data: DocumentData): void;
  updateAcademySpecialty(academyId: string, uid: string, patch: DocumentData): void;
  createProClubMembership(clubId: string, uid: string, data: DocumentData): void;
  updateProClubMembership(clubId: string, uid: string, patch: DocumentData): void;
  createProClubStaff(clubId: string, uid: string, data: DocumentData): void;
  updateProClubStaff(clubId: string, uid: string, patch: DocumentData): void;
  createProClubPointer(uid: string, clubId: string, data: DocumentData): void;
  writeAccessControlAuditState(
    organizationType: SuperAdminAccessOrganizationType,
    organizationId: string,
    uid: string,
    data: DocumentData,
  ): void;
  createAccessAudit(actionId: string, data: DocumentData): void;
}

export interface AccessControlMutationDependencies {
  getAuthenticatedUid(): string | null;
  runAccessTransaction<T>(operation: (transaction: AccessControlTransaction) => Promise<T>): Promise<T>;
  timestamp(): unknown;
  newActionId(): string;
}

export interface AccessControlMutationResult {
  actionId: string | null;
  actionType: ProClubAccessAction | AcademyAccessAction | null;
  decisionState: string;
  previousState: ProClubExpectedState | AcademyExpectedState;
  newState: ProClubExpectedState | AcademyExpectedState;
}

function fail(message: string): never {
  throw new Error(message);
}

function assertExactId(value: unknown, field: string): asserts value is string {
  if (!isExactDocumentId(value)) fail(`${field} must be an exact Firestore document ID.`);
}

function assertPresentationAndActor(
  input: AccessControlMutationInput,
  dependencies: AccessControlMutationDependencies,
): void {
  if (input.presentationModeActive !== false) {
    fail("Direct access management is unavailable while Support or Work As is active.");
  }
  if (dependencies.getAuthenticatedUid() !== input.actorUid) {
    fail("Authenticated Firebase actor does not match the requested SuperAdmin actor.");
  }
}

function assertActiveSuperAdmin(
  actorUid: string,
  snapshot: AccessControlDocumentSnapshot,
): void {
  const actor = snapshot.data;
  if (!snapshot.exists || !actor) fail("The authoritative SuperAdmin account no longer exists.");
  if (actor.uid !== undefined && actor.uid !== actorUid) {
    fail("The authoritative SuperAdmin account UID does not match its document.");
  }
  if (!isActivePrivilegedActor({ id: actorUid, role: actor.role, status: actor.status }, ["SUPERADMIN"])) {
    fail("Direct access management requires an active authenticated SUPERADMIN.");
  }
}

function assertEligibleTarget(targetUid: string, actorUid: string, snapshot: AccessControlDocumentSnapshot): void {
  const target = snapshot.data;
  if (!snapshot.exists || !target) fail("The selected target account no longer exists.");
  if (target.uid !== undefined && target.uid !== targetUid) fail("The target account UID does not match its document.");
  if (targetUid === actorUid || target.role === "SUPERADMIN" || !isExplicitlyActiveAccountStatus(target.status)) {
    fail("The target account must be ACTIVE and must not be a SUPERADMIN.");
  }
}

function assertActiveOrganization(
  type: SuperAdminAccessOrganizationType,
  snapshot: AccessControlDocumentSnapshot,
): void {
  if (!snapshot.exists || !snapshot.data) fail("The selected organization no longer exists.");
  if (type === "PRO_CLUB" && snapshot.data.status !== "ACTIVE") {
    fail("Direct Pro Club access requires an ACTIVE organization.");
  }
  if (
    type === "ACADEMY" &&
    snapshot.data.status !== undefined &&
    snapshot.data.status !== "ACTIVE" &&
    snapshot.data.status !== "Active"
  ) {
    fail("Direct Academy access requires an ACTIVE organization.");
  }
}

function assertCanonicalAuditState(
  type: SuperAdminAccessOrganizationType,
  organizationId: string,
  targetUid: string,
  snapshot: AccessControlAuditStateSnapshot,
): void {
  if (!snapshot.exists) return;
  const state = snapshot.data;
  if (
    !state ||
    !exactKeys(state, [
      "schemaVersion",
      "organizationType",
      "organizationId",
      "targetUid",
      "lastActionId",
      "updatedAt",
      "updatedBy",
    ]) ||
    state.schemaVersion !== 1 ||
    state.organizationType !== type ||
    state.organizationId !== organizationId ||
    state.targetUid !== targetUid ||
    !isExactDocumentId(state.lastActionId) ||
    !isExactDocumentId(state.updatedBy)
  ) {
    fail("The access audit pointer is malformed and requires manual review.");
  }
}

function ownRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue);
  const record = ownRecord(value);
  if (!record) return value;
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortedValue(record[key])]));
}

function statesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortedValue(left)) === JSON.stringify(sortedValue(right));
}

function assertPreviewStillCurrent(
  expectedActionType: string | null,
  currentActionType: string | null,
  expectedState: unknown,
  currentState: unknown,
): void {
  if (expectedActionType !== currentActionType || !statesEqual(expectedState, currentState)) {
    fail("Access changed after preview. Reload the current access state before confirming.");
  }
}

function confirmedAction(
  decisionAction: string | null,
  expectedAction: string | null,
  confirmedAction: string | null | undefined,
): void {
  if (decisionAction === null) {
    if (expectedAction !== null) fail("Access changed after preview. Reload the current access state before confirming.");
    return;
  }
  if (expectedAction !== decisionAction || confirmedAction !== decisionAction) {
    fail("Explicit confirmation for the current access action is required.");
  }
}

function proClubState(
  membership: AccessControlDocumentSnapshot,
  staff: AccessControlDocumentSnapshot,
  pointer: AccessControlDocumentSnapshot,
): ProClubExpectedState {
  const member = membership.data;
  const staffData = staff.data;
  const pointerData = pointer.data;
  if ((membership.exists && !member) || (staff.exists && !staffData) || (pointer.exists && !pointerData)) {
    fail("The current Pro Club access record is malformed.");
  }
  if (pointerData && (!exactKeys(pointerData, ["schemaVersion", "clubId"]) || pointerData.schemaVersion !== 1)) {
    fail("The Pro Club discovery pointer is malformed and requires manual review.");
  }
  return {
    membership: member ? {
      authorizationRole: String(member.authorizationRole),
      status: String(member.status),
    } : null,
    staff: staffData ? {
      staffRole: String(staffData.staffRole),
      status: String(staffData.status),
    } : null,
    pointerExists: pointer.exists,
  };
}

function assertProClubPointerConsistency(
  state: ProClubExpectedState,
  pointer: AccessControlDocumentSnapshot,
  clubId: string,
): void {
  if (pointer.exists && pointer.data?.clubId !== clubId) {
    fail("The Pro Club discovery pointer identifies another organization.");
  }
  const hasRelationship = state.membership !== null || state.staff !== null;
  if (hasRelationship !== pointer.exists) {
    fail("The Pro Club membership, staff assignment, and discovery pointer are incomplete; manual review is required.");
  }
}

function academyState(
  membership: AccessControlDocumentSnapshot,
  specialty: AccessControlDocumentSnapshot,
  academyId: string,
  targetUid: string,
): AcademyExpectedState {
  const data = membership.data;
  const specialtyData = specialty.data;
  if ((membership.exists && !data) || (specialty.exists && !specialtyData)) {
    fail("The current Academy access record is malformed.");
  }
  if (data && (data.userId !== targetUid || data.academyId !== academyId)) {
    fail("The Academy membership identity does not match its canonical document path.");
  }
  const currentMembership = data ? {
    role: String(data.role),
    status: String(data.status),
    source: String(data.source),
    joinedBy: String(data.joinedBy),
    ...(Object.hasOwn(data, "approvalClaimId") ? { approvalClaimId: String(data.approvalClaimId) } : {}),
  } : null;
  const currentSpecialty = specialtyData ? {
    specialty: String(specialtyData.specialty),
    status: String(specialtyData.status),
  } : null;
  return { membership: currentMembership, specialty: currentSpecialty };
}

function executeProClubMutation(
  input: Extract<AccessControlMutationInput, { organizationType: "PRO_CLUB" }>,
  transaction: AccessControlTransaction,
  dependencies: AccessControlMutationDependencies,
  snapshots: {
    membership: AccessControlDocumentSnapshot;
    staff: AccessControlDocumentSnapshot;
    pointer: AccessControlDocumentSnapshot;
  },
): AccessControlMutationResult {
  const previousState = proClubState(snapshots.membership, snapshots.staff, snapshots.pointer);
  assertProClubPointerConsistency(previousState, snapshots.pointer, input.organizationId);
  const decision = resolveProClubAccessState(
    snapshots.membership.exists ? snapshots.membership.data : null,
    snapshots.staff.exists ? snapshots.staff.data : null,
    input.desiredStaffRole,
  );
  if (decision.state === "MANUAL_REVIEW") fail(decision.reason ?? "Pro Club access requires manual review.");
  assertPreviewStillCurrent(input.expectedActionType, decision.actionType, input.expectedState, previousState);
  confirmedAction(decision.actionType, input.expectedActionType, input.confirmedActionType);
  if (decision.actionType === null) {
    return { actionId: null, actionType: null, decisionState: decision.state, previousState, newState: previousState };
  }

  const at = dependencies.timestamp();
  const clubId = input.organizationId;
  const targetUid = input.targetUid;
  if (decision.state === "ASSIGN") {
    transaction.createProClubMembership(clubId, targetUid, { authorizationRole: "MEMBER", status: "ACTIVE" });
    transaction.createProClubStaff(clubId, targetUid, { staffRole: input.desiredStaffRole, status: "ACTIVE" });
    transaction.createProClubPointer(targetUid, clubId, { schemaVersion: 1, clubId });
  } else if (decision.state === "ASSIGN_STAFF_ROLE") {
    transaction.createProClubStaff(clubId, targetUid, { staffRole: input.desiredStaffRole, status: "ACTIVE" });
  } else if (decision.state === "CHANGE_ROLE") {
    transaction.updateProClubStaff(clubId, targetUid, { staffRole: input.desiredStaffRole });
  } else if (decision.state === "REACTIVATE") {
    if (previousState.membership?.status === "INACTIVE") {
      transaction.updateProClubMembership(clubId, targetUid, { status: "ACTIVE" });
    }
    if (previousState.staff === null) {
      transaction.createProClubStaff(clubId, targetUid, { staffRole: input.desiredStaffRole, status: "ACTIVE" });
    } else {
      transaction.updateProClubStaff(clubId, targetUid, { staffRole: input.desiredStaffRole, status: "ACTIVE" });
    }
  }

  const newState: ProClubExpectedState = {
    membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
    staff: { staffRole: input.desiredStaffRole, status: "ACTIVE" },
    pointerExists: true,
  };
  const actionId = dependencies.newActionId();
  transaction.writeAccessControlAuditState("PRO_CLUB", clubId, targetUid, {
    schemaVersion: 1,
    organizationType: "PRO_CLUB",
    organizationId: clubId,
    targetUid,
    lastActionId: actionId,
    updatedAt: at,
    updatedBy: input.actorUid,
  });
  transaction.createAccessAudit(actionId, {
    schemaVersion: 1,
    actionId,
    actionType: decision.actionType,
    actorUid: input.actorUid,
    targetUid,
    organizationType: "PRO_CLUB",
    organizationId: clubId,
    previousState: { membership: previousState.membership, staff: previousState.staff },
    newState: { membership: newState.membership, staff: newState.staff },
    createdAt: at,
  });
  return { actionId, actionType: decision.actionType, decisionState: decision.state, previousState, newState };
}

function executeAcademyMutation(
  input: Extract<AccessControlMutationInput, { organizationType: "ACADEMY" }>,
  transaction: AccessControlTransaction,
  dependencies: AccessControlMutationDependencies,
  snapshots: { membership: AccessControlDocumentSnapshot; specialty: AccessControlDocumentSnapshot },
): AccessControlMutationResult {
  const previousState = academyState(snapshots.membership, snapshots.specialty, input.organizationId, input.targetUid);
  const decision = resolveAcademyAccessState(
    snapshots.membership.exists ? snapshots.membership.data : null,
    snapshots.specialty.exists ? snapshots.specialty.data : null,
    input.desiredAcademyRole,
    input.desiredFitnessCoach,
  );
  if (decision.state === "MANUAL_REVIEW") fail(decision.reason ?? "Academy access requires manual review.");
  assertPreviewStillCurrent(input.expectedActionType, decision.actionType, input.expectedState, previousState);
  confirmedAction(decision.actionType, input.expectedActionType, input.confirmedActionType);
  if (decision.actionType === null) {
    return { actionId: null, actionType: null, decisionState: decision.state, previousState, newState: previousState };
  }

  const at = dependencies.timestamp();
  const academyId = input.organizationId;
  const targetUid = input.targetUid;
  if (!snapshots.membership.exists) {
    transaction.createAcademyMembership(academyId, targetUid, {
      userId: targetUid,
      academyId,
      role: input.desiredAcademyRole,
      status: "ACTIVE",
      source: "SUPERADMIN_ASSIGNMENT",
      joinedAt: at,
      joinedBy: input.actorUid,
      updatedAt: at,
    });
  } else if (
    snapshots.membership.data!.status === "SUSPENDED" ||
    snapshots.membership.data!.role !== input.desiredAcademyRole
  ) {
    const membership = snapshots.membership.data!;
    const patch: DocumentData = { updatedAt: at };
    if (membership.status === "SUSPENDED") patch.status = "ACTIVE";
    if (membership.role !== input.desiredAcademyRole) patch.role = input.desiredAcademyRole;
    transaction.updateAcademyMembership(academyId, targetUid, patch);
  }

  if (input.desiredFitnessCoach && previousState.specialty?.status !== "ACTIVE") {
    const projectedMembership = {
      userId: targetUid,
      academyId,
      role: input.desiredAcademyRole,
      status: "ACTIVE",
    };
    const transition = validateFitnessCoachTransition(
      "ACTIVE",
      projectedMembership,
      targetUid,
      academyId,
      snapshots.specialty.exists ? snapshots.specialty.data : null,
    );
    if (transition === "UPDATE") {
      transaction.updateAcademySpecialty(academyId, targetUid, {
        status: "ACTIVE",
        updatedAt: at,
        updatedBy: input.actorUid,
      });
    } else {
      transaction.createAcademySpecialty(academyId, targetUid, {
        schemaVersion: 1,
        specialty: "FITNESS_COACH",
        status: "ACTIVE",
        createdAt: at,
        createdBy: input.actorUid,
        updatedAt: at,
        updatedBy: input.actorUid,
      });
    }
  }

  const newState: AcademyExpectedState = {
    membership: {
      role: input.desiredAcademyRole,
      status: "ACTIVE",
      source: previousState.membership?.source ?? "SUPERADMIN_ASSIGNMENT",
      joinedBy: previousState.membership?.joinedBy ?? input.actorUid,
      ...(previousState.membership?.approvalClaimId ? { approvalClaimId: previousState.membership.approvalClaimId } : {}),
    },
    specialty: input.desiredFitnessCoach
      ? { specialty: "FITNESS_COACH", status: "ACTIVE" }
      : previousState.specialty,
  };
  const actionId = dependencies.newActionId();
  transaction.writeAccessControlAuditState("ACADEMY", academyId, targetUid, {
    schemaVersion: 1,
    organizationType: "ACADEMY",
    organizationId: academyId,
    targetUid,
    lastActionId: actionId,
    updatedAt: at,
    updatedBy: input.actorUid,
  });
  transaction.createAccessAudit(actionId, {
    schemaVersion: 1,
    actionId,
    actionType: decision.actionType,
    actorUid: input.actorUid,
    targetUid,
    organizationType: "ACADEMY",
    organizationId: academyId,
    previousState,
    newState,
    createdAt: at,
  });
  return { actionId, actionType: decision.actionType, decisionState: decision.state, previousState, newState };
}

export async function mutateSuperAdminAccessAtomically(
  input: AccessControlMutationInput,
  dependencies: AccessControlMutationDependencies = FIRESTORE_DEPENDENCIES,
): Promise<AccessControlMutationResult> {
  assertExactId(input.actorUid, "actorUid");
  assertExactId(input.targetUid, "targetUid");
  assertExactId(input.organizationId, "organizationId");
  if (input.actorUid === input.targetUid) fail("A SuperAdmin cannot assign organization access to themselves here.");
  assertPresentationAndActor(input, dependencies);

  return dependencies.runAccessTransaction(async (transaction) => {
    const [actorSnapshot, targetSnapshot, auditStateSnapshot] = await Promise.all([
      transaction.getUser(input.actorUid),
      transaction.getUser(input.targetUid),
      transaction.getAccessControlAuditState(input.organizationType, input.organizationId, input.targetUid),
    ]);
    assertPresentationAndActor(input, dependencies);
    assertActiveSuperAdmin(input.actorUid, actorSnapshot);
    assertEligibleTarget(input.targetUid, input.actorUid, targetSnapshot);
    assertCanonicalAuditState(input.organizationType, input.organizationId, input.targetUid, auditStateSnapshot);

    if (input.organizationType === "PRO_CLUB") {
      // The control-plane selector uses the SuperAdmin-only collection list.
      // The commit Rules re-read the canonical club document and require ACTIVE.
      const [membership, staff, pointer] = await Promise.all([
        transaction.getProClubMembership(input.organizationId, input.targetUid),
        transaction.getProClubStaff(input.organizationId, input.targetUid),
        transaction.getProClubPointer(input.targetUid, input.organizationId),
      ]);
      assertPresentationAndActor(input, dependencies);
      return executeProClubMutation(input, transaction, dependencies, { membership, staff, pointer });
    }

    const organizationSnapshot = await transaction.getOrganization("ACADEMY", input.organizationId);
    assertActiveOrganization("ACADEMY", organizationSnapshot);
    const [membership, specialty] = await Promise.all([
      transaction.getAcademyMembership(input.organizationId, input.targetUid),
      transaction.getAcademySpecialty(input.organizationId, input.targetUid),
    ]);
    assertPresentationAndActor(input, dependencies);
    return executeAcademyMutation(input, transaction, dependencies, { membership, specialty });
  });
}

function createFirestoreDependencies(firestore: Firestore): AccessControlMutationDependencies {
  const userRef = (uid: string) => doc(firestore, "users", uid);
  const orgRef = (type: SuperAdminAccessOrganizationType, id: string) =>
    doc(firestore, type === "ACADEMY" ? "academies" : "proClubs", id);
  return {
    getAuthenticatedUid: () => auth.currentUser?.uid ?? null,
    timestamp: () => serverTimestamp(),
    newActionId: () => doc(collection(firestore, "superAdminAccessControlAudits")).id,
    async runAccessTransaction(operation) {
      return runTransaction(firestore, async (transaction) => {
        const read = async (reference: ReturnType<typeof doc>): Promise<AccessControlDocumentSnapshot> => {
          const snapshot = await transaction.get(reference);
          return {
            exists: snapshot.exists(),
            data: snapshot.exists() ? snapshot.data() as Record<string, unknown> : undefined,
          };
        };
        return operation({
          getUser: (uid) => read(userRef(uid)),
          getOrganization: (type, id) => read(orgRef(type, id)),
          getAcademyMembership: (id, uid) => read(doc(firestore, "academies", id, "members", uid)),
          getAcademySpecialty: (id, uid) => read(doc(firestore, "academies", id, "staffSpecialties", uid)),
          getProClubMembership: (id, uid) => read(doc(firestore, "proClubs", id, "members", uid)),
          getProClubStaff: (id, uid) => read(doc(firestore, "proClubs", id, "staff", uid)),
          getProClubPointer: (uid, id) => read(doc(firestore, "users", uid, "proClubMemberships", id)),
          getAccessControlAuditState: (type, id, uid) => read(doc(firestore, "superAdminAccessControlState", type, "organizations", id, "targets", uid)),
          createAcademyMembership: (id, uid, data) => transaction.set(doc(firestore, "academies", id, "members", uid), data),
          updateAcademyMembership: (id, uid, patch) => transaction.update(doc(firestore, "academies", id, "members", uid), patch),
          createAcademySpecialty: (id, uid, data) => transaction.set(doc(firestore, "academies", id, "staffSpecialties", uid), data),
          updateAcademySpecialty: (id, uid, patch) => transaction.update(doc(firestore, "academies", id, "staffSpecialties", uid), patch),
          createProClubMembership: (id, uid, data) => transaction.set(doc(firestore, "proClubs", id, "members", uid), data),
          updateProClubMembership: (id, uid, patch) => transaction.update(doc(firestore, "proClubs", id, "members", uid), patch),
          createProClubStaff: (id, uid, data) => transaction.set(doc(firestore, "proClubs", id, "staff", uid), data),
          updateProClubStaff: (id, uid, patch) => transaction.update(doc(firestore, "proClubs", id, "staff", uid), patch),
          createProClubPointer: (uid, id, data) => transaction.set(doc(firestore, "users", uid, "proClubMemberships", id), data),
          writeAccessControlAuditState: (type, id, uid, data) => transaction.set(doc(firestore, "superAdminAccessControlState", type, "organizations", id, "targets", uid), data),
          createAccessAudit: (actionId, data) => transaction.set(doc(firestore, "superAdminAccessControlAudits", actionId), data),
        });
      });
    },
  };
}

const FIRESTORE_DEPENDENCIES = createFirestoreDependencies(db);
