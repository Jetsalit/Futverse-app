import assert from "node:assert/strict";
import test from "node:test";
import {
  createProClubStaffManagementServiceV1,
  ProClubStaffManagementServiceError,
  type ProClubStaffManagementSourceV1,
} from "../functions/src/proClubStaffManagement/service.ts";
import type { ProClubStaffManagementPlanV1 } from "../functions/src/proClubStaffManagement/transition.ts";
import {
  createProClubStaffRosterService,
  type ProClubStaffRosterDataSource,
} from "../functions/src/proClubStaffRoster/service.ts";
import {
  createProClubStaffLifecycleReviewServiceV1,
  type ProClubStaffLifecycleReviewDocumentV1,
  type ProClubStaffLifecycleReviewSourceV1,
} from "../functions/src/proClubStaffLifecycleReview/service.ts";

type Membership = {
  authorizationRole: "OWNER" | "ADMIN" | "MEMBER";
  status: "ACTIVE" | "INACTIVE" | "LEFT" | "REVOKED";
};
type StaffAssignment = {
  staffRole:
    | "TECHNICAL_DIRECTOR"
    | "MANAGER"
    | "HEAD_COACH"
    | "ASSISTANT_COACH"
    | "GK_COACH"
    | "FITNESS_COACH"
    | "ANALYST"
    | "PHYSIO"
    | "TEAM_MANAGER"
    | "STAFF";
  status: "ACTIVE" | "INACTIVE" | "LEFT";
};

function createApprovedStaffFixture() {
  const clubId = "club-e2e-1";
  const ownerUid = "owner-e2e-1";
  const staffUid = "staff-e2e-1";

  // This is the canonical handoff state produced after onboarding approval.
  // Invite/claim/approval rules are covered by the onboarding contract gates;
  // this rehearsal exercises the complete management lifecycle after approval.
  const memberships = new Map<string, Membership>([
    [ownerUid, { authorizationRole: "OWNER", status: "ACTIVE" }],
    [staffUid, { authorizationRole: "MEMBER", status: "ACTIVE" }],
  ]);
  const staffAssignments = new Map<string, StaffAssignment>([
    [staffUid, { staffRole: "ASSISTANT_COACH", status: "ACTIVE" }],
  ]);
  const users = new Map<string, Record<string, unknown>>([
    [ownerUid, { name: "Owner Reviewer" }],
    [staffUid, { name: "Lifecycle Staff" }],
  ]);
  const history: ProClubStaffLifecycleReviewDocumentV1[] = [];
  let eventSequence = 0;
  let clock = 1_780_000_000_000;

  const readClub = async (requestedClubId: string) =>
    requestedClubId === clubId ? { status: "ACTIVE" } : null;
  const readMembership = async (requestedClubId: string, uid: string) =>
    requestedClubId === clubId ? memberships.get(uid) ?? null : null;
  const readUser = async (uid: string) => users.get(uid) ?? null;
  const listStaffAssignments = async (requestedClubId: string) =>
    requestedClubId === clubId
      ? [...staffAssignments.entries()].map(([id, data]) => ({ id, data: { ...data } }))
      : [];

  const managementSource: ProClubStaffManagementSourceV1 = {
    readClub,
    readMembership,
    async readStaffAssignment(requestedClubId, uid) {
      return requestedClubId === clubId ? staffAssignments.get(uid) ?? null : null;
    },
    async applyAtomicPlan(input) {
      const currentMembership = memberships.get(input.targetUid);
      const currentStaff = staffAssignments.get(input.targetUid);
      assert.ok(currentMembership, "target membership must still exist");
      assert.ok(currentStaff, "target staff assignment must still exist");
      assert.equal(currentMembership.authorizationRole, input.plan.history.previousAuthorizationRole);
      assert.equal(currentMembership.status, input.plan.history.previousMembershipStatus);
      assert.equal(currentStaff.staffRole, input.plan.history.previousStaffRole);
      assert.equal(currentStaff.status, input.plan.history.previousStaffStatus);

      // Simulate the atomic server write: update in place and append history.
      // No membership/staff document is ever deleted in this rehearsal.
      memberships.set(input.targetUid, { ...input.plan.membership });
      staffAssignments.set(input.targetUid, { ...input.plan.staff });
      eventSequence += 1;
      clock += 1_000;
      const eventId = `event-${eventSequence}`;
      history.push({
        id: eventId,
        data: {
          ...input.plan.history,
          eventId,
          changedAt: { toMillis: () => clock },
        },
      });
    },
  };

  const rosterSource: ProClubStaffRosterDataSource = {
    readClub,
    readMembership,
    listStaffAssignments,
    readUser,
  };

  const lifecycleSource: ProClubStaffLifecycleReviewSourceV1 = {
    readClub,
    readMembership,
    listStaffAssignments,
    async listHistory(requestedClubId) {
      return requestedClubId === clubId ? history.map((entry) => ({ ...entry })) : [];
    },
    readUser,
  };

  return {
    clubId,
    ownerUid,
    staffUid,
    memberships,
    staffAssignments,
    history,
    management: createProClubStaffManagementServiceV1(managementSource),
    roster: createProClubStaffRosterService(rosterSource),
    lifecycle: createProClubStaffLifecycleReviewServiceV1(lifecycleSource),
  };
}

async function manage(
  fixture: ReturnType<typeof createApprovedStaffFixture>,
  action: unknown,
): Promise<ProClubStaffManagementPlanV1> {
  return await fixture.management.manageStaff({
    requesterUid: fixture.ownerUid,
    requestBody: {
      clubId: fixture.clubId,
      targetUid: fixture.staffUid,
      action,
    },
  });
}

async function loadRoster(fixture: ReturnType<typeof createApprovedStaffFixture>) {
  return await fixture.roster.loadRoster({
    requesterUid: fixture.ownerUid,
    requestBody: { clubId: fixture.clubId },
  });
}

async function loadLifecycle(fixture: ReturnType<typeof createApprovedStaffFixture>) {
  return await fixture.lifecycle.loadReview({
    requesterUid: fixture.ownerUid,
    requestBody: { clubId: fixture.clubId },
  });
}

test("post-approval staff management lifecycle rehearsal preserves documents and history", async () => {
  const fixture = createApprovedStaffFixture();
  const initialMembershipCount = fixture.memberships.size;
  const initialStaffCount = fixture.staffAssignments.size;

  const initialRoster = await loadRoster(fixture);
  assert.equal(initialRoster.entries.length, 1);
  assert.equal(initialRoster.entries[0]?.staffRole, "ASSISTANT_COACH");
  assert.deepEqual((await loadLifecycle(fixture)).events, []);

  const rolePlan = await manage(fixture, { type: "CHANGE_ROLE", staffRole: "HEAD_COACH" });
  assert.equal(rolePlan.membership.authorizationRole, "MEMBER");
  assert.equal(rolePlan.staff.staffRole, "HEAD_COACH");
  assert.equal((await loadRoster(fixture)).entries[0]?.staffRole, "HEAD_COACH");
  assert.equal(fixture.history.length, 1);

  const deactivatePlan = await manage(fixture, { type: "DEACTIVATE" });
  assert.equal(deactivatePlan.membership.authorizationRole, "MEMBER");
  assert.equal(deactivatePlan.membership.status, "INACTIVE");
  assert.equal(deactivatePlan.staff.status, "INACTIVE");
  assert.equal((await loadRoster(fixture)).entries.length, 0, "inactive staff must leave the active roster");

  const afterDeactivate = await loadLifecycle(fixture);
  assert.equal(afterDeactivate.inactiveEntries.length, 1);
  assert.equal(afterDeactivate.leftEntries.length, 0);
  assert.deepEqual(afterDeactivate.events.map((event) => event.action), ["DEACTIVATE", "CHANGE_ROLE"]);
  assert.ok(afterDeactivate.events.every((event) => !("changedBy" in event)), "review response must not expose changedBy");

  const reactivatePlan = await manage(fixture, { type: "REACTIVATE" });
  assert.equal(reactivatePlan.membership.authorizationRole, "MEMBER");
  assert.equal(reactivatePlan.membership.status, "ACTIVE");
  assert.equal(reactivatePlan.staff.status, "ACTIVE");
  const afterReactivateRoster = await loadRoster(fixture);
  assert.equal(afterReactivateRoster.entries.length, 1);
  assert.equal(afterReactivateRoster.entries[0]?.staffRole, "HEAD_COACH");
  assert.equal((await loadLifecycle(fixture)).inactiveEntries.length, 0);

  const leftPlan = await manage(fixture, { type: "MARK_LEFT" });
  assert.equal(leftPlan.membership.authorizationRole, "MEMBER");
  assert.equal(leftPlan.membership.status, "LEFT");
  assert.equal(leftPlan.staff.status, "LEFT");
  assert.equal((await loadRoster(fixture)).entries.length, 0, "left staff must not return to the active roster");

  const finalReview = await loadLifecycle(fixture);
  assert.equal(finalReview.inactiveEntries.length, 0);
  assert.equal(finalReview.leftEntries.length, 1);
  assert.equal(finalReview.leftEntries[0]?.staffRole, "HEAD_COACH");
  assert.deepEqual(finalReview.events.map((event) => event.action), [
    "MARK_LEFT",
    "REACTIVATE",
    "DEACTIVATE",
    "CHANGE_ROLE",
  ]);

  assert.equal(fixture.memberships.size, initialMembershipCount, "membership documents must be preserved");
  assert.equal(fixture.staffAssignments.size, initialStaffCount, "staff documents must be preserved");
  assert.equal(fixture.history.length, 4, "history must be append-only across all successful actions");
  assert.ok(fixture.history.every((event) => "changedBy" in (event.data as Record<string, unknown>)), "canonical history retains server audit actor");

  await assert.rejects(
    () => manage(fixture, { type: "REACTIVATE" }),
    (error: unknown) => {
      assert.ok(error instanceof ProClubStaffManagementServiceError);
      assert.equal(error.code, "CONFLICT");
      return true;
    },
  );
  assert.equal(fixture.history.length, 4, "failed terminal action must not append history");
  assert.deepEqual(fixture.memberships.get(fixture.staffUid), { authorizationRole: "MEMBER", status: "LEFT" });
  assert.deepEqual(fixture.staffAssignments.get(fixture.staffUid), { staffRole: "HEAD_COACH", status: "LEFT" });
});
