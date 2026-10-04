import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch, type DocumentData, type Firestore } from "firebase/firestore";

const PROJECT = "demo-superadmin-unified-access-control-v1";
const SUPERADMIN = "superadmin-a";
const INACTIVE_SUPERADMIN = "superadmin-inactive";
const USER = "coach-a";
const USER_2 = "coach-b";
const SUPERADMIN_TARGET = "superadmin-target";
const CLUB = "club-a";
const ACADEMY = "academy-a";
let environment: RulesTestEnvironment;

function db(uid: string): Firestore {
  return environment.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function statePath(type: "PRO_CLUB" | "ACADEMY", organizationId: string, targetUid: string) {
  return `superAdminAccessControlState/${type}/organizations/${organizationId}/targets/${targetUid}`;
}

function seedUser(uid: string, role = "USER", status = "Active"): DocumentData {
  return { uid, role, status, email: `${uid}@example.test` };
}

function auditState(type: "PRO_CLUB" | "ACADEMY", organizationId: string, targetUid: string, actionId: string) {
  return {
    schemaVersion: 1,
    organizationType: type,
    organizationId,
    targetUid,
    lastActionId: actionId,
    updatedAt: serverTimestamp(),
    updatedBy: SUPERADMIN,
  };
}

function proClubAudit(
  actionId: string,
  targetUid: string,
  previousState: DocumentData,
  newState: DocumentData,
  actorUid = SUPERADMIN,
  actionType?: string,
) {
  return {
    schemaVersion: 1,
    actionId,
    actionType: actionType ?? (previousState.membership === null && previousState.staff === null
      ? "ACCESS_ASSIGNED"
      : previousState.staff === null ? "STAFF_ROLE_ASSIGNED" : "STAFF_ROLE_CHANGED"),
    actorUid,
    targetUid,
    organizationType: "PRO_CLUB",
    organizationId: CLUB,
    previousState,
    newState,
    createdAt: serverTimestamp(),
  };
}

function academyAudit(actionId: string, targetUid: string, previousState: DocumentData, newState: DocumentData) {
  return {
    schemaVersion: 1,
    actionId,
    actionType: previousState.membership === null ? "ACADEMY_MEMBERSHIP_ASSIGNED" : "ACADEMY_ROLE_CHANGED",
    actorUid: SUPERADMIN,
    targetUid,
    organizationType: "ACADEMY",
    organizationId: ACADEMY,
    previousState,
    newState,
    createdAt: serverTimestamp(),
  };
}

async function seedBase() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await Promise.all([
      setDoc(doc(firestore, `users/${SUPERADMIN}`), seedUser(SUPERADMIN, "SUPERADMIN")),
      setDoc(doc(firestore, `users/${INACTIVE_SUPERADMIN}`), seedUser(INACTIVE_SUPERADMIN, "SUPERADMIN", "Inactive")),
      setDoc(doc(firestore, `users/${USER}`), seedUser(USER)),
      setDoc(doc(firestore, `users/${USER_2}`), seedUser(USER_2)),
      setDoc(doc(firestore, `users/${SUPERADMIN_TARGET}`), seedUser(SUPERADMIN_TARGET, "SUPERADMIN")),
      setDoc(doc(firestore, `proClubs/${CLUB}`), { name: "TNSU Lampang", level: "T2", status: "ACTIVE" }),
      setDoc(doc(firestore, "proClubs/club-inactive"), { name: "Inactive Club", level: "T2", status: "INACTIVE" }),
      setDoc(doc(firestore, `academies/${ACADEMY}`), { name: "Talumball Academy" }),
    ]);
  });
}

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(emulatorHost, "Rules tests must run through the Firestore Emulator.");
  const separator = emulatorHost.lastIndexOf(":");
  const host = emulatorHost.slice(0, separator);
  const port = Number(emulatorHost.slice(separator + 1));
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { host, port, rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seedBase();
});

after(async () => environment?.cleanup());

async function commitProClubAssignment(options: {
  actorUid?: string;
  targetUid?: string;
  includeAudit?: boolean;
  includeMembership?: boolean;
  includeStaff?: boolean;
  includePointer?: boolean;
  authorizationRole?: string;
  role?: string;
  organizationId?: string;
  previousState?: DocumentData;
  actionType?: string;
} = {}) {
  const actorUid = options.actorUid ?? SUPERADMIN;
  const targetUid = options.targetUid ?? USER;
  const organizationId = options.organizationId ?? CLUB;
  const actionId = "direct-action-1";
  const staffRole = options.role ?? "HEAD_COACH";
  const previousState = options.previousState ?? { membership: null, staff: null };
  const newMember = { authorizationRole: options.authorizationRole ?? "MEMBER", status: "ACTIVE" };
  const newStaff = { staffRole, status: "ACTIVE" };
  const newState = { membership: newMember, staff: newStaff };
  const firestore = db(actorUid);
  const batch = writeBatch(firestore);
  if (options.includeMembership !== false) {
    batch.set(doc(firestore, `proClubs/${organizationId}/members/${targetUid}`), newMember);
  }
  if (options.includeStaff !== false) batch.set(doc(firestore, `proClubs/${organizationId}/staff/${targetUid}`), newStaff);
  if (options.includePointer !== false) {
    batch.set(doc(firestore, `users/${targetUid}/proClubMemberships/${organizationId}`), { schemaVersion: 1, clubId: organizationId });
  }
  if (options.includeAudit !== false) {
    batch.set(doc(firestore, statePath("PRO_CLUB", organizationId, targetUid)), auditState("PRO_CLUB", organizationId, targetUid, actionId));
    batch.set(doc(firestore, `superAdminAccessControlAudits/${actionId}`), {
      ...proClubAudit(actionId, targetUid, previousState, newState, actorUid, options.actionType),
      organizationId,
    });
  }
  await batch.commit();
}

test("active SuperAdmin directly creates MEMBER, staff, pointer, state pointer, and immutable audit atomically", async () => {
  await assertSucceeds(commitProClubAssignment());
  const firestore = db(SUPERADMIN);
  assert.equal((await getDoc(doc(firestore, `proClubs/${CLUB}/members/${USER}`))).data()?.authorizationRole, "MEMBER");
  assert.equal((await getDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`))).data()?.staffRole, "HEAD_COACH");
  assert.equal((await getDoc(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`))).data()?.clubId, CLUB);
  assert.equal((await getDoc(doc(firestore, "superAdminAccessControlAudits/direct-action-1"))).data()?.actionType, "ACCESS_ASSIGNED");
});

test("direct Pro Club bundle is denied when audit is omitted or any relationship half is missing", async () => {
  await assertFails(commitProClubAssignment({ includeAudit: false }));
  await assertFails(commitProClubAssignment({ includeStaff: false }));
  assert.equal(await getDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}/members/${USER}`)).then((snapshot) => snapshot.exists()), false);
});

test("ACCESS_ASSIGNED cannot adopt a pre-existing orphan discovery pointer", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${USER}/proClubMemberships/${CLUB}`), { schemaVersion: 1, clubId: CLUB });
  });
  await assertFails(commitProClubAssignment({ includePointer: false }));
});

test("existing MEMBER staff assignment and reactivation cannot repair a missing pointer", async () => {
  const activeMember = { authorizationRole: "MEMBER", status: "ACTIVE" };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `proClubs/${CLUB}/members/${USER}`), activeMember);
  });
  await assertFails(commitProClubAssignment({
    actionType: "STAFF_ROLE_ASSIGNED",
    includeMembership: false,
    previousState: { membership: activeMember, staff: null },
  }));

  await environment.clearFirestore();
  await seedBase();
  const inactiveMember = { authorizationRole: "MEMBER", status: "INACTIVE" };
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `proClubs/${CLUB}/members/${USER}`), inactiveMember);
  });
  await assertFails(commitProClubAssignment({
    actionType: "ACCESS_REACTIVATED",
    previousState: { membership: inactiveMember, staff: null },
  }));
});

test("reactivation requires an existing MEMBER relationship and only inactive staff state", async () => {
  const inactiveMember = { authorizationRole: "MEMBER", status: "INACTIVE" };
  const inactiveStaff = { staffRole: "HEAD_COACH", status: "INACTIVE" };
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `proClubs/${CLUB}/members/${USER}`), inactiveMember);
    await setDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`), inactiveStaff);
    await setDoc(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`), { schemaVersion: 1, clubId: CLUB });
  });

  await assertSucceeds(commitProClubAssignment({
    actionType: "ACCESS_REACTIVATED",
    includePointer: false,
    previousState: { membership: inactiveMember, staff: inactiveStaff },
  }));

  await environment.clearFirestore();
  await seedBase();
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, `proClubs/${CLUB}/staff/${USER}`), inactiveStaff);
    await setDoc(doc(firestore, `users/${USER}/proClubMemberships/${CLUB}`), { schemaVersion: 1, clubId: CLUB });
  });

  await assertFails(commitProClubAssignment({
    actionType: "ACCESS_REACTIVATED",
    includePointer: false,
    previousState: { membership: null, staff: inactiveStaff },
  }));
  assert.equal(await getDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}/members/${USER}`)).then((snapshot) => snapshot.exists()), false);
  const retainedStaff = await getDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}/staff/${USER}`));
  assert.equal(retainedStaff.data()?.status, "INACTIVE");
});

test("OWNER and ADMIN membership escalation is denied by the direct staff path", async () => {
  await assertFails(commitProClubAssignment({ authorizationRole: "OWNER" }));
  await assertFails(commitProClubAssignment({ authorizationRole: "ADMIN" }));
});

test("normal, inactive, and presentation-only actors cannot use direct Pro Club control", async () => {
  await assertFails(commitProClubAssignment({ actorUid: USER_2 }));
  await assertFails(commitProClubAssignment({ actorUid: INACTIVE_SUPERADMIN }));
  // Client presentation flags are not authority; request.auth still resolves to USER_2.
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${USER_2}`), { ...seedUser(USER_2), supportPresentation: true });
  });
  await assertFails(commitProClubAssignment({ actorUid: USER_2 }));
});

test("inactive, missing, or SuperAdmin targets and inactive clubs are rejected", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users/inactive-target"), seedUser("inactive-target", "USER", "Inactive"));
  });
  await assertFails(commitProClubAssignment({ targetUid: "inactive-target" }));
  await assertFails(commitProClubAssignment({ targetUid: SUPERADMIN_TARGET }));
  await assertFails(commitProClubAssignment({ targetUid: "missing-target" }));
  await assertFails(commitProClubAssignment({ organizationId: "club-inactive" }));
});

test("SuperAdmin can list Pro Clubs and get selected target relationship documents without root get bypass", async () => {
  const clubs = await getDocs(collection(db(SUPERADMIN), "proClubs"));
  assert.equal(clubs.docs.some((club) => club.id === CLUB), true);
  await assertFails(getDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}`)));
  await assertSucceeds(getDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}/members/${USER}`)));
  await assertSucceeds(getDoc(doc(db(SUPERADMIN), `proClubs/${CLUB}/staff/${USER}`)));
  await assertSucceeds(getDoc(doc(db(SUPERADMIN), `users/${USER}/proClubMemberships/${CLUB}`)));
  await assertFails(getDoc(doc(db(USER_2), `proClubs/${CLUB}/members/${USER}`)));
});

test("direct Academy assignment uses canonical schema and SUPERADMIN_ASSIGNMENT provenance with audit", async () => {
  const actionId = "academy-action-1";
  const previousState = { membership: null, specialty: null };
  const membership = {
    userId: USER,
    academyId: ACADEMY,
    role: "COACH",
    status: "ACTIVE",
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: serverTimestamp(),
    joinedBy: SUPERADMIN,
    updatedAt: serverTimestamp(),
  };
  const specialty = {
    schemaVersion: 1,
    specialty: "FITNESS_COACH",
    status: "ACTIVE",
    createdAt: serverTimestamp(),
    createdBy: SUPERADMIN,
    updatedAt: serverTimestamp(),
    updatedBy: SUPERADMIN,
  };
  const newState = {
    membership: { role: "COACH", status: "ACTIVE", source: "SUPERADMIN_ASSIGNMENT", joinedBy: SUPERADMIN },
    specialty: { specialty: "FITNESS_COACH", status: "ACTIVE" },
  };
  const firestore = db(SUPERADMIN);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, `academies/${ACADEMY}/members/${USER}`), membership);
  batch.set(doc(firestore, `academies/${ACADEMY}/staffSpecialties/${USER}`), specialty);
  batch.set(doc(firestore, statePath("ACADEMY", ACADEMY, USER)), auditState("ACADEMY", ACADEMY, USER, actionId));
  batch.set(doc(firestore, `superAdminAccessControlAudits/${actionId}`), academyAudit(actionId, USER, previousState, newState));
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(doc(db(SUPERADMIN), `academies/${ACADEMY}/members/${USER}`))).data()?.source, "SUPERADMIN_ASSIGNMENT");
  assert.equal((await getDoc(doc(db(SUPERADMIN), `academies/${ACADEMY}/staffSpecialties/${USER}`))).data()?.specialty, "FITNESS_COACH");
});

test("direct Academy assignment is denied when the Academy has an explicit inactive status", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `academies/${ACADEMY}`), { name: "Talumball Academy", status: "INACTIVE" });
  });

  const actionId = "inactive-academy-action";
  const membership = {
    userId: USER,
    academyId: ACADEMY,
    role: "COACH",
    status: "ACTIVE",
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: serverTimestamp(),
    joinedBy: SUPERADMIN,
    updatedAt: serverTimestamp(),
  };
  const previousState = { membership: null, specialty: null };
  const newState = {
    membership: { role: "COACH", status: "ACTIVE", source: "SUPERADMIN_ASSIGNMENT", joinedBy: SUPERADMIN },
    specialty: null,
  };
  const firestore = db(SUPERADMIN);
  const batch = writeBatch(firestore);
  batch.set(doc(firestore, `academies/${ACADEMY}/members/${USER}`), membership);
  batch.set(doc(firestore, statePath("ACADEMY", ACADEMY, USER)), auditState("ACADEMY", ACADEMY, USER, actionId));
  batch.set(doc(firestore, `superAdminAccessControlAudits/${actionId}`), academyAudit(actionId, USER, previousState, newState));
  await assertFails(batch.commit());
  assert.equal(await getDoc(doc(firestore, `academies/${ACADEMY}/members/${USER}`)).then((snapshot) => snapshot.exists()), false);
});

test("Academy role changes reject malformed prior membership and specialty records", async () => {
  async function attemptRoleChange(options: { previousRole?: string; extraMembershipField?: boolean; extraSpecialtyField?: boolean }) {
    await environment.clearFirestore();
    await seedBase();
    const priorMembership: DocumentData = {
      userId: USER,
      academyId: ACADEMY,
      role: options.previousRole ?? "COACH",
      status: "ACTIVE",
      source: "SUPERADMIN_ASSIGNMENT",
      joinedAt: serverTimestamp(),
      joinedBy: SUPERADMIN,
      updatedAt: serverTimestamp(),
      ...(options.extraMembershipField ? { unexpectedLegacyField: true } : {}),
    };
    const priorSpecialty: DocumentData | null = options.extraSpecialtyField
      ? {
          schemaVersion: 1,
          specialty: "FITNESS_COACH",
          status: "INACTIVE",
          createdAt: serverTimestamp(),
          createdBy: SUPERADMIN,
          updatedAt: serverTimestamp(),
          updatedBy: SUPERADMIN,
          unexpectedLegacyField: true,
        }
      : null;

    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, `academies/${ACADEMY}/members/${USER}`), priorMembership);
      if (priorSpecialty) await setDoc(doc(firestore, `academies/${ACADEMY}/staffSpecialties/${USER}`), priorSpecialty);
    });

    const firestore = db(SUPERADMIN);
    const previousMembershipSnapshot = await getDoc(doc(firestore, `academies/${ACADEMY}/members/${USER}`));
    const previousMembership = previousMembershipSnapshot.data()!;
    const previousSpecialtySnapshot = await getDoc(doc(firestore, `academies/${ACADEMY}/staffSpecialties/${USER}`));
    const previousSpecialty = previousSpecialtySnapshot.exists() ? previousSpecialtySnapshot.data()! : null;
    const nextMembership = {
      userId: USER,
      academyId: ACADEMY,
      role: "ADMIN",
      status: previousMembership.status,
      source: previousMembership.source,
      ...(previousMembership.approvalClaimId !== undefined ? { approvalClaimId: previousMembership.approvalClaimId } : {}),
      joinedAt: previousMembership.joinedAt,
      joinedBy: previousMembership.joinedBy,
      updatedAt: serverTimestamp(),
    };
    const membershipProjection = (membership: DocumentData) => ({
      role: membership.role,
      status: membership.status,
      source: membership.source,
      joinedBy: membership.joinedBy,
      approvalClaimId: membership.approvalClaimId ?? null,
    });
    const specialtyProjection = (specialty: DocumentData | null) => specialty
      ? { specialty: specialty.specialty, status: specialty.status }
      : null;
    const previousState = {
      membership: membershipProjection(previousMembership),
      specialty: specialtyProjection(previousSpecialty),
    };
    const newState = {
      membership: membershipProjection(nextMembership),
      specialty: specialtyProjection(previousSpecialty),
    };
    const actionId = "malformed-academy-role-change";
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, `academies/${ACADEMY}/members/${USER}`), nextMembership);
    batch.set(doc(firestore, statePath("ACADEMY", ACADEMY, USER)), auditState("ACADEMY", ACADEMY, USER, actionId));
    batch.set(doc(firestore, `superAdminAccessControlAudits/${actionId}`), academyAudit(actionId, USER, previousState, newState));
    await assertFails(batch.commit());
  }

  await attemptRoleChange({ previousRole: "OWNER" });
  await attemptRoleChange({ extraMembershipField: true });
  await attemptRoleChange({ extraSpecialtyField: true });
});

test("Academy direct assignment without matching audit is denied and does not create membership", async () => {
  const membership = {
    userId: USER,
    academyId: ACADEMY,
    role: "ADMIN",
    status: "ACTIVE",
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: serverTimestamp(),
    joinedBy: SUPERADMIN,
    updatedAt: serverTimestamp(),
  };
  await assertFails(setDoc(doc(db(SUPERADMIN), `academies/${ACADEMY}/members/${USER}`), membership));
  assert.equal(await getDoc(doc(db(SUPERADMIN), `academies/${ACADEMY}/members/${USER}`)).then((snapshot) => snapshot.exists()), false);
});

test("an access audit cannot be reused for another target or organization", async () => {
  async function attemptReusedAudit(options: { secondAcademy?: boolean; secondTarget?: boolean }) {
    await environment.clearFirestore();
    await seedBase();
    const secondAcademy = "academy-b";
    const secondTarget = "inactive-target";
    await environment.withSecurityRulesDisabled(async (context) => {
      if (options.secondAcademy) {
        await setDoc(doc(context.firestore(), `academies/${secondAcademy}`), { name: "Second Academy" });
      }
      if (options.secondTarget) {
        await setDoc(doc(context.firestore(), `users/${secondTarget}`), seedUser(secondTarget, "USER", "Inactive"));
      }
    });

    const actionId = options.secondAcademy ? "reused-across-orgs" : "reused-across-targets";
    const firestore = db(SUPERADMIN);
    const newMembership = {
      userId: USER,
      academyId: ACADEMY,
      role: "COACH",
      status: "ACTIVE",
      source: "SUPERADMIN_ASSIGNMENT",
      joinedAt: serverTimestamp(),
      joinedBy: SUPERADMIN,
      updatedAt: serverTimestamp(),
    };
    const previousState = { membership: null, specialty: null };
    const newState = {
      membership: { role: "COACH", status: "ACTIVE", source: "SUPERADMIN_ASSIGNMENT", joinedBy: SUPERADMIN },
      specialty: null,
    };
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, `academies/${ACADEMY}/members/${USER}`), newMembership);
    batch.set(doc(firestore, statePath("ACADEMY", ACADEMY, USER)), auditState("ACADEMY", ACADEMY, USER, actionId));
    batch.set(doc(firestore, `superAdminAccessControlAudits/${actionId}`), academyAudit(actionId, USER, previousState, newState));

    if (options.secondAcademy) {
      batch.set(doc(firestore, `academies/${secondAcademy}/members/${USER}`), {
        ...newMembership,
        academyId: secondAcademy,
      });
      batch.set(doc(firestore, statePath("ACADEMY", secondAcademy, USER)), auditState("ACADEMY", secondAcademy, USER, actionId));
    }
    if (options.secondTarget) {
      batch.set(doc(firestore, `academies/${ACADEMY}/members/${secondTarget}`), {
        ...newMembership,
        userId: secondTarget,
      });
      batch.set(doc(firestore, statePath("ACADEMY", ACADEMY, secondTarget)), auditState("ACADEMY", ACADEMY, secondTarget, actionId));
    }
    await assertFails(batch.commit());
  }

  await attemptReusedAudit({ secondAcademy: true });
  await attemptReusedAudit({ secondTarget: true });
});

test("unified access audit is append-only", async () => {
  await assertSucceeds(commitProClubAssignment());
  const reference = doc(db(SUPERADMIN), "superAdminAccessControlAudits/direct-action-1");
  await assertFails(setDoc(reference, { actionType: "FORGED" }));
  await assertFails(deleteDoc(reference));
  await assertFails(getDoc(doc(db(USER_2), "superAdminAccessControlAudits/direct-action-1")));
});
