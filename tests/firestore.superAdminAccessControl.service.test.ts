import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { cleanupAdminApp, initializeAdminServices } from "../functions/src/lib/firebaseAdmin.ts";
import {
  parseSuperAdminAccessControlRequest,
  SuperAdminAccessControlError,
  type SuperAdminAccessControlInput,
} from "../functions/src/superAdminAccessControl/core.ts";
import { createSuperAdminAccessControlService } from "../functions/src/superAdminAccessControl/service.ts";

const PROJECT_ID = "demo-futverse-superadmin-access-control";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(EMULATOR_HOST, "SAFETY GATE: Firestore Emulator is required");
assert.ok(["127.0.0.1", "localhost"].includes(EMULATOR_HOST.split(":")[0]), "SAFETY GATE: emulator must be local");
assert.ok(PROJECT_ID.startsWith("demo-"), "SAFETY GATE: demo project required");

let firestore: Firestore;
let service: ReturnType<typeof createSuperAdminAccessControlService>;

async function clearEmulator(): Promise<void> {
  const response = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.equal(response.ok, true);
}

async function seed(): Promise<void> {
  await Promise.all([
    firestore.collection("users").doc("superadmin").set({ uid: "superadmin", role: "SUPERADMIN", status: "ACTIVE" }),
    firestore.collection("users").doc("ordinary").set({ uid: "ordinary", role: "USER", status: "Active" }),
    firestore.collection("users").doc("admin-staff").set({ uid: "admin-staff", role: "ADMIN", status: "ACTIVE" }),
    firestore.collection("users").doc("inactive-superadmin").set({ role: "SUPERADMIN", status: "INACTIVE" }),
    firestore.collection("users").doc("coach").set({ uid: "coach", role: "USER", status: "ACTIVE" }),
    firestore.collection("users").doc("inactive-coach").set({ uid: "inactive-coach", role: "USER", status: "INACTIVE" }),
    firestore.collection("users").doc("target-superadmin").set({ role: "SUPERADMIN", status: "ACTIVE" }),
    firestore.collection("proClubs").doc("club").set({ name: "Club", status: "ACTIVE" }),
    firestore.collection("academies").doc("academy").set({ name: "Academy", status: "ACTIVE" }),
    firestore.doc("academies/academy/members/admin-staff").set({
      userId: "admin-staff", academyId: "academy", role: "ADMIN", status: "ACTIVE",
      source: "LEGACY_MIGRATION", joinedAt: new Date(), joinedBy: "superadmin", updatedAt: new Date(),
    }),
  ]);
}

function manageAccess(overrides: Record<string, unknown> = {}) {
  const request: Record<string, unknown> = {
    operation: "MANAGE_ACCESS",
    organizationType: "PRO_CLUB",
    organizationId: "club",
    targetUid: "coach",
    presentationModeActive: false,
    desiredStaffRole: "HEAD_COACH",
    expectedActionType: "ACCESS_ASSIGNED",
    confirmedActionType: "ACCESS_ASSIGNED",
    expectedState: { membership: null, staff: null, pointerExists: false },
    ...overrides,
  };
  if (request.organizationType === "ACADEMY") delete request.desiredStaffRole;
  return request;
}

function input(request: Record<string, unknown>, actorUid = "superadmin"): SuperAdminAccessControlInput {
  return { actorUid, request: parseSuperAdminAccessControlRequest(request) };
}

async function expectNoWrites(request: Record<string, unknown>, actorUid = "superadmin") {
  const [membersBefore, staffBefore, academyBefore, auditBefore] = await Promise.all([
    firestore.collection("proClubs").doc("club").collection("members").get(),
    firestore.collection("proClubs").doc("club").collection("staff").get(),
    firestore.collection("academies").doc("academy").collection("members").get(),
    firestore.collection("superAdminAccessControlAudits").get(),
  ]);
  await assert.rejects(service.execute(input(request, actorUid)), SuperAdminAccessControlError);
  const [membersAfter, staffAfter, academyAfter, auditAfter] = await Promise.all([
    firestore.collection("proClubs").doc("club").collection("members").get(),
    firestore.collection("proClubs").doc("club").collection("staff").get(),
    firestore.collection("academies").doc("academy").collection("members").get(),
    firestore.collection("superAdminAccessControlAudits").get(),
  ]);
  assert.equal(membersAfter.size, membersBefore.size);
  assert.equal(staffAfter.size, staffBefore.size);
  assert.equal(academyAfter.size, academyBefore.size);
  assert.equal(auditAfter.size, auditBefore.size);
}

before(async () => {
  firestore = initializeAdminServices({ projectId: PROJECT_ID, requireEmulator: true }).firestore;
  service = createSuperAdminAccessControlService({ firestore });
});
beforeEach(async () => { await clearEmulator(); await seed(); });
after(async () => cleanupAdminApp());

test("Pro Club grant atomically creates MEMBER, staff, discovery pointer, state, and server-authored audit", async () => {
  const result = await service.execute(input(manageAccess()));
  assert.equal(result.actionType, "ACCESS_ASSIGNED");
  const member = await firestore.doc("proClubs/club/members/coach").get();
  const staff = await firestore.doc("proClubs/club/staff/coach").get();
  const pointer = await firestore.doc("users/coach/proClubMemberships/club").get();
  const state = await firestore.doc("superAdminAccessControlState/PRO_CLUB/organizations/club/targets/coach").get();
  const audit = await firestore.doc(`superAdminAccessControlAudits/${result.actionId}`).get();
  assert.deepEqual(member.data(), { authorizationRole: "MEMBER", status: "ACTIVE" });
  assert.deepEqual(staff.data(), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  assert.deepEqual(pointer.data(), { schemaVersion: 1, clubId: "club" });
  assert.equal(state.data()?.lastActionId, result.actionId);
  assert.equal(audit.data()?.actorUid, "superadmin");
  assert.equal(audit.data()?.targetUid, "coach");
  assert.equal(typeof (audit.data()?.createdAt as { toDate?: unknown })?.toDate, "function");
  assert.deepEqual(audit.data()?.previousState, { membership: null, staff: null });
});

test("Pro Club role change rechecks the exact preview and audits prior and new roles", async () => {
  await firestore.doc("proClubs/club/members/coach").set({ authorizationRole: "MEMBER", status: "ACTIVE" });
  await firestore.doc("proClubs/club/staff/coach").set({ staffRole: "ANALYST", status: "ACTIVE" });
  await firestore.doc("users/coach/proClubMemberships/club").set({ schemaVersion: 1, clubId: "club" });
  const result = await service.execute(input(manageAccess({
    desiredStaffRole: "HEAD_COACH",
    expectedActionType: "STAFF_ROLE_CHANGED",
    confirmedActionType: "STAFF_ROLE_CHANGED",
    expectedState: {
      membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
      staff: { staffRole: "ANALYST", status: "ACTIVE" },
      pointerExists: true,
    },
  })));
  assert.equal(result.actionType, "STAFF_ROLE_CHANGED");
  assert.equal((await firestore.doc("proClubs/club/staff/coach").get()).data()?.staffRole, "HEAD_COACH");
  assert.deepEqual((await firestore.doc(`superAdminAccessControlAudits/${result.actionId}`).get()).data()?.previousState,
    { membership: { authorizationRole: "MEMBER", status: "ACTIVE" }, staff: { staffRole: "ANALYST", status: "ACTIVE" } });
});

test("Pro Club reactivation restores both inactive records and preserves the discovery pointer", async () => {
  await firestore.doc("proClubs/club/members/coach").set({ authorizationRole: "MEMBER", status: "INACTIVE" });
  await firestore.doc("proClubs/club/staff/coach").set({ staffRole: "ANALYST", status: "INACTIVE" });
  await firestore.doc("users/coach/proClubMemberships/club").set({ schemaVersion: 1, clubId: "club" });
  const result = await service.execute(input(manageAccess({
    desiredStaffRole: "HEAD_COACH",
    expectedActionType: "ACCESS_REACTIVATED",
    confirmedActionType: "ACCESS_REACTIVATED",
    expectedState: {
      membership: { authorizationRole: "MEMBER", status: "INACTIVE" },
      staff: { staffRole: "ANALYST", status: "INACTIVE" }, pointerExists: true,
    },
  })));
  assert.equal(result.actionType, "ACCESS_REACTIVATED");
  assert.equal((await firestore.doc("proClubs/club/members/coach").get()).data()?.status, "ACTIVE");
  assert.deepEqual((await firestore.doc("proClubs/club/staff/coach").get()).data(), { staffRole: "HEAD_COACH", status: "ACTIVE" });
  assert.equal((await firestore.doc("users/coach/proClubMemberships/club").get()).exists, true);
});

test("stale preview and unconfirmed action are rejected without writes", async () => {
  await firestore.doc("proClubs/club/members/coach").set({ authorizationRole: "MEMBER", status: "ACTIVE" });
  await firestore.doc("proClubs/club/staff/coach").set({ staffRole: "ANALYST", status: "ACTIVE" });
  await firestore.doc("users/coach/proClubMemberships/club").set({ schemaVersion: 1, clubId: "club" });
  await assert.rejects(service.execute(input(manageAccess({
    expectedState: { membership: null, staff: null, pointerExists: false },
  }))), SuperAdminAccessControlError);
  await assert.rejects(service.execute(input(manageAccess({
    desiredStaffRole: "HEAD_COACH", expectedActionType: "STAFF_ROLE_CHANGED",
    confirmedActionType: null,
    expectedState: {
      membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
      staff: { staffRole: "ANALYST", status: "ACTIVE" }, pointerExists: true,
    },
  }))), SuperAdminAccessControlError);
  assert.equal((await firestore.collection("superAdminAccessControlAudits").get()).size, 0);
});

test("Academy grant atomically writes membership provenance, specialty, state, and audit", async () => {
  const result = await service.execute(input(manageAccess({
    organizationType: "ACADEMY", organizationId: "academy", desiredStaffRole: undefined,
    desiredAcademyRole: "COACH", desiredFitnessCoach: true,
    expectedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED", confirmedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
    expectedState: { membership: null, specialty: null },
  })));
  const membership = (await firestore.doc("academies/academy/members/coach").get()).data();
  const specialty = (await firestore.doc("academies/academy/staffSpecialties/coach").get()).data();
  const audit = (await firestore.doc(`superAdminAccessControlAudits/${result.actionId}`).get()).data();
  assert.equal(membership?.source, "SUPERADMIN_ASSIGNMENT");
  assert.equal(membership?.joinedBy, "superadmin");
  assert.equal(typeof (membership?.joinedAt as { toDate?: unknown })?.toDate, "function");
  assert.equal(specialty?.specialty, "FITNESS_COACH");
  assert.equal(specialty?.createdBy, "superadmin");
  assert.equal(typeof (specialty?.createdAt as { toDate?: unknown })?.toDate, "function");
  assert.equal(audit?.actorUid, "superadmin");
  assert.deepEqual(audit?.newState, {
    membership: { role: "COACH", status: "ACTIVE", source: "SUPERADMIN_ASSIGNMENT", joinedBy: "superadmin" },
    specialty: { specialty: "FITNESS_COACH", status: "ACTIVE" },
  });
});

test("Academy role changes preserve claim provenance and Fitness Coach reactivation is audited", async () => {
  await firestore.doc("academies/academy/members/coach").set({
    userId: "coach", academyId: "academy", role: "ADMIN", status: "ACTIVE", source: "CLAIM_APPROVAL",
    approvalClaimId: "claim-1", joinedAt: new Date(), joinedBy: "superadmin", updatedAt: new Date(),
  });
  const roleResult = await service.execute(input(manageAccess({
    organizationType: "ACADEMY", organizationId: "academy", desiredAcademyRole: "COACH", desiredFitnessCoach: false,
    expectedActionType: "ACADEMY_ROLE_CHANGED", confirmedActionType: "ACADEMY_ROLE_CHANGED",
    expectedState: {
      membership: { role: "ADMIN", status: "ACTIVE", source: "CLAIM_APPROVAL", joinedBy: "superadmin", approvalClaimId: "claim-1" },
      specialty: null,
    },
  })));
  assert.equal(roleResult.actionType, "ACADEMY_ROLE_CHANGED");
  assert.equal((await firestore.doc("academies/academy/members/coach").get()).data()?.approvalClaimId, "claim-1");
  assert.equal((await firestore.doc("academies/academy/members/coach").get()).data()?.role, "COACH");

  await firestore.doc("academies/academy/staffSpecialties/coach").set({
    schemaVersion: 1, specialty: "FITNESS_COACH", status: "INACTIVE", createdAt: new Date(), createdBy: "superadmin",
    updatedAt: new Date(), updatedBy: "superadmin",
  });
  const specialtyResult = await service.execute(input(manageAccess({
    organizationType: "ACADEMY", organizationId: "academy", desiredAcademyRole: "COACH", desiredFitnessCoach: true,
    expectedActionType: "ACADEMY_SPECIALTY_REACTIVATED", confirmedActionType: "ACADEMY_SPECIALTY_REACTIVATED",
    expectedState: {
      membership: { role: "COACH", status: "ACTIVE", source: "CLAIM_APPROVAL", joinedBy: "superadmin", approvalClaimId: "claim-1" },
      specialty: { specialty: "FITNESS_COACH", status: "INACTIVE" },
    },
  })));
  assert.equal(specialtyResult.actionType, "ACADEMY_SPECIALTY_REACTIVATED");
  assert.equal((await firestore.doc("academies/academy/staffSpecialties/coach").get()).data()?.status, "ACTIVE");
});

test("rejects ordinary or inactive actors, inactive or missing targets, and ineligible organizations", async () => {
  await expectNoWrites(manageAccess(), "ordinary");
  await expectNoWrites(manageAccess(), "admin-staff");
  await expectNoWrites(manageAccess(), "inactive-superadmin");
  await expectNoWrites(manageAccess({ targetUid: "missing-target" }));
  await expectNoWrites(manageAccess({ targetUid: "inactive-coach" }));
  await expectNoWrites(manageAccess({ targetUid: "target-superadmin" }));
  await firestore.doc("proClubs/club").update({ status: "INACTIVE" });
  await expectNoWrites(manageAccess());
  await expectNoWrites(manageAccess({ organizationId: "missing-club" }));
});

test("validates Academy role and specialty eligibility before any writes", async () => {
  await assert.rejects(service.execute(input(manageAccess({
    organizationType: "ACADEMY", organizationId: "academy", desiredStaffRole: undefined,
    desiredAcademyRole: "ADMIN", desiredFitnessCoach: true,
    expectedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED", confirmedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
    expectedState: { membership: null, specialty: null },
  }))), SuperAdminAccessControlError);
  assert.equal((await firestore.doc("academies/academy/members/coach").get()).exists, false);
  assert.equal((await firestore.collection("superAdminAccessControlAudits").get()).size, 0);
});

test("SuperAdmin can deactivate a stale Fitness Coach specialty with atomic cleanup audit", async () => {
  await firestore.doc("users/inactive-coach").set({ uid: "inactive-coach", role: "USER", status: "INACTIVE" });
  await firestore.doc("academies/academy/members/inactive-coach").set({
    userId: "inactive-coach", academyId: "academy", role: "COACH", status: "SUSPENDED",
    source: "LEGACY_MIGRATION", joinedAt: new Date(), joinedBy: "superadmin", updatedAt: new Date(),
  });
  await firestore.doc("academies/academy/staffSpecialties/inactive-coach").set({
    schemaVersion: 1, specialty: "FITNESS_COACH", status: "ACTIVE", createdAt: new Date(),
    createdBy: "superadmin", updatedAt: new Date(), updatedBy: "superadmin",
  });
  const result = await service.execute(input({
    operation: "SET_ACADEMY_SPECIALTY_STATUS", organizationId: "academy",
    targetUid: "inactive-coach", nextStatus: "INACTIVE",
  }));
  assert.equal(result.actionType, "ACADEMY_SPECIALTY_DEACTIVATED");
  assert.equal((await firestore.doc("academies/academy/staffSpecialties/inactive-coach").get()).data()?.status, "INACTIVE");
  const audit = (await firestore.doc(`superAdminAccessControlAudits/${result.actionId}`).get()).data();
  assert.equal(audit?.actorUid, "superadmin");
  assert.equal(audit?.actionType, "ACADEMY_SPECIALTY_DEACTIVATED");
  assert.equal(typeof (audit?.createdAt as { toDate?: unknown })?.toDate, "function");
  assert.equal((await firestore.doc("academies/academy/members/inactive-coach").get()).data()?.status, "SUSPENDED");
});

test("Fitness Coach activation requires an active Coach membership and is idempotent", async () => {
  await firestore.doc("academies/academy/members/coach").set({
    userId: "coach", academyId: "academy", role: "ADMIN", status: "ACTIVE",
    source: "LEGACY_MIGRATION", joinedAt: new Date(), joinedBy: "superadmin", updatedAt: new Date(),
  });
  await assert.rejects(service.execute(input({
    operation: "SET_ACADEMY_SPECIALTY_STATUS", organizationId: "academy", targetUid: "coach", nextStatus: "ACTIVE",
  })), SuperAdminAccessControlError);
  assert.equal((await firestore.collection("superAdminAccessControlAudits").get()).size, 0);

  await firestore.doc("academies/academy/members/coach").update({ role: "COACH" });
  const activated = await service.execute(input({
    operation: "SET_ACADEMY_SPECIALTY_STATUS", organizationId: "academy", targetUid: "coach", nextStatus: "ACTIVE",
  }));
  assert.equal(activated.actionType, "ACADEMY_SPECIALTY_ASSIGNED");
  const repeated = await service.execute(input({
    operation: "SET_ACADEMY_SPECIALTY_STATUS", organizationId: "academy", targetUid: "coach", nextStatus: "ACTIVE",
  }));
  assert.equal(repeated.actionId, null);
  assert.equal((await firestore.collection("superAdminAccessControlAudits").get()).size, 1);
});
