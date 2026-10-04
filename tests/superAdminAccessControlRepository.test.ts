import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mutateSuperAdminAccessAtomically,
  type AccessControlMutationDependencies,
  type AccessControlMutationInput,
  type AccessControlTransaction,
} from "../src/lib/firestore/superAdminAccessControlRepository";

type Snapshot = { exists: boolean; data?: Record<string, unknown> };

const actor = { uid: "superadmin", role: "SUPERADMIN", status: "Active" };
const target = { uid: "coach-1", role: "COACH", status: "Active" };
const academy = { name: "Talumball Academy" };
const club = { name: "TNSU Lampang", status: "ACTIVE" };

function academyMembership(overrides: Record<string, unknown> = {}) {
  return {
    userId: "coach-1",
    academyId: "academy-a",
    role: "COACH",
    status: "ACTIVE",
    source: "SUPERADMIN_ASSIGNMENT",
    joinedAt: "joined-at",
    joinedBy: "superadmin",
    updatedAt: "updated-at",
    ...overrides,
  };
}

function input(
  overrides: Record<string, unknown> = {},
): AccessControlMutationInput {
  return {
    actorUid: "superadmin",
    targetUid: "coach-1",
    organizationType: "PRO_CLUB",
    organizationId: "club-a",
    presentationModeActive: false,
    desiredStaffRole: "GK_COACH",
    expectedActionType: "ACCESS_ASSIGNED",
    confirmedActionType: "ACCESS_ASSIGNED",
    expectedState: {
      membership: null,
      staff: null,
      pointerExists: false,
    },
    ...overrides,
  } as AccessControlMutationInput;
}

function createHarness(options: {
  authenticatedUid?: string | null;
  users?: Record<string, Snapshot>;
  organizations?: Record<string, Snapshot>;
  academyMembership?: Snapshot;
  academySpecialty?: Snapshot;
  proClubMembership?: Snapshot;
  proClubStaff?: Snapshot;
  pointer?: Snapshot;
} = {}) {
  const created: Array<{ path: readonly string[]; data: Record<string, unknown> }> = [];
  const updated: Array<{ path: readonly string[]; patch: Record<string, unknown> }> = [];
  const reads: string[] = [];
  let transactions = 0;

  const snapshot = (value: Snapshot | undefined): Snapshot => value ?? { exists: false };
  const dependencies: AccessControlMutationDependencies = {
    getAuthenticatedUid: () => options.authenticatedUid === undefined ? "superadmin" : options.authenticatedUid,
    newActionId: () => "access-action-1",
    timestamp: () => "SERVER_TIMESTAMP",
    async runAccessTransaction<T>(operation: (transaction: AccessControlTransaction) => Promise<T>) {
      transactions += 1;
      const get = async (key: string, value?: Snapshot): Promise<Snapshot> => {
        reads.push(key);
        return snapshot(value);
      };
      return operation({
        getUser: (uid) => get(`users/${uid}`, options.users?.[uid] ?? {
          exists: uid === "superadmin" || uid === "coach-1",
          data: uid === "superadmin" ? actor : target,
        }),
        getOrganization: (type, id) => get(`${type}/${id}`, options.organizations?.[`${type}/${id}`] ?? {
          exists: true,
          data: type === "ACADEMY" ? academy : club,
        }),
        getAcademyMembership: (id, uid) => get(`academies/${id}/members/${uid}`, options.academyMembership),
        getAcademySpecialty: (id, uid) => get(`academies/${id}/staffSpecialties/${uid}`, options.academySpecialty),
        getProClubMembership: (id, uid) => get(`proClubs/${id}/members/${uid}`, options.proClubMembership),
        getProClubStaff: (id, uid) => get(`proClubs/${id}/staff/${uid}`, options.proClubStaff),
        getProClubPointer: (uid, id) => get(`users/${uid}/proClubMemberships/${id}`, options.pointer),
        getAccessControlAuditState: (type, id, uid) => get(`superAdminAccessControlState/${type}/organizations/${id}/targets/${uid}`),
        createAcademyMembership: (id, uid, data) => created.push({ path: ["academies", id, "members", uid], data }),
        updateAcademyMembership: (id, uid, patch) => updated.push({ path: ["academies", id, "members", uid], patch }),
        createAcademySpecialty: (id, uid, data) => created.push({ path: ["academies", id, "staffSpecialties", uid], data }),
        updateAcademySpecialty: (id, uid, patch) => updated.push({ path: ["academies", id, "staffSpecialties", uid], patch }),
        createProClubMembership: (id, uid, data) => created.push({ path: ["proClubs", id, "members", uid], data }),
        updateProClubMembership: (id, uid, patch) => updated.push({ path: ["proClubs", id, "members", uid], patch }),
        createProClubStaff: (id, uid, data) => created.push({ path: ["proClubs", id, "staff", uid], data }),
        updateProClubStaff: (id, uid, patch) => updated.push({ path: ["proClubs", id, "staff", uid], patch }),
        createProClubPointer: (uid, id, data) => created.push({ path: ["users", uid, "proClubMemberships", id], data }),
        writeAccessControlAuditState: (type, id, uid, data) => created.push({ path: ["superAdminAccessControlState", type, "organizations", id, "targets", uid], data }),
        createAccessAudit: (actionId, data) => created.push({ path: ["superAdminAccessControlAudits", actionId], data }),
      });
    },
  };
  return { dependencies, created, updated, reads, get transactions() { return transactions; } };
}

describe("SuperAdmin unified access repository", () => {
  it("requires the actual authenticated active SuperAdmin and rejects presentation mode", async () => {
    for (const harness of [
      createHarness({ authenticatedUid: "another-user" }),
      createHarness({ users: { superadmin: { exists: true, data: { ...actor, status: "Inactive" } } } }),
    ]) {
      await assert.rejects(mutateSuperAdminAccessAtomically(input(), harness.dependencies));
      assert.equal(harness.created.length, 0);
      assert.equal(harness.updated.length, 0);
    }
    const presentationHarness = createHarness();
    await assert.rejects(mutateSuperAdminAccessAtomically(
      input({ presentationModeActive: true }),
      presentationHarness.dependencies,
    ));
    assert.equal(presentationHarness.transactions, 0);
    assert.equal(presentationHarness.created.length, 0);
    assert.equal(presentationHarness.updated.length, 0);
  });

  it("creates canonical Pro Club MEMBER, staff role, discovery pointer, and audit atomically", async () => {
    const harness = createHarness();
    const result = await mutateSuperAdminAccessAtomically(input(), harness.dependencies);
    assert.equal(result.actionType, "ACCESS_ASSIGNED");
    assert.deepEqual(harness.created.slice(0, 3), [
      { path: ["proClubs", "club-a", "members", "coach-1"], data: { authorizationRole: "MEMBER", status: "ACTIVE" } },
      { path: ["proClubs", "club-a", "staff", "coach-1"], data: { staffRole: "GK_COACH", status: "ACTIVE" } },
      { path: ["users", "coach-1", "proClubMemberships", "club-a"], data: { schemaVersion: 1, clubId: "club-a" } },
    ]);
    assert.deepEqual(harness.created[3].path, ["superAdminAccessControlState", "PRO_CLUB", "organizations", "club-a", "targets", "coach-1"]);
    assert.deepEqual(harness.created[4].path, ["superAdminAccessControlAudits", "access-action-1"]);
    const audit = harness.created[4].data;
    assert.equal(audit.actorUid, "superadmin");
    assert.equal(audit.targetUid, "coach-1");
    assert.equal(audit.organizationType, "PRO_CLUB");
    assert.equal(harness.reads.includes("PRO_CLUB/club-a"), false);
    assert.deepEqual(audit.previousState, { membership: null, staff: null });
    assert.deepEqual(audit.newState, {
      membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
      staff: { staffRole: "GK_COACH", status: "ACTIVE" },
    });
    assert.equal(harness.transactions, 1);
  });

  it("does not let the staff flow create OWNER or ADMIN membership authority", async () => {
    const harness = createHarness();
    const result = await mutateSuperAdminAccessAtomically(input({ desiredStaffRole: "HEAD_COACH" }), harness.dependencies);
    assert.equal(result.actionType, "ACCESS_ASSIGNED");
    assert.deepEqual(harness.created[0].data, { authorizationRole: "MEMBER", status: "ACTIVE" });
    assert.ok(harness.created.every(({ data }) => data.authorizationRole !== "OWNER" && data.authorizationRole !== "ADMIN"));
  });

  it("is a no-op with no audit when the requested active staff role already exists", async () => {
    const harness = createHarness({
      proClubMembership: { exists: true, data: { authorizationRole: "MEMBER", status: "ACTIVE" } },
      proClubStaff: { exists: true, data: { staffRole: "GK_COACH", status: "ACTIVE" } },
      pointer: { exists: true, data: { schemaVersion: 1, clubId: "club-a" } },
    });
    const result = await mutateSuperAdminAccessAtomically(input({
      expectedActionType: null,
      expectedState: {
        membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
        staff: { staffRole: "GK_COACH", status: "ACTIVE" },
        pointerExists: true,
      },
    }), harness.dependencies);
    assert.equal(result.actionType, null);
    assert.equal(harness.created.length, 0);
    assert.equal(harness.updated.length, 0);
  });

  it("requires explicit matching confirmation for role changes and reactivation", async () => {
    const harness = createHarness({
      proClubMembership: { exists: true, data: { authorizationRole: "MEMBER", status: "ACTIVE" } },
      proClubStaff: { exists: true, data: { staffRole: "ANALYST", status: "ACTIVE" } },
      pointer: { exists: true, data: { schemaVersion: 1, clubId: "club-a" } },
    });
    await assert.rejects(mutateSuperAdminAccessAtomically(input({
      expectedActionType: "STAFF_ROLE_CHANGED",
      expectedState: {
        membership: { authorizationRole: "MEMBER", status: "ACTIVE" },
        staff: { staffRole: "ANALYST", status: "ACTIVE" },
        pointerExists: true,
      },
    }), harness.dependencies), /confirmation/i);
    assert.equal(harness.created.length, 0);
  });

  it("fails closed for inactive targets, SuperAdmin targets, and terminal membership", async () => {
    const cases = [
      createHarness({ users: { "coach-1": { exists: true, data: { ...target, status: "Inactive" } } } }),
      createHarness({ users: { "coach-1": { exists: true, data: { ...target, role: "SUPERADMIN" } } } }),
      createHarness({ proClubMembership: { exists: true, data: { authorizationRole: "MEMBER", status: "LEFT" } } }),
    ];
    for (const harness of cases) {
      await assert.rejects(mutateSuperAdminAccessAtomically(input(), harness.dependencies));
      assert.equal(harness.created.length, 0);
      assert.equal(harness.updated.length, 0);
    }
  });

  it("creates a direct Academy membership with SUPERADMIN_ASSIGNMENT provenance", async () => {
    const harness = createHarness();
    const academyInput = input({
      organizationType: "ACADEMY",
      organizationId: "academy-a",
      desiredStaffRole: undefined,
      desiredAcademyRole: "COACH",
      desiredFitnessCoach: false,
      expectedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
      confirmedActionType: "ACADEMY_MEMBERSHIP_ASSIGNED",
      expectedState: { membership: null, specialty: null },
    });
    const result = await mutateSuperAdminAccessAtomically(academyInput, harness.dependencies);
    assert.equal(result.actionType, "ACADEMY_MEMBERSHIP_ASSIGNED");
    assert.deepEqual(harness.created[0], {
      path: ["academies", "academy-a", "members", "coach-1"],
      data: {
        userId: "coach-1",
        academyId: "academy-a",
        role: "COACH",
        status: "ACTIVE",
        source: "SUPERADMIN_ASSIGNMENT",
        joinedAt: "SERVER_TIMESTAMP",
        joinedBy: "superadmin",
        updatedAt: "SERVER_TIMESTAMP",
      },
    });
    assert.equal(harness.created[2].data.organizationType, "ACADEMY");
  });

  it("preserves Academy provenance on role changes and reactivation", async () => {
    const harness = createHarness({
      academyMembership: { exists: true, data: academyMembership({ role: "ADMIN", source: "CLAIM_APPROVAL", approvalClaimId: "claim-1" }) },
    });
    await mutateSuperAdminAccessAtomically(input({
      organizationType: "ACADEMY",
      organizationId: "academy-a",
      desiredStaffRole: undefined,
      desiredAcademyRole: "COACH",
      desiredFitnessCoach: false,
      expectedActionType: "ACADEMY_ROLE_CHANGED",
      confirmedActionType: "ACADEMY_ROLE_CHANGED",
      expectedState: { membership: { role: "ADMIN", status: "ACTIVE", source: "CLAIM_APPROVAL", joinedBy: "superadmin", approvalClaimId: "claim-1" }, specialty: null },
    }), harness.dependencies);
    assert.deepEqual(harness.updated[0].patch, { role: "COACH", updatedAt: "SERVER_TIMESTAMP" });
    assert.equal(harness.created.at(-1)?.data.actionType, "ACADEMY_ROLE_CHANGED");
  });

  it("only writes the requested organization domain and never account roles", async () => {
    const harness = createHarness();
    await mutateSuperAdminAccessAtomically(input(), harness.dependencies);
    assert.ok(harness.created.every(({ path }) => path[0] !== "academies"));
    assert.ok(harness.updated.every(({ path }) => path[0] !== "academies"));
    assert.ok(harness.created.every(({ path, data }) => !(path[0] === "users" && "role" in data)));
  });
});
